create index if not exists release_campaign_legacy_selections_card_idx
  on public.release_campaign_legacy_selections(card_id);

create index if not exists release_campaign_legacy_submissions_player_idx
  on public.release_campaign_legacy_submissions(player_id);
