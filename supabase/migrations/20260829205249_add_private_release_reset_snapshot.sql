create table if not exists private.release_reset_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.release_campaigns(id) on delete restrict,
  created_by uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default now(),
  status text not null default 'prepared'
    check (status in ('prepared','used','restored','superseded')),
  preview jsonb not null,
  row_counts jsonb not null default '{}'::jsonb,
  used_at timestamptz,
  restored_at timestamptz
);

create unique index if not exists release_reset_one_prepared_snapshot_idx
  on private.release_reset_snapshots(campaign_id)
  where status = 'prepared';

create table if not exists private.release_reset_snapshot_rows (
  id bigint generated always as identity primary key,
  snapshot_id uuid not null references private.release_reset_snapshots(id) on delete cascade,
  table_name text not null,
  row_data jsonb not null
);

create index if not exists release_reset_snapshot_rows_lookup_idx
  on private.release_reset_snapshot_rows(snapshot_id, table_name);

revoke all on table private.release_reset_snapshots from public, anon, authenticated;
revoke all on table private.release_reset_snapshot_rows from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.release_reset_snapshots to service_role;
grant select, insert, update, delete on table private.release_reset_snapshot_rows to service_role;
grant usage, select on all sequences in schema private to service_role;

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

  select * into v_existing
  from private.release_reset_snapshots
  where campaign_id = v_campaign.id
    and status = 'prepared'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'created', false,
      'snapshotId', v_existing.id,
      'createdAt', v_existing.created_at,
      'status', v_existing.status,
      'rowCounts', v_existing.row_counts,
      'preview', v_existing.preview
    );
  end if;

  select public.server_release_reset_preview(p_actor_id)
  into v_preview;

  if not coalesce((v_preview->>'readyToReset')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'RELEASE_NOT_READY_FOR_SNAPSHOT';
  end if;

  insert into private.release_reset_snapshots(campaign_id, created_by, preview)
  values (v_campaign.id, p_actor_id, v_preview)
  returning id into v_snapshot_id;

  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'players', to_jsonb(t) from public.players t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_cards', to_jsonb(t) from public.player_cards t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'decks', to_jsonb(t) from public.decks t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'deck_cards', to_jsonb(t) from public.deck_cards t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_achievements', to_jsonb(t) from public.player_achievements t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_daily_missions', to_jsonb(t) from public.player_daily_missions t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_missions_v2', to_jsonb(t) from public.player_missions_v2 t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_login_streaks', to_jsonb(t) from public.player_login_streaks t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_seasons', to_jsonb(t) from public.player_seasons t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'collection_milestone_claims', to_jsonb(t) from public.collection_milestone_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'battle_pass_player_progress', to_jsonb(t) from public.battle_pass_player_progress t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'battle_pass_mission_progress', to_jsonb(t) from public.battle_pass_mission_progress t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'battle_pass_reward_claims', to_jsonb(t) from public.battle_pass_reward_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'profile_showcase', to_jsonb(t) from public.profile_showcase t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'guilds', to_jsonb(t) from public.guilds t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'guild_war_player_points', to_jsonb(t) from public.guild_war_player_points t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'guild_weekly_reward_claims', to_jsonb(t) from public.guild_weekly_reward_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'guild_collective_booster_claims', to_jsonb(t) from public.guild_collective_booster_claims t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'admin_members', to_jsonb(t) from public.admin_members t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'admin_tester_title_grants', to_jsonb(t) from public.admin_tester_title_grants t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'guild_members', to_jsonb(t) from public.guild_members t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_settings', to_jsonb(t) from public.player_settings t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'player_cosmetics', to_jsonb(t) from public.player_cosmetics t;
  insert into private.release_reset_snapshot_rows(snapshot_id, table_name, row_data)
  select v_snapshot_id, 'friendships', to_jsonb(t) from public.friendships t;

  select coalesce(jsonb_object_agg(table_name, row_count), '{}'::jsonb)
  into v_counts
  from (
    select table_name, count(*)::bigint as row_count
    from private.release_reset_snapshot_rows
    where snapshot_id = v_snapshot_id
    group by table_name
  ) counts;

  update private.release_reset_snapshots
  set row_counts = v_counts
  where id = v_snapshot_id;

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'snapshotId', v_snapshot_id,
    'status', 'prepared',
    'rowCounts', v_counts,
    'preview', v_preview
  );
end;
$$;

revoke all on function public.server_create_release_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.server_create_release_snapshot(uuid) to service_role;
