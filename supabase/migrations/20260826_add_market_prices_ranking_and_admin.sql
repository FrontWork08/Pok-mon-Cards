alter table public.cards
  add column if not exists market_price_usd numeric(12,2),
  add column if not exists market_price_low_usd numeric(12,2),
  add column if not exists market_price_high_usd numeric(12,2),
  add column if not exists market_price_variant text,
  add column if not exists market_price_source text,
  add column if not exists market_price_updated_at timestamptz,
  add column if not exists market_price_data jsonb not null default '{}'::jsonb;

create index if not exists idx_cards_market_price_usd
  on public.cards(market_price_usd desc nulls last);
create index if not exists idx_cards_market_price_updated_at
  on public.cards(market_price_updated_at);

create table if not exists public.admin_members (
  player_id uuid primary key references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_members enable row level security;
revoke all on public.admin_members from anon, authenticated;
grant select, insert, update, delete on public.admin_members to service_role;

insert into public.admin_members(player_id)
select id from public.players
where lower(username) = lower('Alemão')
on conflict (player_id) do nothing;

create table if not exists public.admin_coin_adjustments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.players(id) on delete restrict,
  target_id uuid not null references public.players(id) on delete restrict,
  amount bigint not null check (amount > 0),
  balance_before bigint not null,
  balance_after bigint not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.admin_coin_adjustments enable row level security;
revoke all on public.admin_coin_adjustments from anon, authenticated;
grant select, insert on public.admin_coin_adjustments to service_role;
create index if not exists idx_admin_coin_adjustments_created_at
  on public.admin_coin_adjustments(created_at desc);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.admin_members a
    where a.player_id = auth.uid()
  );
$$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.get_collection_value_leaderboard(p_limit integer default 100)
returns table (
  global_rank bigint,
  player_id uuid,
  username text,
  collection_value_usd numeric,
  priced_card_copies bigint,
  total_card_copies bigint,
  price_coverage_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      p.id as player_id,
      p.username,
      coalesce(sum(pc.quantity * coalesce(c.market_price_usd, 0)), 0)::numeric(14,2) as collection_value_usd,
      coalesce(sum(pc.quantity) filter (where c.market_price_usd is not null), 0)::bigint as priced_card_copies,
      coalesce(sum(pc.quantity), 0)::bigint as total_card_copies
    from public.players p
    left join public.player_cards pc
      on pc.player_id = p.id and pc.quantity > 0
    left join public.cards c
      on c.id = pc.card_id
    group by p.id, p.username
  ),
  ranked as (
    select
      dense_rank() over (
        order by collection_value_usd desc, total_card_copies desc, username asc
      ) as global_rank,
      *,
      case
        when total_card_copies = 0 then 0::numeric
        else round((priced_card_copies::numeric / total_card_copies::numeric) * 100, 1)
      end as price_coverage_pct
    from totals
  )
  select
    global_rank,
    player_id,
    username,
    collection_value_usd,
    priced_card_copies,
    total_card_copies,
    price_coverage_pct
  from ranked
  where auth.uid() is not null
  order by global_rank, username
  limit greatest(1, least(coalesce(p_limit,100), 200));
$$;
revoke all on function public.get_collection_value_leaderboard(integer) from public, anon;
grant execute on function public.get_collection_value_leaderboard(integer) to authenticated;

