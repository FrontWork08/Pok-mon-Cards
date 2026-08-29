create or replace function private.legacy_card_is_available(p_player_id uuid, p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.player_cards pc
      where pc.player_id = p_player_id
        and pc.card_id = p_card_id
        and pc.quantity > 0
    )
    or exists (
      select 1
      from public.market_listings ml
      where ml.seller_id = p_player_id
        and ml.card_id = p_card_id
        and ml.status = 'active'
        and ml.quantity > 0
    );
$$;

revoke all on function private.legacy_card_is_available(uuid,text) from public, anon, authenticated;

create or replace function private.validate_release_legacy_selection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_enabled boolean;
  v_phase text;
  v_frozen boolean;
  v_auto boolean := coalesce(current_setting('app.legacy_autofill', true), '') = '1';
begin
  if not v_auto and (v_uid is null or v_uid <> new.player_id) then
    raise exception using errcode = 'P0001', message = 'LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:' || new.campaign_id::text || ':' || new.player_id::text, 0));

  select c.legacy_card_limit, c.legacy_selection_enabled, c.phase, c.economy_frozen
  into v_limit, v_enabled, v_phase, v_frozen
  from public.release_campaigns c
  where c.id = new.campaign_id
    and c.active = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  if v_auto then
    if v_phase <> 'freeze' or not coalesce(v_frozen, false) then
      raise exception using errcode = 'P0001', message = 'LEGACY_FREEZE_REQUIRED';
    end if;
    new.selection_source := 'automatic';
  else
    if not coalesce(v_enabled, false) or v_phase <> 'legacy_selection' then
      raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
    end if;

    if exists (
      select 1
      from public.release_campaign_legacy_submissions s
      where s.campaign_id = new.campaign_id
        and s.player_id = new.player_id
    ) then
      raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_LOCKED';
    end if;

    new.selection_source := 'manual';
  end if;

  if not private.legacy_card_is_available(new.player_id, new.card_id) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  select count(*)
  into v_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id = new.campaign_id
    and s.player_id = new.player_id;

  if v_count >= greatest(0, coalesce(v_limit, 0)) then
    raise exception using errcode = 'P0001', message = 'LEGACY_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_release_legacy_selection() from public, anon, authenticated;

create or replace function private.validate_release_legacy_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_auto_count integer;
  v_enabled boolean;
  v_phase text;
  v_frozen boolean;
  v_auto boolean := coalesce(current_setting('app.legacy_autofill', true), '') = '1';
  v_listing record;
