alter function public.rarity_tier(text) set search_path = '';

alter policy player_gamepasses_select_own
  on public.player_gamepasses
  using (player_id = (select auth.uid()));

alter policy trainer_journey_claims_select_own
  on public.trainer_journey_claims
  using (player_id = (select auth.uid()));

alter policy player_booster_luck_select_own
  on public.player_booster_luck
  using (player_id = (select auth.uid()));

alter view public.set_catalog set (security_invoker = true);

revoke all on function public.get_adventure_battle_context(uuid) from public, anon;
grant execute on function public.get_adventure_battle_context(uuid) to authenticated, service_role;

revoke all on function public.get_adventure_hub() from public, anon;
grant execute on function public.get_adventure_hub() to authenticated, service_role;

revoke all on function public.get_guild_raid_state() from public, anon;
grant execute on function public.get_guild_raid_state() to authenticated, service_role;

revoke all on function public.get_kanto_adventure() from public, anon;
grant execute on function public.get_kanto_adventure() to authenticated, service_role;

revoke all on function public.get_marketplace_hub_v2() from public, anon;
grant execute on function public.get_marketplace_hub_v2() to authenticated, service_role;

revoke all on function public.get_pokemon_mastery() from public, anon;
grant execute on function public.get_pokemon_mastery() to authenticated, service_role;

revoke all on function public.get_rogue_run_state() from public, anon;
grant execute on function public.get_rogue_run_state() to authenticated, service_role;

revoke all on function public.get_trainer_battle_records() from public, anon;
grant execute on function public.get_trainer_battle_records() to authenticated, service_role;

revoke all on function public.server_adventure_team3_bot_take_turn(uuid) from public, anon;
grant execute on function public.server_adventure_team3_bot_take_turn(uuid) to authenticated, service_role;

revoke all on function public.server_list_adventure_team_battle_cards(uuid,uuid,text,integer,integer) from public, anon;
grant execute on function public.server_list_adventure_team_battle_cards(uuid,uuid,text,integer,integer) to authenticated, service_role;

revoke all on function public.server_set_adventure_battle_team(uuid,uuid,text[]) from public, anon;
grant execute on function public.server_set_adventure_battle_team(uuid,uuid,text[]) to authenticated, service_role;

revoke all on function public.server_start_adventure_battle(text,text) from public, anon;
grant execute on function public.server_start_adventure_battle(text,text) to authenticated, service_role;
