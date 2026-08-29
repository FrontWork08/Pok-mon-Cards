-- Include tournaments and daily battle species in the Trainer Collection 1.0 freeze/preview.
-- See remote migration 20260829205548 for the full function bodies.
-- This file intentionally mirrors the deployed functions from Supabase.

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
begin
  if not exists (select 1 from public.admin_members a where a.player_id=p_actor_id and a.role='owner') then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;
  select * into v_campaign from public.release_campaigns where code='trainer_collection_1_0_beta_transition' and active=true for update;
  if not found then raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND'; end if;
  if v_campaign.phase not in ('notice','legacy_selection','freeze') then
    raise exception using errcode='P0001', message='RELEASE_PHASE_LOCKED';
  end if;

  update public.app_runtime_status
  set maintenance_enabled=true,
      maintenance_message='A Trainer Collection está entrando na migração 1.0. Sua conta e seu Legado estão sendo protegidos.',
      enabled_at=coalesce(enabled_at,now()),
      enabled_by=p_actor_id,
      updated_at=now()
  where id=1;

  update public.release_campaigns
  set phase='freeze', legacy_selection_enabled=false, economy_frozen=true, updated_at=now()
  where id=v_campaign.id;

  delete from public.matchmaking_queue;
  get diagnostics v_queue_cleared = row_count;

  update public.trades set status='cancelled', updated_at=now() where status::text='pending';
  get diagnostics v_cancelled_trades = row_count;

  update public.market_offers set status='rejected', updated_at=now() where status='pending';
  get diagnostics v_rejected_offers = row_count;

  update public.market_listings set status='cancelled', updated_at=now() where status='active';
  get diagnostics v_cancelled_listings = row_count;

  update public.tournament_matches set status='cancelled', updated_at=now() where status not in ('completed','cancelled');
  get diagnostics v_cancelled_tournament_matches = row_count;

  update public.tournaments set status='cancelled', ends_at=coalesce(ends_at,now()) where status not in ('completed','cancelled');
  get diagnostics v_cancelled_tournaments = row_count;

  select public.server_finalize_legacy_selections(p_actor_id) into v_finalize;

  return jsonb_build_object(
    'ok',true,'phase','freeze','maintenanceEnabled',true,'economyFrozen',true,'legacySelectionEnabled',false,
    'closedOperations',jsonb_build_object(
      'matchmakingQueue',v_queue_cleared,'trades',v_cancelled_trades,'marketOffers',v_rejected_offers,
      'marketListings',v_cancelled_listings,'tournaments',v_cancelled_tournaments,'tournamentMatches',v_cancelled_tournament_matches
    ),
    'legacyFinalize',v_finalize
  );
end;
$$;

revoke all on function public.server_begin_release_freeze(uuid) from public, anon, authenticated;
grant execute on function public.server_begin_release_freeze(uuid) to service_role;
