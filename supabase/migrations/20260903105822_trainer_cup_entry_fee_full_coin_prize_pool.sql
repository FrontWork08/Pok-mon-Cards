-- Trainer Cup: charge a 10,000 Coin entry fee and send 100% of the Coin pot to the champion.
-- Diamond rewards remain separate and are not part of the registration pool.

alter table public.tournaments
  add column if not exists entry_fee_coins bigint not null default 0;

alter table public.tournaments
  alter column entry_fee_coins set default 10000;

alter table public.tournaments
  alter column reward_coins set default 0;

alter table public.tournament_entries
  add column if not exists entry_fee_coins_paid bigint not null default 0;

alter table public.tournament_entries
  add column if not exists entry_fee_refunded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='tournaments_entry_fee_nonnegative'
      and conrelid='public.tournaments'::regclass
  ) then
    alter table public.tournaments
      add constraint tournaments_entry_fee_nonnegative
      check(entry_fee_coins>=0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='tournament_entries_fee_paid_nonnegative'
      and conrelid='public.tournament_entries'::regclass
  ) then
    alter table public.tournament_entries
      add constraint tournament_entries_fee_paid_nonnegative
      check(entry_fee_coins_paid>=0);
  end if;
end;
$$;

create table if not exists private.tournament_coin_events(
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  event_type text not null check(event_type in ('entry_fee','refund','champion_prize')),
  amount_coins bigint not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists tournament_coin_events_tournament_idx
  on private.tournament_coin_events(tournament_id,created_at);

create index if not exists tournament_coin_events_player_idx
  on private.tournament_coin_events(player_id,created_at);

create or replace function private.refund_tournament_entry_fees(
  p_tournament uuid,
  p_reason text default 'cancelled'
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_entry record;
  v_total bigint:=0;
begin
  for v_entry in
    select e.player_id,e.entry_fee_coins_paid
    from public.tournament_entries e
    where e.tournament_id=p_tournament
      and e.entry_fee_coins_paid>0
      and e.entry_fee_refunded_at is null
    for update
  loop
    update public.players
    set coins=coins+v_entry.entry_fee_coins_paid
    where id=v_entry.player_id;

    update public.tournament_entries
    set entry_fee_refunded_at=now()
    where tournament_id=p_tournament
      and player_id=v_entry.player_id
      and entry_fee_refunded_at is null;

    insert into private.tournament_coin_events(
      tournament_id,player_id,event_type,amount_coins,reason
    )
    values(
      p_tournament,v_entry.player_id,'refund',
      v_entry.entry_fee_coins_paid,coalesce(p_reason,'refund')
    );

    v_total:=v_total+v_entry.entry_fee_coins_paid;
  end loop;

  update public.tournaments
  set reward_coins=0
  where id=p_tournament;

  return v_total;
end;
$$;

revoke all on function private.refund_tournament_entry_fees(uuid,text)
from public,anon,authenticated;

create or replace function private.refund_tournament_on_cancel()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    perform private.refund_tournament_entry_fees(new.id,'tournament_cancelled');
  end if;
  return new;
end;
$$;

revoke all on function private.refund_tournament_on_cancel()
from public,anon,authenticated;

drop trigger if exists trg_refund_tournament_fees_on_cancel
on public.tournaments;

create trigger trg_refund_tournament_fees_on_cancel
after update of status
on public.tournaments
for each row
execute function private.refund_tournament_on_cancel();

update public.tournaments
set entry_fee_coins=10000,
    reward_coins=0
where status='registration';

do $$
declare
  v_entry record;
begin
  for v_entry in
    select e.tournament_id,e.player_id,t.entry_fee_coins
    from public.tournament_entries e
    join public.tournaments t on t.id=e.tournament_id
    where t.status='registration'
      and e.entry_fee_coins_paid=0
    for update of e
  loop
    update public.players
    set coins=coins-v_entry.entry_fee_coins
    where id=v_entry.player_id
      and account_status='active'
      and coins>=v_entry.entry_fee_coins;

    if found then
      update public.tournament_entries
      set entry_fee_coins_paid=v_entry.entry_fee_coins,
          entry_fee_refunded_at=null
      where tournament_id=v_entry.tournament_id
        and player_id=v_entry.player_id;

      update public.tournaments
      set reward_coins=reward_coins+v_entry.entry_fee_coins
      where id=v_entry.tournament_id;

      insert into private.tournament_coin_events(
        tournament_id,player_id,event_type,amount_coins,reason
      )
      values(
        v_entry.tournament_id,v_entry.player_id,'entry_fee',
        -v_entry.entry_fee_coins,'fee_enabled_for_open_registration'
      );
    else
      delete from public.tournament_entries
      where tournament_id=v_entry.tournament_id
        and player_id=v_entry.player_id;
    end if;
  end loop;
end;
$$;

create or replace function private.ensure_active_tournament()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_number integer;
begin
  update public.tournaments
  set status='cancelled'
  where status='registration' and registration_ends_at<=now()
    and (select count(*) from public.tournament_entries e where e.tournament_id=tournaments.id)<8;

  select id into v_id
  from public.tournaments
  where status in ('registration','active')
  order by created_at desc
  limit 1;

  if v_id is not null then return v_id; end if;

  select count(*)+1 into v_number from public.tournaments;

  insert into public.tournaments(
    name,status,registration_ends_at,starts_at,ends_at,
    entry_fee_coins,reward_coins,reward_diamonds
  )
  values(
    'Copa Trainer #'||v_number,
    'registration',
    now()+interval '24 hours',
    null,
    now()+interval '7 days',
    10000,
    0,
    3
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function private.ensure_active_tournament()
from public,anon,authenticated;

create or replace function private.join_tournament()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_tournament uuid;
  v_count integer;
  v_max integer;
  v_fee bigint;
  v_pool bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(
    select 1 from public.players
    where id=v_player and account_status='active'
  ) then
    raise exception 'PLAYER_NOT_AVAILABLE';
  end if;

  v_tournament:=private.ensure_active_tournament();

  select max_players,entry_fee_coins,reward_coins
  into v_max,v_fee,v_pool
  from public.tournaments
  where id=v_tournament
    and status='registration'
    and registration_ends_at>now()
  for update;

  if not found then raise exception 'REGISTRATION_CLOSED'; end if;

  if exists(
    select 1 from public.tournament_entries
    where tournament_id=v_tournament and player_id=v_player
  ) then
    select count(*) into v_count
    from public.tournament_entries
    where tournament_id=v_tournament;

    return jsonb_build_object(
      'tournamentId',v_tournament,
      'joined',true,
      'entries',v_count,
      'maxPlayers',v_max,
      'entryFeeCoins',v_fee,
      'feeCharged',0,
      'prizePoolCoins',v_pool
    );
  end if;

  select count(*) into v_count
  from public.tournament_entries
  where tournament_id=v_tournament;

  if v_count>=v_max then raise exception 'TOURNAMENT_FULL'; end if;

  if v_fee>0 then
    update public.players
    set coins=coins-v_fee
    where id=v_player
      and account_status='active'
      and coins>=v_fee;

    if not found then raise exception 'NOT_ENOUGH_COINS'; end if;
  end if;

  insert into public.tournament_entries(
    tournament_id,player_id,entry_fee_coins_paid,entry_fee_refunded_at
  )
  values(v_tournament,v_player,v_fee,null);

  if v_fee>0 then
    insert into private.tournament_coin_events(
      tournament_id,player_id,event_type,amount_coins,reason
    )
    values(v_tournament,v_player,'entry_fee',-v_fee,'registration');
  end if;

  update public.tournaments
  set reward_coins=reward_coins+v_fee
  where id=v_tournament
  returning reward_coins into v_pool;

  select count(*) into v_count
  from public.tournament_entries
  where tournament_id=v_tournament;

  if v_count=v_max then
    perform private.start_tournament(v_tournament);
  end if;

  return jsonb_build_object(
    'tournamentId',v_tournament,
    'joined',true,
    'entries',v_count,
    'maxPlayers',v_max,
    'entryFeeCoins',v_fee,
    'feeCharged',v_fee,
    'prizePoolCoins',v_pool
  );
end;
$$;

revoke all on function private.join_tournament()
from public,anon,authenticated;

create or replace function private.leave_tournament()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_tournament uuid;
  v_fee bigint:=0;
  v_pool bigint:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select id
  into v_tournament
  from public.tournaments
  where status='registration'
    and registration_ends_at>now()
  order by created_at desc
  limit 1
  for update;

  if v_tournament is null then raise exception 'NO_OPEN_TOURNAMENT'; end if;

  select entry_fee_coins_paid
  into v_fee
  from public.tournament_entries
  where tournament_id=v_tournament
    and player_id=v_player
  for update;

  if not found then
    select reward_coins into v_pool
    from public.tournaments
    where id=v_tournament;

    return jsonb_build_object(
      'tournamentId',v_tournament,
      'joined',false,
      'refundedCoins',0,
      'prizePoolCoins',coalesce(v_pool,0)
    );
  end if;

  delete from public.tournament_entries
  where tournament_id=v_tournament
    and player_id=v_player;

  if v_fee>0 then
    update public.players
    set coins=coins+v_fee
    where id=v_player;

    insert into private.tournament_coin_events(
      tournament_id,player_id,event_type,amount_coins,reason
    )
    values(v_tournament,v_player,'refund',v_fee,'left_during_registration');
  end if;

  update public.tournaments
  set reward_coins=greatest(0,reward_coins-v_fee)
  where id=v_tournament
  returning reward_coins into v_pool;

  return jsonb_build_object(
    'tournamentId',v_tournament,
    'joined',false,
    'refundedCoins',v_fee,
    'prizePoolCoins',v_pool
  );
end;
$$;

revoke all on function private.leave_tournament()
from public,anon,authenticated;

create or replace function private.get_tournament_hub()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  v_id:=private.ensure_active_tournament();

  return (
    select jsonb_build_object(
      'id',t.id,'name',t.name,'status',t.status,
      'registrationEndsAt',t.registration_ends_at,'startsAt',t.starts_at,'endsAt',t.ends_at,
      'maxPlayers',t.max_players,
      'entryFeeCoins',t.entry_fee_coins,
      'prizePoolCoins',t.reward_coins,
      'rewardCoins',t.reward_coins,
      'rewardDiamonds',t.reward_diamonds,
      'winnerId',t.winner_id,
      'joined',exists(
        select 1 from public.tournament_entries e
        where e.tournament_id=t.id and e.player_id=v_actor
      ),
      'entries',coalesce((
        select jsonb_agg(jsonb_build_object(
          'playerId',e.player_id,'username',p.username,'seed',e.seed,
          'rating',p.battle_rating,'joinedAt',e.joined_at
        ) order by coalesce(e.seed,999),e.joined_at)
        from public.tournament_entries e
        join public.players p on p.id=e.player_id
        where e.tournament_id=t.id
      ),'[]'::jsonb),
      'matches',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',m.id,'round',m.round_no,'slot',m.slot_no,'status',m.status,'battleId',m.battle_id,
          'playerA',case when pa.id is null then null else jsonb_build_object('id',pa.id,'username',pa.username) end,
          'playerB',case when pb.id is null then null else jsonb_build_object('id',pb.id,'username',pb.username) end,
          'winnerId',m.winner_id
        ) order by m.round_no,m.slot_no)
        from public.tournament_matches m
        left join public.players pa on pa.id=m.player_a_id
        left join public.players pb on pb.id=m.player_b_id
        where m.tournament_id=t.id
      ),'[]'::jsonb)
    )
    from public.tournaments t
    where t.id=v_id
  );
