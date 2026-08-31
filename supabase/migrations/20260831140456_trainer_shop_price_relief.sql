-- Trainer Shop price relief: make permanent cosmetics and buyable items more accessible
-- while preserving event/auction-only rewards and the broader Economy 2.1 sink structure.

update public.economy_store_items
set
  price_coins = greatest(
    15000::bigint,
    (round((price_coins::numeric * 0.80) / 5000.0) * 5000)::bigint
  ),
  metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'trainerShopPriceRelief','2026-08-31',
    'trainerShopPriceMultiplier',0.80
  )
where active=true
  and coalesce((metadata->>'notForDirectSale')::boolean,false)=false;
