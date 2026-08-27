-- Connect in-app notifications to Supabase Realtime and enforce real TCGplayer
-- market prices only. Synthetic/fallback valuations are intentionally cleared.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- Existing synthetic prices are not valid market data.
update public.cards
set market_price_usd = null,
    market_price_low_usd = null,
    market_price_high_usd = null,
    market_price_variant = null,
    market_price_source = 'pokemontcg:pending_review',
    market_price_data = '{}'::jsonb,
    market_price_updated_at = null
where market_price_source = 'fixed_collection_v1';

-- The production function was updated to select only TCGplayer's explicit
-- "market" field. The full function body is kept in the database migration
-- history and the Edge worker mirrors the same rule.

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
