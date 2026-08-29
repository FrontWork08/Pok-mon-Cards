create or replace function public.server_create_release_snapshot(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_preview jsonb;
  v_snapshot_id uuid;
  v_existing private.release_reset_snapshots%rowtype;
  v_counts jsonb;
begin
  if not exists (select 1 from public.admin_members a where a.player_id=p_actor_id and a.role='owner') then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  select * into v_existing
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='prepared'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,'created',false,'snapshotId',v_existing.id,
      'createdAt',v_existing.created_at,'status',v_existing.status,
      'rowCounts',v_existing.row_counts,'preview',v_existing.preview
    );
  end if;

  select public.server_release_reset_preview(p_actor_id) into v_preview;
  if not coalesce((v_preview->>'readyToReset')::boolean,false) then
    raise exception using errcode='P0001', message='RELEASE_NOT_READY_FOR_SNAPSHOT';
  end if;

  insert into private.release_reset_snapshots(campaign_id,created_by,preview)
  values(v_campaign.id,p_actor_id,v_preview)
  returning id into v_snapshot_id;

  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'players',to_jsonb(t) from public.players t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_cards',to_jsonb(t) from public.player_cards t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'decks',to_jsonb(t) from public.decks t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'deck_cards',to_jsonb(t) from public.deck_cards t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_achievements',to_jsonb(t) from public.player_achievements t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_daily_missions',to_jsonb(t) from public.player_daily_missions t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_daily_battle_species',to_jsonb(t) from public.player_daily_battle_species t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_missions_v2',to_jsonb(t) from public.player_missions_v2 t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_login_streaks',to_jsonb(t) from public.player_login_streaks t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_seasons',to_jsonb(t) from public.player_seasons t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'collection_milestone_claims',to_jsonb(t) from public.collection_milestone_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'battle_pass_player_progress',to_jsonb(t) from public.battle_pass_player_progress t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'battle_pass_mission_progress',to_jsonb(t) from public.battle_pass_mission_progress t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'battle_pass_reward_claims',to_jsonb(t) from public.battle_pass_reward_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'profile_showcase',to_jsonb(t) from public.profile_showcase t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guilds',to_jsonb(t) from public.guilds t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guild_war_player_points',to_jsonb(t) from public.guild_war_player_points t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guild_weekly_reward_claims',to_jsonb(t) from public.guild_weekly_reward_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guild_collective_boosters',to_jsonb(t) from public.guild_collective_boosters t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guild_collective_booster_claims',to_jsonb(t) from public.guild_collective_booster_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'admin_members',to_jsonb(t) from public.admin_members t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'admin_tester_title_grants',to_jsonb(t) from public.admin_tester_title_grants t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'guild_members',to_jsonb(t) from public.guild_members t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_settings',to_jsonb(t) from public.player_settings t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'player_cosmetics',to_jsonb(t) from public.player_cosmetics t;
  insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data) select v_snapshot_id,'friendships',to_jsonb(t) from public.friendships t;

  select coalesce(jsonb_object_agg(table_name,row_count),'{}'::jsonb)
  into v_counts
  from (
    select table_name,count(*)::bigint as row_count
    from private.release_reset_snapshot_rows
    where snapshot_id=v_snapshot_id
    group by table_name
  ) q;

  update private.release_reset_snapshots set row_counts=v_counts where id=v_snapshot_id;

  return jsonb_build_object(
    'ok',true,'created',true,'snapshotId',v_snapshot_id,
    'status','prepared','rowCounts',v_counts,'preview',v_preview
  );
end;
$$;

revoke all on function public.server_create_release_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.server_create_release_snapshot(uuid) to service_role;

