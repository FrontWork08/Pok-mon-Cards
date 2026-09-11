create index if not exists battle_game_fighters_player_idx
  on private.battle_game_fighters(player_id);

create index if not exists battle_game_fighters_card_idx
  on private.battle_game_fighters(card_id);

create index if not exists battle_team_members_player_idx
  on private.battle_team_members(player_id);

create index if not exists battle_team_members_card_idx
  on private.battle_team_members(card_id);

create index if not exists battle_team_state_player_idx
  on private.battle_team_state(player_id);

create index if not exists battle_team_actions_player_idx
  on private.battle_team_actions(player_id);
