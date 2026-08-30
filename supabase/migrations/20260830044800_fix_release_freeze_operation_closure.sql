-- Restore the complete release-freeze behavior after marketplace-aware legacy changes.
-- Keeps marketplace cards safe, cancels tournaments, clears queues/offers/trades,
-- and refuses to freeze while a live battle still exists.

create or replace function public.server_begin_release_freeze(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_finalize jsonb;
  v_cancelled_trades integer := 0;
  v_cancelled_listings integer := 0;
  v_rejected_offers integer := 0;
  v_queue_cleared integer := 0;
  v_cancelled_tournaments integer := 0;
  v_cancelled_tournament_matches integer := 0;
  v_active_battles integer := 0;
  v_listing record;
begin
  if not exists (
    select 1
    from public.admin_members a
    where a.player_id = p_actor_id
      and a.role = 'owner'
  ) then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select *
  into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition'
    and active=true
  for update;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.phase not in ('notice','legacy_selection','freeze') then
    raise exception using errcode='P0001', message='RELEASE_PHASE_LOCKED';
  end if;

  select count(*)
  into v_active_battles
  from public.battles
  where status not in ('completed','declined','cancelled');

  if v_active_battles > 0 then
    raise exception using errcode='P0001', message='ACTIVE_BATTLES_MUST_FINISH';
  end if;

  update public.app_runtime_status
  set
    maintenance_enabled=true,
    maintenance_message='A Trainer Collection está entrando na migração 1.0. Sua conta e seu Legado estão sendo protegidos.',
    enabled_at=coalesce(enabled_at,now()),
    enabled_by=p_actor_id,
    updated_at=now()
  where id=1;

  update public.release_campaigns
  set
    phase='freeze',
    legacy_selection_enabled=false,
    economy_frozen=true,
    updated_at=now()
  where id=v_campaign.id;

  delete from public.matchmaking_queue;
  get diagnostics v_queue_cleared = row_count;

  update public.trades
  set status='cancelled', updated_at=now()
  where status::text='pending';
  get diagnostics v_cancelled_trades = row_count;

  update public.market_offers
  set status='rejected', updated_at=now()
  where status='pending';
  get diagnostics v_rejected_offers = row_count;

  for v_listing in
    select ml.id, ml.seller_id, ml.card_id, ml.quantity
    from public.market_listings ml
    where ml.status='active'
    order by ml.id
    for update
  loop
    insert into public.player_cards(player_id, card_id, quantity)
    values(v_listing.seller_id, v_listing.card_id, v_listing.quantity)
    on conflict(player_id, card_id)
    do update set quantity=public.player_cards.quantity + excluded.quantity;

    update public.market_listings
    set status='cancelled', updated_at=now()
    where id=v_listing.id;

    v_cancelled_listings := v_cancelled_listings + 1;
  end loop;

  update public.tournament_matches
  set status='cancelled', updated_at=now()
  where status not in ('completed','cancelled');
  get diagnostics v_cancelled_tournament_matches = row_count;

  update public.tournaments
  set status='cancelled', ends_at=coalesce(ends_at,now())
  where status not in ('completed','cancelled');
  get diagnostics v_cancelled_tournaments = row_count;

  select public.server_finalize_legacy_selections(p_actor_id)
  into v_finalize;

  return jsonb_build_object(
    'ok',true,
    'phase','freeze',
    'maintenanceEnabled',true,
    'economyFrozen',true,
    'legacySelectionEnabled',false,
    'closedOperations',jsonb_build_object(
      'matchmakingQueue',v_queue_cleared,
      'trades',v_cancelled_trades,
      'marketOffers',v_rejected_offers,
      'marketListings',v_cancelled_listings,
      'tournaments',v_cancelled_tournaments,
      'tournamentMatches',v_cancelled_tournament_matches,
      'activeBattles',v_active_battles
    ),
    'legacyFinalize',v_finalize
  );
end;
$$;

revoke all on function public.server_begin_release_freeze(uuid) from public, anon, authenticated;
grant execute on function public.server_begin_release_freeze(uuid) to service_role;
