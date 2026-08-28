-- Runtime integrity guard for the OTA-first deployment model.
-- This does not change the Android runtime. It only exposes a private,
-- service-role diagnostic that confirms the live backend still matches
-- the critical client expectations.

create or replace function private.runtime_integrity_check()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with required_relations(name) as (
  values
    ('players'), ('cards'), ('packs'), ('player_cards'), ('notifications'),
    ('push_tokens'), ('messages'), ('battles'), ('battle_events'),
    ('matchmaking_queue'), ('trades'), ('market_listings'), ('global_announcements')
),
required_functions(name) as (
  values
    ('server_open_pack'), ('server_matchmaking_join'), ('server_matchmaking_cancel'),
    ('server_dispatch_push_notifications'), ('server_background_tick'),
    ('get_collection_value_leaderboard'), ('get_public_player_profile'),
    ('get_my_bag_page'), ('get_my_missions_v2')
),
required_realtime(name) as (
  values
    ('notifications'), ('messages'), ('battles'), ('battle_events'),
    ('matchmaking_queue'), ('trades'), ('market_listings'), ('global_announcements')
),
missing_relations as (
  select r.name from required_relations r
  where not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = r.name
  )
),
missing_functions as (
  select r.name from required_functions r
  where not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.proname = r.name
  )
),
missing_realtime as (
  select r.name from required_realtime r
  where not exists (
    select 1 from pg_catalog.pg_publication_tables p
    where p.pubname = 'supabase_realtime'
      and p.schemaname = 'public'
      and p.tablename = r.name
  )
)
select jsonb_build_object(
  'ok',
    not exists(select 1 from missing_relations)
    and not exists(select 1 from missing_functions)
    and not exists(select 1 from missing_realtime),
  'missingRelations', coalesce((select jsonb_agg(name order by name) from missing_relations), '[]'::jsonb),
  'missingFunctions', coalesce((select jsonb_agg(name order by name) from missing_functions), '[]'::jsonb),
  'missingRealtime', coalesce((select jsonb_agg(name order by name) from missing_realtime), '[]'::jsonb),
  'backgroundWorkerActive', exists(select 1 from cron.job where jobname='pokemon-cards-background' and active),
  'weeklyPriceReviewActive', exists(select 1 from cron.job where jobname='pokemon-cards-price-review-weekly' and active),
  'checkedAt', now()
);
$$;

revoke all on function private.runtime_integrity_check()
from public, anon, authenticated;

grant execute on function private.runtime_integrity_check()
to service_role;
