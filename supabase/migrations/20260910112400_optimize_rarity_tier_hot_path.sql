create or replace function public.rarity_tier_legacy(p_rarity text)
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

create or replace function public.rarity_tier(p_rarity text)
returns smallint
language sql
immutable
parallel safe
set search_path to ''
as $function$
  with input as (
    select lower(coalesce(p_rarity,'')) as rarity,btrim(coalesce(p_rarity,''))='' as empty
  )
  select case
    when empty then 0
    when rarity like '%mega hyper%' or rarity like '%hyper rare%' then 7
    when rarity like '%special illustration%' or rarity like '%shiny ultra%'
      or rarity like '%secret%' or rarity like '%rainbow%' then 6
    when rarity like '%rare ultra%' or rarity like '%ultra rare%'
      or rarity like '%illustration rare%' or rarity like '%shiny%'
      or rarity like '%shining%' then 5
    when rarity like '%double rare%' or rarity like '%vmax%'
      or rarity like '%vstar%' or rarity like '%rare holo v%'
      or rarity like '%rare holo gx%' or rarity like '%rare holo ex%'
      or rarity like '%radiant%' or rarity like '%amazing%'
      or rarity like '%legend%' or rarity like '%prime%'
      or rarity like '%break%' then 4
    when rarity like '%rare holo%' or rarity='rare'
      or rarity='promo' or rarity like '%rare%' then 3
    when rarity='uncommon' then 2
    when rarity='common' then 1
    else 1
  end::smallint
  from input;
$function$;

do $validation$
declare v_mismatches integer;
begin
  select count(*)::integer into v_mismatches
  from (select distinct rarity from public.cards union all select null::text union all select ''::text) r
  where public.rarity_tier_legacy(r.rarity) is distinct from public.rarity_tier(r.rarity);
  if v_mismatches<>0 then raise exception 'RARITY_TIER_VALIDATION_FAILED:%',v_mismatches; end if;
end;
$validation$;
