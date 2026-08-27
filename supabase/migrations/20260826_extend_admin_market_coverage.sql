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
      'ownedUniqueCards', (select count(distinct card_id) from public.player_cards where quantity > 0),
      'ownedCardsWithUsdPrice', (
        select count(distinct pc.card_id)
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        where pc.quantity > 0 and c.market_price_usd is not null
      ),
      'ownedPriceCoveragePct', (
        select case when count(distinct pc.card_id)=0 then 0::numeric
          else round(
            count(distinct pc.card_id) filter (where c.market_price_usd is not null)::numeric
            / count(distinct pc.card_id)::numeric * 100, 1
          )
        end
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        where pc.quantity > 0
      ),
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
