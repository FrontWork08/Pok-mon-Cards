create index if not exists diamond_pack_openings_card_idx
  on public.diamond_pack_openings(card_id);
create index if not exists market_listings_buyer_idx
  on public.market_listings(buyer_id) where buyer_id is not null;
create index if not exists redeem_codes_created_by_idx
  on public.redeem_codes(created_by) where created_by is not null;
