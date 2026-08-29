-- Hybrid duplicate-sale pricing based on market value, rarity and real set pull difficulty.
-- Coin-pack cards are protected against self-funding loops by a 4x base-pack-price cap per sold copy.

alter table private.card_duplicate_sales
  add column if not exists rarity_tier smallint,
  add column if not exists rarity_multiplier numeric(6,3),
  add column if not exists drop_chance_pct numeric(10,6),
  add column if not exists drop_multiplier numeric(6,3),
  add column if not exists coin_pack_cap bigint;

create or replace function private.duplicate_sale_base_value(p_price numeric)
returns bigint language sql immutable set search_path='' as $$
  select case
    when p_price is null or p_price <= 0 then 0
    when p_price <= 0.50 then greatest(10, round(((p_price / 0.50) * 25) / 5.0) * 5)::bigint
    when p_price <= 1.00 then (round((25 + ((p_price - 0.50) / 0.50) * 25) / 5.0) * 5)::bigint
    when p_price <= 2.00 then (round((50 + ((p_price - 1.00) / 1.00) * 25) / 5.0) * 5)::bigint
    when p_price <= 5.00 then (round((75 + ((p_price - 2.00) / 3.00) * 75) / 5.0) * 5)::bigint
    when p_price <= 10.00 then (round((150 + ((p_price - 5.00) / 5.00) * 100) / 5.0) * 5)::bigint
    when p_price <= 20.00 then (round((250 + ((p_price - 10.00) / 10.00) * 150) / 5.0) * 5)::bigint
    when p_price <= 50.00 then (round((400 + ((p_price - 20.00) / 30.00) * 300) / 5.0) * 5)::bigint
    when p_price <= 100.00 then (round((700 + ((p_price - 50.00) / 50.00) * 300) / 5.0) * 5)::bigint
    when p_price <= 200.00 then (round((1000 + ((p_price - 100.00) / 100.00) * 500) / 5.0) * 5)::bigint
    when p_price <= 500.00 then (round((1500 + ((p_price - 200.00) / 300.00) * 1000) / 5.0) * 5)::bigint
    when p_price <= 1000.00 then (round((2500 + ((p_price - 500.00) / 500.00) * 1000) / 5.0) * 5)::bigint
    when p_price <= 2000.00 then (round((3500 + ((p_price - 1000.00) / 1000.00) * 1500) / 5.0) * 5)::bigint
    when p_price <= 5000.00 then (round((5000 + ((p_price - 2000.00) / 3000.00) * 2500) / 5.0) * 5)::bigint
    else (round((7500 + 1500 * (ln(p_price / 5000.0) / ln(2.0))) / 50.0) * 50)::bigint
  end
$$;

create or replace function private.duplicate_sale_rarity_multiplier(p_rarity text)
returns numeric language sql immutable set search_path='' as $$
  select case public.rarity_tier(p_rarity)
    when 7 then 1.90 when 6 then 1.60 when 5 then 1.35 when 4 then 1.15
    when 3 then 1.00 when 2 then 0.90 when 1 then 0.75 else 0.80 end::numeric
$$;

create or replace function private.duplicate_sale_drop_chance(p_card_id text)
returns numeric language sql stable set search_path='' as $$
  with target as (
    select c.set_id,c.rarity,public.rarity_tier(c.rarity) as tier,
           public.rarity_pull_weight(c.rarity) as weight
    from public.cards c where c.id=p_card_id
  )
  select case when t.tier<3 then null else t.weight/nullif((
    select sum(public.rarity_pull_weight(c2.rarity))
    from public.cards c2
    where c2.set_id=t.set_id and public.rarity_tier(c2.rarity)>=3
  ),0) end
  from target t
$$;

