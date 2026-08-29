-- Prevent temporary pricing-source misses from deleting a previously valid market quote.
-- Recover quotes that were erased by the former behavior from the local price-history table.

create or replace function public.apply_market_price_sync_set(
  p_token text,
  p_set_id text,
  p_cards jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_updated integer:=0;
  v_unmatched integer:=0;
  v_priced integer:=0;
  v_total integer:=0;
begin
  perform private.assert_market_price_sync_token(p_token);
  if p_set_id is null or p_set_id !~ '^[A-Za-z0-9._-]+$' then raise exception 'INVALID_SET_ID'; end if;
  if p_cards is null or jsonb_typeof(p_cards)<>'array' then raise exception 'INVALID_CARD_PAYLOAD'; end if;

  with api_cards as (
    select card->>'id' id, card->>'rarity' rarity, card->'tcgplayer' tcgplayer,
           coalesce(card->>'pricing_source','pokemontcg') pricing_source
    from jsonb_array_elements(p_cards) card
  ), chosen as (
    select api.id,api.tcgplayer,api.pricing_source,
           picked.variant,picked.market,picked.low,picked.high,picked.value_kind
    from api_cards api
    left join lateral (
      select price.key variant,
             coalesce(nullif(price.value->>'market','')::numeric,
                      nullif(price.value->>'mid','')::numeric,
                      nullif(price.value->>'low','')::numeric) market,
             nullif(price.value->>'low','')::numeric low,
             nullif(price.value->>'high','')::numeric high,
             case when nullif(price.value->>'market','') is not null then 'market'
                  when nullif(price.value->>'mid','') is not null then 'mid'
                  else 'low' end value_kind
      from jsonb_each(coalesce(api.tcgplayer->'prices','{}'::jsonb)) price
      where coalesce(nullif(price.value->>'market','')::numeric,
                     nullif(price.value->>'mid','')::numeric,
                     nullif(price.value->>'low','')::numeric)>0
      order by
        case when lower(coalesce(api.rarity,'')) ~
          '(holo|shiny|rare|ultra|secret|illustration|rainbow|radiant|amazing)'
        then case price.key when 'holofoil' then 1 when '1stEditionHolofoil' then 2
             when 'normal' then 3 when '1stEditionNormal' then 4
             when 'reverseHolofoil' then 5 else 9 end
        else case price.key when 'normal' then 1 when '1stEditionNormal' then 2
             when 'holofoil' then 3 when 'reverseHolofoil' then 4
             when '1stEditionHolofoil' then 5 else 9 end end,
        coalesce(nullif(price.value->>'market','')::numeric,
                 nullif(price.value->>'mid','')::numeric,
                 nullif(price.value->>'low','')::numeric) desc
      limit 1
    ) picked on true
  )
  update public.cards c
  set market_price_usd=case when chosen.market>0 then chosen.market else c.market_price_usd end,
      market_price_low_usd=case when chosen.market>0 then chosen.low else c.market_price_low_usd end,
      market_price_high_usd=case when chosen.market>0 then chosen.high else c.market_price_high_usd end,
      market_price_variant=case when chosen.market>0 then chosen.variant else c.market_price_variant end,
      market_price_source=case
        when chosen.market is null or chosen.market<=0 then
          case when c.market_price_usd>0 then c.market_price_source else 'pokemontcg:no_tcgplayer_price' end
        when chosen.pricing_source='tcgdex' then 'tcgdex:tcgplayer_'||chosen.value_kind
        when chosen.pricing_source='cardmarket' then 'cardmarket:eur_to_usd_'||chosen.value_kind
        else 'pokemontcg:tcgplayer_'||chosen.value_kind end,
      market_price_data=case when chosen.market>0 then coalesce(chosen.tcgplayer,'{}'::jsonb) else c.market_price_data end,
      market_price_updated_at=now()
  from chosen
  where c.id=chosen.id and c.set_id=p_set_id;
  get diagnostics v_updated=row_count;

  update public.cards c
  set market_price_source=case when c.market_price_usd>0 then c.market_price_source else 'pokemontcg:no_card_record' end,
      market_price_data=case when c.market_price_usd>0 then c.market_price_data else
        jsonb_build_object('setId',p_set_id,'reviewedAt',now(),'reason','Card id was not returned by pricing sources') end,
      market_price_updated_at=now()
  where c.set_id=p_set_id
    and not exists (
      select 1 from jsonb_array_elements(p_cards) api_card where api_card->>'id'=c.id
    );
  get diagnostics v_unmatched=row_count;

  select count(*)::integer,count(*) filter(where market_price_usd>0)::integer
  into v_total,v_priced
  from public.cards where set_id=p_set_id;

  update private.market_price_sync_sets
  set status='completed',total_cards=v_total,priced_cards=v_priced,last_http_status=200,
      last_error=null,completed_at=now(),updated_at=now()
  where set_id=p_set_id;

  return jsonb_build_object('setId',p_set_id,'updated',v_updated,'unmatched',v_unmatched,'priced',v_priced,'total',v_total);
end;
$$;

revoke all on function public.apply_market_price_sync_set(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_market_price_sync_set(text,text,jsonb) to service_role;

with missing as (
  select id from public.cards
  where (market_price_usd is null or market_price_usd<=0)
    and coalesce(market_price_source,'')<>'unreleased:no_english_market'
), latest_good as (
  select distinct on (h.card_id) h.card_id,h.price_usd,h.source,h.recorded_at
  from public.card_market_price_history h
  join missing m on m.id=h.card_id
  where h.price_usd>0
  order by h.card_id,h.recorded_at desc
)
update public.cards c
set market_price_usd=g.price_usd,
    market_price_source='history_restore:'||coalesce(g.source,'unknown'),
    market_price_updated_at=now()
from latest_good g
where c.id=g.card_id;
