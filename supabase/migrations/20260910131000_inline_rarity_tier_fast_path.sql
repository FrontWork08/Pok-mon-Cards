-- Keep the legacy classification semantics, but make the immutable SQL helper
-- planner-inlineable and short-circuit the rarity labels that exist in the catalog.
-- pg_catalog qualification keeps builtin resolution safe without a SET clause,
-- which would prevent SQL-function inlining.
create or replace function public.rarity_tier(p_rarity text)
returns smallint
language sql
immutable
parallel safe
as $function$
  select (case
    when p_rarity is null or pg_catalog.btrim(p_rarity)='' then 0
    else case pg_catalog.lower(p_rarity)
      when 'common' then 1
      when 'uncommon' then 2
      when 'rare' then 3
      when 'rare holo' then 3
      when 'promo' then 3
      when 'rare ultra' then 5
      when 'illustration rare' then 5
      when 'rare holo ex' then 4
      when 'double rare' then 4
      when 'rare holo v' then 4
      when 'rare rainbow' then 6
      when 'ultra rare' then 5
      when 'rare holo gx' then 4
      when 'special illustration rare' then 6
      when 'rare secret' then 6
      when 'rare shiny' then 5
      when 'shiny rare' then 5
      when 'rare holo vmax' then 4
      when 'trainer gallery rare holo' then 3
      when 'rare holo lv.x' then 3
      when 'rare holo vstar' then 4
      when 'hyper rare' then 7
      when 'rare shiny gx' then 5
      when 'rare break' then 4
      when 'rare prime' then 4
      when 'rare holo star' then 3
      when 'classic collection' then 1
      when 'legend' then 4
      when 'rare shining' then 5
      when 'rare prism star' then 3
      when 'radiant rare' then 4
      when 'shiny ultra rare' then 6
      when 'amazing rare' then 4
      when 'mega hyper rare' then 7
      when 'mega_attack_rare' then 3
      when 'black white rare' then 3
      else case
        when pg_catalog.lower(p_rarity) like '%mega hyper%' or pg_catalog.lower(p_rarity) like '%hyper rare%' then 7
        when pg_catalog.lower(p_rarity) like '%special illustration%' or pg_catalog.lower(p_rarity) like '%shiny ultra%' or pg_catalog.lower(p_rarity) like '%secret%' or pg_catalog.lower(p_rarity) like '%rainbow%' then 6
        when pg_catalog.lower(p_rarity) like '%rare ultra%' or pg_catalog.lower(p_rarity) like '%ultra rare%' or pg_catalog.lower(p_rarity) like '%illustration rare%' or pg_catalog.lower(p_rarity) like '%shiny%' or pg_catalog.lower(p_rarity) like '%shining%' then 5
        when pg_catalog.lower(p_rarity) like '%double rare%' or pg_catalog.lower(p_rarity) like '%vmax%' or pg_catalog.lower(p_rarity) like '%vstar%' or pg_catalog.lower(p_rarity) like '%rare holo v%' or pg_catalog.lower(p_rarity) like '%rare holo gx%' or pg_catalog.lower(p_rarity) like '%rare holo ex%' or pg_catalog.lower(p_rarity) like '%radiant%' or pg_catalog.lower(p_rarity) like '%amazing%' or pg_catalog.lower(p_rarity) like '%legend%' or pg_catalog.lower(p_rarity) like '%prime%' or pg_catalog.lower(p_rarity) like '%break%' then 4
        when pg_catalog.lower(p_rarity) like '%rare holo%' or pg_catalog.lower(p_rarity)='rare' or pg_catalog.lower(p_rarity)='promo' or pg_catalog.lower(p_rarity) like '%rare%' then 3
        else 1
      end
    end
  end)::smallint;
$function$;