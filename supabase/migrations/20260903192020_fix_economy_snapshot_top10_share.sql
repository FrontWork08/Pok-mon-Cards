
create or replace function public.server_capture_economy_snapshot(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_health jsonb;
  v_distribution jsonb;
  v_market jsonb;
  v_id bigint;
  v_player_count integer:=0;
  v_total_coins numeric:=0;
  v_top10_coins numeric:=0;
  v_top_n integer:=1;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  v_health:=public.server_get_economy_health(p_actor_id);

  select count(*)::integer,coalesce(sum(coins),0)
  into v_player_count,v_total_coins
  from public.players
  where account_status='active';

  v_top_n:=greatest(1,ceil(greatest(v_player_count,1)*.10)::integer);

  select coalesce(sum(x.coins),0)
  into v_top10_coins
  from (
    select p2.coins
    from public.players p2
    where p2.account_status='active'
    order by p2.coins desc
    limit v_top_n
  ) x;

  select jsonb_build_object(
    'players',count(*),
    'coinP50',coalesce(percentile_cont(.50) within group(order by coins),0),
    'coinP90',coalesce(percentile_cont(.90) within group(order by coins),0),
    'coinP99',coalesce(percentile_cont(.99) within group(order by coins),0),
    'diamondP50',coalesce(percentile_cont(.50) within group(order by diamonds),0),
    'diamondP90',coalesce(percentile_cont(.90) within group(order by diamonds),0),
    'maxCoins',coalesce(max(coins),0),
    'maxDiamonds',coalesce(max(diamonds),0),
    'top10CoinShare',case when v_total_coins>0 then round(v_top10_coins/v_total_coins,4) else 0 end
  )
  into v_distribution
  from public.players
  where account_status='active';

  select jsonb_build_object(
    'activeListings',(select count(*) from public.market_listings where status='active'),
    'sales7d',(select count(*) from public.market_listings where status='sold' and sold_at>=now()-interval '7 days'),
    'medianActiveCoins',(select coalesce(percentile_cont(.5) within group(order by unit_price_coins),0) from public.market_listings where status='active'),
    'medianSoldCoins7d',(select coalesce(percentile_cont(.5) within group(order by unit_price_coins),0) from public.market_listings where status='sold' and sold_at>=now()-interval '7 days'),
    'feesBurned7d',(select coalesce(sum(fee_coins),0) from private.market_fee_log where created_at>=now()-interval '7 days')
  ) into v_market;

  insert into private.economy_health_snapshots(captured_by,health,distribution,market)
  values(p_actor_id,v_health,v_distribution,v_market)
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,'capturedAt',now(),'health',v_health,'distribution',v_distribution,'market',v_market,
    'guardrails',jsonb_build_object(
      'automaticChanges',false,
      'burnMintWatchBelow',0.75,
      'burnMintCriticalBelow',0.55,
      'coinsPerPlayerWatch',3000000,
      'coinsPerPlayerCritical',5000000,
      'top10ShareWatch',0.70
    )
  );
end;
$$;
revoke all on function public.server_capture_economy_snapshot(uuid) from public,anon;
grant execute on function public.server_capture_economy_snapshot(uuid) to authenticated,service_role;
