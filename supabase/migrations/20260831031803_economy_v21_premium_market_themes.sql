create or replace function private.marketplace_action(
  p_action text,
  p_listing_id uuid default null,
  p_card_id text default null,
  p_quantity integer default null,
  p_price bigint default null,
  p_shop_name text default null,
  p_theme_style text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_username text;
  v_name text;
  v_listing public.market_listings%rowtype;
  v_inventory integer;
  v_buyer_coins bigint;
  v_buyer_after bigint;
  v_seller_after bigint;
  v_fee bigint;
  v_seller_credit bigint;
  v_theme text:=coalesce(p_theme_style,'guild');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select username into v_username from public.players where id=v_actor and account_status='active';
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  if p_action='save_shop' then
    v_name:=regexp_replace(trim(coalesce(p_shop_name,'')),'\s+',' ','g');
    if char_length(v_name)<3 or char_length(v_name)>32 then raise exception 'INVALID_SHOP_NAME'; end if;

    if v_theme<>all(array['guild','classic','night'])
       and not exists(
         select 1
         from public.player_economy_items pi
         join public.economy_store_items i on i.id=pi.item_id
         where pi.player_id=v_actor and pi.quantity>0
           and i.category='shop_theme'
           and i.metadata->>'themeStyle'=v_theme
       ) then
      raise exception 'PREMIUM_SHOP_THEME_LOCKED';
    end if;

    insert into public.player_shops(player_id,name,theme_style)
    values(v_actor,v_name,v_theme)
    on conflict(player_id) do update
    set name=excluded.name,theme_style=excluded.theme_style,updated_at=now();

    return jsonb_build_object('ok',true,'shopName',v_name,'themeStyle',v_theme);
  end if;

  if p_action='list' then
    if p_card_id is null or p_quantity is null or p_quantity<1 or p_quantity>99
      or p_price is null or p_price<1 or p_price>100000000 then raise exception 'INVALID_LISTING'; end if;
    if (select count(*) from public.market_listings where seller_id=v_actor and status='active')>=100
      then raise exception 'LISTING_LIMIT_REACHED'; end if;

    insert into public.player_shops(player_id,name)
    values(v_actor,left(v_username||' Card Shop',32))
    on conflict(player_id) do nothing;

    select quantity into v_inventory from public.player_cards
    where player_id=v_actor and card_id=p_card_id for update;
    if not found or v_inventory<p_quantity then raise exception 'NOT_ENOUGH_CARDS'; end if;

    update public.player_cards set quantity=quantity-p_quantity
    where player_id=v_actor and card_id=p_card_id;

    insert into public.market_listings(seller_id,card_id,quantity,unit_price_coins)
    values(v_actor,p_card_id,p_quantity,p_price)
    returning * into v_listing;

    return jsonb_build_object('ok',true,'listingId',v_listing.id,'marketFeePercent',8);
  end if;

  if p_action='cancel' then
    select * into v_listing from public.market_listings where id=p_listing_id for update;
    if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    if v_listing.seller_id<>v_actor then raise exception 'FORBIDDEN'; end if;
    if v_listing.status<>'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;

    update public.market_listings set status='cancelled',updated_at=now() where id=v_listing.id;
    insert into public.player_cards(player_id,card_id,quantity)
    values(v_actor,v_listing.card_id,v_listing.quantity)
    on conflict(player_id,card_id) do update
    set quantity=public.player_cards.quantity+excluded.quantity;

    return jsonb_build_object('ok',true,'listingId',v_listing.id);
  end if;

  if p_action='buy' then
    select * into v_listing from public.market_listings where id=p_listing_id for update;
    if not found then raise exception 'LISTING_NOT_FOUND'; end if;
    if v_listing.status<>'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;
    if v_listing.seller_id=v_actor then raise exception 'CANNOT_BUY_OWN_LISTING'; end if;

    perform 1 from public.players where id in(v_actor,v_listing.seller_id) order by id for update;
    select coins into v_buyer_coins from public.players where id=v_actor and account_status='active';
    if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
    if v_buyer_coins<v_listing.unit_price_coins then raise exception 'NOT_ENOUGH_COINS'; end if;

    v_fee:=least(v_listing.unit_price_coins,greatest(1,ceil(v_listing.unit_price_coins::numeric*.08)::bigint));
    v_seller_credit:=v_listing.unit_price_coins-v_fee;

    update public.players set coins=coins-v_listing.unit_price_coins
    where id=v_actor returning coins into v_buyer_after;
    update public.players set coins=coins+v_seller_credit
    where id=v_listing.seller_id returning coins into v_seller_after;

    insert into public.player_cards(player_id,card_id,quantity)
    values(v_actor,v_listing.card_id,v_listing.quantity)
    on conflict(player_id,card_id) do update
    set quantity=public.player_cards.quantity+excluded.quantity;

    update public.market_listings
    set status='sold',buyer_id=v_actor,sold_at=now(),updated_at=now()
    where id=v_listing.id;

    insert into private.market_fee_log(
      listing_id,buyer_id,seller_id,gross_coins,fee_coins,seller_net_coins,sale_kind
    ) values(
      v_listing.id,v_actor,v_listing.seller_id,v_listing.unit_price_coins,v_fee,v_seller_credit,'listing'
    );

    return jsonb_build_object(
      'ok',true,'listingId',v_listing.id,'coins',v_buyer_after,
      'sellerCoins',v_seller_after,'quantity',v_listing.quantity,'cardId',v_listing.card_id,
      'marketFeeCoins',v_fee,'marketFeePercent',8,'sellerNetCoins',v_seller_credit
    );
  end if;

  raise exception 'INVALID_MARKETPLACE_ACTION';
end;
$$;
