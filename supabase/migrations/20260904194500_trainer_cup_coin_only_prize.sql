-- Trainer Cup entry fees form a coin-only prize pool. Diamonds are never part of the pot.
update public.tournaments
set reward_diamonds=0
where status in ('registration','active') and coalesce(reward_diamonds,0)<>0;

create or replace function private.ensure_active_tournament()
returns uuid
language plpgsql
security definer
set search_path to ''
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

  if v_id is not null then
    update public.tournaments set reward_diamonds=0 where id=v_id and coalesce(reward_diamonds,0)<>0;
    return v_id;
  end if;

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
    0
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.apply_tournament_battle_result()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_match public.tournament_matches%rowtype;
  v_next_round integer;
  v_next_slot integer;
  v_next public.tournament_matches%rowtype;
  v_reward_coins bigint;
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
    set status='completed',winner_id=new.winner_id,ends_at=now(),reward_diamonds=0
    where id=v_match.tournament_id and status='active'
    returning reward_coins into v_reward_coins;

    if found then
      update public.players
      set coins=coins+v_reward_coins
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
        'Você venceu a Copa Trainer e recebeu 100% do pot: 🪙 '||v_reward_coins||'.',
        jsonb_build_object(
          'tournamentId',v_match.tournament_id,
          'coins',v_reward_coins,
          'diamonds',0,
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