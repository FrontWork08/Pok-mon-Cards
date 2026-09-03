
alter table public.cards
  add column if not exists game_types text[] not null default array[]::text[];

comment on column public.cards.game_types is
  'Canonical Pokemon game types for the species/form used by game_v1. TCG card types remain in cards.types.';

with mapped as (
  select
    c.id,
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(private.battle_game_profile_for_card(c.id)->'types','[]'::jsonb)
        )
      ),
      array[]::text[]
    ) as game_types
  from public.cards c
)
update public.cards c
set game_types=m.game_types
from mapped m
where c.id=m.id
  and c.game_types is distinct from m.game_types;

alter table public.cards
  drop constraint if exists cards_game_types_valid;

alter table public.cards
  add constraint cards_game_types_valid
  check (
    game_types <@ array[
      'normal','fighting','flying','poison','ground','rock','bug','ghost',
      'steel','fire','water','grass','electric','psychic','ice','dragon',
      'dark','fairy'
    ]::text[]
  );

create index if not exists cards_game_types_gin_idx
  on public.cards using gin(game_types);

create or replace function private.sync_card_game_types_from_profile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_types text[];
begin
  select coalesce(
    array(
      select jsonb_array_elements_text(
        coalesce(private.battle_game_profile_for_card(new.id)->'types','[]'::jsonb)
      )
    ),
    array[]::text[]
  )
  into v_types;

  update public.cards
  set game_types=v_types
  where id=new.id
    and game_types is distinct from v_types;

  return new;
end;
$function$;

drop trigger if exists trg_sync_card_game_types_from_profile on public.cards;
create trigger trg_sync_card_game_types_from_profile
after insert or update of id,pokemon_name,pokedex_numbers on public.cards
for each row execute function private.sync_card_game_types_from_profile();

create or replace function private.get_my_bag_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  with owned as (
    select pc.quantity, pc.favorite, pc.first_obtained_at, c.*
    from public.player_cards pc
    join public.cards c on c.id = pc.card_id
    where pc.player_id = v_actor and pc.quantity > 0
  ), most_valuable as (
    select * from owned
    order by market_price_usd desc nulls last, pokemon_name, id
    limit 1
  )
  select jsonb_build_object(
    'uniqueCards', (select count(*) from owned),
    'totalCards', (select coalesce(sum(quantity),0) from owned),
    'collectionValueUsd', (select coalesce(sum(quantity * coalesce(market_price_usd,0)),0)::numeric(14,2) from owned),
    'pricedCopies', (select coalesce(sum(quantity) filter (where market_price_usd is not null),0) from owned),
    'mostValuable', coalesce((
      select jsonb_build_object(
        'id', id, 'pokemon_name', pokemon_name, 'rarity', rarity,
        'image_small', image_small, 'market_price_usd', market_price_usd
      ) from most_valuable
    ), 'null'::jsonb),
    'types', coalesce((
      select jsonb_agg(t order by t)
      from (
        select distinct unnest(coalesce(game_types, array[]::text[])) t
        from owned
      ) valueset
      where t is not null and t <> ''
    ), '[]'::jsonb),
    'rarities', coalesce((
      select jsonb_agg(rarity order by rarity)
      from (select distinct rarity from owned where rarity is not null and rarity <> '') r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function private.get_my_bag_page(
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null::text,
  p_set_query text default null::text,
  p_quick_filter text default 'all'::text,
  p_type_filter text default null::text,
  p_rarity_filter text default null::text,
  p_generation integer default null::integer,
  p_sort_mode text default 'recent'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
      c.card_number,c.rarity,c.types,c.game_types,c.image_small,c.image_large,
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
      and (
        p_type_filter is null
        or lower(p_type_filter)=any(coalesce(c.game_types,array[]::text[]))
      )
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
          'rarity',rarity,'types',types,'game_types',game_types,'image_small',image_small,
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
$function$;

create or replace function private.get_my_deck_builder_page_v2_impl(
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
set search_path to ''
as $function$
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
      c.id,c.pokemon_name,c.rarity,c.set_name,c.image_small,c.market_price_usd,
      c.types,c.game_types,
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
      and (
        p_type_filter is null
        or lower(p_type_filter)=any(coalesce(c.game_types,array[]::text[]))
      )
      and (p_rarity_filter is null or c.rarity=p_rarity_filter)
      and (
        v_search is null
        or c.pokemon_name ilike '%'||v_search||'%'
        or coalesce(c.rarity,'') ilike '%'||v_search||'%'
        or c.set_name ilike '%'||v_search||'%'
      )
  ),
  page as (
    select *
    from owned
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
      array_agg(distinct u.type_name order by u.type_name)
        filter (where u.type_name is not null) available_types,
      array_agg(distinct c.rarity order by c.rarity)
        filter (where c.rarity is not null) available_rarities
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    left join lateral unnest(coalesce(c.game_types,array[]::text[])) as u(type_name) on true
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
          'image_small',image_small,'market_price_usd',market_price_usd,
          'types',types,'game_types',game_types,
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
$function$;
