-- Real market-price coverage improvement.
-- TCGplayer market is preferred; real TCGplayer mid/low values are accepted when
-- market is unavailable. Edge workers may supply TCGdex's TCGplayer USD snapshot
-- using pricing_source='tcgdex'. Synthetic prices are never generated here.

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

  if p_set_id is null or p_set_id !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'INVALID_SET_ID';
  end if;
  if p_cards is null or jsonb_typeof(p_cards)<>'array' then
    raise exception 'INVALID_CARD_PAYLOAD';
  end if;

  with api_cards as (
    select
      card->>'id' id,
      card->>'rarity' rarity,
      card->'tcgplayer' tcgplayer,
      coalesce(card->>'pricing_source','pokemontcg') pricing_source
    from jsonb_array_elements(p_cards) card
  ),
  chosen as (
    select api.id,api.tcgplayer,api.pricing_source,
      picked.variant,picked.market,picked.low,picked.high,picked.value_kind
    from api_cards api
    left join lateral (
      select
        price.key variant,
        coalesce(
          nullif(price.value->>'market','')::numeric,
          nullif(price.value->>'mid','')::numeric,
          nullif(price.value->>'low','')::numeric
        ) market,
        nullif(price.value->>'low','')::numeric low,
        nullif(price.value->>'high','')::numeric high,
        case
          when nullif(price.value->>'market','') is not null then 'market'
          when nullif(price.value->>'mid','') is not null then 'mid'
          else 'low'
        end value_kind
      from jsonb_each(coalesce(api.tcgplayer->'prices','{}'::jsonb)) price
      where coalesce(
        nullif(price.value->>'market','')::numeric,
        nullif(price.value->>'mid','')::numeric,
        nullif(price.value->>'low','')::numeric
      )>0
      order by
        case
          when lower(coalesce(api.rarity,'')) ~
            '(holo|shiny|rare|ultra|secret|illustration|rainbow|radiant|amazing)'
          then case price.key
            when 'holofoil' then 1
            when '1stEditionHolofoil' then 2
            when 'normal' then 3
            when '1stEditionNormal' then 4
            when 'reverseHolofoil' then 5
            else 9
          end
          else case price.key
            when 'normal' then 1
            when '1stEditionNormal' then 2
            when 'holofoil' then 3
            when 'reverseHolofoil' then 4
            when '1stEditionHolofoil' then 5
            else 9
          end
        end,
        coalesce(
          nullif(price.value->>'market','')::numeric,
          nullif(price.value->>'mid','')::numeric,
          nullif(price.value->>'low','')::numeric
        ) desc
      limit 1
    ) picked on true
  )
  update public.cards c
  set market_price_usd=chosen.market,
      market_price_low_usd=chosen.low,
      market_price_high_usd=chosen.high,
      market_price_variant=chosen.variant,
      market_price_source=case
        when chosen.market is null then 'pokemontcg:no_tcgplayer_price'
        when chosen.pricing_source='tcgdex' then 'tcgdex:tcgplayer_'||chosen.value_kind
        else 'pokemontcg:tcgplayer_'||chosen.value_kind
      end,
      market_price_data=coalesce(chosen.tcgplayer,'{}'::jsonb),
      market_price_updated_at=now()
  from chosen
  where c.id=chosen.id and c.set_id=p_set_id;

  get diagnostics v_updated=row_count;

  update public.cards c
  set market_price_usd=null,
      market_price_low_usd=null,
      market_price_high_usd=null,
      market_price_variant=null,
      market_price_source='pokemontcg:no_card_record',
      market_price_data=jsonb_build_object(
        'setId',p_set_id,'reviewedAt',now(),
        'reason','Card id was not returned by pricing sources'
      ),
      market_price_updated_at=now()
  where c.set_id=p_set_id
    and not exists (
      select 1 from jsonb_array_elements(p_cards) api_card
      where api_card->>'id'=c.id
    );

  get diagnostics v_unmatched=row_count;

  select count(*)::integer,
         count(*) filter(where market_price_usd is not null)::integer
  into v_total,v_priced
  from public.cards
  where set_id=p_set_id;

  update private.market_price_sync_sets
  set status='completed',
      total_cards=v_total,
      priced_cards=v_priced,
      last_http_status=200,
      last_error=null,
      completed_at=now(),
      updated_at=now()
  where set_id=p_set_id;

  return jsonb_build_object(
    'setId',p_set_id,'updated',v_updated,'unmatched',v_unmatched,
    'priced',v_priced,'total',v_total
  );
