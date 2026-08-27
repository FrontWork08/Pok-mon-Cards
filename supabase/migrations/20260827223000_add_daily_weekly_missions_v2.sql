-- Daily and weekly missions backed by server-side progress calculation.
-- Legacy daily mission tables remain untouched for older published clients.

create table if not exists public.mission_definitions_v2 (
  id text primary key,
  title text not null,
  description text not null,
  cadence text not null check (cadence in ('daily', 'weekly')),
  event_type text not null check (event_type in (
    'pack_opened', 'battle_completed', 'battle_won', 'trade_completed',
    'market_listing', 'market_sale', 'card_discovered'
  )),
  target integer not null check (target > 0),
  reward_coins integer not null default 0 check (reward_coins >= 0),
  reward_xp integer not null default 0 check (reward_xp >= 0),
  reward_diamonds integer not null default 0 check (reward_diamonds >= 0),
  action_route text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_missions_v2 (
  player_id uuid not null references public.players(id) on delete cascade,
  mission_id text not null references public.mission_definitions_v2(id) on delete cascade,
  period_start date not null,
  progress integer not null default 0 check (progress >= 0),
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, mission_id, period_start)
);

alter table public.mission_definitions_v2 enable row level security;
alter table public.player_missions_v2 enable row level security;

drop policy if exists mission_definitions_v2_read_active on public.mission_definitions_v2;
create policy mission_definitions_v2_read_active
  on public.mission_definitions_v2
  for select
  to authenticated
  using (active = true);

drop policy if exists player_missions_v2_read_own on public.player_missions_v2;
create policy player_missions_v2_read_own
  on public.player_missions_v2
  for select
  to authenticated
  using ((select auth.uid()) = player_id);

revoke all on public.mission_definitions_v2 from anon;
revoke all on public.player_missions_v2 from anon;
grant select on public.mission_definitions_v2 to authenticated;
grant select on public.player_missions_v2 to authenticated;

create index if not exists player_missions_v2_current_idx
  on public.player_missions_v2 (player_id, period_start desc);
create index if not exists pack_openings_player_opened_mission_idx
  on public.pack_openings (player_id, opened_at desc);
create index if not exists player_cards_player_obtained_mission_idx
  on public.player_cards (player_id, first_obtained_at desc);
create index if not exists market_listings_seller_created_mission_idx
  on public.market_listings (seller_id, created_at desc);

insert into public.mission_definitions_v2
  (id, title, description, cadence, event_type, target, reward_coins, reward_xp, reward_diamonds, action_route, sort_order)
values
  ('d_open_1', 'Primeiro booster', 'Abra 1 booster hoje.', 'daily', 'pack_opened', 1, 1200, 30, 0, '/(tabs)/packs', 10),
  ('d_open_3', 'Caçador de pulls', 'Abra 3 boosters hoje.', 'daily', 'pack_opened', 3, 3000, 70, 0, '/(tabs)/packs', 20),
  ('d_battle_2', 'Hora do duelo', 'Complete 2 batalhas hoje.', 'daily', 'battle_completed', 2, 2500, 60, 0, '/(tabs)/battles', 30),
  ('d_win_1', 'Vitória do dia', 'Vença 1 batalha hoje.', 'daily', 'battle_won', 1, 3500, 90, 0, '/(tabs)/battles', 40),
  ('d_trade_1', 'Troca justa', 'Conclua 1 troca hoje.', 'daily', 'trade_completed', 1, 2500, 60, 0, '/(tabs)/trade', 50),
  ('d_list_1', 'Vitrine aberta', 'Coloque 1 carta à venda hoje.', 'daily', 'market_listing', 1, 1800, 40, 0, '/marketplace', 60),
  ('w_open_15', 'Maratona de boosters', 'Abra 15 boosters nesta semana.', 'weekly', 'pack_opened', 15, 20000, 500, 2, '/(tabs)/packs', 110),
  ('w_battle_10', 'Temporada de duelos', 'Complete 10 batalhas nesta semana.', 'weekly', 'battle_completed', 10, 16000, 400, 1, '/(tabs)/battles', 120),
  ('w_win_5', 'Sequência de campeão', 'Vença 5 batalhas nesta semana.', 'weekly', 'battle_won', 5, 25000, 650, 3, '/(tabs)/battles', 130),
  ('w_trade_3', 'Negociador Pokémon', 'Conclua 3 trocas nesta semana.', 'weekly', 'trade_completed', 3, 18000, 450, 2, '/(tabs)/trade', 140),
  ('w_sales_2', 'Mestre da loja', 'Venda 2 cartas no Mercado nesta semana.', 'weekly', 'market_sale', 2, 15000, 400, 2, '/marketplace', 150),
  ('w_collect_20', 'Explorador de coleções', 'Descubra 20 cartas diferentes nesta semana.', 'weekly', 'card_discovered', 20, 22000, 550, 2, '/(tabs)/packs', 160)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  cadence = excluded.cadence,
  event_type = excluded.event_type,
  target = excluded.target,
  reward_coins = excluded.reward_coins,
  reward_xp = excluded.reward_xp,
  reward_diamonds = excluded.reward_diamonds,
  action_route = excluded.action_route,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

