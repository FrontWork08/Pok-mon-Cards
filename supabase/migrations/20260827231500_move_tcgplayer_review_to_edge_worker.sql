-- Move the one-time TCGplayer review from the Postgres HTTP client to an Edge
-- worker. The Pokémon TCG API intermittently returned 5xx through http_get,
-- while the existing Edge runtime is the proven network path for this project.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tcgplayer_price_sync_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'tcgplayer_price_sync_token',
      'Private token used only by the one-time TCGplayer price sync worker'
    );
  end if;
end;
$$;

create or replace function private.assert_market_price_sync_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name = 'tcgplayer_price_sync_token';

  if p_token is null or v_expected is null or p_token <> v_expected then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

revoke all on function private.assert_market_price_sync_token(text) from public, anon, authenticated;
grant execute on function private.assert_market_price_sync_token(text) to service_role;

create or replace function public.claim_market_price_sync_sets(p_token text, p_limit integer default 2)
returns table (set_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 2), 3));
  v_job_id bigint;
begin
  perform private.assert_market_price_sync_token(p_token);

  update private.market_price_sync_sets
  set status = 'retry', next_attempt_at = now(), last_error = 'STALE_EDGE_WORKER', updated_at = now()
  where status = 'running' and last_started_at < now() - interval '10 minutes';

  for v_set_id in
    select q.set_id
    from private.market_price_sync_sets q
    where q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
    order by (q.owned_card_count > 0) desc, q.max_game_value desc, q.owned_card_count desc, q.set_id
    limit v_limit
    for update skip locked
  loop
    update private.market_price_sync_sets q
    set status = 'running', attempts = attempts + 1, last_started_at = now(), last_error = null, updated_at = now()
    where q.set_id = v_set_id;
    set_id := v_set_id;
    return next;
  end loop;

  if not exists (
    select 1 from private.market_price_sync_sets where status in ('pending', 'running', 'retry')
  ) then
    for v_job_id in select jobid from cron.job where jobname = 'pokemon-cards-price-review-edge'
    loop perform cron.unschedule(v_job_id); end loop;
  end if;
end;
$$;

revoke all on function public.claim_market_price_sync_sets(text, integer) from public, anon, authenticated;
grant execute on function public.claim_market_price_sync_sets(text, integer) to service_role;

create or replace function public.apply_market_price_sync_set(p_token text, p_set_id text, p_cards jsonb)
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
  if p_set_id is null or p_set_id !~ '^[A-Za-z0-9._-]+$' then raise exception 'INVALID_SET_ID'; end if;
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then raise exception 'INVALID_CARD_PAYLOAD'; end if;

  with api_cards as (
    select card ->> 'id' as id, card ->> 'rarity' as rarity, card -> 'tcgplayer' as tcgplayer
    from jsonb_array_elements(p_cards) card
  ),
  chosen as (
    select api.id, api.tcgplayer, picked.variant, picked.market, picked.low, picked.high
    from api_cards api
    left join lateral (
      select price.key as variant,
             coalesce(nullif(price.value ->> 'market', '')::numeric, nullif(price.value ->> 'mid', '')::numeric, nullif(price.value ->> 'low', '')::numeric) as market,
             nullif(price.value ->> 'low', '')::numeric as low,
             nullif(price.value ->> 'high', '')::numeric as high
      from jsonb_each(coalesce(api.tcgplayer -> 'prices', '{}'::jsonb)) price
      where coalesce(nullif(price.value ->> 'market', '')::numeric, nullif(price.value ->> 'mid', '')::numeric, nullif(price.value ->> 'low', '')::numeric) > 0
      order by
        case
          when lower(coalesce(api.rarity, '')) ~ '(holo|shiny|rare|ultra|secret|illustration|rainbow|radiant|amazing)'
          then case price.key when 'holofoil' then 1 when '1stEditionHolofoil' then 2 when 'normal' then 3 when '1stEditionNormal' then 4 when 'reverseHolofoil' then 5 else 9 end
          else case price.key when 'normal' then 1 when '1stEditionNormal' then 2 when 'holofoil' then 3 when 'reverseHolofoil' then 4 when '1stEditionHolofoil' then 5 else 9 end
        end,
        coalesce(nullif(price.value ->> 'market', '')::numeric, nullif(price.value ->> 'mid', '')::numeric, nullif(price.value ->> 'low', '')::numeric) desc
      limit 1
    ) picked on true
  )
  update public.cards c
  set market_price_usd = chosen.market,
      market_price_low_usd = chosen.low,
      market_price_high_usd = chosen.high,
      market_price_variant = chosen.variant,
      market_price_source = case when chosen.market is null then 'pokemontcg:no_tcgplayer_price' else 'pokemontcg:tcgplayer_review_v2' end,
      market_price_data = coalesce(chosen.tcgplayer, '{}'::jsonb),
      market_price_updated_at = now()
  from chosen
  where c.id = chosen.id and c.set_id = p_set_id;

  get diagnostics v_updated = row_count;

  update public.cards c
  set market_price_usd = null,
      market_price_low_usd = null,
      market_price_high_usd = null,
      market_price_variant = null,
      market_price_source = 'pokemontcg:no_card_record',
      market_price_data = jsonb_build_object('setId', p_set_id, 'reviewedAt', now(), 'reason', 'Card id was not returned by the Pokémon TCG API'),
      market_price_updated_at = now()
  where c.set_id = p_set_id
    and not exists (select 1 from jsonb_array_elements(p_cards) api_card where api_card ->> 'id' = c.id);

  get diagnostics v_unmatched = row_count;

  select count(*)::integer, count(*) filter (where market_price_usd is not null)::integer
  into v_total, v_priced
  from public.cards
  where set_id = p_set_id;

  update private.market_price_sync_sets
  set status = 'completed', total_cards = v_total, priced_cards = v_priced,
      last_http_status = 200, last_error = null, completed_at = now(), updated_at = now()
  where set_id = p_set_id;

  return jsonb_build_object('setId', p_set_id, 'updated', v_updated, 'unmatched', v_unmatched, 'priced', v_priced, 'total', v_total);
end;
$$;

revoke all on function public.apply_market_price_sync_set(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_market_price_sync_set(text, text, jsonb) to service_role;

create or replace function public.fail_market_price_sync_set(p_token text, p_set_id text, p_http_status integer, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_market_price_sync_token(p_token);
  update private.market_price_sync_sets
  set status = 'retry', last_http_status = p_http_status, last_error = left(coalesce(p_error, 'UNKNOWN_ERROR'), 500),
      next_attempt_at = now() + least(60, greatest(2, attempts * 2)) * interval '1 minute', updated_at = now()
  where set_id = p_set_id;
end;
$$;

revoke all on function public.fail_market_price_sync_set(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.fail_market_price_sync_set(text, text, integer, text) to service_role;

update private.market_price_sync_sets
set status = 'retry', next_attempt_at = now(), updated_at = now()
where status = 'running';

do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname in ('pokemon-cards-price-review-once', 'pokemon-cards-price-review-edge')
  loop perform cron.unschedule(v_job_id); end loop;

  perform cron.schedule(
    'pokemon-cards-price-review-edge',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://mhddpovueqvvncrforao.supabase.co/functions/v1/tcgplayer-price-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tcgplayer_price_sync_token')
        ),
        body := '{"limit":2}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$
  );
end;
$$;
