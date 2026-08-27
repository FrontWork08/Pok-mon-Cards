-- Runtime audit fixes: unique-card collection ranking, pack release dates,
-- and missing foreign-key indexes reported by the Supabase advisor.

alter table public.packs
  add column if not exists release_date date;

with source as (
  select content::jsonb as body
  from extensions.http_get(
    'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json'
  )
  where status = 200
),
set_rows as (
  select
    item ->> 'id' as set_id,
    nullif(item ->> 'releaseDate', '')::date as release_date
  from source,
  lateral jsonb_array_elements(body) item
)
update public.packs p
set release_date = s.release_date
from set_rows s
where p.set_id = s.set_id
  and s.release_date is not null
  and p.release_date is distinct from s.release_date;

create index if not exists admin_moderation_actions_admin_id_idx
  on public.admin_moderation_actions(admin_id);

create index if not exists player_favorite_packs_pack_id_idx
  on public.player_favorite_packs(pack_id);

create or replace function private.get_collection_value_leaderboard(
  p_limit integer default 100
)
returns table(
  global_rank bigint,
  player_id uuid,
  username text,
  collection_value_usd numeric,
  priced_card_copies bigint,
  total_card_copies bigint,
  price_coverage_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      p.id as player_id,
      p.username,
      coalesce(sum(coalesce(c.market_price_usd, 0)), 0)::numeric(14,2) as collection_value_usd,
      count(pc.card_id) filter (where c.market_price_usd is not null)::bigint as priced_card_copies,
      count(pc.card_id)::bigint as total_card_copies
    from public.players p
    left join public.player_cards pc
      on pc.player_id = p.id and pc.quantity > 0
    left join public.cards c on c.id = pc.card_id
    group by p.id, p.username
  ),
  ranked as (
    select
      dense_rank() over (
        order by collection_value_usd desc, total_card_copies desc, username asc
      ) as global_rank,
      *,
      case
        when total_card_copies = 0 then 0::numeric
        else round((priced_card_copies::numeric / total_card_copies::numeric) * 100, 1)
      end as price_coverage_pct
    from totals
  )
  select
    global_rank, player_id, username, collection_value_usd,
    priced_card_copies, total_card_copies, price_coverage_pct
  from ranked
  where auth.uid() is not null
  order by global_rank, username
  limit greatest(1, least(coalesce(p_limit,100), 200));
$$;

revoke all on function private.get_collection_value_leaderboard(integer)
from public, anon, authenticated;
grant execute on function private.get_collection_value_leaderboard(integer)
to service_role;


-- Keep the background worker diagnostics aligned with the real TCGplayer
-- market-price pipeline instead of reporting the retired fixed-price mode.
create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_market_pending integer;
begin
  v_battles := public.server_process_expired_battles();
  v_push := public.server_dispatch_push_notifications();

  if exists(
    select 1 from public.catalog_refresh_state
    where job_name='full_tcg_refresh' and status='running'
  ) then
    begin
      v_catalog := public.server_refresh_catalog_batch(2);
    exception when others then
      v_catalog := jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog := jsonb_build_object('status','idle');
  end if;

  select count(*)::integer
  into v_market_pending
  from private.market_price_sync_sets
  where status in ('pending','running','retry');

  return jsonb_build_object(
    'battles', v_battles,
    'pushes', v_push,
    'catalog', v_catalog,
    'marketPrices', jsonb_build_object(
      'status', case when v_market_pending > 0 then 'syncing' else 'ready' end,
      'pendingSets', v_market_pending,
      'source', 'pokemontcg:tcgplayer_market_v3'
    ),
    'at', now()
  );
end;
$$;

revoke all on function public.server_background_tick()
from public, anon, authenticated;
grant execute on function public.server_background_tick()
to service_role;
