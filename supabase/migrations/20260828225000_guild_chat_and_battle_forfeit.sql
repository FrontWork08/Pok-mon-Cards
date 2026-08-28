-- Guild member chat + battle surrender rules.

create table if not exists public.guild_chat_messages (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null,
  sender_username text not null default '',
  sender_profile_icon text not null default 'pokeball',
  sender_title_id text,
  sender_title text,
  sender_title_icon text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists guild_chat_messages_guild_created_idx
  on public.guild_chat_messages(guild_id, created_at desc);

alter table public.guild_chat_messages enable row level security;

drop policy if exists guild_chat_select_members on public.guild_chat_messages;
create policy guild_chat_select_members
on public.guild_chat_messages for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.guild_members gm
    where gm.guild_id = guild_chat_messages.guild_id
      and gm.player_id = (select auth.uid())
  )
);

drop policy if exists guild_chat_insert_members on public.guild_chat_messages;
create policy guild_chat_insert_members
on public.guild_chat_messages for insert
to authenticated
with check (
  player_id = (select auth.uid())
  and exists (
    select 1 from public.guild_members gm
    where gm.guild_id = guild_chat_messages.guild_id
      and gm.player_id = (select auth.uid())
  )
);

revoke all on public.guild_chat_messages from anon;
revoke update, delete on public.guild_chat_messages from authenticated;
grant select, insert on public.guild_chat_messages to authenticated;

create or replace function private.prepare_guild_chat_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_guild_id text;
  v_username text;
  v_icon text;
  v_title_id text;
  v_title text;
  v_title_icon text;
begin
  if v_uid is null or new.player_id is distinct from v_uid then raise exception 'FORBIDDEN'; end if;

  new.body := trim(coalesce(new.body,''));
  if char_length(new.body) < 1 or char_length(new.body) > 280 then raise exception 'INVALID_MESSAGE'; end if;

  select gm.guild_id,p.username,p.profile_icon,p.equipped_title_id,d.title,d.icon
  into v_guild_id,v_username,v_icon,v_title_id,v_title,v_title_icon
  from public.guild_members gm
  join public.players p on p.id=gm.player_id
  left join public.achievement_definitions d on d.id=p.equipped_title_id
  where gm.player_id=v_uid and p.account_status='active'
  limit 1;

  if v_guild_id is null then raise exception 'GUILD_MEMBERSHIP_REQUIRED'; end if;
  if new.guild_id is distinct from v_guild_id then raise exception 'FORBIDDEN'; end if;

  if exists (
    select 1 from public.guild_chat_messages
    where player_id=v_uid and created_at > now()-interval '2 seconds'
  ) then raise exception 'CHAT_RATE_LIMIT'; end if;

  new.guild_id := v_guild_id;
  new.sender_username := v_username;
  new.sender_profile_icon := coalesce(v_icon,'pokeball');
  new.sender_title_id := v_title_id;
  new.sender_title := v_title;
  new.sender_title_icon := v_title_icon;
  new.deleted_at := null;
  return new;
end;
$$;

revoke all on function private.prepare_guild_chat_message() from public,anon,authenticated;

drop trigger if exists guild_chat_prepare on public.guild_chat_messages;
create trigger guild_chat_prepare
before insert on public.guild_chat_messages
for each row execute function private.prepare_guild_chat_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='guild_chat_messages'
  ) then
    alter publication supabase_realtime add table public.guild_chat_messages;
  end if;
end $$;

alter table public.battles
  add column if not exists forfeited_by uuid references public.players(id) on delete set null,
  add column if not exists forfeit_rating_neutral boolean not null default false,
  add column if not exists forfeited_at timestamptz;

