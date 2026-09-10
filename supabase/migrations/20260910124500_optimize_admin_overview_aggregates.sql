create or replace function public.server_admin_overview(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.admin_members where player_id=p_actor_id) then
    raise exception 'FORBIDDEN';
  end if;

  with
  users_stats as materialized (
    select count(*) as total,
      count(*) filter(where created_at>=now()-interval '24 hours') as created_24h,
      coalesce(sum(coins),0) as coins
    from public.players
  ),
  cards_stats as materialized (
    select count(*) as total,
      count(*) filter(where market_price_usd is not null) as priced
    from public.cards
  ),
  owned_stats as materialized (
    select
      count(*) filter(where pc.quantity>0) as unique_rows,
      count(distinct pc.card_id) filter(where pc.quantity>0) as unique_cards,
      count(distinct pc.card_id) filter(where pc.quantity>0 and c.market_price_usd is not null) as priced_cards,
      coalesce(sum(pc.quantity) filter(where pc.quantity>0),0) as copies,
      coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)) filter(where pc.quantity>0),0)::numeric(14,2) as market_value
    from public.player_cards pc
    left join public.cards c on c.id=pc.card_id
  ),
  pack_stats as materialized (
    select count(*) as total,
      count(*) filter(where active) as active,
      count(*) filter(where active and booster_art_url is not null) as with_art
    from public.packs
  ),
  opening_stats as materialized (
    select count(*) as total,
      count(*) filter(where opened_at>=now()-interval '24 hours') as last_24h
    from public.pack_openings
  ),
  friendship_stats as materialized (
    select count(*) filter(where status='accepted') as accepted,
      count(*) filter(where status='pending') as pending
    from public.friendships
  ),
  message_stats as materialized (
    select count(*) as total,
      count(*) filter(where created_at>=now()-interval '24 hours') as last_24h,
      count(*) filter(where read_at is null) as unread
    from public.messages
  ),
  trade_stats as materialized (
    select count(*) as total,
      count(*) filter(where status='pending') as pending,
      count(*) filter(where status='completed') as completed
    from public.trades
  ),
  battle_stats as materialized (
    select count(*) as total,
      count(*) filter(where status in ('invited','accepted','selecting','reveal')) as active,
      count(*) filter(where status='completed') as completed,
      count(*) filter(where status='cancelled') as cancelled
    from public.battles
  ),
  notification_stats as materialized (
    select count(*) as total,
      count(*) filter(where push_sent_at is null and push_attempts<5) as pending_push
    from public.notifications
  ),
  adjustment_stats as materialized (
    select count(*) as total,
      count(*) filter(where created_at>=now()-interval '24 hours') as last_24h,
      coalesce(sum(amount),0) as amount
    from public.admin_coin_adjustments
  )
  select jsonb_build_object(
    'generatedAt',now(),
    'users',jsonb_build_object('total',u.total,'created24h',u.created_24h,'coinsInCirculation',u.coins),
    'catalog',jsonb_build_object(
      'cards',cs.total,'cardsWithUsdPrice',cs.priced,'ownedUniqueRows',os.unique_rows,
      'ownedUniqueCards',os.unique_cards,'ownedCardsWithUsdPrice',os.priced_cards,
      'ownedPriceCoveragePct',case when os.unique_cards=0 then 0::numeric else round(os.priced_cards::numeric/os.unique_cards::numeric*100,1) end,
      'ownedCardCopies',os.copies,'ownedMarketValueUsd',os.market_value
    ),
    'packs',jsonb_build_object('total',ps.total,'active',ps.active,'withPhysicalArt',ps.with_art,'openings',po.total,'openings24h',po.last_24h),
    'social',jsonb_build_object('friendshipsAccepted',fs.accepted,'friendRequestsPending',fs.pending,'messages',ms.total,'messages24h',ms.last_24h,'unreadMessages',ms.unread),
    'trades',jsonb_build_object('total',ts.total,'pending',ts.pending,'completed',ts.completed),
    'battles',jsonb_build_object(
      'total',bs.total,'active',bs.active,'completed',bs.completed,'cancelled',bs.cancelled,
      'events',(select count(*) from public.battle_events)
    ),
    'progression',jsonb_build_object(
      'decks',(select count(*) from public.decks),'dailyMissions',(select count(*) from public.player_daily_missions),
      'notifications',ns.total,'pendingPush',ns.pending_push,
      'pushTokensEnabled',(select count(*) from public.push_tokens where enabled)
    ),
    'admin',jsonb_build_object(
      'admins',(select count(*) from public.admin_members),'coinGrants',ads.total,
      'coinGrants24h',ads.last_24h,'coinsGrantedTotal',ads.amount
    ),
    'catalogRefresh',(
      select coalesce(to_jsonb(s),'{}'::jsonb)
      from public.catalog_refresh_state s
      where job_name='full_tcg_refresh'
      limit 1
    )
  ) into v_result
  from users_stats u
  cross join cards_stats cs
  cross join owned_stats os
  cross join pack_stats ps
  cross join opening_stats po
  cross join friendship_stats fs
  cross join message_stats ms
  cross join trade_stats ts
  cross join battle_stats bs
  cross join notification_stats ns
  cross join adjustment_stats ads;

  return v_result;
end;
$function$;