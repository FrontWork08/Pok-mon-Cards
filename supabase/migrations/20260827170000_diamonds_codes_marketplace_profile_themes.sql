-- Diamonds, one-card legendary pack, single-use reward codes, profile icons and secure player marketplace.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter table public.players
  add column if not exists diamonds bigint not null default 0,
  add column if not exists profile_icon text not null default 'pokeball';

alter table public.players drop constraint if exists players_diamonds_check;
alter table public.players add constraint players_diamonds_check check (diamonds >= 0);
alter table public.players drop constraint if exists players_profile_icon_check;
alter table public.players add constraint players_profile_icon_check
  check (profile_icon = any(array['pokeball','trainer','electric','fire','water','leaf','ghost','dragon','diamond']));

do $$ declare v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'player_settings'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%theme%'
  loop
    execute format('alter table public.player_settings drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.player_settings
  add constraint player_settings_theme_check
  check (theme = any(array[
    'trainer','midnight','poke_red','electric','ghost','fire','water',
    'kanto','johto','hoenn','sinnoh'
  ]));

create table if not exists public.diamond_pack_config (
  id smallint primary key default 1 check (id = 1),
  cost_diamonds bigint not null default 25 check (cost_diamonds > 0),
  min_value_usd numeric(12,2) not null default 25 check (min_value_usd >= 25),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.diamond_pack_config(id, cost_diamonds, min_value_usd, active)
values (1, 25, 25, true)
on conflict (id) do nothing;

create table if not exists public.diamond_pack_openings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  diamonds_spent bigint not null check (diamonds_spent > 0),
  card_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists diamond_pack_openings_player_created_idx
  on public.diamond_pack_openings(player_id, created_at desc);

create table if not exists public.redeem_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  reward jsonb not null,
  active boolean not null default true,
  max_total_uses integer check (max_total_uses is null or max_total_uses > 0),
  expires_at timestamptz,
  created_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.code_redemptions (
  code_id uuid not null references public.redeem_codes(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  reward_snapshot jsonb not null,
  redeemed_at timestamptz not null default now(),
  primary key(code_id, player_id)
);
create index if not exists code_redemptions_player_created_idx
  on public.code_redemptions(player_id, redeemed_at desc);

create table if not exists public.player_shops (
  player_id uuid primary key references public.players(id) on delete cascade,
  name text not null,
  theme_style text not null default 'guild'
    check (theme_style = any(array['guild','classic','night'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(name) between 3 and 32)
);

create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.players(id) on delete cascade,
  buyer_id uuid references public.players(id) on delete set null,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_coins bigint not null check (unit_price_coins between 1 and 100000000),
  status text not null default 'active'
    check (status = any(array['active','sold','cancelled'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists market_listings_active_created_idx
  on public.market_listings(created_at desc) where status = 'active';
create index if not exists market_listings_seller_status_idx
  on public.market_listings(seller_id, status, created_at desc);
create index if not exists market_listings_card_status_idx
  on public.market_listings(card_id, status);

create table if not exists public.admin_diamond_adjustments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.players(id) on delete restrict,
  target_id uuid not null references public.players(id) on delete cascade,
  amount bigint not null check (amount > 0),
  balance_before bigint not null,
  balance_after bigint not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists admin_diamond_adjustments_target_created_idx
  on public.admin_diamond_adjustments(target_id, created_at desc);
create index if not exists admin_diamond_adjustments_admin_created_idx
  on public.admin_diamond_adjustments(admin_id, created_at desc);

alter table public.diamond_pack_config enable row level security;
alter table public.diamond_pack_openings enable row level security;
alter table public.redeem_codes enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.player_shops enable row level security;
alter table public.market_listings enable row level security;
alter table public.admin_diamond_adjustments enable row level security;

drop policy if exists diamond_pack_config_read_authenticated on public.diamond_pack_config;
create policy diamond_pack_config_read_authenticated on public.diamond_pack_config
  for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists diamond_pack_openings_read_own on public.diamond_pack_openings;
create policy diamond_pack_openings_read_own on public.diamond_pack_openings
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists code_redemptions_read_own on public.code_redemptions;
create policy code_redemptions_read_own on public.code_redemptions
  for select to authenticated using (player_id = (select auth.uid()));

drop policy if exists player_shops_read_authenticated on public.player_shops;
create policy player_shops_read_authenticated on public.player_shops
  for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists market_listings_read_available_or_involved on public.market_listings;
create policy market_listings_read_available_or_involved on public.market_listings
  for select to authenticated
  using (
    status = 'active'
    or seller_id = (select auth.uid())
    or buyer_id = (select auth.uid())
  );

revoke all on public.diamond_pack_config, public.diamond_pack_openings,
  public.redeem_codes, public.code_redemptions, public.player_shops,
  public.market_listings, public.admin_diamond_adjustments
  from public, anon, authenticated;
grant select on public.diamond_pack_config, public.diamond_pack_openings,
  public.code_redemptions, public.player_shops, public.market_listings
  to authenticated;
grant all on public.diamond_pack_config, public.diamond_pack_openings,
  public.redeem_codes, public.code_redemptions, public.player_shops,
  public.market_listings, public.admin_diamond_adjustments
  to service_role;

create or replace function private.set_profile_icon(p_icon text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_icon is null or p_icon <> all(array['pokeball','trainer','electric','fire','water','leaf','ghost','dragon','diamond'])
    then raise exception 'INVALID_PROFILE_ICON'; end if;
  update public.players set profile_icon = p_icon where id = v_actor;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  return p_icon;
end;
$$;

create or replace function public.set_profile_icon(p_icon text)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.set_profile_icon(p_icon); $$;

create or replace function private.redeem_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_normalized text;
  v_code public.redeem_codes%rowtype;
  v_uses integer;
  v_coins bigint;
  v_diamonds bigint;
  v_reward_coins bigint;
  v_reward_diamonds bigint;
  v_card_id text;
  v_card_quantity integer;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  v_normalized := upper(regexp_replace(trim(coalesce(p_code,'')), '\s+', '', 'g'));
  if v_normalized !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'INVALID_CODE'; end if;

  select * into v_code from public.redeem_codes
  where code = v_normalized for update;
  if not found then raise exception 'CODE_NOT_FOUND'; end if;
  if not v_code.active then raise exception 'CODE_INACTIVE'; end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then raise exception 'CODE_EXPIRED'; end if;
  if exists (
    select 1 from public.code_redemptions
    where code_id = v_code.id and player_id = v_actor
  ) then raise exception 'CODE_ALREADY_REDEEMED'; end if;

  select count(*) into v_uses from public.code_redemptions where code_id = v_code.id;
  if v_code.max_total_uses is not null and v_uses >= v_code.max_total_uses
    then raise exception 'CODE_LIMIT_REACHED'; end if;

  v_reward_coins := greatest(0, least(100000000, coalesce((v_code.reward->>'coins')::bigint, 0)));
  v_reward_diamonds := greatest(0, least(1000000, coalesce((v_code.reward->>'diamonds')::bigint, 0)));
  v_card_id := nullif(v_code.reward->>'cardId', '');
  v_card_quantity := greatest(0, least(99, coalesce((v_code.reward->>'cardQuantity')::integer, 0)));

  if v_reward_coins = 0 and v_reward_diamonds = 0 and (v_card_id is null or v_card_quantity = 0)
    then raise exception 'EMPTY_REWARD'; end if;
  if v_card_id is not null and not exists(select 1 from public.cards where id = v_card_id)
    then raise exception 'CARD_NOT_FOUND'; end if;

  update public.players
  set coins = coins + v_reward_coins,
      diamonds = diamonds + v_reward_diamonds
  where id = v_actor
  returning coins, diamonds into v_coins, v_diamonds;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_card_id is not null and v_card_quantity > 0 then
    insert into public.player_cards(player_id, card_id, quantity)
    values (v_actor, v_card_id, v_card_quantity)
    on conflict(player_id, card_id)
    do update set quantity = public.player_cards.quantity + excluded.quantity;
  end if;

  insert into public.code_redemptions(code_id, player_id, reward_snapshot)
  values(v_code.id, v_actor, v_code.reward);

  return jsonb_build_object(
    'code', v_code.code,
    'reward', v_code.reward,
    'coins', v_coins,
    'diamonds', v_diamonds
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_REWARD';
end;
$$;

create or replace function public.redeem_code(p_code text)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.redeem_code(p_code); $$;

create or replace function private.marketplace_action(
  p_action text,
  p_listing_id uuid default null,
  p_card_id text default null,
  p_quantity integer default null,
  p_price bigint default null,
  p_shop_name text default null,
  p_theme_style text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_username text;
  v_name text;
  v_listing public.market_listings%rowtype;
  v_inventory integer;
  v_buyer_coins bigint;
  v_buyer_after bigint;
  v_seller_after bigint;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select username into v_username from public.players
  where id = v_actor and account_status = 'active';
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  if p_action = 'save_shop' then
    v_name := regexp_replace(trim(coalesce(p_shop_name,'')), '\s+', ' ', 'g');
    if char_length(v_name) < 3 or char_length(v_name) > 32 then raise exception 'INVALID_SHOP_NAME'; end if;
    if coalesce(p_theme_style,'guild') <> all(array['guild','classic','night']) then raise exception 'INVALID_SHOP_THEME'; end if;
    insert into public.player_shops(player_id, name, theme_style)
    values(v_actor, v_name, coalesce(p_theme_style,'guild'))
    on conflict(player_id) do update
      set name=excluded.name, theme_style=excluded.theme_style, updated_at=now();
    return jsonb_build_object('ok',true,'shopName',v_name,'themeStyle',coalesce(p_theme_style,'guild'));
  end if;

  if p_action = 'list' then
    if p_card_id is null or p_quantity is null or p_quantity < 1 or p_quantity > 99
      or p_price is null or p_price < 1 or p_price > 100000000
      then raise exception 'INVALID_LISTING'; end if;
    if (select count(*) from public.market_listings where seller_id=v_actor and status='active') >= 100
      then raise exception 'LISTING_LIMIT_REACHED'; end if;

    insert into public.player_shops(player_id, name)
    values(v_actor, left(v_username || ' Card Shop', 32))
    on conflict(player_id) do nothing;

    select quantity into v_inventory
    from public.player_cards
    where player_id=v_actor and card_id=p_card_id
    for update;
    if not found or v_inventory < p_quantity then raise exception 'NOT_ENOUGH_CARDS'; end if;

    update public.player_cards
    set quantity = quantity - p_quantity
    where player_id=v_actor and card_id=p_card_id;

    insert into public.market_listings(seller_id,card_id,quantity,unit_price_coins)
    values(v_actor,p_card_id,p_quantity,p_price)
    returning * into v_listing;
    return jsonb_build_object('ok',true,'listingId',v_listing.id);
  end if;

  if p_action = 'cancel' then
    select * into v_listing from public.market_listings
    where id=p_listing_id for update;
    if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    if v_listing.seller_id <> v_actor then raise exception 'FORBIDDEN'; end if;
    if v_listing.status <> 'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;

    update public.market_listings set status='cancelled',updated_at=now()
    where id=v_listing.id;
    insert into public.player_cards(player_id,card_id,quantity)
    values(v_actor,v_listing.card_id,v_listing.quantity)
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+excluded.quantity;
    return jsonb_build_object('ok',true,'listingId',v_listing.id);
  end if;

  if p_action = 'buy' then
    select * into v_listing from public.market_listings
    where id=p_listing_id for update;
    if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    if v_listing.status <> 'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;
    if v_listing.seller_id = v_actor then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;

    perform 1 from public.players
    where id in (v_actor,v_listing.seller_id)
    order by id for update;
    select coins into v_buyer_coins from public.players
    where id=v_actor and account_status='active';
    if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
    if v_buyer_coins < v_listing.unit_price_coins then raise exception 'NOT_ENOUGH_COINS'; end if;

    update public.players set coins=coins-v_listing.unit_price_coins
    where id=v_actor returning coins into v_buyer_after;
    update public.players set coins=coins+v_listing.unit_price_coins
    where id=v_listing.seller_id returning coins into v_seller_after;
    insert into public.player_cards(player_id,card_id,quantity)
    values(v_actor,v_listing.card_id,v_listing.quantity)
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+excluded.quantity;
    update public.market_listings
    set status='sold',buyer_id=v_actor,sold_at=now(),updated_at=now()
    where id=v_listing.id;
    return jsonb_build_object(
      'ok',true,'listingId',v_listing.id,'coins',v_buyer_after,
      'sellerCoins',v_seller_after,'quantity',v_listing.quantity,'cardId',v_listing.card_id
    );
  end if;

  raise exception 'INVALID_MARKETPLACE_ACTION';
end;
$$;

create or replace function public.marketplace_action(
  p_action text,
  p_listing_id uuid default null,
  p_card_id text default null,
  p_quantity integer default null,
  p_price bigint default null,
  p_shop_name text default null,
  p_theme_style text default null
)
returns jsonb language sql volatile security invoker set search_path = ''
as $$
  select private.marketplace_action(
    p_action,p_listing_id,p_card_id,p_quantity,p_price,p_shop_name,p_theme_style
  );
$$;

create or replace function public.server_open_legendary_diamond_pack(p_player_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_config public.diamond_pack_config%rowtype;
  v_diamonds bigint;
  v_card public.cards%rowtype;
  v_snapshot jsonb;
  v_opening_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into v_config from public.diamond_pack_config where id=1 for share;
  if not found or not v_config.active then raise exception 'PACK_NOT_AVAILABLE'; end if;
  select diamonds into v_diamonds from public.players
  where id=p_player_id and account_status='active' for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
  if v_diamonds < v_config.cost_diamonds then raise exception 'NOT_ENOUGH_DIAMONDS'; end if;

  select * into v_card
  from public.cards
  where market_price_usd > v_config.min_value_usd
    and pokedex_numbers && array[
      144,145,146,150,151,243,244,245,249,250,251,
      377,378,379,380,381,382,383,384,385,386,
      480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,
      638,639,640,641,642,643,644,645,646,647,648,649,
      716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,
      800,801,802,807,808,809,888,889,890,891,892,893,894,895,896,897,
      898,905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,1024,1025
    ]::integer[]
  order by random()
  limit 1;
  if not found then raise exception 'NO_ELIGIBLE_LEGENDARY_CARDS'; end if;

  v_snapshot := jsonb_build_object(
    'id',v_card.id,'name',v_card.pokemon_name,'rarity',v_card.rarity,
    'image',coalesce(nullif(v_card.image_large,''),nullif(v_card.image_small,'')),
    'imageLarge',nullif(v_card.image_large,''),'imageSmall',nullif(v_card.image_small,''),
    'marketPriceUsd',v_card.market_price_usd
  );
  update public.players set diamonds=diamonds-v_config.cost_diamonds
  where id=p_player_id returning diamonds into v_diamonds;
  insert into public.player_cards(player_id,card_id,quantity)
  values(p_player_id,v_card.id,1)
  on conflict(player_id,card_id)
  do update set quantity=public.player_cards.quantity+1;
  insert into public.diamond_pack_openings(player_id,card_id,diamonds_spent,card_snapshot)
  values(p_player_id,v_card.id,v_config.cost_diamonds,v_snapshot)
  returning id into v_opening_id;
  return jsonb_build_object(
    'openingId',v_opening_id,'cards',jsonb_build_array(v_snapshot),
    'diamonds',v_diamonds,'pricePaid',v_config.cost_diamonds
  );
end;
$$;

create or replace function public.server_admin_grant_diamonds_batch(
  p_actor_id uuid,p_target_ids uuid[],p_amount bigint,p_note text default null
)
returns jsonb
language plpgsql
volatile
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
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id)
    then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'INVALID_AMOUNT'; end if;
  select array_agg(distinct target_id order by target_id) into v_targets
  from unnest(coalesce(p_target_ids,'{}'::uuid[])) selected(target_id)
  where target_id is not null;
  if coalesce(cardinality(v_targets),0) < 1 or cardinality(v_targets) > 100
    then raise exception 'INVALID_TARGETS'; end if;

  for v_player in
    select id,username,diamonds from public.players
    where id=any(v_targets) order by id for update
  loop
    update public.players set diamonds=diamonds+p_amount
    where id=v_player.id returning diamonds into v_after;
    insert into public.admin_diamond_adjustments(
      admin_id,target_id,amount,balance_before,balance_after,note
    ) values(
      p_actor_id,v_player.id,p_amount,v_player.diamonds,v_after,
      nullif(left(trim(coalesce(p_note,'')),180),'')
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'targetId',v_player.id,'username',v_player.username,'amount',p_amount,
      'balanceBefore',v_player.diamonds,'balanceAfter',v_after
    ));
    v_count := v_count+1;
  end loop;
  if v_count <> cardinality(v_targets) then raise exception 'PLAYER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'recipientCount',v_count,'amountEach',p_amount,
    'totalGranted',p_amount*v_count,'recipients',v_results
  );
end;
$$;

create or replace function public.server_admin_create_redeem_code(
  p_actor_id uuid,p_code text,p_reward jsonb,p_max_total_uses integer default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_code text; v_row public.redeem_codes%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id)
    then raise exception 'FORBIDDEN'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code,'')),'\s+','','g'));
  if v_code !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'INVALID_CODE'; end if;
  if p_reward is null or jsonb_typeof(p_reward) <> 'object' then raise exception 'INVALID_REWARD'; end if;
  if exists(select 1 from jsonb_object_keys(p_reward) k
    where k <> all(array['coins','diamonds','cardId','cardQuantity']))
    then raise exception 'INVALID_REWARD'; end if;
  if p_max_total_uses is not null and p_max_total_uses < 1 then raise exception 'INVALID_LIMIT'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'INVALID_EXPIRY'; end if;
  if greatest(0,coalesce((p_reward->>'coins')::bigint,0)) = 0
    and greatest(0,coalesce((p_reward->>'diamonds')::bigint,0)) = 0
    and (nullif(p_reward->>'cardId','') is null or greatest(0,coalesce((p_reward->>'cardQuantity')::integer,0)) = 0)
    then raise exception 'EMPTY_REWARD'; end if;
  if coalesce((p_reward->>'coins')::bigint,0) < 0 or coalesce((p_reward->>'coins')::bigint,0) > 100000000
    or coalesce((p_reward->>'diamonds')::bigint,0) < 0 or coalesce((p_reward->>'diamonds')::bigint,0) > 1000000
    or coalesce((p_reward->>'cardQuantity')::integer,0) < 0 or coalesce((p_reward->>'cardQuantity')::integer,0) > 99
    then raise exception 'INVALID_REWARD'; end if;
  if nullif(p_reward->>'cardId','') is not null
    and not exists(select 1 from public.cards where id=p_reward->>'cardId')
    then raise exception 'CARD_NOT_FOUND'; end if;
  insert into public.redeem_codes(code,reward,max_total_uses,expires_at,created_by)
  values(v_code,p_reward,p_max_total_uses,p_expires_at,p_actor_id)
  returning * into v_row;
  return jsonb_build_object(
    'id',v_row.id,'code',v_row.code,'reward',v_row.reward,'active',v_row.active,
    'maxTotalUses',v_row.max_total_uses,'expiresAt',v_row.expires_at,'createdAt',v_row.created_at
  );
exception
  when unique_violation then raise exception 'CODE_ALREADY_EXISTS';
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_REWARD';
end;
$$;

-- Extend the existing public profile payload without exposing balances.
create or replace function private.get_public_player_profile(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select jsonb_build_object(
    'player',jsonb_build_object(
      'id',p.id,'username',p.username,'profileIcon',p.profile_icon,'level',p.level,
      'battleWins',p.battle_wins,'battleLosses',p.battle_losses,'battleStreak',p.battle_streak,
      'battleRating',case when p.id=v_actor or p.show_battle_rating then p.battle_rating else null end,
      'showBattleRating',p.show_battle_rating,
      'equippedTitle',case when ad.id is null then null else jsonb_build_object('id',ad.id,'title',ad.title,'icon',ad.icon) end,
      'guild',case when g.id is null then null else jsonb_build_object('id',g.id,'name',g.name,'color',g.color,'role',gm.role) end
    ),
    'collection',jsonb_build_object(
      'uniqueCards',(select count(*) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalCopies',(select coalesce(sum(pc.quantity),0) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalValueUsd',(select coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0)::numeric(14,2)
        from public.player_cards pc join public.cards c on c.id=pc.card_id
        where pc.player_id=p.id and pc.quantity>0),
      'rarestCards',coalesce((select jsonb_agg(to_jsonb(r) order by r.rarity_tier desc,r."marketPriceUsd" desc nulls last,r.name)
        from (select c.id,c.pokemon_name name,c.set_name "setName",c.rarity,c.image_small "imageSmall",
          c.image_large "imageLarge",c.market_price_usd "marketPriceUsd",pc.quantity,
          public.rarity_tier(c.rarity) rarity_tier
          from public.player_cards pc join public.cards c on c.id=pc.card_id
          where pc.player_id=p.id and pc.quantity>0
          order by public.rarity_tier(c.rarity) desc,c.market_price_usd desc nulls last,
            pc.quantity desc,c.pokemon_name limit 12) r),'[]'::jsonb)
    )
  ) into v_result
  from public.players p
  left join public.achievement_definitions ad on ad.id=p.equipped_title_id
  left join public.guild_members gm on gm.player_id=p.id
  left join public.guilds g on g.id=gm.guild_id
  where p.id=p_player_id and p.account_status <> 'banned';
  if v_result is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return v_result;
end;
$$;

revoke all on function private.set_profile_icon(text) from public, anon;
revoke all on function private.redeem_code(text) from public, anon;
revoke all on function private.marketplace_action(text,uuid,text,integer,bigint,text,text) from public, anon;
grant execute on function private.set_profile_icon(text) to authenticated, service_role;
grant execute on function private.redeem_code(text) to authenticated, service_role;
grant execute on function private.marketplace_action(text,uuid,text,integer,bigint,text,text) to authenticated, service_role;

revoke all on function public.set_profile_icon(text) from public, anon;
revoke all on function public.redeem_code(text) from public, anon;
revoke all on function public.marketplace_action(text,uuid,text,integer,bigint,text,text) from public, anon;
grant execute on function public.set_profile_icon(text) to authenticated;
grant execute on function public.redeem_code(text) to authenticated;
grant execute on function public.marketplace_action(text,uuid,text,integer,bigint,text,text) to authenticated;

revoke all on function public.server_open_legendary_diamond_pack(uuid) from public, anon, authenticated;
revoke all on function public.server_admin_grant_diamonds_batch(uuid,uuid[],bigint,text) from public, anon, authenticated;
revoke all on function public.server_admin_create_redeem_code(uuid,text,jsonb,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.server_open_legendary_diamond_pack(uuid) to service_role;
grant execute on function public.server_admin_grant_diamonds_batch(uuid,uuid[],bigint,text) to service_role;
grant execute on function public.server_admin_create_redeem_code(uuid,text,jsonb,integer,timestamptz) to service_role;

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='player_shops'
  ) then alter publication supabase_realtime add table public.player_shops; end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='market_listings'
  ) then alter publication supabase_realtime add table public.market_listings; end if;
end $$;

alter table public.player_shops replica identity full;
alter table public.market_listings replica identity full;

