create index if not exists battle_draft_cards_player_idx on public.battle_draft_cards(player_id);
create index if not exists battle_draft_cards_card_idx on public.battle_draft_cards(card_id);
create index if not exists player_achievements_achievement_idx on public.player_achievements(achievement_id);
create index if not exists players_equipped_title_idx on public.players(equipped_title_id) where equipped_title_id is not null;
