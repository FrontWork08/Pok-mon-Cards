-- Deck Builder v2: filter large collections and return battle stats only for the visible page.

create or replace function public.get_my_deck_builder_page_v2(
  p_offset integer,
  p_limit integer,
  p_search text,
  p_type_filter text,
  p_rarity_filter text,
  p_sort_mode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := greatest(1,least(coalesce(p_limit,36),60));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_sort text := coalesce(nullif(p_sort_mode,''),'name');
  v_result jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if v_sort not in ('name','value','damage','hp','quantity') then raise exception 'INVALID_SORT'; end if;

  with owned as (
    select
      pc.quantity,
      c.id,c.pokemon_name,c.rarity,c.set_name,c.image_small,c.market_price_usd,c.types,
      case when v_sort in ('damage','hp') then
        greatest(10,least(1000,coalesce(nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50)))
      else null end as hp_sort,
      case when v_sort='damage' then
        case when jsonb_typeof(c.tcg_data->'attacks')='array' then
          greatest(10,coalesce((
            select max(coalesce(nullif(substring(coalesce(a->>'damage','') from '([0-9]+)'),'')::integer,0))
            from jsonb_array_elements(c.tcg_data->'attacks') a
          ),0))
        else 10 end
      else null end as damage_sort
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_uid
      and pc.quantity>0
      and (p_type_filter is null or p_type_filter=any(coalesce(c.types,array[]::text[])))
      and (p_rarity_filter is null or c.rarity=p_rarity_filter)
      and (
        v_search is null
        or c.pokemon_name ilike '%'||v_search||'%'
        or coalesce(c.rarity,'') ilike '%'||v_search||'%'
        or c.set_name ilike '%'||v_search||'%'
      )
  ),
  page as (
    select * from owned
    order by
      case when v_sort='damage' then damage_sort end desc nulls last,
      case when v_sort='damage' then hp_sort end desc nulls last,
      case when v_sort='hp' then hp_sort end desc nulls last,
      case when v_sort='value' then market_price_usd end desc nulls last,
      case when v_sort='quantity' then quantity end desc,
      pokemon_name asc,id asc
    offset v_offset limit v_limit
  ),
  profiled as (
    select page.*,public.battle_card_profile(id) battle_profile
    from page
  ),
  filter_meta as (
    select
      array_agg(distinct u.type_name order by u.type_name) filter (where u.type_name is not null) available_types,
      array_agg(distinct c.rarity order by c.rarity) filter (where c.rarity is not null) available_rarities
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    left join lateral unnest(coalesce(c.types,array[]::text[])) as u(type_name) on true
    where pc.player_id=v_uid and pc.quantity>0
  )
  select jsonb_build_object(
    'total',(select count(*) from owned),
    'availableTypes',coalesce(to_jsonb((select available_types from filter_meta)),'[]'::jsonb),
    'availableRarities',coalesce(to_jsonb((select available_rarities from filter_meta)),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity',quantity,
        'cards',jsonb_build_object(
          'id',id,'pokemon_name',pokemon_name,'rarity',rarity,'set_name',set_name,
          'image_small',image_small,'market_price_usd',market_price_usd,'types',types,
          'battle_profile',battle_profile
        )
      ) order by
        case when v_sort='damage' then damage_sort end desc nulls last,
        case when v_sort='damage' then hp_sort end desc nulls last,
        case when v_sort='hp' then hp_sort end desc nulls last,
        case when v_sort='value' then market_price_usd end desc nulls last,
        case when v_sort='quantity' then quantity end desc,
        pokemon_name asc,id asc)
      from profiled
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_my_deck_builder_page_v2(integer,integer,text,text,text,text)
from public,anon;
grant execute on function public.get_my_deck_builder_page_v2(integer,integer,text,text,text,text)
to authenticated;