create or replace function private.calculate_mission_progress(
  p_player_id uuid,
  p_event_type text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_progress bigint := 0;
begin
  case p_event_type
    when 'pack_opened' then
      select count(*) into v_progress
      from public.pack_openings
      where player_id = p_player_id
        and opened_at >= p_period_start and opened_at < p_period_end;
    when 'battle_completed' then
      select count(*) into v_progress
      from public.battles
      where status = 'completed'
        and completed_at >= p_period_start and completed_at < p_period_end
        and (challenger_id = p_player_id or opponent_id = p_player_id);
    when 'battle_won' then
      select count(*) into v_progress
      from public.battles
      where status = 'completed' and winner_id = p_player_id
        and completed_at >= p_period_start and completed_at < p_period_end;
    when 'trade_completed' then
      select count(*) into v_progress
      from public.trades
      where status = 'completed'
        and updated_at >= p_period_start and updated_at < p_period_end
        and (sender_id = p_player_id or receiver_id = p_player_id);
    when 'market_listing' then
      select count(*) into v_progress
      from public.market_listings
      where seller_id = p_player_id
        and created_at >= p_period_start and created_at < p_period_end;
    when 'market_sale' then
      select count(*) into v_progress
      from public.market_listings
      where seller_id = p_player_id and status = 'sold'
        and sold_at >= p_period_start and sold_at < p_period_end;
    when 'card_discovered' then
      select count(*) into v_progress
      from public.player_cards
      where player_id = p_player_id
        and first_obtained_at >= p_period_start and first_obtained_at < p_period_end;
    else
      v_progress := 0;
  end case;
  return least(v_progress, 2147483647)::integer;
end;
$$;

revoke all on function private.calculate_mission_progress(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.get_my_missions_v2()
returns table (
  id text,
  title text,
  description text,
  cadence text,
  event_type text,
  target integer,
  reward_coins integer,
  reward_xp integer,
  reward_diamonds integer,
  action_route text,
  progress integer,
  claimed boolean,
  period_start date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := auth.uid();
  v_definition public.mission_definitions_v2%rowtype;
  v_period_start date;
  v_period_end date;
  v_progress integer;
begin
  if v_player_id is null then raise exception 'UNAUTHORIZED'; end if;

  for v_definition in
    select * from public.mission_definitions_v2 where active = true order by sort_order, id
  loop
    v_period_start := case when v_definition.cadence = 'weekly' then date_trunc('week', current_date)::date else current_date end;
    v_period_end := v_period_start + case when v_definition.cadence = 'weekly' then 7 else 1 end;
    v_progress := private.calculate_mission_progress(v_player_id, v_definition.event_type, v_period_start::timestamptz, v_period_end::timestamptz);

    insert into public.player_missions_v2 (player_id, mission_id, period_start, progress, updated_at)
    values (v_player_id, v_definition.id, v_period_start, v_progress, now())
    on conflict on constraint player_missions_v2_pkey do update
      set progress = excluded.progress, updated_at = now();
  end loop;

  return query
  select d.id, d.title, d.description, d.cadence, d.event_type, d.target,
         d.reward_coins, d.reward_xp, d.reward_diamonds, d.action_route,
         p.progress, p.claimed, p.period_start
  from public.mission_definitions_v2 d
  join public.player_missions_v2 p on p.mission_id = d.id and p.player_id = v_player_id
  where d.active = true
    and p.period_start = case when d.cadence = 'weekly' then date_trunc('week', current_date)::date else current_date end
  order by d.sort_order, d.id;
end;
$$;

revoke all on function public.get_my_missions_v2() from public, anon;
grant execute on function public.get_my_missions_v2() to authenticated;

create or replace function public.claim_mission_v2(p_mission_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := auth.uid();
  v_definition public.mission_definitions_v2%rowtype;
  v_period_start date;
  v_period_end date;
  v_progress integer;
  v_claimed boolean;
begin
  if v_player_id is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_definition
  from public.mission_definitions_v2
  where id = p_mission_id and active = true;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;

  v_period_start := case when v_definition.cadence = 'weekly' then date_trunc('week', current_date)::date else current_date end;
  v_period_end := v_period_start + case when v_definition.cadence = 'weekly' then 7 else 1 end;
  v_progress := private.calculate_mission_progress(v_player_id, v_definition.event_type, v_period_start::timestamptz, v_period_end::timestamptz);

  insert into public.player_missions_v2 (player_id, mission_id, period_start, progress, updated_at)
  values (v_player_id, v_definition.id, v_period_start, v_progress, now())
  on conflict on constraint player_missions_v2_pkey do update
    set progress = excluded.progress, updated_at = now();

  select claimed into v_claimed
  from public.player_missions_v2
  where player_id = v_player_id and mission_id = v_definition.id and period_start = v_period_start
  for update;

  if v_progress < v_definition.target then raise exception 'MISSION_NOT_COMPLETE'; end if;
  if v_claimed then raise exception 'ALREADY_CLAIMED'; end if;

  update public.player_missions_v2
  set claimed = true, updated_at = now()
  where player_id = v_player_id and mission_id = v_definition.id and period_start = v_period_start;

  update public.players
  set coins = coins + v_definition.reward_coins,
      diamonds = diamonds + v_definition.reward_diamonds,
      xp = xp + v_definition.reward_xp,
      level = greatest(level, 1 + floor((xp + v_definition.reward_xp) / 250.0)::integer)
  where id = v_player_id;

  return jsonb_build_object(
    'coins', v_definition.reward_coins,
    'xp', v_definition.reward_xp,
    'diamonds', v_definition.reward_diamonds,
    'cadence', v_definition.cadence
  );
end;
$$;

revoke all on function public.claim_mission_v2(text) from public, anon;
grant execute on function public.claim_mission_v2(text) to authenticated;
