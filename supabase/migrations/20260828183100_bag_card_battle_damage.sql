-- Expose the card's base battle damage in paginated Bag results.
-- This uses the same printed-damage parsing as battle_card_duel_stats.
-- Final effective damage in battle can still change with weakness/resistance.

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
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := greatest(1,least(coalesce(p_limit,60),100));
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_set text := nullif(btrim(coalesce(p_set_query,'')),'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if coalesce(p_quick_filter,'all') not in ('all','favorites','duplicates') then raise exception 'INVALID_FILTER'; end if;
  if coalesce(p_sort_mode,'recent') not in ('recent','value','name','quantity') then raise exception 'INVALID_SORT'; end if;
  if p_generation is not null and (p_generation < 1 or p_generation > 9) then raise exception 'INVALID_GENERATION'; end if;

  with filtered as (
    select
      pc.quantity,
      pc.favorite,
      pc.first_obtained_at,
      c.id,
      c.pokemon_name,
      c.pokedex_numbers,
      c.set_id,
      c.set_name,
      c.card_number,
      c.rarity,
      c.types,
      c.image_small,
      c.image_large,
      c.game_value,
      c.market_price_usd,
      c.market_price_low_usd,
      c.market_price_high_usd,
      c.market_price_variant,
      c.market_price_source,
      c.market_price_updated_at,
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
      end as battle_damage
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
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
      case when p_sort_mode='value' then market_price_usd end desc nulls last,
      case when p_sort_mode='name' then pokemon_name end asc,
      case when p_sort_mode='quantity' then quantity end desc,
      case when p_sort_mode='recent' then first_obtained_at end desc,
      id asc
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'totalFiltered',(select count(*) from filtered),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'quantity',quantity,
          'favorite',favorite,
          'first_obtained_at',first_obtained_at,
          'cards',jsonb_build_object(
            'id',id,
            'pokemon_name',pokemon_name,
            'pokedex_numbers',pokedex_numbers,
            'set_id',set_id,
            'set_name',set_name,
            'card_number',card_number,
            'rarity',rarity,
            'types',types,
            'image_small',image_small,
            'image_large',image_large,
            'game_value',game_value,
            'battle_damage',battle_damage,
            'market_price_usd',market_price_usd,
            'market_price_low_usd',market_price_low_usd,
            'market_price_high_usd',market_price_high_usd,
            'market_price_variant',market_price_variant,
            'market_price_source',market_price_source,
            'market_price_updated_at',market_price_updated_at
          )
        )
        order by
          case when p_sort_mode='value' then market_price_usd end desc nulls last,
          case when p_sort_mode='name' then pokemon_name end asc,
          case when p_sort_mode='quantity' then quantity end desc,
          case when p_sort_mode='recent' then first_obtained_at end desc,
          id asc
      ) from ordered
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
