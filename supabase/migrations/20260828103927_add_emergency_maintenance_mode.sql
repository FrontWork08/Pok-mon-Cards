create table if not exists public.app_runtime_status (
  id smallint primary key default 1,
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'Estamos aplicando uma atualização importante. O jogo voltará em breve.',
  enabled_at timestamptz,
  enabled_by uuid references public.players(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_runtime_status_singleton check (id = 1),
  constraint app_runtime_status_message_length check (char_length(maintenance_message) between 1 and 500)
);

insert into public.app_runtime_status (id, maintenance_enabled, maintenance_message, updated_at)
values (1, false, 'Estamos aplicando uma atualização importante. O jogo voltará em breve.', now())
on conflict (id) do nothing;

alter table public.app_runtime_status enable row level security;
revoke all on table public.app_runtime_status from anon, authenticated;
grant select on table public.app_runtime_status to anon, authenticated;

drop policy if exists "runtime status is publicly readable" on public.app_runtime_status;
create policy "runtime status is publicly readable"
on public.app_runtime_status for select to anon, authenticated
using (id = 1);

do $block$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_runtime_status'
  ) then
    alter publication supabase_realtime add table public.app_runtime_status;
  end if;
end;
$block$;

create or replace function public.server_assert_app_active(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_maintenance boolean := false;
begin
  select maintenance_enabled into v_maintenance
  from public.app_runtime_status where id = 1;

  if not coalesce(v_maintenance, false) then return; end if;
  if exists (select 1 from public.admin_members where player_id = p_player_id) then return; end if;
  raise exception 'APP_MAINTENANCE';
end;
$function$;

revoke all on function public.server_assert_app_active(uuid) from public, anon, authenticated;
grant execute on function public.server_assert_app_active(uuid) to service_role;

create or replace function private.block_activity_during_maintenance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_maintenance boolean := false;
begin
  select maintenance_enabled into v_maintenance
  from public.app_runtime_status where id = 1;

  if coalesce(v_maintenance, false)
     and v_actor is not null
     and not exists (select 1 from public.admin_members where player_id = v_actor)
  then
    raise exception 'APP_MAINTENANCE';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function private.block_activity_during_maintenance() from public, anon, authenticated;

do $block$
declare
  v_table text;
  v_tables text[] := array[
    'player_cards','pack_openings','diamond_pack_openings','trades','trade_cards',
    'battles','battle_selections','battle_rounds','battle_coin_escrows','battle_card_stakes',
    'battle_draft_cards','matchmaking_queue','messages','friendships','decks','code_redemptions',
    'market_listings','market_offers','player_shops','player_daily_missions','player_missions_v2',
    'player_login_streaks','collection_milestone_claims','guild_members','guild_invites',
    'guild_weekly_reward_claims','guild_collective_booster_claims','guild_war_player_points',
    'tournament_entries','tournament_matches','player_cosmetics','card_wishlist',
    'profile_showcase','diamond_exchange_log'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('drop trigger if exists maintenance_guard on public.%I', v_table);
      execute format(
        'create trigger maintenance_guard before insert or update or delete on public.%I for each statement execute function private.block_activity_during_maintenance()',
        v_table
      );
    end if;
  end loop;
end;
$block$;
