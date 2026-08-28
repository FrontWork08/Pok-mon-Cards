-- Fixes found from Android crash/performance report:
-- 1) restore authenticated access to the secured collection-ranking implementation,
-- 2) add lightweight ownership RPCs used by virtualized Pokédex/Set screens,
-- 3) automatically reactivate expired suspensions in the background worker.

grant execute on function private.get_collection_value_leaderboard(integer)
to authenticated;

create or replace function public.get_my_owned_pokedex_numbers()
returns integer[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct n order by n), array[]::integer[])
  from public.player_cards pc
  join public.cards c on c.id = pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers, array[]::integer[])) as n
  where pc.player_id = auth.uid()
    and pc.quantity > 0;
$$;

revoke all on function public.get_my_owned_pokedex_numbers()
from public, anon;
grant execute on function public.get_my_owned_pokedex_numbers()
to authenticated;

create or replace function public.get_my_owned_set_counts()
returns table(set_id text, owned_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.set_id, count(*)::bigint
  from public.player_cards pc
  join public.cards c on c.id = pc.card_id
  where pc.player_id = auth.uid()
    and pc.quantity > 0
  group by c.set_id
  order by c.set_id;
$$;

revoke all on function public.get_my_owned_set_counts()
from public, anon;
grant execute on function public.get_my_owned_set_counts()
to authenticated;

create or replace function public.get_my_owned_card_ids_for_set(p_set_id text)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(pc.card_id order by pc.card_id), array[]::text[])
  from public.player_cards pc
  join public.cards c on c.id = pc.card_id
  where pc.player_id = auth.uid()
    and pc.quantity > 0
    and c.set_id = p_set_id;
$$;

revoke all on function public.get_my_owned_card_ids_for_set(text)
from public, anon;
grant execute on function public.get_my_owned_card_ids_for_set(text)
to authenticated;

create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_market_pending integer;
  v_restored_suspensions integer;
begin
  update public.players
  set account_status = 'active',
      suspended_until = null,
      moderation_reason = null
  where account_status = 'suspended'
    and suspended_until is not null
    and suspended_until <= now();
  get diagnostics v_restored_suspensions = row_count;

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
    'moderation', jsonb_build_object('restoredSuspensions', v_restored_suspensions),
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