end;
$$;

revoke all on function private.get_tournament_hub()
from public,anon,authenticated;

create or replace function private.apply_tournament_battle_result()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_next_round integer;
  v_next_slot integer;
  v_next public.tournament_matches%rowtype;
  v_reward_coins bigint;
  v_reward_diamonds integer;
begin
  if new.status<>'completed' or old.status='completed' or new.winner_id is null then
    return new;
  end if;

  select * into v_match
  from public.tournament_matches
  where battle_id=new.id
  for update;

  if v_match.id is null then return new; end if;

  update public.tournament_matches
  set winner_id=new.winner_id,status='completed',updated_at=now()
  where id=v_match.id;

  if v_match.round_no=3 then
    update public.tournaments
    set status='completed',winner_id=new.winner_id,ends_at=now()
    where id=v_match.tournament_id and status='active'
    returning reward_coins,reward_diamonds
    into v_reward_coins,v_reward_diamonds;

    if found then
      update public.players
      set coins=coins+v_reward_coins,
          diamonds=diamonds+v_reward_diamonds
      where id=new.winner_id;

      if v_reward_coins>0 then
        insert into private.tournament_coin_events(
          tournament_id,player_id,event_type,amount_coins,reason
        )
        values(
          v_match.tournament_id,new.winner_id,'champion_prize',
          v_reward_coins,'full_registration_pool'
        );
      end if;

      perform public.server_queue_notification(
        new.winner_id,
        'tournament_champion',
        'Você é campeão!',
        'Você venceu a Copa Trainer e recebeu 100% do pot: 🪙 '||
          v_reward_coins||' + 💎 '||v_reward_diamonds||'.',
        jsonb_build_object(
          'tournamentId',v_match.tournament_id,
          'coins',v_reward_coins,
          'diamonds',v_reward_diamonds,
          'prizePoolCoins',v_reward_coins
        )
      );
    end if;

    return new;
  end if;

  v_next_round:=v_match.round_no+1;
  v_next_slot:=ceil(v_match.slot_no/2.0)::integer;

  insert into public.tournament_matches(
    tournament_id,round_no,slot_no,
    player_a_id,player_b_id,status
  )
  values(
    v_match.tournament_id,v_next_round,v_next_slot,
    case when mod(v_match.slot_no,2)=1 then new.winner_id else null end,
    case when mod(v_match.slot_no,2)=0 then new.winner_id else null end,
    'pending'
  )
  on conflict(tournament_id,round_no,slot_no) do update
  set player_a_id=case
        when mod(v_match.slot_no,2)=1 then new.winner_id
        else public.tournament_matches.player_a_id
      end,
      player_b_id=case
        when mod(v_match.slot_no,2)=0 then new.winner_id
        else public.tournament_matches.player_b_id
      end,
      updated_at=now();

  select * into v_next
  from public.tournament_matches
  where tournament_id=v_match.tournament_id
    and round_no=v_next_round
    and slot_no=v_next_slot
  for update;

  if v_next.player_a_id is not null
     and v_next.player_b_id is not null
     and v_next.battle_id is null
  then
    update public.tournament_matches
    set status='ready'
    where id=v_next.id;

    perform private.create_tournament_match_battle(
      v_next.tournament_id,v_next.round_no,v_next.slot_no,
      v_next.player_a_id,v_next.player_b_id
    );
  end if;

  return new;
end;
$$;

revoke all on function private.apply_tournament_battle_result()
from public,anon,authenticated;
