-- Draft 3 battles, trainer ranks, achievements, equippable titles and ELO privacy.

alter table public.battles drop constraint if exists battles_mode_check;
alter table public.battles
  add constraint battles_mode_check check (mode in ('quick', 'mystery', 'draft3'));

alter table public.battles drop constraint if exists battles_status_check;
alter table public.battles
  add constraint battles_status_check check (
    status in ('invited', 'drafting', 'selecting', 'revealing', 'completed', 'declined', 'cancelled', 'expired')
  );

alter table public.battles
  add column if not exists draft_turn_id uuid references public.players(id) on delete set null,
  add column if not exists draft_pick_count integer not null default 0,
  add column if not exists draft_seconds integer not null default 90;

alter table public.battles drop constraint if exists battles_draft_pick_count_check;
alter table public.battles
  add constraint battles_draft_pick_count_check check (draft_pick_count between 0 and 6);

alter table public.battles drop constraint if exists battles_draft_seconds_check;
alter table public.battles
  add constraint battles_draft_seconds_check check (draft_seconds between 30 and 180);

create index if not exists battles_draft_turn_idx
  on public.battles(draft_turn_id)
  where status = 'drafting';

create table if not exists public.battle_draft_cards (
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id),
  pick_no integer not null check (pick_no between 1 and 3),
  global_pick_no integer not null check (global_pick_no between 1 and 6),
  picked_at timestamptz not null default now(),
  primary key (battle_id, player_id, card_id),
  unique (battle_id, player_id, pick_no),
  unique (battle_id, global_pick_no)
);

create index if not exists battle_draft_cards_battle_player_idx
  on public.battle_draft_cards(battle_id, player_id);

alter table public.battle_draft_cards enable row level security;

drop policy if exists battle_draft_cards_select_participants on public.battle_draft_cards;
create policy battle_draft_cards_select_participants
on public.battle_draft_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.battles b
    where b.id = battle_id
      and (select auth.uid()) in (b.challenger_id, b.opponent_id)
      and (
        b.status in ('drafting', 'completed')
        or player_id = (select auth.uid())
      )
  )
);

revoke all on public.battle_draft_cards from anon, authenticated;
grant select on public.battle_draft_cards to authenticated;
grant all on public.battle_draft_cards to service_role;

