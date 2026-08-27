
create table if not exists public.admin_game_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint admin_game_events_type_check check (event_type in ('free_boosters')),
  constraint admin_game_events_time_check check (ends_at >= starts_at)
);

create index if not exists idx_admin_game_events_active
  on public.admin_game_events(event_type, active, ends_at desc);

alter table public.admin_game_events enable row level security;

revoke all on table public.admin_game_events from anon, authenticated;
grant select on table public.admin_game_events to authenticated;
grant select, insert, update, delete on table public.admin_game_events to service_role;

drop policy if exists "game events readable" on public.admin_game_events;
create policy "game events readable"
  on public.admin_game_events
  for select
  to authenticated
  using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_game_events'
  ) then
    alter publication supabase_realtime add table public.admin_game_events;
  end if;
end;
$$;

create or replace function public.server_admin_grant_coins_batch(
  p_actor_id uuid,
  p_target_ids uuid[],
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_targets uuid[];
  v_player record;
  v_after bigint;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.admin_members where player_id = p_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select array_agg(distinct target_id order by target_id)
  into v_targets
  from unnest(coalesce(p_target_ids, '{}'::uuid[])) as selected(target_id)
  where target_id is not null;

  if coalesce(cardinality(v_targets), 0) < 1
    or cardinality(v_targets) > 100 then
    raise exception 'INVALID_TARGETS';
  end if;

  for v_player in
    select id, username, coins
    from public.players
    where id = any(v_targets)
    order by id
    for update
  loop
    update public.players
    set coins = coins + p_amount
    where id = v_player.id
    returning coins into v_after;

    insert into public.admin_coin_adjustments(
      admin_id, target_id, amount, balance_before, balance_after, note
    )
    values (
      p_actor_id,
      v_player.id,
      p_amount,
      v_player.coins,
      v_after,
      nullif(left(trim(coalesce(p_note, '')), 180), '')
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'targetId', v_player.id,
      'username', v_player.username,
      'amount', p_amount,
      'balanceBefore', v_player.coins,
      'balanceAfter', v_after
    ));
    v_count := v_count + 1;
  end loop;

  if v_count <> cardinality(v_targets) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'recipientCount', v_count,
    'amountEach', p_amount,
    'totalGranted', p_amount * v_count,
    'recipients', v_results
  );
end;
$$;

revoke all on function public.server_admin_grant_coins_batch(uuid, uuid[], bigint, text)
  from public, anon, authenticated;
grant execute on function public.server_admin_grant_coins_batch(uuid, uuid[], bigint, text)
  to service_role;

