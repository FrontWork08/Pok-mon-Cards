-- Keep SECURITY DEFINER implementations out of the exposed public schema.

alter function public.claim_mission_v2(text) set schema private;
alter function public.get_collection_value_leaderboard(integer) set schema private;
alter function public.get_my_missions_v2() set schema private;
alter function public.is_current_user_admin() set schema private;

create function public.claim_mission_v2(p_mission_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.claim_mission_v2(p_mission_id); $$;

create function public.get_collection_value_leaderboard(p_limit integer default 100)
returns table (
  global_rank bigint,
  player_id uuid,
  username text,
  collection_value_usd numeric,
  priced_card_copies bigint,
  total_card_copies bigint,
  price_coverage_pct numeric
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.get_collection_value_leaderboard(p_limit); $$;

create function public.get_my_missions_v2()
returns table (
  id text,
  title text,
  description text,
  cadence text,
  event_type text,
  target integer,
  reward_coins integer,
  reward_xp integer,
  reward_diamonds integer,
  action_route text,
  progress integer,
  claimed boolean,
  period_start date
)
language sql
security invoker
set search_path = ''
as $$ select * from private.get_my_missions_v2(); $$;

create function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_current_user_admin(); $$;

revoke all on function private.claim_mission_v2(text) from public, anon;
revoke all on function private.get_collection_value_leaderboard(integer) from public, anon;
revoke all on function private.get_my_missions_v2() from public, anon;
revoke all on function private.is_current_user_admin() from public, anon;

grant execute on function private.claim_mission_v2(text) to authenticated, service_role;
grant execute on function private.get_collection_value_leaderboard(integer) to authenticated, service_role;
grant execute on function private.get_my_missions_v2() to authenticated, service_role;
grant execute on function private.is_current_user_admin() to authenticated, service_role;

revoke all on function public.claim_mission_v2(text) from public, anon;
revoke all on function public.get_collection_value_leaderboard(integer) from public, anon;
revoke all on function public.get_my_missions_v2() from public, anon;
revoke all on function public.is_current_user_admin() from public, anon;

grant execute on function public.claim_mission_v2(text) to authenticated, service_role;
grant execute on function public.get_collection_value_leaderboard(integer) to authenticated, service_role;
grant execute on function public.get_my_missions_v2() to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

notify pgrst, 'reload schema';