create or replace function public.server_execute_release_reset(p_actor_id uuid, p_snapshot_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_snapshot private.release_reset_snapshots%rowtype;
  v_preview jsonb;
  v_maintenance boolean := false;
  v_players_now bigint := 0;
  v_cards_now bigint := 0;
  v_removed_cards bigint := 0;
  v_preserved_cards bigint := 0;
begin
  if not exists (select 1 from public.admin_members a where a.player_id=p_actor_id and a.role='owner') then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  for update;

  if not found then raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND'; end if;
  if v_campaign.phase <> 'freeze' or not coalesce(v_campaign.economy_frozen,false) then
    raise exception using errcode='P0001', message='RELEASE_NOT_FROZEN';
  end if;

  select maintenance_enabled into v_maintenance from public.app_runtime_status where id=1;
  if not coalesce(v_maintenance,false) then
    raise exception using errcode='P0001', message='RELEASE_MAINTENANCE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(v_campaign.download_url,'')),'') is null then
    raise exception using errcode='P0001', message='RELEASE_DOWNLOAD_NOT_READY';
  end if;

  select * into v_snapshot
  from private.release_reset_snapshots
  where id=p_snapshot_id and campaign_id=v_campaign.id and status='prepared'
  for update;

  if not found then raise exception using errcode='P0001', message='RELEASE_SNAPSHOT_REQUIRED'; end if;

  select public.server_release_reset_preview(p_actor_id) into v_preview;
  if not coalesce((v_preview->>'readyToReset')::boolean,false) then
    raise exception using errcode='P0001', message='RELEASE_PREFLIGHT_FAILED';
  end if;

  select count(*) into v_players_now from public.players;
  select count(*) into v_cards_now from public.player_cards;

  if coalesce((v_snapshot.row_counts->>'players')::bigint,-1) <> v_players_now
     or coalesce((v_snapshot.row_counts->>'player_cards')::bigint,-1) <> v_cards_now then
    raise exception using errcode='P0001', message='RELEASE_SNAPSHOT_DRIFT';
  end if;

  delete from public.deck_cards;
  delete from public.decks;
  delete from public.battle_pass_reward_claims;
  delete from public.battle_pass_mission_progress;
  delete from public.battle_pass_player_progress;
  delete from public.player_daily_battle_species;
  delete from public.player_daily_missions;
  delete from public.player_missions_v2;
  delete from public.player_login_streaks;
  delete from public.player_seasons;
  delete from public.collection_milestone_claims;
  delete from public.guild_war_player_points;
  delete from public.guild_weekly_reward_claims;
  delete from public.guild_collective_booster_claims;
  delete from public.guild_collective_boosters;

  delete from public.player_achievements pa
  where not exists (
    select 1 from public.admin_tester_title_grants g
    where g.target_id=pa.player_id
      and g.achievement_id=pa.achievement_id
      and g.revoked_at is null
  );

  delete from public.profile_showcase ps
  where not exists (
    select 1 from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
      and s.player_id=ps.player_id
      and s.card_id=ps.card_id
  );

  delete from public.player_cards pc
  where not exists (
    select 1 from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
      and s.player_id=pc.player_id
      and s.card_id=pc.card_id
  );
  get diagnostics v_removed_cards = row_count;

  update public.player_cards set quantity=1;
  select count(*) into v_preserved_cards from public.player_cards;

  update public.players
  set
    coins=v_campaign.reward_coins,
    diamonds=v_campaign.reward_diamonds,
    level=1,
    xp=0,
    last_daily_claim_at=null,
    battle_rating=1000,
    battle_wins=0,
    battle_losses=0,
    battle_streak=0,
    best_battle_streak=0;

  update public.players p
  set equipped_title_id=null
  where p.equipped_title_id is not null
    and not exists (
      select 1 from public.player_achievements pa
      where pa.player_id=p.id and pa.achievement_id=p.equipped_title_id
    );

  update public.guilds set xp=0, level=1;

  update private.release_reset_snapshots set status='used', used_at=now() where id=p_snapshot_id;

  update public.release_campaigns
  set
    phase='update_required',
    legacy_selection_enabled=false,
    economy_frozen=true,
    force_update=true,
    updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object(
    'ok',true,'snapshotId',p_snapshot_id,'phase','update_required','forceUpdate',true,
    'playersReset',v_players_now,'cardRowsRemoved',v_removed_cards,
    'legacyCardRowsPreserved',v_preserved_cards,
    'coinsPerVeteran',v_campaign.reward_coins,
    'diamondsPerVeteran',v_campaign.reward_diamonds,
    'maintenanceRemainsEnabled',true
  );
end;
$$;

revoke all on function public.server_execute_release_reset(uuid,uuid) from public, anon, authenticated;
grant execute on function public.server_execute_release_reset(uuid,uuid) to service_role;

create or replace function public.server_restore_release_snapshot(p_actor_id uuid, p_snapshot_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_snapshot private.release_reset_snapshots%rowtype;
  v_maintenance boolean := false;
begin
  if not exists (select 1 from public.admin_members a where a.player_id=p_actor_id and a.role='owner') then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  for update;

  if not found then raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND'; end if;

  select maintenance_enabled into v_maintenance from public.app_runtime_status where id=1;
  if not coalesce(v_maintenance,false) then
    raise exception using errcode='P0001', message='RELEASE_MAINTENANCE_REQUIRED';
  end if;

  select * into v_snapshot
  from private.release_reset_snapshots
  where id=p_snapshot_id and campaign_id=v_campaign.id and status='used'
  for update;

  if not found then raise exception using errcode='P0001', message='RELEASE_USED_SNAPSHOT_REQUIRED'; end if;

  update public.release_campaigns
  set phase='update_required',legacy_selection_enabled=false,economy_frozen=true,force_update=false,updated_at=now()
  where id=v_campaign.id;

  delete from public.deck_cards;
  delete from public.decks;
  delete from public.battle_pass_reward_claims;
  delete from public.battle_pass_mission_progress;
  delete from public.battle_pass_player_progress;
  delete from public.player_daily_battle_species;
  delete from public.player_daily_missions;
  delete from public.player_missions_v2;
  delete from public.player_login_streaks;
  delete from public.player_seasons;
  delete from public.collection_milestone_claims;
  delete from public.profile_showcase;
  delete from public.player_achievements;
  delete from public.guild_war_player_points;
  delete from public.guild_weekly_reward_claims;
  delete from public.guild_collective_booster_claims;
  delete from public.guild_collective_boosters;
  delete from public.player_cards;

  insert into public.decks
  select (jsonb_populate_record(null::public.decks,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='decks';

  insert into public.deck_cards
  select (jsonb_populate_record(null::public.deck_cards,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='deck_cards';

  insert into public.player_cards
  select (jsonb_populate_record(null::public.player_cards,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_cards';

  insert into public.player_achievements
  select (jsonb_populate_record(null::public.player_achievements,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_achievements';

  insert into public.profile_showcase
  select (jsonb_populate_record(null::public.profile_showcase,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='profile_showcase';

  insert into public.player_daily_missions
  select (jsonb_populate_record(null::public.player_daily_missions,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_daily_missions';

  insert into public.player_daily_battle_species
  select (jsonb_populate_record(null::public.player_daily_battle_species,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_daily_battle_species';

  insert into public.player_missions_v2
  select (jsonb_populate_record(null::public.player_missions_v2,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_missions_v2';

  insert into public.player_login_streaks
  select (jsonb_populate_record(null::public.player_login_streaks,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_login_streaks';

  insert into public.player_seasons
  select (jsonb_populate_record(null::public.player_seasons,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='player_seasons';

  insert into public.collection_milestone_claims
  select (jsonb_populate_record(null::public.collection_milestone_claims,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='collection_milestone_claims';

  insert into public.battle_pass_player_progress
  select (jsonb_populate_record(null::public.battle_pass_player_progress,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='battle_pass_player_progress';

  insert into public.battle_pass_mission_progress
  select (jsonb_populate_record(null::public.battle_pass_mission_progress,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='battle_pass_mission_progress';

  insert into public.battle_pass_reward_claims
  select (jsonb_populate_record(null::public.battle_pass_reward_claims,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='battle_pass_reward_claims';

  insert into public.guild_collective_boosters
  select (jsonb_populate_record(null::public.guild_collective_boosters,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='guild_collective_boosters';

  insert into public.guild_collective_booster_claims
  select (jsonb_populate_record(null::public.guild_collective_booster_claims,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='guild_collective_booster_claims';

  insert into public.guild_war_player_points
  select (jsonb_populate_record(null::public.guild_war_player_points,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='guild_war_player_points';

  insert into public.guild_weekly_reward_claims
  select (jsonb_populate_record(null::public.guild_weekly_reward_claims,r.row_data)).*
  from private.release_reset_snapshot_rows r
  where r.snapshot_id=p_snapshot_id and r.table_name='guild_weekly_reward_claims';

  with snap as (
    select (jsonb_populate_record(null::public.players,r.row_data)).*
    from private.release_reset_snapshot_rows r
    where r.snapshot_id=p_snapshot_id and r.table_name='players'
  )
  update public.players p
  set
    coins=s.coins,diamonds=s.diamonds,level=s.level,xp=s.xp,
    last_daily_claim_at=s.last_daily_claim_at,battle_rating=s.battle_rating,
    battle_wins=s.battle_wins,battle_losses=s.battle_losses,
    battle_streak=s.battle_streak,best_battle_streak=s.best_battle_streak,
    equipped_title_id=s.equipped_title_id
  from snap s
  where p.id=s.id;

  with snap as (
    select (jsonb_populate_record(null::public.guilds,r.row_data)).*
    from private.release_reset_snapshot_rows r
    where r.snapshot_id=p_snapshot_id and r.table_name='guilds'
  )
  update public.guilds g
  set xp=s.xp,level=s.level
  from snap s
  where g.id=s.id;

  update private.release_reset_snapshots
  set status='restored',restored_at=now()
  where id=p_snapshot_id;

  update public.release_campaigns
  set phase='freeze',legacy_selection_enabled=false,economy_frozen=true,force_update=false,updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object(
    'ok',true,'snapshotId',p_snapshot_id,'status','restored',
    'phase','freeze','maintenanceRemainsEnabled',true
  );
end;
$$;

revoke all on function public.server_restore_release_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.server_restore_release_snapshot(uuid,uuid) to service_role;
