-- Public RPC wrappers execute as the database owner so authenticated users can
-- reach the private implementation without receiving "permission denied for
-- schema private". The private functions still enforce auth.uid() and their
-- own authorization rules.

alter function public.get_my_bag_overview() security definer;
alter function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) security definer;

revoke all on function public.get_my_bag_overview() from public, anon;
revoke all on function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) from public, anon;

grant execute on function public.get_my_bag_overview() to authenticated, service_role;
grant execute on function public.get_my_bag_page(integer, integer, text, text, text, text, text, integer, text) to authenticated, service_role;
