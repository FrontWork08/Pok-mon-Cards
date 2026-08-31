-- Small booster luck adjustment after Economy 2.1 price relief.
-- Goal: improve "good pull" feel modestly without flooding high-end cards.
-- Estimated average rare-slot Tier 4+ chance across active coin packs:
-- about 14.0% -> 15.0% (~12% relative increase), before pity/event multipliers.

create or replace function public.rarity_pull_weight(p_rarity text)
returns numeric
language sql
immutable
parallel safe
set search_path=''
as $$
  select case public.rarity_tier(p_rarity)
    when 7 then 0.40
    when 6 then 1.12
    when 5 then 3.30
    when 4 then 10.80
    when 3 then 42.00
    when 2 then 180.00
    when 1 then 520.00
    else 80.00
  end;
$$;

create or replace function private.card_market_pull_factor(p_price numeric)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when p_price is null or p_price<=5 then 1.00
    when p_price<=10 then 0.92
    when p_price<=25 then 0.80
    when p_price<=50 then 0.60
    when p_price<=100 then 0.39
    when p_price<=200 then 0.23
    when p_price<=400 then 0.12
    when p_price<=800 then 0.05
    when p_price<=1500 then 0.025
    else 0.012
  end::numeric;
$$;
