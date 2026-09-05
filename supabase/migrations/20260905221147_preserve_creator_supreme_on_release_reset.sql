create or replace function public.server_execute_release_reset(p_actor_id uuid, p_snapshot_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','public','private'
as $function$
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
  select * into v_campaign from public.release_campaigns where code='trainer_collection_1_0_beta_transition' and active=true for update;
  if not found then raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND'; end if;
  if v_campaign.phase <> 'freeze' or not coalesce(v_campaign.economy_frozen,false) then
    raise exception using errcode='P0001', message='RELEASE_NOT_FROZEN';
  end if;
  select maintenance_enabled into v_maintenance from public.app_runtime_status where id=1;
  if not coalesce(v_maintenance,false) then raise exception using errcode='P0001', message='RELEASE_MAINTENANCE_REQUIRED'; end if;
  if nullif(btrim(coalesce(v_campaign.download_url,'')),'') is null then
    raise exception using errcode='P0001', message='RELEASE_DOWNLOAD_NOT_READY';
  end if;
  select * into v_snapshot from private.release_reset_snapshots where id=p_snapshot_id and campaign_id=v_campaign.id and status='prepared' for update;
  if not found then raise exception using errcode='P0001', message='RELEASE_SNAPSHOT_REQUIRED'; end if;
  select public.server_release_reset_preview(p_actor_id) into v_preview;
  if not coalesce((v_preview->>'readyToReset')::boolean,false) then raise exception using errcode='P0001', message='RELEASE_PREFLIGHT_FAILED'; end if;
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
    where g.target_id=pa.player_id and g.achievement_id=pa.achievement_id and g.revoked_at is null
  )
  and not (
    pa.achievement_id='creator_owner'
    and exists (
      select 1 from public.admin_members a
      where a.player_id=pa.player_id and a.role='owner'
    )
  );

  delete from public.profile_showcase ps
  where not exists (
    select 1 from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id and s.player_id=ps.player_id and s.card_id=ps.card_id
  );

  delete from public.player_cards pc
  where not exists (
    select 1 from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id and s.player_id=pc.player_id and s.card_id=pc.card_id
  );
  get diagnostics v_removed_cards = row_count;

  update public.player_cards set quantity=1;
  select count(*) into v_preserved_cards from public.player_cards;

  update public.players
  set coins=v_campaign.reward_coins, diamonds=v_campaign.reward_diamonds,
      level=1, xp=0, last_daily_claim_at=null,
      battle_rating=1000, battle_wins=0, battle_losses=0,
      battle_streak=0, best_battle_streak=0;

  update public.players p
  set equipped_title_id=null
  where p.equipped_title_id is not null
    and not exists (select 1 from public.player_achievements pa where pa.player_id=p.id and pa.achievement_id=p.equipped_title_id);

  update public.guilds set xp=0, level=1;

  update private.release_reset_snapshots set status='used', used_at=now() where id=p_snapshot_id;

  update public.release_campaigns
  set phase='update_required', legacy_selection_enabled=false, economy_frozen=true, force_update=true, updated_at=now()
  where id=v_campaign.id;

  return jsonb_build_object(
    'ok',true,'snapshotId',p_snapshot_id,'phase','update_required','forceUpdate',true,
    'playersReset',v_players_now,'cardRowsRemoved',v_removed_cards,'legacyCardRowsPreserved',v_preserved_cards,
    'coinsPerVeteran',v_campaign.reward_coins,'diamondsPerVeteran',v_campaign.reward_diamonds,'maintenanceRemainsEnabled',true
  );
end;
$function$;

with campaign as (
  select id from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1
), used_snapshot as (
  select id from private.release_reset_snapshots
  where campaign_id=(select id from campaign) and status='used'
  order by used_at desc nulls last,created_at desc
  limit 1
), owner_actor as (
  select player_id from public.admin_members where role='owner' limit 1
), creator_snapshot as (
  select
    (row_data->>'player_id')::uuid as player_id,
    row_data->>'achievement_id' as achievement_id,
    (row_data->>'progress')::integer as progress,
    (row_data->>'unlocked_at')::timestamptz as unlocked_at,
    (row_data->>'updated_at')::timestamptz as updated_at
  from private.release_reset_snapshot_rows
  where snapshot_id=(select id from used_snapshot)
    and table_name='player_achievements'
    and (row_data->>'player_id')::uuid=(select player_id from owner_actor)
    and row_data->>'achievement_id'='creator_owner'
)
insert into public.player_achievements(player_id,achievement_id,progress,unlocked_at,updated_at)
select player_id,achievement_id,progress,unlocked_at,updated_at
from creator_snapshot
on conflict(player_id,achievement_id) do update
set progress=excluded.progress,
    unlocked_at=excluded.unlocked_at,
    updated_at=excluded.updated_at;

with campaign as (
  select id from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1
), used_snapshot as (
  select id from private.release_reset_snapshots
  where campaign_id=(select id from campaign) and status='used'
  order by used_at desc nulls last,created_at desc
  limit 1
), owner_actor as (
  select player_id from public.admin_members where role='owner' limit 1
), owner_snapshot as (
  select row_data->>'equipped_title_id' as equipped_title_id
  from private.release_reset_snapshot_rows
  where snapshot_id=(select id from used_snapshot)
    and table_name='players'
    and (row_data->>'id')::uuid=(select player_id from owner_actor)
  limit 1
)
update public.players p
set equipped_title_id='creator_owner'
where p.id=(select player_id from owner_actor)
  and (select equipped_title_id from owner_snapshot)='creator_owner'
  and exists(
    select 1 from public.player_achievements pa
    where pa.player_id=p.id and pa.achievement_id='creator_owner'
  );
