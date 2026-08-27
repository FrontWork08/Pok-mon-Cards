-- Connect in-app notifications to Supabase Realtime and enforce real TCGplayer
-- market prices only. Synthetic/fallback valuations are intentionally cleared.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

create or replace function public.apply_market_price_sync_set(
  p_token text,
  p_set_id text,
  p_cards jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
  v_unmatched integer := 0;
  v_priced integer := 0;
  v_total integer := 0;
begin
  perform private.assert_market_price_sync_token(p_token);

  if p_set_id is null or p_set_id !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'INVALID_SET_ID';
  end if;
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then
    raise exception 'INVALID_CARD_PAYLOAD';
  end if;

  with api_cards as (
    select
      card ->> 'id' as id,
      card ->> 'rarity' as rarity,
      card -> 'tcgplayer' as tcgplayer
    from jsonb_array_elements(p_cards) card
  ),
  chosen as (
    select
      api.id,
      api.tcgplayer,
      picked.variant,
      picked.market,
      picked.low,
      picked.high
    from api_cards api
    left join lateral (
      select
        price.key as variant,
        nullif(price.value ->> 'market', '')::numeric as market,
        nullif(price.value ->> 'low', '')::numeric as low,
        nullif(price.value ->> 'high', '')::numeric as high
      from jsonb_each(coalesce(api.tcgplayer -> 'prices', '{}'::jsonb)) price
      where nullif(price.value ->> 'market', '')::numeric > 0
      order by
        case
          when lower(coalesce(api.rarity, '')) ~
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
        nullif(price.value ->> 'market', '')::numeric desc
      limit 1
    ) picked on true
  )
  update public.cards c
  set market_price_usd = chosen.market,
      market_price_low_usd = chosen.low,
      market_price_high_usd = chosen.high,
      market_price_variant = chosen.variant,
      market_price_source = case
        when chosen.market is null then 'pokemontcg:no_tcgplayer_market'
        else 'pokemontcg:tcgplayer_market_v3'
      end,
      market_price_data = coalesce(chosen.tcgplayer, '{}'::jsonb),
      market_price_updated_at = now()
  from chosen
  where c.id = chosen.id
    and c.set_id = p_set_id;

  get diagnostics v_updated = row_count;

  update public.cards c
  set market_price_usd = null,
      market_price_low_usd = null,
      market_price_high_usd = null,
      market_price_variant = null,
      market_price_source = 'pokemontcg:no_card_record',
      market_price_data = jsonb_build_object(
        'setId', p_set_id,
        'reviewedAt', now(),
        'reason', 'Card id was not returned by the Pokémon TCG API'
      ),
      market_price_updated_at = now()
  where c.set_id = p_set_id
    and not exists (
      select 1
      from jsonb_array_elements(p_cards) api_card
      where api_card ->> 'id' = c.id
    );

  get diagnostics v_unmatched = row_count;

  select
    count(*)::integer,
    count(*) filter (where market_price_usd is not null)::integer
  into v_total, v_priced
  from public.cards
  where set_id = p_set_id;

  update private.market_price_sync_sets
  set status = 'completed',
      total_cards = v_total,
      priced_cards = v_priced,
      last_http_status = 200,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where set_id = p_set_id;

  return jsonb_build_object(
    'setId', p_set_id,
    'updated', v_updated,
    'unmatched', v_unmatched,
    'priced', v_priced,
    'total', v_total
  );
end;
$$;

revoke all on function public.apply_market_price_sync_set(text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_market_price_sync_set(text, text, jsonb)
to service_role;

-- Existing API snapshots are normalized to the explicit TCGplayer market field.
with chosen as (
  select
    c.id,
    picked.variant,
    picked.market,
    picked.low,
    picked.high
  from public.cards c
  left join lateral (
    select
      price.key as variant,
      nullif(price.value ->> 'market', '')::numeric as market,
      nullif(price.value ->> 'low', '')::numeric as low,
      nullif(price.value ->> 'high', '')::numeric as high
    from jsonb_each(coalesce(c.market_price_data -> 'prices', '{}'::jsonb)) price
    where nullif(price.value ->> 'market', '')::numeric > 0
    order by
      case
        when lower(coalesce(c.rarity, '')) ~
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
      nullif(price.value ->> 'market', '')::numeric desc
    limit 1
  ) picked on true
  where c.market_price_source in (
    'pokemontcg:tcgplayer_review_v2',
    'pokemontcg:tcgplayer'
  )
)
update public.cards c
set market_price_usd = chosen.market,
    market_price_low_usd = chosen.low,
    market_price_high_usd = chosen.high,
    market_price_variant = chosen.variant,
    market_price_source = case
      when chosen.market is null then 'pokemontcg:no_tcgplayer_market'
      else 'pokemontcg:tcgplayer_market_v3'
    end,
    market_price_updated_at = now()
from chosen
where c.id = chosen.id;

-- Synthetic prices are not accepted as market data. They stay empty until
-- the background worker obtains a real TCGplayer market price.
update public.cards
set market_price_usd = null,
    market_price_low_usd = null,
    market_price_high_usd = null,
    market_price_variant = null,
    market_price_source = 'pokemontcg:pending_review',
    market_price_data = '{}'::jsonb,
    market_price_updated_at = null
where market_price_source = 'fixed_collection_v1';

create or replace function private.start_weekly_market_price_review()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := private.start_market_price_review(true);

  perform cron.schedule(
    'pokemon-cards-price-review-edge',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://mhddpovueqvvncrforao.supabase.co/functions/v1/tcgplayer-price-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tcgplayer_price_sync_token'
          )
        ),
        body := '{"limit":2}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$
  );

  return v_result;
end;
$$;

revoke all on function private.start_weekly_market_price_review()
from public, anon, authenticated;
grant execute on function private.start_weekly_market_price_review()
to service_role;

do $$
declare v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job
    where jobname = 'pokemon-cards-price-review-weekly'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'pokemon-cards-price-review-weekly',
    '0 3 * * 1',
    'select private.start_weekly_market_price_review();'
  );
end;
$$;