create or replace function public.server_admin_start_free_boosters(
  p_actor_id uuid,
  p_duration_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_game_events%rowtype;
begin
  if not exists (
    select 1 from public.admin_members where player_id = p_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_duration_minutes is null
    or p_duration_minutes < 1
    or p_duration_minutes > 1440 then
    raise exception 'INVALID_DURATION';
  end if;

  update public.admin_game_events
  set active = false,
      ends_at = least(ends_at, now())
  where event_type = 'free_boosters'
    and active = true;

  insert into public.admin_game_events(
    event_type, title, active, starts_at, ends_at, created_by
  )
  values (
    'free_boosters',
    'Admin Abuse: boosters grátis',
    true,
    now(),
    now() + make_interval(mins => p_duration_minutes),
    p_actor_id
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.server_admin_start_free_boosters(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.server_admin_start_free_boosters(uuid, integer)
  to service_role;

create or replace function public.server_admin_stop_free_boosters(
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_game_events%rowtype;
begin
  if not exists (
    select 1 from public.admin_members where player_id = p_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.admin_game_events
  set active = false,
      ends_at = least(ends_at, now())
  where id = (
    select id
    from public.admin_game_events
    where event_type = 'free_boosters'
      and active = true
      and starts_at <= now()
      and ends_at > now()
    order by created_at desc
    limit 1
  )
  returning * into v_row;

  return case when v_row.id is null then null else to_jsonb(v_row) end;
end;
$$;

revoke all on function public.server_admin_stop_free_boosters(uuid)
  from public, anon, authenticated;
grant execute on function public.server_admin_stop_free_boosters(uuid)
  to service_role;

create or replace function public.server_open_pack(
  p_player_id uuid,
  p_pack_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.packs%rowtype;
  v_coins bigint;
  v_status text;
  v_until timestamptz;
  v_cards jsonb;
  v_opening_id uuid;
  v_count integer;
  v_new_coins bigint;
  v_new_xp bigint;
  v_new_level integer;
  v_effective_price bigint;
  v_free_until timestamptz;
begin
  select * into v_pack from public.packs
  where id = p_pack_id and active = true for share;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;

  select max(ends_at)
  into v_free_until
  from public.admin_game_events
  where event_type = 'free_boosters'
    and active = true
    and starts_at <= now()
    and ends_at > now();

  v_effective_price := case when v_free_until is null then v_pack.price else 0 end;

  select coins, account_status, suspended_until
  into v_coins, v_status, v_until
  from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_status = 'banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status = 'suspended' and v_until is not null and v_until > now()
    then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if v_status = 'suspended' and (v_until is null or v_until <= now()) then
    update public.players
    set account_status = 'active', suspended_until = null, moderation_reason = null
    where id = p_player_id;
  end if;
  if v_coins < v_effective_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  select count(*) into v_count from public.cards where set_id = v_pack.set_id;
  if v_count < 1 then raise exception 'EMPTY_PACK_POOL'; end if;

  with common_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and public.rarity_tier(rarity) = 1
    order by random()
    limit greatest(v_pack.cards_per_pack - 3, 0)
  ), uncommon_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and public.rarity_tier(rarity) = 2
      and id not in (select id from common_pick)
    order by random()
    limit least(2, greatest(v_pack.cards_per_pack - 1, 0))
  ), rare_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and public.rarity_tier(rarity) >= 3
      and id not in (select id from common_pick)
      and id not in (select id from uncommon_pick)
    order by (-ln(greatest(random(), 0.0000001)) / public.rarity_pull_weight(rarity))
    limit case when v_pack.cards_per_pack > 0 then 1 else 0 end
  ), preset as (
    select * from common_pick
    union all
    select * from uncommon_pick
    union all
    select * from rare_pick
  ), filler as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and id not in (select id from preset)
    order by (-ln(greatest(random(), 0.0000001)) / public.rarity_pull_weight(rarity))
    limit greatest(v_pack.cards_per_pack - (select count(*) from preset), 0)
  ), picked as (
    select * from preset
    union all
    select * from filler
  ), upserted as (
    insert into public.player_cards(player_id, card_id, quantity)
    select p_player_id, id, 1 from picked
    on conflict(player_id, card_id)
    do update set quantity = public.player_cards.quantity + 1
    returning card_id
  )
  select jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.pokemon_name,
    'rarity', p.rarity,
    'image', coalesce(nullif(p.image_large, ''), nullif(p.image_small, '')),
    'imageLarge', nullif(p.image_large, ''),
    'imageSmall', nullif(p.image_small, '')
  ))
  into v_cards
  from picked p;

  update public.players
  set coins = coins - v_effective_price,
      xp = xp + 20,
      level = greatest(level, 1 + floor((xp + 20) / 250.0)::integer)
  where id = p_player_id
  returning coins, xp, level into v_new_coins, v_new_xp, v_new_level;

  insert into public.pack_openings(player_id, pack_id, cards_received)
  values (p_player_id, p_pack_id, coalesce(v_cards, '[]'::jsonb))
  returning id into v_opening_id;

  insert into public.player_daily_missions(player_id, mission_date, mission_id, progress)
  values (p_player_id, current_date, 'open_2_packs', 1)
  on conflict(player_id, mission_date, mission_id)
  do update
  set progress = public.player_daily_missions.progress + 1,
      updated_at = now();

  return jsonb_build_object(
    'openingId', v_opening_id,
    'cards', coalesce(v_cards, '[]'::jsonb),
    'coins', v_new_coins,
    'xp', v_new_xp,
    'level', v_new_level,
    'xpGained', 20,
    'pricePaid', v_effective_price,
    'freeBoostersUntil', v_free_until
  );
end;
$$;

revoke all on function public.server_open_pack(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.server_open_pack(uuid, uuid)
  to service_role;
