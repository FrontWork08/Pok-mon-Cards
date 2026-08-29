create or replace function public.server_release_reset_preview(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_preflight jsonb;
  v_players integer := 0;
  v_card_rows bigint := 0;
  v_card_copies bigint := 0;
  v_preserved_rows bigint := 0;
  v_preserved_copies bigint := 0;
  v_total_coins numeric := 0;
  v_total_diamonds numeric := 0;
  v_active_ops integer := 0;
  v_maintenance boolean := false;
begin
  if not exists (
    select 1 from public.admin_members a
    where a.player_id = p_actor_id and a.role = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code = 'trainer_collection_1_0_beta_transition' and active = true
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  select count(*), coalesce(sum(coins),0), coalesce(sum(diamonds),0)
  into v_players, v_total_coins, v_total_diamonds from public.players;

  select count(*), coalesce(sum(quantity),0)
  into v_card_rows, v_card_copies from public.player_cards where quantity > 0;

  if v_campaign.phase in ('freeze','update_required','completed') then
    select count(*), count(*)
    into v_preserved_rows, v_preserved_copies
    from public.release_campaign_legacy_selections s
    where s.campaign_id = v_campaign.id;
  else
    select coalesce(sum(least(card_count, v_campaign.legacy_card_limit)),0)
    into v_preserved_rows
    from (
      select player_id, count(*)::integer as card_count
      from public.player_cards
      where quantity > 0
      group by player_id
    ) x;
    v_preserved_copies := v_preserved_rows;
  end if;

  select
    (select count(*) from public.trades where status::text='pending')
    + (select count(*) from public.market_listings where status='active')
    + (select count(*) from public.market_offers where status='pending')
    + (select count(*) from public.matchmaking_queue)
    + (select count(*) from public.battles where status not in ('completed','declined','cancelled'))
  into v_active_ops;

  select maintenance_enabled into v_maintenance
  from public.app_runtime_status where id=1;

  select public.server_release_preflight(p_actor_id) into v_preflight;

  return jsonb_build_object(
    'readyToReset',
      v_campaign.phase = 'freeze'
      and coalesce(v_campaign.economy_frozen,false)
      and coalesce(v_maintenance,false)
      and coalesce((v_preflight->>'ready')::boolean,false)
      and v_active_ops = 0,
    'campaign', jsonb_build_object(
      'phase', v_campaign.phase,
      'legacyCardLimit', v_campaign.legacy_card_limit,
      'rewardCoinsPerVeteran', v_campaign.reward_coins,
      'rewardDiamondsPerVeteran', v_campaign.reward_diamonds,
      'economyFrozen', v_campaign.economy_frozen,
      'maintenanceEnabled', coalesce(v_maintenance,false)
    ),
    'preserve', jsonb_build_object(
      'accounts', v_players,
      'admins', (select count(*) from public.admin_members),
      'activeTesters', (select count(*) from public.admin_tester_title_grants where revoked_at is null),
      'guilds', (select count(*) from public.guilds),
      'guildMembers', (select count(*) from public.guild_members),
      'friendships', (select count(*) from public.friendships),
      'settings', (select count(*) from public.player_settings),
      'cosmetics', (select count(*) from public.player_cosmetics),
      'legacyCardRows', v_preserved_rows,
      'legacyCardCopies', v_preserved_copies
    ),
    'reset', jsonb_build_object(
      'cardRowsRemoved', greatest(v_card_rows - v_preserved_rows,0),
      'cardCopiesRemoved', greatest(v_card_copies - v_preserved_copies,0),
      'decks', (select count(*) from public.decks),
      'deckCards', (select count(*) from public.deck_cards),
      'achievementsExceptTester', (
        select count(*) from public.player_achievements pa
        where not exists (
          select 1 from public.admin_tester_title_grants g
          where g.target_id = pa.player_id
            and g.achievement_id = pa.achievement_id
            and g.revoked_at is null
        )
      ),
      'dailyMissions', (select count(*) from public.player_daily_missions),
      'missionsV2', (select count(*) from public.player_missions_v2),
      'loginStreaks', (select count(*) from public.player_login_streaks),
      'playerSeasons', (select count(*) from public.player_seasons),
      'milestoneClaims', (select count(*) from public.collection_milestone_claims),
      'battlePassProgress', (select count(*) from public.battle_pass_player_progress),
      'battlePassMissionProgress', (select count(*) from public.battle_pass_mission_progress),
      'battlePassClaims', (select count(*) from public.battle_pass_reward_claims),
      'guildWarPoints', (select count(*) from public.guild_war_player_points),
      'guildWeeklyClaims', (select count(*) from public.guild_weekly_reward_claims),
      'guildBoosterClaims', (select count(*) from public.guild_collective_booster_claims),
      'showcaseSlotsAtRisk', (
        select count(*) from public.profile_showcase ps
        where not exists (
          select 1 from public.release_campaign_legacy_selections s
          where s.campaign_id = v_campaign.id
            and s.player_id = ps.player_id
            and s.card_id = ps.card_id
        )
      )
    ),
    'economy', jsonb_build_object(
      'coinsBefore', v_total_coins,
      'diamondsBefore', v_total_diamonds,
      'coinsAfterVeteranReward', v_players * v_campaign.reward_coins,
      'diamondsAfterVeteranReward', v_players * v_campaign.reward_diamonds
    ),
    'activeOperations', v_active_ops,
    'preflight', v_preflight
  );
end;
$$;

revoke all on function public.server_release_reset_preview(uuid) from public, anon, authenticated;
grant execute on function public.server_release_reset_preview(uuid) to service_role;