create table if not exists public.achievement_definitions (
  id text primary key,
  name text not null,
  title text not null,
  description text not null,
  icon text not null,
  category text not null check (category in ('special', 'battle', 'collection', 'social', 'rank')),
  target integer not null default 1 check (target > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.player_achievements (
  player_id uuid not null references public.players(id) on delete cascade,
  achievement_id text not null references public.achievement_definitions(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (player_id, achievement_id)
);

create index if not exists player_achievements_player_unlocked_idx
  on public.player_achievements(player_id, unlocked_at)
  where unlocked_at is not null;

alter table public.achievement_definitions enable row level security;
alter table public.player_achievements enable row level security;

drop policy if exists achievement_definitions_read on public.achievement_definitions;
create policy achievement_definitions_read
on public.achievement_definitions
for select
to authenticated
using (active);

drop policy if exists player_achievements_read_own on public.player_achievements;
create policy player_achievements_read_own
on public.player_achievements
for select
to authenticated
using (player_id = (select auth.uid()));

revoke all on public.achievement_definitions from anon, authenticated;
revoke all on public.player_achievements from anon, authenticated;
grant select on public.achievement_definitions to authenticated;
grant select on public.player_achievements to authenticated;
grant all on public.achievement_definitions to service_role;
grant all on public.player_achievements to service_role;

insert into public.achievement_definitions
  (id, name, title, description, icon, category, target, sort_order)
values
  ('creator_owner', 'Criador do jogo', 'Criador Supremo', 'Título exclusivo do criador de Pokémon Cards.', '👑', 'special', 1, 1),
  ('beat_creator', 'Derrotou o criador', 'Lenda do Servidor', 'Vença uma batalha contra o criador do jogo.', '⚔️', 'special', 1, 2),
  ('first_win', 'Primeira vitória', 'Primeiro Triunfo', 'Vença sua primeira batalha.', '🏅', 'battle', 1, 10),
  ('wins_10', 'Dez vitórias', 'Duelista', 'Vença 10 batalhas.', '🥊', 'battle', 10, 11),
  ('wins_50', 'Cinquenta vitórias', 'Mestre de Batalha', 'Vença 50 batalhas.', '🏆', 'battle', 50, 12),
  ('streak_3', 'Sequência de 3', 'Em Chamas', 'Consiga 3 vitórias seguidas.', '🔥', 'battle', 3, 13),
  ('streak_5', 'Sequência de 5', 'Imparável', 'Consiga 5 vitórias seguidas.', '💥', 'battle', 5, 14),
  ('draft_win', 'Primeira vitória no Draft 3', 'Estrategista', 'Vença uma batalha no modo Draft 3.', '🧠', 'battle', 1, 15),
  ('draft_perfect', 'Draft perfeito', 'Trinca Perfeita', 'Vença um Draft 3 por 3 a 0.', '🎯', 'battle', 1, 16),
  ('collector_100', 'Coleção centenária', 'Grande Colecionador', 'Tenha 100 cartas diferentes na coleção.', '🗃️', 'collection', 100, 20),
  ('packs_25', 'Caçador de boosters', 'Caçador de Boosters', 'Abra 25 pacotes.', '🎁', 'collection', 25, 21),
  ('trades_10', 'Negociador experiente', 'Negociador', 'Complete 10 trocas.', '🤝', 'social', 10, 30),
  ('rank_starter', 'Starter Trainer', 'Starter Trainer', 'Alcance 1000 pontos de ELO.', '◇', 'rank', 1000, 40),
  ('rank_ace', 'Ace Trainer', 'Ace Trainer', 'Alcance 1500 pontos de ELO.', '◆', 'rank', 1500, 41),
  ('rank_veteran', 'Veteran Trainer', 'Veteran Trainer', 'Alcance 2000 pontos de ELO.', '✦', 'rank', 2000, 42),
  ('rank_elite', 'Elite Trainer', 'Elite Trainer', 'Alcance 2500 pontos de ELO.', '✧', 'rank', 2500, 43),
  ('rank_master', 'Master Trainer', 'Master Trainer', 'Alcance 3000 pontos de ELO.', '★', 'rank', 3000, 44),
  ('rank_grand', 'Grand Trainer', 'Grand Trainer', 'Alcance 3500 pontos de ELO.', '♛', 'rank', 3500, 45)
on conflict (id) do update set
  name = excluded.name,
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  target = excluded.target,
  sort_order = excluded.sort_order,
  active = true;

alter table public.players
  add column if not exists equipped_title_id text references public.achievement_definitions(id) on delete set null,
  add column if not exists show_battle_rating boolean not null default true;

create or replace function public.server_set_achievement_progress(
  p_player_id uuid,
  p_achievement_id text,
  p_progress integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.player_achievements(player_id, achievement_id, progress, unlocked_at, updated_at)
  select
    p_player_id,
    d.id,
    greatest(0, p_progress),
    case when p_progress >= d.target then now() else null end,
    now()
  from public.achievement_definitions d
  where d.id = p_achievement_id and d.active
  on conflict (player_id, achievement_id) do update set
    progress = greatest(public.player_achievements.progress, excluded.progress),
    unlocked_at = coalesce(public.player_achievements.unlocked_at, excluded.unlocked_at),
    updated_at = now();
$$;

create or replace function public.server_refresh_player_achievements(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players%rowtype;
  v_count integer;
  v_creator boolean;
begin
  select * into p from public.players where id = p_player_id;
  if p.id is null then return; end if;

  select exists(select 1 from public.admin_members a where a.player_id = p_player_id) into v_creator;
  perform public.server_set_achievement_progress(p_player_id, 'creator_owner', case when v_creator then 1 else 0 end);

  select count(*) into v_count
  from public.battles b
  where b.status = 'completed'
    and b.winner_id = p_player_id
    and exists (
      select 1 from public.admin_members a
      where a.player_id = case when b.challenger_id = p_player_id then b.opponent_id else b.challenger_id end
    );
  perform public.server_set_achievement_progress(p_player_id, 'beat_creator', v_count);

  perform public.server_set_achievement_progress(p_player_id, 'first_win', p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id, 'wins_10', p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id, 'wins_50', p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id, 'streak_3', p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id, 'streak_5', p.best_battle_streak);

  select count(*) into v_count from public.battles b
  where b.status = 'completed' and b.mode = 'draft3' and b.winner_id = p_player_id;
  perform public.server_set_achievement_progress(p_player_id, 'draft_win', v_count);

  select count(*) into v_count from public.battles b
  where b.status = 'completed'
    and b.mode = 'draft3'
    and b.winner_id = p_player_id
    and (
      (b.challenger_id = p_player_id and b.challenger_score = 3 and b.opponent_score = 0)
      or (b.opponent_id = p_player_id and b.opponent_score = 3 and b.challenger_score = 0)
    );
  perform public.server_set_achievement_progress(p_player_id, 'draft_perfect', v_count);

  select count(*) into v_count from public.player_cards pc
  where pc.player_id = p_player_id and pc.quantity > 0;
  perform public.server_set_achievement_progress(p_player_id, 'collector_100', v_count);

  select count(*) into v_count from public.pack_openings po where po.player_id = p_player_id;
  perform public.server_set_achievement_progress(p_player_id, 'packs_25', v_count);

  select count(*) into v_count from public.trades t
  where t.status::text = 'completed' and p_player_id in (t.sender_id, t.receiver_id);
  perform public.server_set_achievement_progress(p_player_id, 'trades_10', v_count);

  perform public.server_set_achievement_progress(p_player_id, 'rank_starter', p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id, 'rank_ace', p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id, 'rank_veteran', p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id, 'rank_elite', p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id, 'rank_master', p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id, 'rank_grand', p.battle_rating);

  if v_creator and p.equipped_title_id is null then
    update public.players set equipped_title_id = 'creator_owner' where id = p_player_id;
  end if;
end;
$$;

create or replace function public.server_set_equipped_title(
  p_player_id uuid,
  p_achievement_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_achievement_id is not null and not exists (
    select 1 from public.player_achievements pa
    where pa.player_id = p_player_id
      and pa.achievement_id = p_achievement_id
      and pa.unlocked_at is not null
  ) then
    raise exception 'ACHIEVEMENT_LOCKED';
  end if;
  update public.players set equipped_title_id = p_achievement_id where id = p_player_id;
  return p_achievement_id;
end;
$$;

create or replace function public.server_set_rating_visibility(
  p_player_id uuid,
  p_visible boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players set show_battle_rating = coalesce(p_visible, true) where id = p_player_id;
  return coalesce(p_visible, true);
end;
$$;

create or replace function public.enforce_equipped_title_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.equipped_title_id is distinct from old.equipped_title_id
    and new.equipped_title_id is not null
    and not exists (
      select 1 from public.player_achievements pa
      where pa.player_id = new.id
        and pa.achievement_id = new.equipped_title_id
        and pa.unlocked_at is not null
    )
  then
    raise exception 'ACHIEVEMENT_LOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists players_equipped_title_guard on public.players;
create trigger players_equipped_title_guard
before update of equipped_title_id on public.players
for each row execute function public.enforce_equipped_title_unlock();

create or replace function public.server_pick_battle_draft_card(
  p_actor_id uuid,
  p_battle_id uuid,
  p_card_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.battles%rowtype;
  v_player_pick integer;
  v_global_pick integer;
  v_next uuid;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.mode <> 'draft3' or b.status <> 'drafting' then raise exception 'INVALID_STATUS'; end if;
  if p_actor_id not in (b.challenger_id, b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.draft_turn_id <> p_actor_id then raise exception 'NOT_YOUR_TURN'; end if;
  if b.selection_deadline is not null and now() > b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists (
    select 1 from public.player_cards pc
    where pc.player_id = p_actor_id and pc.card_id = p_card_id and pc.quantity > 0
  ) then raise exception 'NOT_OWNED'; end if;
  if exists (
    select 1 from public.battle_draft_cards d
    where d.battle_id = b.id and d.player_id = p_actor_id and d.card_id = p_card_id
  ) then raise exception 'CARD_ALREADY_DRAFTED'; end if;

  select count(*) + 1 into v_player_pick
  from public.battle_draft_cards d where d.battle_id = b.id and d.player_id = p_actor_id;
  if v_player_pick > 3 then raise exception 'DRAFT_COMPLETE_FOR_PLAYER'; end if;
  v_global_pick := b.draft_pick_count + 1;

  insert into public.battle_draft_cards(battle_id, player_id, card_id, pick_no, global_pick_no)
  values (b.id, p_actor_id, p_card_id, v_player_pick, v_global_pick);

  insert into public.battle_events(battle_id, event_type, payload)
  values (b.id, 'draft_card_picked', jsonb_build_object(
    'playerId', p_actor_id, 'cardId', p_card_id, 'pickNo', v_player_pick, 'globalPickNo', v_global_pick
  ));

  if v_global_pick = 6 then
    update public.battles
    set status = 'selecting', draft_pick_count = 6, draft_turn_id = null,
        active_round = 1, selection_deadline = now() + make_interval(secs => selection_seconds), updated_at = now()
    where id = b.id;
    insert into public.battle_events(battle_id, event_type, payload)
    values (b.id, 'draft_completed', jsonb_build_object('round', 1, 'selectionSeconds', b.selection_seconds));
    return jsonb_build_object('completed', true, 'status', 'selecting', 'round', 1);
  end if;

  v_next := case when p_actor_id = b.challenger_id then b.opponent_id else b.challenger_id end;
  update public.battles
  set draft_pick_count = v_global_pick, draft_turn_id = v_next,
      selection_deadline = now() + make_interval(secs => draft_seconds), updated_at = now()
  where id = b.id;
  return jsonb_build_object('completed', false, 'pick', v_global_pick, 'nextPlayerId', v_next);
end;
$$;

create or replace function public.server_create_battle_v2(
  p_actor_id uuid,
  p_opponent_id uuid,
  p_mode text,
  p_stake_type text,
  p_wager_coins bigint default 0,
  p_stake_card_id text default null,
  p_rematch_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_rounds integer; v_invites boolean; v_qty integer; v_cards integer;
begin
  if p_actor_id = p_opponent_id then raise exception 'INVALID_PLAYER'; end if;
  if p_mode not in ('quick', 'mystery', 'draft3') then raise exception 'INVALID_MODE'; end if;
  if p_stake_type not in ('none', 'coins', 'card') then raise exception 'STAKE_NOT_AVAILABLE'; end if;
  if p_stake_type = 'none' then p_wager_coins := 0; p_stake_card_id := null; end if;
  if p_stake_type = 'coins' and not (p_wager_coins = any(array[100,250,500,1000,2500]::bigint[])) then raise exception 'INVALID_WAGER'; end if;
  if p_stake_type = 'card' then p_wager_coins := 0; if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED'; end if; end if;
  if not exists(select 1 from public.friendships f where f.status::text = 'accepted' and ((f.requester_id = p_actor_id and f.addressee_id = p_opponent_id) or (f.requester_id = p_opponent_id and f.addressee_id = p_actor_id))) then raise exception 'NOT_FRIENDS'; end if;
  select battle_invites into v_invites from public.player_settings where player_id = p_opponent_id;
  if v_invites is false then raise exception 'BATTLE_INVITES_DISABLED'; end if;
  if exists(select 1 from public.battles where challenger_id = p_actor_id and opponent_id = p_opponent_id and status = 'invited' and created_at > now() - interval '2 minutes') then raise exception 'INVITE_ALREADY_PENDING'; end if;
  if p_stake_type = 'coins' and ((select coins from public.players where id = p_actor_id) < p_wager_coins or (select coins from public.players where id = p_opponent_id) < p_wager_coins) then raise exception 'NOT_ENOUGH_COINS'; end if;
  if p_mode = 'draft3' then
    select count(*) into v_cards from public.player_cards where player_id = p_actor_id and quantity > 0;
    if v_cards < 3 then raise exception 'DRAFT_NEEDS_3_CARDS'; end if;
    select count(*) into v_cards from public.player_cards where player_id = p_opponent_id and quantity > 0;
    if v_cards < 3 then raise exception 'OPPONENT_NEEDS_3_CARDS'; end if;
  end if;
  v_rounds := case when p_mode in ('mystery', 'draft3') then 2 else 1 end;
  insert into public.battles(challenger_id, opponent_id, mode, stake_type, wager_coins, rounds_to_win, rematch_of)
  values(p_actor_id, p_opponent_id, p_mode, p_stake_type, p_wager_coins, v_rounds, p_rematch_of)
  returning id into v_id;
  if p_stake_type = 'card' then
    update public.player_cards set quantity = quantity - 1 where player_id = p_actor_id and card_id = p_stake_card_id and quantity > 0 returning quantity into v_qty;
    if not found then raise exception 'STAKE_CARD_NOT_OWNED'; end if;
    insert into public.battle_card_stakes(battle_id, player_id, card_id, quantity, status) values(v_id, p_actor_id, p_stake_card_id, 1, 'held');
  end if;
  if p_mode = 'draft3' and (select count(*) from public.player_cards where player_id = p_actor_id and quantity > 0) < 3 then raise exception 'DRAFT_NEEDS_3_CARDS_AFTER_STAKE'; end if;
  insert into public.battle_events(battle_id, event_type, payload)
  values(v_id, 'invited', jsonb_build_object('challengerId', p_actor_id, 'opponentId', p_opponent_id, 'mode', p_mode, 'stakeType', p_stake_type, 'wagerCoins', p_wager_coins, 'stakeCardId', p_stake_card_id, 'rematchOf', p_rematch_of));
  return v_id;
end;
$$;

create or replace function public.server_respond_battle_v2(
  p_actor_id uuid,
  p_battle_id uuid,
  p_accept boolean,
  p_stake_card_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.battles%rowtype; c_coins bigint; o_coins bigint; v_qty integer; v_cards integer;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.opponent_id <> p_actor_id then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'invited' then raise exception 'INVALID_STATUS'; end if;
  if not p_accept then
    if b.stake_type = 'card' then perform public.server_return_card_stakes(b.id); end if;
    update public.battles set status = 'declined', updated_at = now() where id = b.id;
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'declined', '{}');
    perform public.server_queue_notification(b.challenger_id, 'battle_declined', 'Desafio recusado', 'Seu desafio de batalha foi recusado.', jsonb_build_object('battleId', b.id));
    return jsonb_build_object('status', 'declined');
  end if;
  if b.stake_type = 'coins' then
    perform 1 from public.players where id in (b.challenger_id, b.opponent_id) order by id for update;
    select coins into c_coins from public.players where id = b.challenger_id;
    select coins into o_coins from public.players where id = b.opponent_id;
    if c_coins < b.wager_coins or o_coins < b.wager_coins then raise exception 'NOT_ENOUGH_COINS'; end if;
    update public.players set coins = coins - b.wager_coins where id in (b.challenger_id, b.opponent_id);
    insert into public.battle_coin_escrows(battle_id, player_id, amount, status)
    values(b.id, b.challenger_id, b.wager_coins, 'held'), (b.id, b.opponent_id, b.wager_coins, 'held')
    on conflict(battle_id, player_id) do nothing;
  elsif b.stake_type = 'card' then
    if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED'; end if;
    update public.player_cards set quantity = quantity - 1 where player_id = p_actor_id and card_id = p_stake_card_id and quantity > 0 returning quantity into v_qty;
    if not found then raise exception 'STAKE_CARD_NOT_OWNED'; end if;
    insert into public.battle_card_stakes(battle_id, player_id, card_id, quantity, status)
    values(b.id, p_actor_id, p_stake_card_id, 1, 'held') on conflict(battle_id, player_id) do nothing;
  end if;
  if b.mode = 'draft3' then
    select count(*) into v_cards from public.player_cards where player_id = b.challenger_id and quantity > 0;
    if v_cards < 3 then raise exception 'CHALLENGER_NEEDS_3_CARDS'; end if;
    select count(*) into v_cards from public.player_cards where player_id = b.opponent_id and quantity > 0;
    if v_cards < 3 then raise exception 'OPPONENT_NEEDS_3_CARDS'; end if;
    update public.battles
    set status = 'drafting', draft_turn_id = b.challenger_id, draft_pick_count = 0,
        selection_deadline = now() + make_interval(secs => draft_seconds), updated_at = now()
    where id = b.id;
    insert into public.battle_events(battle_id, event_type, payload)
    values(b.id, 'draft_started', jsonb_build_object('turnPlayerId', b.challenger_id, 'draftSeconds', b.draft_seconds));
    perform public.server_queue_notification(b.challenger_id, 'battle_started', 'Draft 3 começou', 'É sua vez de escolher a primeira carta.', jsonb_build_object('battleId', b.id));
    return jsonb_build_object('status', 'drafting', 'turnPlayerId', b.challenger_id, 'draftSeconds', b.draft_seconds);
  end if;
  update public.battles set status = 'selecting', selection_deadline = now() + make_interval(secs => selection_seconds), updated_at = now() where id = b.id;
  insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'started', jsonb_build_object('round', 1, 'selectionSeconds', b.selection_seconds));
  perform public.server_queue_notification(b.challenger_id, 'battle_started', 'Desafio aceito', 'Sua batalha começou. Escolha sua carta!', jsonb_build_object('battleId', b.id));
  return jsonb_build_object('status', 'selecting', 'round', 1, 'selectionSeconds', b.selection_seconds);
end;
$$;

create or replace function public.server_lock_battle_card(
  p_actor_id uuid,
  p_battle_id uuid,
  p_card_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.battles%rowtype; v_count integer;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id, b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'selecting' then raise exception 'INVALID_STATUS'; end if;
  if b.selection_deadline is not null and now() > b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists(select 1 from public.player_cards where player_id = p_actor_id and card_id = p_card_id and quantity > 0) then raise exception 'NOT_OWNED'; end if;
  if exists(select 1 from public.battle_selections where battle_id = b.id and round_no = b.active_round and player_id = p_actor_id) then raise exception 'ALREADY_LOCKED'; end if;
  if b.mode = 'draft3' then
    if not exists(select 1 from public.battle_draft_cards d where d.battle_id = b.id and d.player_id = p_actor_id and d.card_id = p_card_id) then raise exception 'CARD_NOT_IN_DRAFT'; end if;
    if exists(select 1 from public.battle_selections s where s.battle_id = b.id and s.player_id = p_actor_id and s.card_id = p_card_id) then raise exception 'CARD_ALREADY_USED'; end if;
  end if;
  insert into public.battle_selections(battle_id, round_no, player_id, card_id) values(b.id, b.active_round, p_actor_id, p_card_id);
  select count(*) into v_count from public.battle_selections where battle_id = b.id and round_no = b.active_round;
  insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'card_locked', jsonb_build_object('playerId', p_actor_id, 'round', b.active_round));
  return jsonb_build_object('locked', true, 'bothLocked', v_count = 2, 'round', b.active_round);
end;
$$;

create or replace function public.server_timeout_battle(p_actor_id uuid, p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.battles%rowtype; v_card text; v_count integer; v_result jsonb;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id, b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('drafting', 'selecting') then return jsonb_build_object('alreadyResolved', true, 'status', b.status, 'round', b.active_round); end if;
  if b.selection_deadline is null or now() < b.selection_deadline then raise exception 'NOT_EXPIRED'; end if;

  if b.status = 'drafting' then
    select pc.card_id into v_card
    from public.player_cards pc
    where pc.player_id = b.draft_turn_id and pc.quantity > 0
      and not exists(select 1 from public.battle_draft_cards d where d.battle_id = b.id and d.player_id = b.draft_turn_id and d.card_id = pc.card_id)
    order by random() limit 1;
    if v_card is null then
      update public.players p set coins = p.coins + e.amount from public.battle_coin_escrows e where e.battle_id = b.id and e.player_id = p.id and e.status = 'held';
      update public.battle_coin_escrows set status = 'refunded', updated_at = now() where battle_id = b.id and status = 'held';
      perform public.server_return_card_stakes(b.id);
      update public.battles set status = 'cancelled', updated_at = now() where id = b.id;
      return jsonb_build_object('cancelled', true, 'reason', 'draft_player_no_cards');
    end if;
    update public.battles set selection_deadline = now() + interval '1 second' where id = b.id;
    v_result := public.server_pick_battle_draft_card(b.draft_turn_id, b.id, v_card);
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'draft_auto_picked', jsonb_build_object('playerId', b.draft_turn_id, 'cardId', v_card));
    return v_result || jsonb_build_object('timedOut', true);
  end if;

  if not exists(select 1 from public.battle_selections where battle_id = b.id and round_no = b.active_round and player_id = b.challenger_id) then
    if b.mode = 'draft3' then
      select d.card_id into v_card from public.battle_draft_cards d
      where d.battle_id = b.id and d.player_id = b.challenger_id
        and not exists(select 1 from public.battle_selections s where s.battle_id = b.id and s.player_id = b.challenger_id and s.card_id = d.card_id)
      order by random() limit 1;
    else
      select card_id into v_card from public.player_cards where player_id = b.challenger_id and quantity > 0 order by random() limit 1;
    end if;
    if v_card is null then raise exception 'CHALLENGER_NO_CARDS'; end if;
    insert into public.battle_selections(battle_id, round_no, player_id, card_id) values(b.id, b.active_round, b.challenger_id, v_card) on conflict do nothing;
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'auto_locked', jsonb_build_object('playerId', b.challenger_id, 'round', b.active_round));
  end if;
  if not exists(select 1 from public.battle_selections where battle_id = b.id and round_no = b.active_round and player_id = b.opponent_id) then
    if b.mode = 'draft3' then
      select d.card_id into v_card from public.battle_draft_cards d
      where d.battle_id = b.id and d.player_id = b.opponent_id
        and not exists(select 1 from public.battle_selections s where s.battle_id = b.id and s.player_id = b.opponent_id and s.card_id = d.card_id)
      order by random() limit 1;
    else
      select card_id into v_card from public.player_cards where player_id = b.opponent_id and quantity > 0 order by random() limit 1;
    end if;
    if v_card is null then raise exception 'OPPONENT_NO_CARDS'; end if;
    insert into public.battle_selections(battle_id, round_no, player_id, card_id) values(b.id, b.active_round, b.opponent_id, v_card) on conflict do nothing;
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'auto_locked', jsonb_build_object('playerId', b.opponent_id, 'round', b.active_round));
  end if;
  select count(*) into v_count from public.battle_selections where battle_id = b.id and round_no = b.active_round;
  return jsonb_build_object('bothLocked', v_count = 2, 'round', b.active_round, 'timedOut', true);
end;
$$;

create or replace function public.server_cancel_battle(p_actor_id uuid, p_battle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare b public.battles%rowtype;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id, b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('invited', 'drafting', 'selecting') then raise exception 'INVALID_STATUS'; end if;
  if b.status = 'selecting' and exists(select 1 from public.battle_selections where battle_id = b.id) then raise exception 'BATTLE_ALREADY_STARTED'; end if;
  if b.stake_type = 'coins' then
    update public.players p set coins = p.coins + e.amount from public.battle_coin_escrows e where e.battle_id = b.id and e.player_id = p.id and e.status = 'held';
    update public.battle_coin_escrows set status = 'refunded', updated_at = now() where battle_id = b.id and status = 'held';
  elsif b.stake_type = 'card' then perform public.server_return_card_stakes(b.id); end if;
  update public.battles set status = 'cancelled', updated_at = now() where id = b.id;
  insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'cancelled', jsonb_build_object('by', p_actor_id));
  return 'cancelled';
end;
$$;

create or replace function public.server_process_expired_battles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; b public.battles%rowtype; v_result jsonb; v_processed integer := 0;
begin
  for r in
    select id from public.battles
    where status in ('drafting', 'selecting') and selection_deadline is not null and selection_deadline <= now()
    order by selection_deadline asc limit 50
  loop
    begin
      select * into b from public.battles where id = r.id;
      v_result := public.server_timeout_battle(b.challenger_id, b.id);
      select * into b from public.battles where id = r.id;
      if b.status = 'selecting' and exists (
        select 1 from public.battle_selections s where s.battle_id = b.id and s.round_no = b.active_round
        group by s.battle_id, s.round_no having count(*) = 2
      ) then
        perform public.server_resolve_battle_round(b.id);
      end if;
      v_processed := v_processed + 1;
    exception when others then
      begin insert into public.battle_events(battle_id, event_type, payload) values(r.id, 'worker_error', jsonb_build_object('message', sqlerrm)); exception when others then null; end;
    end;
  end loop;
  return v_processed;
end;
$$;

-- Draft 3 always plays all three rounds, even after a player wins the first two.
create or replace function public.server_finish_battle_round(p_battle_id uuid, p_round_no integer, p_challenger_power numeric, p_opponent_power numeric, p_challenger_roll numeric, p_opponent_roll numeric, p_winner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b public.battles%rowtype; c_card text; o_card text; c_score integer; o_score integer; v_complete boolean; v_winner uuid; v_loser uuid; v_pot bigint; v_pair_count integer; v_reward boolean; v_cr integer; v_or integer; v_c_expected numeric; v_o_expected numeric; v_cr_after integer; v_or_after integer; v_c_species text; v_o_species text; v_species_count integer;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status <> 'selecting' or b.active_round <> p_round_no then raise exception 'INVALID_STATUS'; end if;
  if p_winner_id not in (b.challenger_id, b.opponent_id) then raise exception 'INVALID_WINNER'; end if;
  select card_id into c_card from public.battle_selections where battle_id = b.id and round_no = p_round_no and player_id = b.challenger_id;
  select card_id into o_card from public.battle_selections where battle_id = b.id and round_no = p_round_no and player_id = b.opponent_id;
  if c_card is null or o_card is null then raise exception 'SELECTIONS_MISSING'; end if;
  if exists(select 1 from public.battle_rounds where battle_id = b.id and round_no = p_round_no) then raise exception 'ROUND_ALREADY_RESOLVED'; end if;
  insert into public.battle_rounds(battle_id, round_no, challenger_card_id, opponent_card_id, challenger_power, opponent_power, challenger_roll, opponent_roll, winner_id)
  values(b.id, p_round_no, c_card, o_card, p_challenger_power, p_opponent_power, p_challenger_roll, p_opponent_roll, p_winner_id);

  select coalesce(pokedex_numbers[1]::text, lower(pokemon_name)) into v_c_species from public.cards where id = c_card;
  select coalesce(pokedex_numbers[1]::text, lower(pokemon_name)) into v_o_species from public.cards where id = o_card;
  insert into public.player_daily_battle_species(player_id, mission_date, species_key, card_id) values(b.challenger_id, current_date, v_c_species, c_card) on conflict do nothing;
  insert into public.player_daily_battle_species(player_id, mission_date, species_key, card_id) values(b.opponent_id, current_date, v_o_species, o_card) on conflict do nothing;
  select count(*) into v_species_count from public.player_daily_battle_species where player_id = b.challenger_id and mission_date = current_date;
  insert into public.player_daily_missions(player_id, mission_date, mission_id, progress) values(b.challenger_id, current_date, 'use_3_species', v_species_count) on conflict(player_id, mission_date, mission_id) do update set progress = greatest(public.player_daily_missions.progress, excluded.progress), updated_at = now();
  select count(*) into v_species_count from public.player_daily_battle_species where player_id = b.opponent_id and mission_date = current_date;
  insert into public.player_daily_missions(player_id, mission_date, mission_id, progress) values(b.opponent_id, current_date, 'use_3_species', v_species_count) on conflict(player_id, mission_date, mission_id) do update set progress = greatest(public.player_daily_missions.progress, excluded.progress), updated_at = now();

  c_score := b.challenger_score + case when p_winner_id = b.challenger_id then 1 else 0 end;
  o_score := b.opponent_score + case when p_winner_id = b.opponent_id then 1 else 0 end;
  v_complete := case when b.mode = 'draft3' then p_round_no >= 3 else c_score >= b.rounds_to_win or o_score >= b.rounds_to_win end;
  if v_complete then
    v_winner := case when c_score > o_score then b.challenger_id else b.opponent_id end;
    v_loser := case when v_winner = b.challenger_id then b.opponent_id else b.challenger_id end;
    select count(*) into v_pair_count from public.battles x where x.status = 'completed' and x.reward_eligible and x.completed_at >= now() - interval '24 hours' and ((x.challenger_id = b.challenger_id and x.opponent_id = b.opponent_id) or (x.challenger_id = b.opponent_id and x.opponent_id = b.challenger_id));
    v_reward := v_pair_count < 5;
    perform 1 from public.players where id in (b.challenger_id, b.opponent_id) order by id for update;
    select battle_rating into v_cr from public.players where id = b.challenger_id;
    select battle_rating into v_or from public.players where id = b.opponent_id;
    v_cr_after := v_cr; v_or_after := v_or;
    if v_reward then
      v_c_expected := 1 / (1 + power(10::numeric, (v_or - v_cr) / 400.0));
      v_o_expected := 1 - v_c_expected;
      v_cr_after := round(v_cr + 24 * ((case when v_winner = b.challenger_id then 1 else 0 end) - v_c_expected));
      v_or_after := round(v_or + 24 * ((case when v_winner = b.opponent_id then 1 else 0 end) - v_o_expected));
      update public.players set battle_rating = case when id = b.challenger_id then v_cr_after else v_or_after end where id in (b.challenger_id, b.opponent_id);
    end if;
    update public.players set battle_wins = battle_wins + 1, battle_streak = battle_streak + 1, best_battle_streak = greatest(best_battle_streak, battle_streak + 1) where id = v_winner;
    update public.players set battle_losses = battle_losses + 1, battle_streak = 0 where id = v_loser;
    update public.battles set challenger_score = c_score, opponent_score = o_score, status = 'completed', winner_id = v_winner, completed_at = now(), updated_at = now(), reward_eligible = v_reward, challenger_rating_before = v_cr, challenger_rating_after = v_cr_after, opponent_rating_before = v_or, opponent_rating_after = v_or_after where id = b.id;
    if b.stake_type = 'coins' then
      select coalesce(sum(amount), 0) into v_pot from public.battle_coin_escrows where battle_id = b.id and status = 'held';
      if v_pot > 0 then update public.players set coins = coins + v_pot where id = v_winner; update public.battle_coin_escrows set status = 'paid', updated_at = now() where battle_id = b.id and status = 'held'; end if;
    elsif b.stake_type = 'card' then
      insert into public.player_cards(player_id, card_id, quantity) select v_winner, card_id, sum(quantity)::integer from public.battle_card_stakes where battle_id = b.id and status = 'held' group by card_id on conflict(player_id, card_id) do update set quantity = public.player_cards.quantity + excluded.quantity;
      update public.battle_card_stakes set status = 'paid', updated_at = now() where battle_id = b.id and status = 'held';
    end if;
    if v_reward then
      update public.players set xp = xp + case when id = v_winner then 50 else 20 end, level = greatest(level, 1 + floor((xp + case when id = v_winner then 50 else 20 end) / 250.0)::integer) where id in (b.challenger_id, b.opponent_id);
      insert into public.player_daily_missions(player_id, mission_date, mission_id, progress) values(b.challenger_id, current_date, 'play_2_battles', 1), (b.opponent_id, current_date, 'play_2_battles', 1), (v_winner, current_date, 'win_1_battle', 1) on conflict(player_id, mission_date, mission_id) do update set progress = public.player_daily_missions.progress + excluded.progress, updated_at = now();
    end if;
    perform public.server_refresh_player_achievements(b.challenger_id);
    perform public.server_refresh_player_achievements(b.opponent_id);
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'completed', jsonb_build_object('winnerId', v_winner, 'challengerScore', c_score, 'opponentScore', o_score, 'rewardEligible', v_reward, 'challengerRating', v_cr_after, 'opponentRating', v_or_after));
    perform public.server_queue_notification(v_winner, 'battle_result', 'Vitória!', 'Você venceu a batalha' || case when b.stake_type = 'coins' then ' e recebeu o pote de moedas.' when b.stake_type = 'card' then ' e recebeu as cartas apostadas.' else '!' end, jsonb_build_object('battleId', b.id, 'result', 'win', 'rating', case when v_winner = b.challenger_id then v_cr_after else v_or_after end));
    perform public.server_queue_notification(v_loser, 'battle_result', 'Batalha encerrada', 'A batalha terminou. Abra o histórico para ver o resultado.', jsonb_build_object('battleId', b.id, 'result', 'loss', 'rating', case when v_loser = b.challenger_id then v_cr_after else v_or_after end));
    return jsonb_build_object('completed', true, 'winnerId', v_winner, 'challengerScore', c_score, 'opponentScore', o_score, 'rewardEligible', v_reward, 'challengerRating', v_cr_after, 'opponentRating', v_or_after);
  end if;
  update public.battles set challenger_score = c_score, opponent_score = o_score, active_round = active_round + 1, selection_deadline = now() + make_interval(secs => selection_seconds), updated_at = now() where id = b.id;
  insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'round_resolved', jsonb_build_object('round', p_round_no, 'winnerId', p_winner_id, 'challengerScore', c_score, 'opponentScore', o_score));
  return jsonb_build_object('completed', false, 'nextRound', p_round_no + 1, 'challengerScore', c_score, 'opponentScore', o_score);
end;
$$;

create or replace function public.refresh_achievements_after_trade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status::text = 'completed' and (tg_op = 'INSERT' or old.status::text is distinct from 'completed') then
    perform public.server_refresh_player_achievements(new.sender_id);
    perform public.server_refresh_player_achievements(new.receiver_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trades_refresh_achievements on public.trades;
create trigger trades_refresh_achievements after insert or update of status on public.trades
for each row execute function public.refresh_achievements_after_trade();

create or replace function public.refresh_achievements_after_pack()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.server_refresh_player_achievements(new.player_id);
  return new;
end;
$$;

drop trigger if exists pack_openings_refresh_achievements on public.pack_openings;
create trigger pack_openings_refresh_achievements after insert on public.pack_openings
for each row execute function public.refresh_achievements_after_pack();

revoke all on function public.server_set_achievement_progress(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.server_refresh_player_achievements(uuid) from public, anon, authenticated;
revoke all on function public.server_set_equipped_title(uuid, text) from public, anon, authenticated;
revoke all on function public.server_set_rating_visibility(uuid, boolean) from public, anon, authenticated;
revoke all on function public.server_pick_battle_draft_card(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.enforce_equipped_title_unlock() from public, anon, authenticated;
revoke all on function public.refresh_achievements_after_trade() from public, anon, authenticated;
revoke all on function public.refresh_achievements_after_pack() from public, anon, authenticated;
revoke all on function public.server_create_battle_v2(uuid, uuid, text, text, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.server_respond_battle_v2(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.server_lock_battle_card(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.server_timeout_battle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_cancel_battle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_process_expired_battles() from public, anon, authenticated;
revoke all on function public.server_finish_battle_round(uuid, integer, numeric, numeric, numeric, numeric, uuid) from public, anon, authenticated;

grant execute on function public.server_set_achievement_progress(uuid, text, integer) to service_role;
grant execute on function public.server_refresh_player_achievements(uuid) to service_role;
grant execute on function public.server_set_equipped_title(uuid, text) to service_role;
grant execute on function public.server_set_rating_visibility(uuid, boolean) to service_role;
grant execute on function public.server_pick_battle_draft_card(uuid, uuid, text) to service_role;
grant execute on function public.server_create_battle_v2(uuid, uuid, text, text, bigint, text, uuid) to service_role;
grant execute on function public.server_respond_battle_v2(uuid, uuid, boolean, text) to service_role;
grant execute on function public.server_lock_battle_card(uuid, uuid, text) to service_role;
grant execute on function public.server_timeout_battle(uuid, uuid) to service_role;
grant execute on function public.server_cancel_battle(uuid, uuid) to service_role;
grant execute on function public.server_process_expired_battles() to service_role;
grant execute on function public.server_finish_battle_round(uuid, integer, numeric, numeric, numeric, numeric, uuid) to service_role;

do $$ declare r record; begin
  for r in select id from public.players loop
    perform public.server_refresh_player_achievements(r.id);
  end loop;
end $$;