create or replace function private.duplicate_sale_drop_multiplier(p_card_id text)
returns numeric language sql stable set search_path='' as $$
  with target as (
    select public.rarity_tier(c.rarity) as tier,
           private.duplicate_sale_drop_chance(c.id) as chance
    from public.cards c where c.id=p_card_id
  )
  select case
    when tier<=1 then 0.80 when tier=2 then 0.90
    when chance>=0.05 then 0.85 when chance>=0.02 then 1.00
    when chance>=0.01 then 1.10 when chance>=0.005 then 1.20
    when chance>=0.002 then 1.35 when chance>=0.001 then 1.50
    when chance>=0.0005 then 1.70 else 2.00 end::numeric
  from target
$$;

create or replace function private.duplicate_sale_coin_value(p_card_id text)
returns bigint language sql stable set search_path='' as $$
  with target as (
    select c.id,c.set_id,c.rarity,c.market_price_usd,
           private.duplicate_sale_base_value(c.market_price_usd) as base_coins,
           private.duplicate_sale_rarity_multiplier(c.rarity) as rarity_multiplier,
           private.duplicate_sale_drop_multiplier(c.id) as drop_multiplier
    from public.cards c where c.id=p_card_id
  ), calc as (
    select t.*,
           greatest(10,round((t.base_coins*t.rarity_multiplier*t.drop_multiplier)/10.0)*10)::bigint as raw_coins,
           (select min(p.price*4) from public.packs p
            where p.active=true and p.set_id=t.set_id and p.currency='coins')::bigint as coin_pack_cap
    from target t
  )
  select case
    when market_price_usd is null or market_price_usd<=0 then 0
    when coin_pack_cap is not null then least(raw_coins,coin_pack_cap)
    else raw_coins end
  from calc
$$;

drop function if exists private.duplicate_sale_coin_value(numeric);

revoke all on function private.duplicate_sale_base_value(numeric) from public,anon,authenticated;
revoke all on function private.duplicate_sale_rarity_multiplier(text) from public,anon,authenticated;
revoke all on function private.duplicate_sale_drop_chance(text) from public,anon,authenticated;
revoke all on function private.duplicate_sale_drop_multiplier(text) from public,anon,authenticated;
revoke all on function private.duplicate_sale_coin_value(text) from public,anon,authenticated;

create or replace function public.get_my_duplicate_sale_cards()
returns jsonb language sql security definer set search_path='' as $$
  with me as (select auth.uid() as player_id), rows as (
    select pc.quantity,c.id,c.pokemon_name,c.set_name,c.rarity,c.image_small,
           c.market_price_usd,c.market_price_source,
           public.rarity_tier(c.rarity) as rarity_tier,
           private.duplicate_sale_base_value(c.market_price_usd) as base_coins,
           private.duplicate_sale_rarity_multiplier(c.rarity) as rarity_multiplier,
           private.duplicate_sale_drop_chance(c.id) as drop_chance,
           private.duplicate_sale_drop_multiplier(c.id) as drop_multiplier,
           (select min(p.price*4) from public.packs p
            where p.active=true and p.set_id=c.set_id and p.currency='coins')::bigint as coin_pack_cap,
           private.duplicate_sale_coin_value(c.id) as unit_coins
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join me
    where me.player_id is not null and pc.player_id=me.player_id and pc.quantity>1
    order by private.duplicate_sale_coin_value(c.id) desc,c.market_price_usd desc nulls last,c.pokemon_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'quantity',quantity,
    'cards',jsonb_build_object(
      'id',id,'pokemon_name',pokemon_name,'set_name',set_name,'rarity',rarity,
      'image_small',image_small,'market_price_usd',market_price_usd,'market_price_source',market_price_source
    ),
    'sale',jsonb_build_object(
      'baseCoins',base_coins,'rarityTier',rarity_tier,'rarityMultiplier',rarity_multiplier,
      'dropChancePct',case when drop_chance is null then null else drop_chance*100 end,
      'dropMultiplier',drop_multiplier,'coinPackCap',coin_pack_cap,'unitCoins',unit_coins
    )
  )),'[]'::jsonb) from rows
$$;

