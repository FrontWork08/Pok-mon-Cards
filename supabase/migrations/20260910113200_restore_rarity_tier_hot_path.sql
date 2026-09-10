-- The attempted lower-once SQL CTE version of rarity_tier was measurably slower
-- over the full card catalog. Restore the proven direct immutable expression.
create or replace function public.rarity_tier(p_rarity text)
returns smallint
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select case
    when p_rarity is null or btrim(p_rarity) = '' then 0
    when lower(p_rarity) like '%mega hyper%' or lower(p_rarity) like '%hyper rare%' then 7
    when lower(p_rarity) like '%special illustration%' or lower(p_rarity) like '%shiny ultra%'
      or lower(p_rarity) like '%secret%' or lower(p_rarity) like '%rainbow%' then 6
    when lower(p_rarity) like '%rare ultra%' or lower(p_rarity) like '%ultra rare%'
      or lower(p_rarity) like '%illustration rare%' or lower(p_rarity) like '%shiny%'
      or lower(p_rarity) like '%shining%' then 5
    when lower(p_rarity) like '%double rare%' or lower(p_rarity) like '%vmax%'
      or lower(p_rarity) like '%vstar%' or lower(p_rarity) like '%rare holo v%'
      or lower(p_rarity) like '%rare holo gx%' or lower(p_rarity) like '%rare holo ex%'
      or lower(p_rarity) like '%radiant%' or lower(p_rarity) like '%amazing%'
      or lower(p_rarity) like '%legend%' or lower(p_rarity) like '%prime%'
      or lower(p_rarity) like '%break%' then 4
    when lower(p_rarity) like '%rare holo%' or lower(p_rarity) = 'rare'
      or lower(p_rarity) = 'promo' or lower(p_rarity) like '%rare%' then 3
    when lower(p_rarity) = 'uncommon' then 2
    when lower(p_rarity) = 'common' then 1
    else 1
  end::smallint;
$function$;

drop function if exists public.rarity_tier_legacy(text);