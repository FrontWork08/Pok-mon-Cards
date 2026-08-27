create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
begin
  v_battles:=server_process_expired_battles();
  v_push:=server_dispatch_push_notifications();

  if exists(
    select 1 from catalog_refresh_state
    where job_name='full_tcg_refresh' and status='running'
  ) then
    begin
      v_catalog:=server_refresh_catalog_batch(2);
    exception when others then
      v_catalog:=jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog:=jsonb_build_object('status','idle');
  end if;

  return jsonb_build_object(
    'battles',v_battles,
    'pushes',v_push,
    'catalog',v_catalog,
    'marketPrices',jsonb_build_object('status','fixed'),
    'at',now()
  );
end;
$$;

revoke all on function public.server_background_tick()
from public,anon,authenticated;
grant execute on function public.server_background_tick()
to service_role;

drop function if exists public.server_refresh_owned_market_prices_batch(uuid,text[],boolean,integer);

update public.cards
set market_price_usd = public.fixed_card_usd_price(game_value, rarity, set_id),
    market_price_low_usd = null,
    market_price_high_usd = null,
    market_price_variant = 'fixed',
    market_price_source = 'fixed_collection_v1',
    market_price_updated_at = now(),
    market_price_data = jsonb_build_object(
      'mode','fixed',
      'version','v1',
      'note','Stable in-game USD valuation; no runtime market refresh'
    );