create or replace function public.server_forfeit_battle(p_actor_id uuid, p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  b public.battles%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_neutral boolean;
  v_cr integer;
  v_or integer;
  v_cr_after integer;
  v_or_after integer;
  v_c_expected numeric;
  v_o_expected numeric;
  v_pot bigint;
  v_pair_count integer;
  v_reward boolean := false;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('drafting','selecting') then raise exception 'INVALID_STATUS'; end if;

  v_loser := p_actor_id;
  v_winner := case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  v_neutral := not exists (
    select 1 from public.battle_selections where battle_id=b.id and player_id=p_actor_id
  ) and not exists (
    select 1 from public.battle_draft_cards where battle_id=b.id and player_id=p_actor_id
  );

  perform 1 from public.players
  where id in (b.challenger_id,b.opponent_id)
  order by id for update;

  select battle_rating into v_cr from public.players where id=b.challenger_id;
  select battle_rating into v_or from public.players where id=b.opponent_id;
  v_cr_after := v_cr;
  v_or_after := v_or;

  if not v_neutral then
    select count(*) into v_pair_count
    from public.battles x
    where x.status='completed'
      and x.reward_eligible
      and x.completed_at>=now()-interval '24 hours'
      and (
        (x.challenger_id=b.challenger_id and x.opponent_id=b.opponent_id)
        or (x.challenger_id=b.opponent_id and x.opponent_id=b.challenger_id)
      );

    v_reward := v_pair_count < 5;
    v_c_expected := 1/(1+power(10::numeric,(v_or-v_cr)/400.0));
    v_o_expected := 1-v_c_expected;
    v_cr_after := round(v_cr + 24*((case when v_winner=b.challenger_id then 1 else 0 end)-v_c_expected));
    v_or_after := round(v_or + 24*((case when v_winner=b.opponent_id then 1 else 0 end)-v_o_expected));

    update public.players
    set battle_rating=case when id=b.challenger_id then v_cr_after else v_or_after end
    where id in (b.challenger_id,b.opponent_id);

    update public.players
    set battle_wins=battle_wins+1,
        battle_streak=battle_streak+1,
        best_battle_streak=greatest(best_battle_streak,battle_streak+1)
    where id=v_winner;

    update public.players
    set battle_losses=battle_losses+1,battle_streak=0
    where id=v_loser;

    if v_reward then
      update public.players
      set xp=xp+case when id=v_winner then 50 else 20 end,
          level=greatest(level,1+floor((xp+case when id=v_winner then 50 else 20 end)/250.0)::integer)
      where id in (b.challenger_id,b.opponent_id);
    end if;
  end if;

  if b.stake_type='coins' then
    select coalesce(sum(amount),0) into v_pot
    from public.battle_coin_escrows where battle_id=b.id and status='held';
    if v_pot>0 then
      update public.players set coins=coins+v_pot where id=v_winner;
      update public.battle_coin_escrows set status='paid',updated_at=now()
      where battle_id=b.id and status='held';
    end if;
  elsif b.stake_type='card' then
    insert into public.player_cards(player_id,card_id,quantity)
    select v_winner,card_id,sum(quantity)::integer
    from public.battle_card_stakes
    where battle_id=b.id and status='held'
    group by card_id
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+excluded.quantity;

    update public.battle_card_stakes set status='paid',updated_at=now()
    where battle_id=b.id and status='held';
  end if;

  update public.battles
  set status='completed',winner_id=v_winner,completed_at=now(),updated_at=now(),
      reward_eligible=v_reward,
      challenger_rating_before=v_cr,challenger_rating_after=v_cr_after,
      opponent_rating_before=v_or,opponent_rating_after=v_or_after,
      forfeited_by=v_loser,forfeit_rating_neutral=v_neutral,forfeited_at=now(),
      challenger_score=case when v_winner=b.challenger_id then greatest(challenger_score,rounds_to_win) else challenger_score end,
      opponent_score=case when v_winner=b.opponent_id then greatest(opponent_score,rounds_to_win) else opponent_score end
  where id=b.id;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'forfeited',jsonb_build_object(
    'by',v_loser,'winnerId',v_winner,'ratingNeutral',v_neutral,
    'challengerRating',v_cr_after,'opponentRating',v_or_after
  ));

  perform public.server_queue_notification(
    v_winner,'battle_result','Vitória por desistência!',
    case when v_neutral
      then 'O adversário desistiu antes de escolher uma carta. A vitória não alterou o ELO.'
      else 'O adversário desistiu e a batalha foi encerrada a seu favor.'
    end,
    jsonb_build_object('battleId',b.id,'result','win','forfeit',true,'ratingNeutral',v_neutral)
  );

  return jsonb_build_object(
    'completed',true,'winnerId',v_winner,'forfeitedBy',v_loser,
    'ratingNeutral',v_neutral,'challengerRating',v_cr_after,'opponentRating',v_or_after
  );
end;
$$;

revoke all on function public.server_forfeit_battle(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_forfeit_battle(uuid,uuid) to service_role;
