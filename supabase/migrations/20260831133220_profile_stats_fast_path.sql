create or replace function public.get_my_profile_stats_fast()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_player uuid := auth.uid();
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  with bag as (
    select
      coalesce(sum(pc.quantity),0)::bigint as total_cards,
      count(*)::bigint as unique_cards,
      count(*) filter (where pc.favorite)::bigint as favorites,
      count(distinct c.pokedex_numbers[1]) filter (where cardinality(c.pokedex_numbers)>0)::bigint as species,
      coalesce(sum(pc.quantity * coalesce(c.game_value,0)),0)::numeric as collection_value,
      coalesce(sum(pc.quantity * coalesce(c.market_price_usd,0)),0)::numeric as collection_market_value_usd,
      coalesce(sum(pc.quantity) filter (where c.market_price_usd is not null),0)::bigint as priced_card_copies
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player and pc.quantity>0
  ),
  valuable as (
    select jsonb_build_object(
      'quantity',pc.quantity,
      'favorite',pc.favorite,
      'first_obtained_at',pc.first_obtained_at,
      'cards',jsonb_build_object(
        'id',c.id,'pokemon_name',c.pokemon_name,'pokedex_numbers',c.pokedex_numbers,
        'set_id',c.set_id,'set_name',c.set_name,'card_number',c.card_number,
        'rarity',c.rarity,'types',c.types,'image_small',c.image_small,'image_large',c.image_large,
        'game_value',c.game_value,'market_price_usd',c.market_price_usd,
        'market_price_low_usd',c.market_price_low_usd,'market_price_high_usd',c.market_price_high_usd,
        'market_price_variant',c.market_price_variant,'market_price_source',c.market_price_source,
        'market_price_updated_at',c.market_price_updated_at
      )
    ) as item
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player and pc.quantity>0
    order by coalesce(c.game_value,0) desc, coalesce(c.market_price_usd,0) desc
    limit 1
  )
  select jsonb_build_object(
    'totalCards',b.total_cards,
    'uniqueCards',b.unique_cards,
    'favorites',b.favorites,
    'species',b.species,
    'collectionValue',b.collection_value,
    'collectionMarketValueUsd',b.collection_market_value_usd,
    'totalCardCopies',b.total_cards,
    'pricedCardCopies',b.priced_card_copies,
    'priceCoveragePct',case when b.total_cards>0 then round((b.priced_card_copies::numeric/b.total_cards::numeric)*100,2) else 0 end,
    'mostValuable',(select item from valuable),
    'openings',(select count(*) from public.pack_openings po where po.player_id=v_player),
    'completedTrades',(
      select count(*) from public.trades t
      where t.status='completed' and (t.sender_id=v_player or t.receiver_id=v_player)
    )
  )
  into v_result
  from bag b;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke execute on function public.get_my_profile_stats_fast() from public, anon;
grant execute on function public.get_my_profile_stats_fast() to authenticated;
