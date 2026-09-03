
alter table public.battle_formats enable row level security;
drop policy if exists battle_formats_select_active on public.battle_formats;
create policy battle_formats_select_active
on public.battle_formats
for select
to authenticated
using(active=true);
revoke all on table public.battle_formats from anon;
grant select on table public.battle_formats to authenticated,service_role;

revoke all on function public.get_card_game_profile(text) from public,anon;
grant execute on function public.get_card_game_profile(text) to authenticated,service_role;

revoke all on function public.server_abandon_trade(uuid,uuid) from public,anon;
grant execute on function public.server_abandon_trade(uuid,uuid) to authenticated,service_role;

revoke all on function public.server_cleanup_abandoned_trades(uuid) from public,anon;
grant execute on function public.server_cleanup_abandoned_trades(uuid) to authenticated,service_role;

revoke all on function public.get_my_weekly_collection_rank() from public,anon;
grant execute on function public.get_my_weekly_collection_rank() to authenticated,service_role;