create or replace function public.server_admin_grant_coins(
  p_actor_id uuid,
  p_target_id uuid,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint;
  v_after bigint;
  v_username text;
begin
  if not exists (
    select 1 from public.admin_members where player_id = p_actor_id
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select coins, username
  into v_before, v_username
  from public.players
  where id = p_target_id
  for update;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  update public.players
  set coins = coins + p_amount
  where id = p_target_id
  returning coins into v_after;

  insert into public.admin_coin_adjustments(
    admin_id, target_id, amount, balance_before, balance_after, note
  )
  values (
    p_actor_id, p_target_id, p_amount, v_before, v_after,
    nullif(left(trim(coalesce(p_note,'')), 180), '')
  );

  return jsonb_build_object(
    'targetId', p_target_id,
    'username', v_username,
    'amount', p_amount,
    'balanceBefore', v_before,
    'balanceAfter', v_after
  );
end;
$$;
revoke all on function public.server_admin_grant_coins(uuid,uuid,bigint,text)
  from public, anon, authenticated;
grant execute on function public.server_admin_grant_coins(uuid,uuid,bigint,text)
  to service_role;

create or replace function public.server_admin_overview(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not exists (
    select 1 from public.admin_members where player_id = p_actor_id
  ) then raise exception 'FORBIDDEN'; end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from public.players),
      'created24h', (select count(*) from public.players where created_at >= now() - interval '24 hours'),
      'coinsInCirculation', (select coalesce(sum(coins),0) from public.players)
    ),
    'catalog', jsonb_build_object(
      'cards', (select count(*) from public.cards),
      'cardsWithUsdPrice', (select count(*) from public.cards where market_price_usd is not null),
      'ownedUniqueRows', (select count(*) from public.player_cards where quantity > 0),
      'ownedCardCopies', (select coalesce(sum(quantity),0) from public.player_cards where quantity > 0),
      'ownedMarketValueUsd', (
        select coalesce(sum(pc.quantity * coalesce(c.market_price_usd,0)),0)::numeric(14,2)
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        where pc.quantity > 0
      )
    ),
    'packs', jsonb_build_object(
      'total', (select count(*) from public.packs),
      'active', (select count(*) from public.packs where active),
      'withPhysicalArt', (select count(*) from public.packs where active and booster_art_url is not null),
      'openings', (select count(*) from public.pack_openings),
      'openings24h', (select count(*) from public.pack_openings where opened_at >= now() - interval '24 hours')
    ),
    'social', jsonb_build_object(
      'friendshipsAccepted', (select count(*) from public.friendships where status='accepted'),
      'friendRequestsPending', (select count(*) from public.friendships where status='pending'),
      'messages', (select count(*) from public.messages),
      'messages24h', (select count(*) from public.messages where created_at >= now() - interval '24 hours'),
      'unreadMessages', (select count(*) from public.messages where read_at is null)
    ),
    'trades', jsonb_build_object(
      'total', (select count(*) from public.trades),
      'pending', (select count(*) from public.trades where status='pending'),
      'completed', (select count(*) from public.trades where status='completed')
    ),
    'battles', jsonb_build_object(
      'total', (select count(*) from public.battles),
      'active', (select count(*) from public.battles where status in ('invited','accepted','selecting','reveal')),
      'completed', (select count(*) from public.battles where status='completed'),
      'cancelled', (select count(*) from public.battles where status='cancelled'),
      'events', (select count(*) from public.battle_events)
    ),
    'progression', jsonb_build_object(
      'decks', (select count(*) from public.decks),
      'dailyMissions', (select count(*) from public.player_daily_missions),
      'notifications', (select count(*) from public.notifications),
      'pendingPush', (select count(*) from public.notifications where push_sent_at is null and push_attempts < 5),
      'pushTokensEnabled', (select count(*) from public.push_tokens where enabled)
    ),
    'admin', jsonb_build_object(
      'admins', (select count(*) from public.admin_members),
      'coinGrants', (select count(*) from public.admin_coin_adjustments),
      'coinGrants24h', (select count(*) from public.admin_coin_adjustments where created_at >= now() - interval '24 hours'),
      'coinsGrantedTotal', (select coalesce(sum(amount),0) from public.admin_coin_adjustments)
    ),
    'catalogRefresh', (
      select coalesce(to_jsonb(s),'{}'::jsonb)
      from public.catalog_refresh_state s
      where job_name='full_tcg_refresh'
      limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.server_admin_overview(uuid)
  from public, anon, authenticated;
grant execute on function public.server_admin_overview(uuid)
  to service_role;
