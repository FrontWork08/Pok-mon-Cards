drop function if exists public.get_admin_battle_lab_catalog(text,integer,integer);

create function public.get_admin_battle_lab_catalog(
  p_search text default null,
  p_offset integer default 0,
  p_limit integer default 80,
  p_type text default null,
  p_set text default null,
  p_rarity text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=(select auth.uid());
  v_q text:=nullif(btrim(coalesce(p_search,'')),'');
  v_type text:=lower(nullif(btrim(coalesce(p_type,'')),''));
  v_set text:=nullif(btrim(coalesce(p_set,'')),'');
  v_rarity text:=nullif(btrim(coalesce(p_rarity,'')),'');
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_limit,80),120));
begin
  if v_actor is null or not private.admin_has_permission(v_actor,'battle_lab_manage') then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.pokemon_name,'image',x.image_small,'imageLarge',x.image_large,'setName',x.set_name,'rarity',x.rarity,'gameTypes',coalesce(x.game_types,'{}'::text[]),'marketPriceUsd',x.market_price_usd,'gameValue',x.game_value,'ability',prof.profile->>'ability','stats',stats.level50) order by x.pokemon_name,x.set_name,x.id) from (select id,pokemon_name,image_small,image_large,set_name,rarity,game_types,market_price_usd,game_value from public.cards where pokemon_name is not null and (v_q is null or pokemon_name ilike '%'||v_q||'%' or id ilike '%'||v_q||'%' or set_name ilike '%'||v_q||'%') and (v_type is null or v_type=any(coalesce(game_types,'{}'::text[]))) and (v_set is null or set_name ilike '%'||v_set||'%') and (v_rarity is null or rarity ilike '%'||v_rarity||'%') and private.battle_game_profile_for_card(id) is not null order by pokemon_name,set_name,id offset v_offset limit v_limit) x cross join lateral (select private.battle_game_profile_for_card(x.id) profile) prof cross join lateral (select private.battle_game_level50_stats(prof.profile) level50) stats),'[]'::jsonb),
    'total',(select count(*) from public.cards c where c.pokemon_name is not null and (v_q is null or c.pokemon_name ilike '%'||v_q||'%' or c.id ilike '%'||v_q||'%' or c.set_name ilike '%'||v_q||'%') and (v_type is null or v_type=any(coalesce(c.game_types,'{}'::text[]))) and (v_set is null or c.set_name ilike '%'||v_set||'%') and (v_rarity is null or c.rarity ilike '%'||v_rarity||'%') and private.battle_game_profile_for_card(c.id) is not null),
    'offset',v_offset,'limit',v_limit,'filters',jsonb_build_object('search',v_q,'type',v_type,'set',v_set,'rarity',v_rarity)
  );
end;
$function$;

revoke all on function public.get_admin_battle_lab_catalog(text,integer,integer,text,text,text) from public, anon;
grant execute on function public.get_admin_battle_lab_catalog(text,integer,integer,text,text,text) to authenticated, service_role;
