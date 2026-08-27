create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.get_my_bag_overview() set schema private;
alter function public.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) set schema private;
alter function public.get_public_player_profile(uuid) set schema private;
alter function public.get_guild_hub() set schema private;
alter function public.guild_action(text,text,uuid,text,uuid) set schema private;

revoke all on function private.get_my_bag_overview() from public, anon;
revoke all on function private.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) from public, anon;
revoke all on function private.get_public_player_profile(uuid) from public, anon;
revoke all on function private.get_guild_hub() from public, anon;
revoke all on function private.guild_action(text,text,uuid,text,uuid) from public, anon;
grant execute on function private.get_my_bag_overview() to authenticated, service_role;
grant execute on function private.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) to authenticated, service_role;
grant execute on function private.get_public_player_profile(uuid) to authenticated, service_role;
grant execute on function private.get_guild_hub() to authenticated, service_role;
grant execute on function private.guild_action(text,text,uuid,text,uuid) to authenticated, service_role;

create or replace function public.get_my_bag_overview()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_my_bag_overview(); $$;

create or replace function public.get_my_bag_page(
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null,
  p_set_query text default null,
  p_quick_filter text default 'all',
  p_type_filter text default null,
  p_rarity_filter text default null,
  p_generation integer default null,
  p_sort_mode text default 'recent'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_my_bag_page(
    p_offset,p_limit,p_search,p_set_query,p_quick_filter,
    p_type_filter,p_rarity_filter,p_generation,p_sort_mode
  );
$$;

create or replace function public.get_public_player_profile(p_player_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_public_player_profile(p_player_id); $$;

create or replace function public.get_friend_profile(p_friend_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select public.get_public_player_profile(p_friend_id); $$;

create or replace function public.get_guild_hub()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_guild_hub(); $$;

create or replace function public.guild_action(
  p_action text,
  p_guild_id text default null,
  p_target_id uuid default null,
  p_role text default null,
  p_invite_id uuid default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.guild_action(p_action,p_guild_id,p_target_id,p_role,p_invite_id); $$;

revoke all on function public.get_my_bag_overview() from public, anon;
revoke all on function public.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) from public, anon;
revoke all on function public.get_public_player_profile(uuid) from public, anon;
revoke all on function public.get_friend_profile(uuid) from public, anon;
revoke all on function public.get_guild_hub() from public, anon;
revoke all on function public.guild_action(text,text,uuid,text,uuid) from public, anon;
grant execute on function public.get_my_bag_overview() to authenticated;
grant execute on function public.get_my_bag_page(integer,integer,text,text,text,text,text,integer,text) to authenticated;
grant execute on function public.get_public_player_profile(uuid) to authenticated;
grant execute on function public.get_friend_profile(uuid) to authenticated;
grant execute on function public.get_guild_hub() to authenticated;
grant execute on function public.guild_action(text,text,uuid,text,uuid) to authenticated;
