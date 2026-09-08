create or replace function public.get_my_pack_collection_progress(p_set_id text)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with config as (
    select coalesce(
      (select dpc.min_value_usd from public.diamond_pack_config dpc where dpc.id = 1),
      25
    )::numeric as min_value_usd
  ),
  eligible as (
    select c.id
    from public.cards c
    cross join config cfg
    where case
      when p_set_id = 'legendary-vault' then
        c.market_price_usd > cfg.min_value_usd
        and c.pokedex_numbers && array[
          144,145,146,150,151,243,244,245,249,250,251,
          377,378,379,380,381,382,383,384,385,386,
          480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,
          638,639,640,641,642,643,644,645,646,647,648,649,
          716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,
          800,801,802,807,808,809,888,889,890,891,892,893,894,895,896,897,
          898,905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,1024,1025
        ]::integer[]
      else c.set_id = p_set_id
    end
  ),
  totals as (
    select
      count(*)::integer as total,
      count(pc.card_id)::integer as owned
    from eligible e
    left join public.player_cards pc
      on pc.card_id = e.id
     and pc.player_id = auth.uid()
     and pc.quantity > 0
  )
  select jsonb_build_object(
    'owned', owned,
    'total', total,
    'percent', case when total > 0 then round((owned::numeric / total::numeric) * 100) else 0 end
  )
  from totals;
$function$;

revoke all on function public.get_my_pack_collection_progress(text) from public, anon;
grant execute on function public.get_my_pack_collection_progress(text) to authenticated;
