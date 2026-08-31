-- Economy 2.1 performance hardening after Supabase advisor review.
create index if not exists economy_sink_ledger_guild_idx
  on private.economy_sink_ledger(guild_id);
create index if not exists economy_auctions_highest_bidder_idx
  on public.economy_auctions(highest_bidder_id);
create index if not exists economy_auctions_item_idx
  on public.economy_auctions(item_id);
create index if not exists economy_global_project_contributions_player_idx
  on public.economy_global_project_contributions(player_id);
create index if not exists economy_global_projects_reward_item_idx
  on public.economy_global_projects(reward_item_id);
create index if not exists guild_project_contributions_guild_idx
  on public.guild_project_contributions(guild_id);
create index if not exists player_card_customizations_card_idx
  on public.player_card_customizations(card_id);
create index if not exists player_card_customizations_style_idx
  on public.player_card_customizations(style_item_id);
create index if not exists player_economy_items_item_idx
  on public.player_economy_items(item_id);
create index if not exists player_museum_cards_card_idx
  on public.player_museum_cards(card_id);

drop policy if exists "own economy items readable" on public.player_economy_items;
create policy "own economy items readable"
on public.player_economy_items for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "own prestige readable" on public.player_prestige;
create policy "own prestige readable"
on public.player_prestige for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "own card styles readable" on public.player_card_customizations;
create policy "own card styles readable"
on public.player_card_customizations for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "own global contrib readable" on public.economy_global_project_contributions;
create policy "own global contrib readable"
on public.economy_global_project_contributions for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "economy recommendations admin readable" on public.economy_price_recommendations;
create policy "economy recommendations admin readable"
on public.economy_price_recommendations for select to authenticated
using (
  exists(
    select 1 from public.admin_members a
    where a.player_id=(select auth.uid())
  )
);

drop policy if exists "economy alerts admin readable" on public.economy_alerts;
create policy "economy alerts admin readable"
on public.economy_alerts for select to authenticated
using (
  exists(
    select 1 from public.admin_members a
    where a.player_id=(select auth.uid())
  )
);

drop policy if exists "own luxury rotation readable" on public.player_luxury_rotation;
create policy "own luxury rotation readable"
on public.player_luxury_rotation for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "own museum progress readable" on public.player_museum_progress;
create policy "own museum progress readable"
on public.player_museum_progress for select to authenticated
using (player_id=(select auth.uid()));

drop policy if exists "own museum cards readable" on public.player_museum_cards;
create policy "own museum cards readable"
on public.player_museum_cards for select to authenticated
using (player_id=(select auth.uid()));