revoke all on function public.get_my_duplicate_sale_cards() from public,anon,authenticated;
grant execute on function public.get_my_duplicate_sale_cards() to authenticated;

create or replace function public.sell_duplicate_cards(p_card_id text,p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_player_id uuid:=auth.uid(); v_inventory integer; v_market_price numeric; v_rarity text;
  v_rarity_tier smallint; v_base_coins bigint; v_rarity_multiplier numeric; v_drop_chance numeric;
  v_drop_multiplier numeric; v_coin_pack_cap bigint; v_unit_coins bigint; v_total_coins bigint; v_new_balance bigint;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_card_id is null or btrim(p_card_id)='' or p_quantity is null or p_quantity<1 or p_quantity>10000 then raise exception 'INVALID_SALE'; end if;
  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then raise exception 'APP_MAINTENANCE'; end if;

  perform 1 from public.players where id=v_player_id and account_status='active' for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  select pc.quantity,c.market_price_usd,c.rarity into v_inventory,v_market_price,v_rarity
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  where pc.player_id=v_player_id and pc.card_id=p_card_id for update of pc;

  if not found then raise exception 'CARD_NOT_OWNED'; end if;
  if v_market_price is null or v_market_price<=0 then raise exception 'CARD_WITHOUT_MARKET_PRICE'; end if;
  if v_inventory<=1 then raise exception 'NO_DUPLICATES'; end if;
  if p_quantity>(v_inventory-1) then raise exception 'KEEP_ONE_COPY'; end if;

  v_rarity_tier:=public.rarity_tier(v_rarity);
  v_base_coins:=private.duplicate_sale_base_value(v_market_price);
  v_rarity_multiplier:=private.duplicate_sale_rarity_multiplier(v_rarity);
  v_drop_chance:=private.duplicate_sale_drop_chance(p_card_id);
  v_drop_multiplier:=private.duplicate_sale_drop_multiplier(p_card_id);
  select min(p.price*4)::bigint into v_coin_pack_cap
  from public.packs p join public.cards c on c.set_id=p.set_id
  where c.id=p_card_id and p.active=true and p.currency='coins';
  v_unit_coins:=private.duplicate_sale_coin_value(p_card_id);
  if v_unit_coins<=0 then raise exception 'CARD_WITHOUT_MARKET_PRICE'; end if;
  v_total_coins:=v_unit_coins*p_quantity;

  update public.player_cards set quantity=quantity-p_quantity where player_id=v_player_id and card_id=p_card_id;
  update public.players set coins=coins+v_total_coins where id=v_player_id returning coins into v_new_balance;

  insert into private.card_duplicate_sales(
    player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins,
    rarity_tier,rarity_multiplier,drop_chance_pct,drop_multiplier,coin_pack_cap
  ) values(
    v_player_id,p_card_id,p_quantity,v_market_price,v_unit_coins,v_total_coins,
    v_rarity_tier,v_rarity_multiplier,case when v_drop_chance is null then null else v_drop_chance*100 end,
    v_drop_multiplier,v_coin_pack_cap
  );

  perform private.battle_pass_record_event(v_player_id,'market_sell',1);

  return jsonb_build_object(
    'ok',true,'cardId',p_card_id,'quantitySold',p_quantity,'remainingQuantity',v_inventory-p_quantity,
    'marketPriceUsd',v_market_price,'baseCoins',v_base_coins,'rarityTier',v_rarity_tier,
    'rarityMultiplier',v_rarity_multiplier,'dropChancePct',case when v_drop_chance is null then null else v_drop_chance*100 end,
    'dropMultiplier',v_drop_multiplier,'coinPackCap',v_coin_pack_cap,'unitCoins',v_unit_coins,
    'coinsEarned',v_total_coins,'coins',v_new_balance
  );
end;
$$;

revoke all on function public.sell_duplicate_cards(text,integer) from public,anon,authenticated;
grant execute on function public.sell_duplicate_cards(text,integer) to authenticated;
