create index if not exists pack_openings_pack_player_opened_idx
  on public.pack_openings(pack_id,player_id,opened_at desc);
