alter table public.release_campaign_legacy_selections
  add column if not exists selection_source text not null default 'manual'
  check (selection_source in ('manual','automatic'));

alter table public.release_campaign_legacy_submissions
  add column if not exists auto_filled_count integer not null default 0
  check (auto_filled_count >= 0);

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

  if not exists (
    select 1
    from public.player_cards pc
    where pc.player_id = new.player_id
      and pc.card_id = new.card_id
      and pc.quantity > 0
  ) then
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

create or replace function public.server_finalize_legacy_selections(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_inserted integer := 0;
  v_new_submissions integer := 0;
  v_updated_submissions integer := 0;
  v_fully_filled integer := 0;
  v_short_bag integer := 0;
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

  if v_campaign.phase <> 'freeze' or not coalesce(v_campaign.economy_frozen, false) then
    raise exception using errcode = 'P0001', message = 'LEGACY_FREEZE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trainer_collection_1_0_legacy_finalize', 0));
  perform set_config('app.legacy_autofill', '1', true);

  with existing as (
    select p.id as player_id, count(s.card_id)::integer as selected_count
    from public.players p
    left join public.release_campaign_legacy_selections s
      on s.player_id = p.id
     and s.campaign_id = v_campaign.id
    group by p.id
  ),
  candidates as (
    select
      pc.player_id,
      pc.card_id,
      row_number() over (
        partition by pc.player_id
        order by
          c.market_price_usd desc nulls last,
          c.game_value desc nulls last,
          pc.first_obtained_at asc,
          pc.card_id asc
      ) as candidate_rank
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.quantity > 0
      and not exists (
        select 1
        from public.release_campaign_legacy_selections s
        where s.campaign_id = v_campaign.id
          and s.player_id = pc.player_id
          and s.card_id = pc.card_id
      )
  ),
  inserted as (
    insert into public.release_campaign_legacy_selections (
      campaign_id,
      player_id,
      card_id,
      selection_source
    )
    select
      v_campaign.id,
      c.player_id,
      c.card_id,
      'automatic'
    from candidates c
    join existing e on e.player_id = c.player_id
    where c.candidate_rank <= greatest(v_campaign.legacy_card_limit - e.selected_count, 0)
    on conflict (campaign_id, player_id, card_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  with counts as (
    select
      s.player_id,
      count(*)::integer as selected_count,
      count(*) filter (where s.selection_source = 'automatic')::integer as auto_count
    from public.release_campaign_legacy_selections s
    where s.campaign_id = v_campaign.id
    group by s.player_id
  ),
  inserted_submissions as (
    insert into public.release_campaign_legacy_submissions (
      campaign_id,
      player_id,
      selected_count,
      auto_filled_count,
      confirmed_at
    )
    select
      v_campaign.id,
      c.player_id,
      c.selected_count,
      c.auto_count,
      now()
    from counts c
    where c.selected_count > 0
      and not exists (
        select 1
        from public.release_campaign_legacy_submissions sub
        where sub.campaign_id = v_campaign.id
          and sub.player_id = c.player_id
      )
    returning 1
  )
  select count(*) into v_new_submissions from inserted_submissions;

  with counts as (
    select
      s.player_id,
      count(*)::integer as selected_count,
      count(*) filter (where s.selection_source = 'automatic')::integer as auto_count
    from public.release_campaign_legacy_selections s
    where s.campaign_id = v_campaign.id
    group by s.player_id
  ),
  updated as (
    update public.release_campaign_legacy_submissions sub
    set
      selected_count = c.selected_count,
      auto_filled_count = c.auto_count
    from counts c
    where sub.campaign_id = v_campaign.id
      and sub.player_id = c.player_id
      and (
        sub.selected_count is distinct from c.selected_count
        or sub.auto_filled_count is distinct from c.auto_count
      )
    returning 1
  )
  select count(*) into v_updated_submissions from updated;

  select count(*)
  into v_fully_filled
  from (
    select player_id
    from public.release_campaign_legacy_selections
    where campaign_id = v_campaign.id
    group by player_id
    having count(*) = v_campaign.legacy_card_limit
  ) filled;

  select count(*)
  into v_short_bag
  from public.players p
  where (
    select count(*)
    from public.player_cards pc
    where pc.player_id = p.id
      and pc.quantity > 0
  ) < v_campaign.legacy_card_limit;

  return jsonb_build_object(
    'ok', true,
    'campaignId', v_campaign.id,
    'legacyCardLimit', v_campaign.legacy_card_limit,
    'automaticCardsAdded', v_inserted,
    'newAutoConfirmedAccounts', v_new_submissions,
    'existingSubmissionsUpdated', v_updated_submissions,
    'accountsWithFullLegacy', v_fully_filled,
    'accountsWithFewerThanLimitOwned', v_short_bag,
    'selectionRule', 'manual_first_then_market_price_desc_game_value_desc'
  );
end;
$$;

revoke all on function public.server_finalize_legacy_selections(uuid) from public, anon, authenticated;
grant execute on function public.server_finalize_legacy_selections(uuid) to service_role;
