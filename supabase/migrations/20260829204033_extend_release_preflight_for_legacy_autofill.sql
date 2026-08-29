create or replace function public.server_release_preflight(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_players integer := 0;
  v_admins integer := 0;
  v_testers integer := 0;
  v_guilds integer := 0;
  v_guild_members integer := 0;
  v_selections integer := 0;
  v_submissions integer := 0;
  v_auto_cards integer := 0;
  v_auto_accounts integer := 0;
  v_awaiting_autofill integer := 0;
  v_invalid_owned integer := 0;
  v_submission_mismatch integer := 0;
  v_over_limit integer := 0;
  v_autofill_incomplete integer := 0;
  v_tester_missing_achievement integer := 0;
  v_guild_leader_mismatch integer := 0;
  v_owner_count integer := 0;
begin
  if not exists (
    select 1
    from public.admin_members a
    where a.player_id = p_actor_id
      and a.role = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'OWNER_ONLY';
  end if;

  select *
  into v_campaign
  from public.release_campaigns
  where code = 'trainer_collection_1_0_beta_transition'
    and active = true
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  select count(*) into v_players from public.players;
  select count(*) into v_admins from public.admin_members;
  select count(*) into v_owner_count from public.admin_members where role = 'owner';
  select count(*) into v_testers from public.admin_tester_title_grants where revoked_at is null;
  select count(*) into v_guilds from public.guilds;
  select count(*) into v_guild_members from public.guild_members;
  select count(*) into v_selections
    from public.release_campaign_legacy_selections
    where campaign_id = v_campaign.id;
  select count(*) into v_submissions
    from public.release_campaign_legacy_submissions
    where campaign_id = v_campaign.id;
  select count(*) into v_auto_cards
    from public.release_campaign_legacy_selections
    where campaign_id = v_campaign.id
      and selection_source = 'automatic';
  select count(*) into v_auto_accounts
    from public.release_campaign_legacy_submissions
    where campaign_id = v_campaign.id
      and auto_filled_count > 0;

  select count(*)
  into v_awaiting_autofill
  from public.players p
  where (
    select count(*)
    from public.release_campaign_legacy_selections s
    where s.campaign_id = v_campaign.id
      and s.player_id = p.id
  ) < least(
    v_campaign.legacy_card_limit,
    (
      select count(*)
      from public.player_cards pc
      where pc.player_id = p.id
        and pc.quantity > 0
    )
  );

  if v_campaign.phase in ('freeze','update_required','completed') then
    v_autofill_incomplete := v_awaiting_autofill;
  else
    v_autofill_incomplete := 0;
  end if;

  select count(*)
  into v_invalid_owned
  from public.release_campaign_legacy_selections s
  left join public.player_cards pc
    on pc.player_id = s.player_id
   and pc.card_id = s.card_id
   and pc.quantity > 0
  where s.campaign_id = v_campaign.id
    and pc.player_id is null;

  select count(*)
  into v_submission_mismatch
  from public.release_campaign_legacy_submissions sub
  left join (
    select campaign_id, player_id, count(*)::integer as actual_count
    from public.release_campaign_legacy_selections
    group by campaign_id, player_id
  ) sel
    on sel.campaign_id = sub.campaign_id
   and sel.player_id = sub.player_id
  where sub.campaign_id = v_campaign.id
    and sub.selected_count <> coalesce(sel.actual_count, 0);

  select count(*)
  into v_over_limit
  from (
    select player_id
    from public.release_campaign_legacy_selections
    where campaign_id = v_campaign.id
    group by player_id
    having count(*) > v_campaign.legacy_card_limit
  ) offenders;

  select count(*)
  into v_tester_missing_achievement
  from public.admin_tester_title_grants g
  left join public.player_achievements pa
    on pa.player_id = g.target_id
   and pa.achievement_id = g.achievement_id
  where g.revoked_at is null
    and pa.player_id is null;

  select count(*)
  into v_guild_leader_mismatch
  from public.guilds g
  where g.leader_id is not null
    and not exists (
      select 1
      from public.guild_members gm
      where gm.guild_id = g.id
        and gm.player_id = g.leader_id
        and gm.role = 'leader'
    );

  return jsonb_build_object(
    'ready',
      v_invalid_owned = 0
      and v_submission_mismatch = 0
      and v_over_limit = 0
      and v_autofill_incomplete = 0
      and v_tester_missing_achievement = 0
      and v_guild_leader_mismatch = 0
      and v_owner_count = 1,
    'generatedAt', now(),
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'phase', v_campaign.phase,
      'legacySelectionEnabled', v_campaign.legacy_selection_enabled,
      'legacyCardLimit', v_campaign.legacy_card_limit,
      'economyFrozen', v_campaign.economy_frozen,
      'forceUpdate', v_campaign.force_update
    ),
    'counts', jsonb_build_object(
      'players', v_players,
      'admins', v_admins,
      'owners', v_owner_count,
      'activeTesters', v_testers,
      'guilds', v_guilds,
      'guildMembers', v_guild_members,
      'selectedCards', v_selections,
      'confirmedAccounts', v_submissions,
      'automaticCards', v_auto_cards,
      'autoFilledAccounts', v_auto_accounts,
      'accountsAwaitingAutoFill', v_awaiting_autofill
    ),
    'issues', jsonb_build_object(
      'selectedCardsNotOwned', v_invalid_owned,
      'submissionCountMismatch', v_submission_mismatch,
      'playersOverCardLimit', v_over_limit,
      'legacyAutofillIncomplete', v_autofill_incomplete,
      'testersMissingAchievement', v_tester_missing_achievement,
      'guildLeaderMismatch', v_guild_leader_mismatch,
      'ownerCountInvalid', case when v_owner_count = 1 then 0 else abs(v_owner_count - 1) end
    )
  );
end;
$$;

revoke all on function public.server_release_preflight(uuid) from public, anon, authenticated;
grant execute on function public.server_release_preflight(uuid) to service_role;
