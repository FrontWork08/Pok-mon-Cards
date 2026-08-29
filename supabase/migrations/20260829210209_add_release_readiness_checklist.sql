create or replace function public.server_release_readiness(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_preview jsonb;
  v_snapshot_count integer := 0;
  v_snapshot_id uuid;
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
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  select public.server_release_reset_preview(p_actor_id)
  into v_preview;

  select count(*)
  into v_snapshot_count
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id
    and status='prepared';

  select id
  into v_snapshot_id
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id
    and status='prepared'
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'readyToReset', coalesce((v_preview->>'readyToReset')::boolean,false)
      and v_snapshot_count = 1
      and nullif(btrim(coalesce(v_campaign.download_url,'')),'') is not null,
    'phase', v_campaign.phase,
    'targetVersion', v_campaign.target_version,
    'downloadUrlReady', nullif(btrim(coalesce(v_campaign.download_url,'')),'') is not null,
    'snapshotPrepared', v_snapshot_count = 1,
    'preparedSnapshotCount', v_snapshot_count,
    'snapshotId', v_snapshot_id,
    'maintenanceEnabled', coalesce((v_preview->'campaign'->>'maintenanceEnabled')::boolean,false),
    'economyFrozen', v_campaign.economy_frozen,
    'legacySelectionEnabled', v_campaign.legacy_selection_enabled,
    'activeOperations', coalesce((v_preview->>'activeOperations')::integer,0),
    'preflightReady', coalesce((v_preview->'preflight'->>'ready')::boolean,false),
    'accountsAwaitingAutoFill', coalesce((v_preview->'preflight'->'counts'->>'accountsAwaitingAutoFill')::integer,0),
    'preview', v_preview
  );
end;
$$;

revoke all on function public.server_release_readiness(uuid) from public, anon, authenticated;
grant execute on function public.server_release_readiness(uuid) to service_role;
