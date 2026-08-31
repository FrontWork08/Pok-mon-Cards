create or replace function private.get_my_bag_page(
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null,
  p_set_query text default null,
  p_quick_filter text default 'all',
  p_type_filter text default null,
  p_rarity_filter text default null,
  p_generation integer default null,
  p_sort_mode text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_result jsonb;
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=greatest(1,least(coalesce(p_limit,60),100));
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_set text:=nullif(btrim(coalesce(p_set_query,'')),'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if coalesce(p_quick_filter,'all') not in ('all','favorites','duplicates') then raise exception 'INVALID_FILTER'; end if;
  if coalesce(p_sort_mode,'recent') not in ('recent','value','name','quantity','damage','hp') then raise exception 'INVALID_SORT'; end if;
  if p_generation is not null and (p_generation<1 or p_generation>9) then raise exception 'INVALID_GENERATION'; end if;

  with filtered as (
    select
      pc.quantity,pc.favorite,pc.first_obtained_at,
      c.id,c.pokemon_name,c.pokedex_numbers,c.set_id,c.set_name,
      c.card_number,c.rarity,c.types,c.image_small,c.image_large,
      c.game_value,c.market_price_usd,c.market_price_low_usd,
      c.market_price_high_usd,c.market_price_variant,
      c.market_price_source,c.market_price_updated_at,
      pcc.style_item_id,
      esi.name as style_name,
      esi.icon as style_icon,
      esi.rarity as style_rarity,
      esi.category as style_category,
      esi.metadata as style_metadata,
      case when p_sort_mode in ('damage','hp') then
        greatest(
          10,
          least(
            1000,
            coalesce(
              nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,
              50
            )
          )
        )
      else null end as battle_hp_sort,
      case when p_sort_mode='damage' then
        case
          when jsonb_typeof(c.tcg_data->'attacks')='array' then
            greatest(
              10,
              coalesce((
                select max(
                  coalesce(
                    nullif(substring(coalesce(a->>'damage','') from '([0-9]+)'), '')::integer,
                    0
                  )
                )
                from jsonb_array_elements(c.tcg_data->'attacks') a
              ),0)
            )
          else 10
        end
      else null end as battle_damage_sort
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    left join public.player_card_customizations pcc
      on pcc.player_id=v_actor and pcc.card_id=pc.card_id
    left join public.economy_store_items esi
      on esi.id=pcc.style_item_id and esi.active=true
    where pc.player_id=v_actor
      and pc.quantity>0
      and (coalesce(p_quick_filter,'all')<>'favorites' or pc.favorite)
      and (coalesce(p_quick_filter,'all')<>'duplicates' or pc.quantity>1)
      and (p_type_filter is null or p_type_filter=any(coalesce(c.types,array[]::text[])))
      and (p_rarity_filter is null or c.rarity=p_rarity_filter)
      and (v_set is null or c.set_name ilike '%'||v_set||'%' or c.set_id ilike '%'||v_set||'%')
      and (
        v_search is null
        or c.pokemon_name ilike '%'||v_search||'%'
        or c.set_name ilike '%'||v_search||'%'
        or coalesce(c.card_number,'') ilike '%'||v_search||'%'
      )
      and (
        p_generation is null
        or case p_generation
          when 1 then coalesce(c.pokedex_numbers[1],0) between 1 and 151
          when 2 then coalesce(c.pokedex_numbers[1],0) between 152 and 251
          when 3 then coalesce(c.pokedex_numbers[1],0) between 252 and 386
          when 4 then coalesce(c.pokedex_numbers[1],0) between 387 and 493
          when 5 then coalesce(c.pokedex_numbers[1],0) between 494 and 649
          when 6 then coalesce(c.pokedex_numbers[1],0) between 650 and 721
          when 7 then coalesce(c.pokedex_numbers[1],0) between 722 and 809
          when 8 then coalesce(c.pokedex_numbers[1],0) between 810 and 905
          when 9 then coalesce(c.pokedex_numbers[1],0) between 906 and 1025
          else false
        end
      )
  ),
  ordered as (
    select * from filtered
    order by
      case when p_sort_mode='damage' then battle_damage_sort end desc nulls last,
      case when p_sort_mode='damage' then battle_hp_sort end desc nulls last,
      case when p_sort_mode='hp' then battle_hp_sort end desc nulls last,
      case when p_sort_mode='value' then market_price_usd end desc nulls last,
      case when p_sort_mode='name' then pokemon_name end asc,
      case when p_sort_mode='quantity' then quantity end desc,
      case when p_sort_mode='recent' then first_obtained_at end desc,
      pokemon_name asc,
      id asc
    offset v_offset limit v_limit
  ),
  profiled as (
    select ordered.*,public.battle_card_profile(id) as battle_profile
    from ordered
  )
  select jsonb_build_object(
    'totalFiltered',(select count(*) from filtered),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity',quantity,
        'favorite',favorite,
        'first_obtained_at',first_obtained_at,
        'economyStyle',
          case when style_item_id is null or style_name is null then null else
            jsonb_build_object(
              'id',style_item_id,
              'name',style_name,
              'icon',coalesce(style_icon,'color-wand'),
              'rarity',coalesce(style_rarity,'standard'),
              'category',style_category,
              'effect',coalesce(style_metadata->>'effect','flow')
            )
          end,
        'cards',jsonb_build_object(
          'id',id,'pokemon_name',pokemon_name,'pokedex_numbers',pokedex_numbers,
          'set_id',set_id,'set_name',set_name,'card_number',card_number,
          'rarity',rarity,'types',types,'image_small',image_small,
          'image_large',image_large,'game_value',game_value,
          'battle_damage',(battle_profile->>'maxDamage')::numeric,
          'battle_profile',battle_profile,
          'market_price_usd',market_price_usd,
          'market_price_low_usd',market_price_low_usd,
          'market_price_high_usd',market_price_high_usd,
          'market_price_variant',market_price_variant,
          'market_price_source',market_price_source,
          'market_price_updated_at',market_price_updated_at
        )
      ) order by
        case when p_sort_mode='damage' then battle_damage_sort end desc nulls last,
        case when p_sort_mode='damage' then battle_hp_sort end desc nulls last,
        case when p_sort_mode='hp' then battle_hp_sort end desc nulls last,
        case when p_sort_mode='value' then market_price_usd end desc nulls last,
        case when p_sort_mode='name' then pokemon_name end asc,
        case when p_sort_mode='quantity' then quantity end desc,
        case when p_sort_mode='recent' then first_obtained_at end desc,
        pokemon_name asc,
        id asc)
      from profiled
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
