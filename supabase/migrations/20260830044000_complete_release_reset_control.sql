-- Final owner-only controls for the Trainer Collection 1.0 reset.
-- Adds a recoverable snapshot status endpoint and an explicit "complete release"
-- transition that only unlocks the game after reset invariants pass.

create or replace function public.server_release_snapshot_state(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_prepared_id uuid;
  v_used_id uuid;
  v_restored_id uuid;
  v_prepared_at timestamptz;
  v_used_at timestamptz;
  v_restored_at timestamptz;
begin
  if not exists (
    select 1 from public.admin_members a
    where a.player_id = p_actor_id and a.role = 'owner'
  ) then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  select id, created_at into v_prepared_id, v_prepared_at
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='prepared'
  order by created_at desc limit 1;

  select id, used_at into v_used_id, v_used_at
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='used'
  order by used_at desc nulls last, created_at desc limit 1;

  select id, restored_at into v_restored_id, v_restored_at
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='restored'
  order by restored_at desc nulls last, created_at desc limit 1;

  return jsonb_build_object(
    'phase', v_campaign.phase,
    'preparedSnapshotId', v_prepared_id,
    'preparedAt', v_prepared_at,
    'usedSnapshotId', v_used_id,
    'usedAt', v_used_at,
    'restoredSnapshotId', v_restored_id,
    'restoredAt', v_restored_at
  );
end;
$$;

revoke all on function public.server_release_snapshot_state(uuid) from public, anon, authenticated;
grant execute on function public.server_release_snapshot_state(uuid) to service_role;

create or replace function public.server_complete_release(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_maintenance boolean := false;
  v_used_snapshot uuid;
  v_bad_players integer := 0;
  v_bad_cards integer := 0;
  v_unpreserved_cards integer := 0;
begin
  if not exists (
    select 1 from public.admin_members a
    where a.player_id = p_actor_id and a.role = 'owner'
  ) then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  for update;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.phase <> 'update_required' or not coalesce(v_campaign.economy_frozen,false) then
    raise exception using errcode='P0001', message='RELEASE_RESET_REQUIRED';
  end if;

  select maintenance_enabled into v_maintenance
  from public.app_runtime_status where id=1;

  if not coalesce(v_maintenance,false) then
    raise exception using errcode='P0001', message='RELEASE_MAINTENANCE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(v_campaign.download_url,'')),'') is null then
    raise exception using errcode='P0001', message='RELEASE_DOWNLOAD_NOT_READY';
  end if;

  select id into v_used_snapshot
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='used'
  order by used_at desc nulls last, created_at desc
  limit 1;

  if v_used_snapshot is null then
    raise exception using errcode='P0001', message='RELEASE_USED_SNAPSHOT_REQUIRED';
  end if;

  select count(*) into v_bad_players
  from public.players p
  where p.coins is distinct from v_campaign.reward_coins
     or p.diamonds is distinct from v_campaign.reward_diamonds
     or p.level is distinct from 1
     or p.xp is distinct from 0
     or p.battle_rating is distinct from 1000
     or p.battle_wins is distinct from 0
     or p.battle_losses is distinct from 0
     or p.battle_streak is distinct from 0
     or p.best_battle_streak is distinct from 0;

  if v_bad_players > 0 then
    raise exception using errcode='P0001', message='RELEASE_PLAYER_RESET_INVARIANT_FAILED';
  end if;

  select count(*) into v_bad_cards
  from public.player_cards pc
  where pc.quantity <> 1;

  if v_bad_cards > 0 then
    raise exception using errcode='P0001', message='RELEASE_CARD_QUANTITY_INVARIANT_FAILED';
  end if;

  select count(*) into v_unpreserved_cards
  from public.player_cards pc
  where not exists (
    select 1
    from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
      and s.player_id=pc.player_id
      and s.card_id=pc.card_id
  );

  if v_unpreserved_cards > 0 then
    raise exception using errcode='P0001', message='RELEASE_UNPRESERVED_CARD_FOUND';
  end if;

  update public.release_campaigns
  set
    phase='completed',
    legacy_selection_enabled=false,
    economy_frozen=false,
    force_update=true,
    updated_at=now()
  where id=v_campaign.id;

  update public.app_runtime_status
  set
    maintenance_enabled=false,
    maintenance_message='Trainer Collection 1.0 está online.',
    enabled_at=null,
    enabled_by=null,
    updated_at=now()
  where id=1;

  return jsonb_build_object(
    'ok',true,
    'phase','completed',
    'targetVersion',v_campaign.target_version,
    'forceUpdate',true,
    'economyFrozen',false,
    'maintenanceEnabled',false,
    'usedSnapshotId',v_used_snapshot,
    'playersVerified',(select count(*) from public.players),
    'legacyCardRowsVerified',(select count(*) from public.player_cards)
  );
end;
$$;

revoke all on function public.server_complete_release(uuid) from public, anon, authenticated;
grant execute on function public.server_complete_release(uuid) to service_role;