end;
$$;

revoke all on function public.apply_market_price_sync_set(text,text,jsonb)
from public,anon,authenticated;
grant execute on function public.apply_market_price_sync_set(text,text,jsonb)
to service_role;

-- Immediately recover already cached TCGplayer mid/low values.
with chosen as (
  select c.id,picked.variant,picked.price,picked.low,picked.high,picked.kind
  from public.cards c
  cross join lateral (
    select
      e.key variant,
      coalesce(
        nullif(e.value->>'mid','')::numeric,
        nullif(e.value->>'low','')::numeric
      ) price,
      nullif(e.value->>'low','')::numeric low,
      nullif(e.value->>'high','')::numeric high,
      case
        when nullif(e.value->>'mid','') is not null then 'mid'
        else 'low'
      end kind
    from jsonb_each(coalesce(c.market_price_data->'prices','{}'::jsonb)) e
    where nullif(e.value->>'market','') is null
      and coalesce(
        nullif(e.value->>'mid','')::numeric,
        nullif(e.value->>'low','')::numeric
      )>0
    order by coalesce(
      nullif(e.value->>'mid','')::numeric,
      nullif(e.value->>'low','')::numeric
    ) desc
    limit 1
  ) picked
  where c.market_price_usd is null
)
update public.cards c
set market_price_usd=chosen.price,
    market_price_low_usd=chosen.low,
    market_price_high_usd=chosen.high,
    market_price_variant=chosen.variant,
    market_price_source='pokemontcg:tcgplayer_'||chosen.kind,
    market_price_updated_at=now()
from chosen
where c.id=chosen.id;

select private.start_market_price_review(true);


-- Always process currently unpriced sets before routine refresh work.
create or replace function public.claim_market_price_sync_sets(
  p_token text,
  p_limit integer default 2
)
returns table(set_id text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_set_id text;
  v_limit integer := greatest(1,least(coalesce(p_limit,2),3));
  v_job_id bigint;
begin
  perform private.assert_market_price_sync_token(p_token);

  update private.market_price_sync_sets
  set status='retry',next_attempt_at=now(),last_error='STALE_EDGE_WORKER',updated_at=now()
  where status='running' and last_started_at<now()-interval '10 minutes';

  for v_set_id in
    select q.set_id
    from private.market_price_sync_sets q
    where q.status in ('pending','retry')
      and q.next_attempt_at<=now()
    order by
      exists(
        select 1 from public.cards c
        where c.set_id=q.set_id and (c.market_price_usd is null or c.market_price_usd<=0)
      ) desc,
      (q.owned_card_count>0) desc,
      q.max_game_value desc,
      q.owned_card_count desc,
      q.set_id
    limit v_limit
    for update skip locked
  loop
    update private.market_price_sync_sets q
    set status='running',attempts=attempts+1,last_started_at=now(),last_error=null,updated_at=now()
    where q.set_id=v_set_id;

    set_id:=v_set_id;
    return next;
  end loop;

  if not exists(
    select 1 from private.market_price_sync_sets where status in ('pending','running','retry')
  ) then
    for v_job_id in select jobid from cron.job where jobname='pokemon-cards-price-review-edge'
    loop perform cron.unschedule(v_job_id); end loop;
  end if;
end;
$$;

revoke all on function public.claim_market_price_sync_sets(text,integer)
from public,anon,authenticated;
grant execute on function public.claim_market_price_sync_sets(text,integer)
to service_role;
