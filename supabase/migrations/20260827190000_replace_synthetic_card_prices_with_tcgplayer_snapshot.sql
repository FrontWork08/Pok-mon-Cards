-- One-time full review of the synthetic in-game valuation against TCGplayer USD.
-- Prices are sourced from the Pokémon TCG API and reviewed set-by-set so the
-- game remains responsive. The temporary cron job removes itself on completion.

drop trigger if exists cards_apply_fixed_usd_price on public.cards;
drop function if exists public.apply_fixed_card_usd_price();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.market_price_sync_sets (
  set_id text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'retry', 'completed')),
  owned_card_count integer not null default 0,
  max_game_value integer not null default 0,
  attempts integer not null default 0,
  total_cards integer not null default 0,
  priced_cards integer not null default 0,
  last_http_status integer,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  last_started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.market_price_sync_sets enable row level security;
revoke all on table private.market_price_sync_sets from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.market_price_sync_sets to service_role;

create index if not exists idx_market_price_sync_sets_queue
  on private.market_price_sync_sets (
    status,
    next_attempt_at,
    owned_card_count desc,
    max_game_value desc
  );

create or replace function private.start_market_price_review(
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queued integer;
begin
  insert into private.market_price_sync_sets as target (
    set_id,
    status,
    owned_card_count,
    max_game_value,
    attempts,
    total_cards,
    priced_cards,
    last_http_status,
    last_error,
    next_attempt_at,
    last_started_at,
    completed_at,
    updated_at
  )
  select
    c.set_id,
    'pending',
    count(distinct pc.card_id) filter (where pc.quantity > 0)::integer,
    coalesce(max(c.game_value), 0)::integer,
    0,
    count(distinct c.id)::integer,
    count(distinct c.id) filter (where c.market_price_usd is not null)::integer,
    null,
    null,
    now(),
    null,
    null,
    now()
  from public.cards c
  left join public.player_cards pc
    on pc.card_id = c.id
   and pc.quantity > 0
  where c.set_id is not null
  group by c.set_id
  on conflict (set_id) do update
  set owned_card_count = excluded.owned_card_count,
      max_game_value = excluded.max_game_value,
      total_cards = excluded.total_cards,
      status = case when p_force then 'pending' else target.status end,
      attempts = case when p_force then 0 else target.attempts end,
      last_http_status = case when p_force then null else target.last_http_status end,
      last_error = case when p_force then null else target.last_error end,
      next_attempt_at = case when p_force then now() else target.next_attempt_at end,
      last_started_at = case when p_force then null else target.last_started_at end,
      completed_at = case when p_force then null else target.completed_at end,
      updated_at = now();

  select count(*)::integer
  into v_queued
  from private.market_price_sync_sets
  where status in ('pending', 'running', 'retry');

  return jsonb_build_object(
    'status', case when v_queued > 0 then 'running' else 'completed' end,
    'queuedSets', v_queued,
    'source', 'pokemontcg:tcgplayer_review_v2'
  );
end;
$$;

revoke all on function private.start_market_price_review(boolean)
from public, anon, authenticated;
grant execute on function private.start_market_price_review(boolean)
to service_role;

create or replace function private.review_market_price_sets(
  p_set_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.market_price_sync_sets%rowtype;
  v_response extensions.http_response;
  v_body jsonb;
  v_cards jsonb;
  v_url text;
  v_error text;
  v_page integer;
  v_page_size constant integer := 50;
  v_total integer;
  v_count integer;
  v_updated integer;
  v_unmatched integer;
  v_priced integer;
  v_limit integer := greatest(1, least(coalesce(p_set_limit, 1), 2));
  v_processed integer := 0;
  v_failed integer := 0;
  v_remaining integer;
  v_job_id bigint;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('pokemon_cards_market_price_sync_v2', 0)
  ) then
    return jsonb_build_object('status', 'busy', 'processedSets', 0);
  end if;

  for v_job in
    select q.*
    from private.market_price_sync_sets q
    where q.status in ('pending', 'retry')
      and q.next_attempt_at <= now()
    order by
      (q.owned_card_count > 0) desc,
      q.max_game_value desc,
      q.owned_card_count desc,
      q.set_id
    limit v_limit
    for update skip locked
  loop
    update private.market_price_sync_sets
    set status = 'running',
        attempts = attempts + 1,
        last_started_at = now(),
        last_error = null,
        updated_at = now()
    where set_id = v_job.set_id;

    begin
      if v_job.set_id !~ '^[A-Za-z0-9._-]+$' then
        raise exception 'INVALID_SET_ID';
      end if;

      v_cards := '[]'::jsonb;
      v_page := 1;
      v_total := 0;

      loop
        v_url := 'https://api.pokemontcg.io/v2/cards?q=set.id:'
          || v_job.set_id
          || '&page=' || v_page
          || '&pageSize=' || v_page_size
          || '&select=id%2Crarity%2Ctcgplayer';

        select *
        into v_response
        from extensions.http_get(v_url);

        if v_response.status is distinct from 200 then
          raise exception 'POKEMONTCG_HTTP_%', v_response.status;
        end if;

        v_body := v_response.content::jsonb;
        if v_body is null
           or pg_catalog.jsonb_typeof(v_body -> 'data') is distinct from 'array' then
          raise exception 'POKEMONTCG_INVALID_RESPONSE';
        end if;

        v_cards := v_cards || (v_body -> 'data');
        v_count := coalesce((v_body ->> 'count')::integer, 0);
        v_total := coalesce((v_body ->> 'totalCount')::integer, v_count);

        exit when v_count = 0
          or v_page * v_page_size >= v_total
          or v_page >= 8;
        v_page := v_page + 1;
      end loop;

      with api_cards as (
        select
          card ->> 'id' as id,
          card ->> 'rarity' as rarity,
          card -> 'tcgplayer' as tcgplayer
        from pg_catalog.jsonb_array_elements(v_cards) as card
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
            coalesce(
              nullif(price.value ->> 'market', '')::numeric,
              nullif(price.value ->> 'mid', '')::numeric,
              nullif(price.value ->> 'low', '')::numeric
            ) as market,
            nullif(price.value ->> 'low', '')::numeric as low,
            nullif(price.value ->> 'high', '')::numeric as high
          from pg_catalog.jsonb_each(
            coalesce(api.tcgplayer -> 'prices', '{}'::jsonb)
          ) as price
          where coalesce(
            nullif(price.value ->> 'market', '')::numeric,
            nullif(price.value ->> 'mid', '')::numeric,
            nullif(price.value ->> 'low', '')::numeric
          ) > 0
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
            coalesce(
              nullif(price.value ->> 'market', '')::numeric,
              nullif(price.value ->> 'mid', '')::numeric,
              nullif(price.value ->> 'low', '')::numeric
            ) desc
          limit 1
        ) picked on true
      )
      update public.cards c
      set market_price_usd = chosen.market,
          market_price_low_usd = chosen.low,
          market_price_high_usd = chosen.high,
          market_price_variant = chosen.variant,
          market_price_source = case
            when chosen.market is null then 'pokemontcg:no_tcgplayer_price'
            else 'pokemontcg:tcgplayer_review_v2'
          end,
          market_price_data = coalesce(chosen.tcgplayer, '{}'::jsonb),
          market_price_updated_at = now()
      from chosen
      where c.id = chosen.id
        and c.set_id = v_job.set_id;

      get diagnostics v_updated = row_count;

      -- A successful upstream response that does not contain a local card is
      -- treated as "unpriced", never as permission to keep the old estimate.
      update public.cards c
      set market_price_usd = null,
          market_price_low_usd = null,
          market_price_high_usd = null,
          market_price_variant = null,
          market_price_source = 'pokemontcg:no_card_record',
          market_price_data = jsonb_build_object(
            'setId', v_job.set_id,
            'reviewedAt', now(),
            'reason', 'Card id was not returned by the Pokémon TCG API'
          ),
          market_price_updated_at = now()
      where c.set_id = v_job.set_id
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_cards) as api_card
          where api_card ->> 'id' = c.id
        );

      get diagnostics v_unmatched = row_count;

      select count(*)::integer
      into v_priced
      from public.cards c
      where c.set_id = v_job.set_id
        and c.market_price_usd is not null
        and c.market_price_source in (
          'pokemontcg:tcgplayer_review_v2',
          'pokemontcg:tcgplayer'
        );

      update private.market_price_sync_sets
      set status = 'completed',
          total_cards = v_updated + v_unmatched,
          priced_cards = v_priced,
          last_http_status = 200,
          last_error = null,
          completed_at = now(),
          updated_at = now()
      where set_id = v_job.set_id;

      v_processed := v_processed + 1;
    exception
      when others then
        get stacked diagnostics v_error = message_text;

        update private.market_price_sync_sets
        set status = 'retry',
            last_http_status = case
              when v_error ~ '^POKEMONTCG_HTTP_[0-9]+$'
                then substring(v_error from '[0-9]+$')::integer
              else null
            end,
            last_error = left(v_error, 500),
            next_attempt_at = now()
              + least(60, greatest(2, (v_job.attempts + 1) * 2)) * interval '1 minute',
            updated_at = now()
        where set_id = v_job.set_id;

        v_failed := v_failed + 1;
    end;
  end loop;

  select count(*)::integer
  into v_remaining
  from private.market_price_sync_sets
  where status in ('pending', 'running', 'retry');

  if v_remaining = 0 then
    for v_job_id in
      select jobid
      from cron.job
      where jobname = 'pokemon-cards-price-review-once'
    loop
      perform cron.unschedule(v_job_id);
    end loop;
  end if;

  return jsonb_build_object(
    'status', case when v_remaining = 0 then 'completed' else 'running' end,
    'processedSets', v_processed,
    'failedSets', v_failed,
    'remainingSets', v_remaining,
    'source', 'pokemontcg:tcgplayer_review_v2'
  );
end;
$$;

revoke all on function private.review_market_price_sets(integer)
from public, anon, authenticated;
grant execute on function private.review_market_price_sets(integer)
to service_role;

select private.start_market_price_review(true);

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'pokemon-cards-price-review-once'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'pokemon-cards-price-review-once',
    '* * * * *',
    'select private.review_market_price_sets(2);'
  );
end;
$$;
