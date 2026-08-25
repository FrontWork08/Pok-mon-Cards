create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists pack_openings_pack_idx on public.pack_openings(pack_id);
create index if not exists pack_openings_player_idx on public.pack_openings(player_id);
create index if not exists player_cards_card_idx on public.player_cards(card_id);
create index if not exists trade_cards_card_idx on public.trade_cards(card_id);
create index if not exists trade_cards_owner_idx on public.trade_cards(owner_id);
create index if not exists trades_receiver_idx on public.trades(receiver_id);
create index if not exists trades_sender_idx on public.trades(sender_id);
