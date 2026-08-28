-- Optimize Deck Builder loading for large collections.
-- Returns only lightweight card fields in small server-side pages.

create or replace function public.get_my_deck_builder_page(
  p_offset integer default 0,
  p_limit integer default 36,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with filtered as (
    select
      pc.quantity,
      c.id,
      c.pokemon_name,
      c.rarity,
      c.set_name,
      c.image_small,
      c.market_price_usd
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=auth.uid()
      and pc.quantity>0
      and (
        nullif(btrim(coalesce(p_search,'')),'') is null
        or c.pokemon_name ilike '%'||btrim(p_search)||'%'
        or coalesce(c.rarity,'') ilike '%'||btrim(p_search)||'%'
        or c.set_name ilike '%'||btrim(p_search)||'%'
      )
  ),
  page as (
    select *
    from filtered
    order by pokemon_name asc,id asc
    offset greatest(coalesce(p_offset,0),0)
    limit greatest(1,least(coalesce(p_limit,36),60))
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity',quantity,
        'cards',jsonb_build_object(
          'id',id,
          'pokemon_name',pokemon_name,
          'rarity',rarity,
          'set_name',set_name,
          'image_small',image_small,
          'market_price_usd',market_price_usd
        )
      ) order by pokemon_name,id)
      from page
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.get_my_deck_builder_page(integer,integer,text) from public,anon;
grant execute on function public.get_my_deck_builder_page(integer,integer,text) to authenticated;

update public.app_update_logs
set changes = case
  when 'Editor de Deck otimizado para coleções grandes, com carregamento paginado e scroll virtualizado' = any(changes)
    then changes
  else array_append(changes,'Editor de Deck otimizado para coleções grandes, com carregamento paginado e scroll virtualizado')
end
where version='0.1.1 • OTA 28/08';
