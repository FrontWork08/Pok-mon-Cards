-- Keep privileged implementations in the non-exposed private schema while
-- allowing only authenticated users to reach the explicitly approved RPCs.

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke execute on functions from public;

revoke all on function private.get_guild_hub() from public, anon;
revoke all on function private.get_my_bag_overview() from public, anon;
revoke all on function private.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) from public, anon;
revoke all on function private.get_public_player_profile(uuid) from public, anon;
revoke all on function private.guild_action(text, text, uuid, text, uuid) from public, anon;
revoke all on function private.marketplace_action(text, uuid, text, integer, bigint, text, text) from public, anon;
revoke all on function private.redeem_code(text) from public, anon;
revoke all on function private.set_profile_icon(text) from public, anon;

grant execute on function private.get_guild_hub() to authenticated, service_role;
grant execute on function private.get_my_bag_overview() to authenticated, service_role;
grant execute on function private.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) to authenticated, service_role;
grant execute on function private.get_public_player_profile(uuid) to authenticated, service_role;
grant execute on function private.guild_action(text, text, uuid, text, uuid) to authenticated, service_role;
grant execute on function private.marketplace_action(text, uuid, text, integer, bigint, text, text) to authenticated, service_role;
grant execute on function private.redeem_code(text) to authenticated, service_role;
grant execute on function private.set_profile_icon(text) to authenticated, service_role;

alter function public.get_guild_hub() security invoker;
alter function public.get_my_bag_overview() security invoker;
alter function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) security invoker;
alter function public.get_public_player_profile(uuid) security invoker;
alter function public.guild_action(text, text, uuid, text, uuid) security invoker;
alter function public.marketplace_action(text, uuid, text, integer, bigint, text, text) security invoker;
alter function public.redeem_code(text) security invoker;
alter function public.set_profile_icon(text) security invoker;

revoke all on function public.get_guild_hub() from public, anon;
revoke all on function public.get_my_bag_overview() from public, anon;
revoke all on function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) from public, anon;
revoke all on function public.get_public_player_profile(uuid) from public, anon;
revoke all on function public.guild_action(text, text, uuid, text, uuid) from public, anon;
revoke all on function public.marketplace_action(text, uuid, text, integer, bigint, text, text) from public, anon;
revoke all on function public.redeem_code(text) from public, anon;
revoke all on function public.set_profile_icon(text) from public, anon;

grant execute on function public.get_guild_hub() to authenticated, service_role;
grant execute on function public.get_my_bag_overview() to authenticated, service_role;
grant execute on function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) to authenticated, service_role;
grant execute on function public.get_public_player_profile(uuid) to authenticated, service_role;
grant execute on function public.guild_action(text, text, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.marketplace_action(text, uuid, text, integer, bigint, text, text) to authenticated, service_role;
grant execute on function public.redeem_code(text) to authenticated, service_role;
grant execute on function public.set_profile_icon(text) to authenticated, service_role;

-- The catalog views are read-only client APIs.
revoke insert, update, delete, truncate, references, trigger
  on public.pokedex_catalog, public.set_catalog
  from anon, authenticated;
grant select on public.pokedex_catalog, public.set_catalog to anon, authenticated;
