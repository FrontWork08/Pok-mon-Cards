-- Applied remotely as Supabase migration 20260829212616.
-- Recreate the legacy selection RLS policies with fully-qualified outer-column
-- references so one player's submission cannot shadow another player's policy checks.

drop policy if exists release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections
for insert
to authenticated
with check (
  (select auth.uid()) = release_campaign_legacy_selections.player_id
  and exists (
    select 1 from public.release_campaigns c
    where c.id = release_campaign_legacy_selections.campaign_id
      and c.active
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled
  )
  and exists (
    select 1 from public.player_cards pc
    where pc.player_id = release_campaign_legacy_selections.player_id
      and pc.card_id = release_campaign_legacy_selections.card_id
      and pc.quantity > 0
  )
  and not exists (
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id = release_campaign_legacy_selections.campaign_id
      and sub.player_id = release_campaign_legacy_selections.player_id
  )
);

drop policy if exists release_campaign_legacy_selections_delete_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_delete_own
on public.release_campaign_legacy_selections
for delete
to authenticated
using (
  (select auth.uid()) = release_campaign_legacy_selections.player_id
  and exists (
    select 1 from public.release_campaigns c
    where c.id = release_campaign_legacy_selections.campaign_id
      and c.active
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled
  )
  and not exists (
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id = release_campaign_legacy_selections.campaign_id
      and sub.player_id = release_campaign_legacy_selections.player_id
  )
);