begin
  if not v_auto and (v_uid is null or v_uid <> new.player_id) then
    raise exception using errcode = 'P0001', message = 'LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:' || new.campaign_id::text || ':' || new.player_id::text, 0));

  select c.legacy_card_limit, c.legacy_selection_enabled, c.phase, c.economy_frozen
  into v_limit, v_enabled, v_phase, v_frozen
  from public.release_campaigns c
  where c.id = new.campaign_id
    and c.active = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  if v_auto then
    if v_phase <> 'freeze' or not coalesce(v_frozen, false) then
      raise exception using errcode = 'P0001', message = 'LEGACY_FREEZE_REQUIRED';
    end if;
  elsif not coalesce(v_enabled, false) or v_phase <> 'legacy_selection' then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  select count(*), count(*) filter (where selection_source = 'automatic')
  into v_count, v_auto_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id = new.campaign_id
    and s.player_id = new.player_id;

  if v_count < 1 then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECT_AT_LEAST_ONE';
  end if;

  if v_count > greatest(0, coalesce(v_limit, 0)) then
    raise exception using errcode = 'P0001', message = 'LEGACY_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from public.release_campaign_legacy_selections s
    where s.campaign_id = new.campaign_id
      and s.player_id = new.player_id
      and not private.legacy_card_is_available(s.player_id, s.card_id)
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  for v_listing in
    select ml.id, ml.card_id, ml.quantity
    from public.market_listings ml
    where ml.seller_id = new.player_id
      and ml.status = 'active'
      and exists (
        select 1
        from public.release_campaign_legacy_selections s
        where s.campaign_id = new.campaign_id
          and s.player_id = new.player_id
          and s.card_id = ml.card_id
      )
    order by ml.id
    for update
  loop
    update public.market_offers
    set status = 'rejected', updated_at = now()
    where listing_id = v_listing.id
      and status = 'pending';

    insert into public.player_cards(player_id, card_id, quantity)
    values(new.player_id, v_listing.card_id, v_listing.quantity)
    on conflict(player_id, card_id)
    do update set quantity = public.player_cards.quantity + excluded.quantity;

    update public.market_listings
    set status = 'cancelled', updated_at = now()
    where id = v_listing.id;
  end loop;

  if exists (
    select 1
    from public.release_campaign_legacy_selections s
    left join public.player_cards pc
      on pc.player_id = s.player_id
     and pc.card_id = s.card_id
     and pc.quantity > 0
    where s.campaign_id = new.campaign_id
      and s.player_id = new.player_id
      and pc.player_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  new.selected_count := v_count;
  new.auto_filled_count := v_auto_count;
  new.confirmed_at := now();
  return new;
end;
$$;

revoke all on function private.validate_release_legacy_submission() from public, anon, authenticated;

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
  v_listing record;
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
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.phase not in ('notice', 'legacy_selection', 'freeze') then
    raise exception using errcode = 'P0001', message = 'RELEASE_PHASE_LOCKED';
  end if;

  update public.app_runtime_status
  set
    maintenance_enabled = true,
    maintenance_message = 'A Trainer Collection está entrando na migração 1.0. Sua conta e seu Legado estão sendo protegidos.',
    enabled_at = coalesce(enabled_at, now()),
    enabled_by = p_actor_id,
    updated_at = now()
  where id = 1;

  update public.release_campaigns
  set
    phase = 'freeze',
    legacy_selection_enabled = false,
    economy_frozen = true,
    updated_at = now()
  where id = v_campaign.id;

  delete from public.matchmaking_queue;
  get diagnostics v_queue_cleared = row_count;

  update public.trades
  set
    status = 'cancelled',
    updated_at = now()
  where status::text = 'pending';
  get diagnostics v_cancelled_trades = row_count;

  update public.market_offers
  set
    status = 'rejected',
    updated_at = now()
  where status = 'pending';
  get diagnostics v_rejected_offers = row_count;

  for v_listing in
    select ml.id, ml.seller_id, ml.card_id, ml.quantity
    from public.market_listings ml
    where ml.status = 'active'
    order by ml.id
    for update
  loop
    insert into public.player_cards(player_id, card_id, quantity)
    values(v_listing.seller_id, v_listing.card_id, v_listing.quantity)
    on conflict(player_id, card_id)
    do update set quantity = public.player_cards.quantity + excluded.quantity;

    update public.market_listings
    set status = 'cancelled', updated_at = now()
    where id = v_listing.id;

    v_cancelled_listings := v_cancelled_listings + 1;
  end loop;

  select public.server_finalize_legacy_selections(p_actor_id)
  into v_finalize;

  return jsonb_build_object(
    'ok', true,
    'phase', 'freeze',
    'maintenanceEnabled', true,
    'economyFrozen', true,
    'legacySelectionEnabled', false,
    'closedOperations', jsonb_build_object(
      'matchmakingQueue', v_queue_cleared,
      'trades', v_cancelled_trades,
      'marketOffers', v_rejected_offers,
      'marketListings', v_cancelled_listings
    ),
    'legacyFinalize', v_finalize
  );
end;
$$;

revoke all on function public.server_begin_release_freeze(uuid) from public, anon, authenticated;
grant execute on function public.server_begin_release_freeze(uuid) to service_role;

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
  select count(*) into v_selections from public.release_campaign_legacy_selections where campaign_id = v_campaign.id;
  select count(*) into v_submissions from public.release_campaign_legacy_submissions where campaign_id = v_campaign.id;
  select count(*) into v_auto_cards from public.release_campaign_legacy_selections where campaign_id = v_campaign.id and selection_source = 'automatic';
  select count(*) into v_auto_accounts from public.release_campaign_legacy_submissions where campaign_id = v_campaign.id and auto_filled_count > 0;

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
      from (
        select pc.card_id
        from public.player_cards pc
        where pc.player_id = p.id
          and pc.quantity > 0
        union
        select ml.card_id
        from public.market_listings ml
        where ml.seller_id = p.id
          and ml.status = 'active'
          and ml.quantity > 0
      ) eligible
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
  where s.campaign_id = v_campaign.id
    and not private.legacy_card_is_available(s.player_id, s.card_id);

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
