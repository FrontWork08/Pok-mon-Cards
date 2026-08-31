create or replace function private.settle_expired_economy_auctions()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_auction public.economy_auctions%rowtype;
  v_count integer:=0;
begin
  for v_auction in
    select * from public.economy_auctions
    where status='active' and ends_at<=now()
    order by ends_at
    for update
  loop
    if v_auction.highest_bidder_id is null or coalesce(v_auction.highest_bid_coins,0)<=0 then
      update public.economy_auctions set status='expired',settled_at=now() where id=v_auction.id;
    else
      insert into public.player_economy_items(player_id,item_id,quantity,purchased_at)
      values(v_auction.highest_bidder_id,v_auction.item_id,1,now())
      on conflict(player_id,item_id) do update
      set quantity=public.player_economy_items.quantity+1,purchased_at=now();

      insert into private.economy_sink_ledger(player_id,sink_type,amount_coins,metadata)
      values(v_auction.highest_bidder_id,'luxury_auction',v_auction.highest_bid_coins,
        jsonb_build_object('auctionId',v_auction.id,'itemId',v_auction.item_id));

      update public.economy_auctions set status='settled',settled_at=now() where id=v_auction.id;
    end if;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.ensure_luxury_auction()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  perform private.settle_expired_economy_auctions();
  select id into v_id from public.economy_auctions
  where status='active' and ends_at>now()
  order by created_at desc limit 1;
  if v_id is null and private.economy_v2_actor_allowed(auth.uid()) then
    insert into public.economy_auctions(item_id,min_bid_coins,bid_increment_coins,starts_at,ends_at,status)
    values('auction_master_crown',250000,25000,now(),now()+interval '72 hours','active')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.place_economy_auction_bid(p_auction_id uuid,p_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_auction public.economy_auctions%rowtype;
  v_balance bigint;
  v_required bigint;
  v_delta bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not private.economy_v2_actor_allowed(v_player) then raise exception 'ECONOMY_V2_NOT_LIVE'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_BID'; end if;
  perform private.settle_expired_economy_auctions();

  select * into v_auction from public.economy_auctions where id=p_auction_id for update;
  if not found then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_auction.status<>'active' or v_auction.starts_at>now() or v_auction.ends_at<=now() then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  v_required:=case when v_auction.highest_bid_coins is null
    then v_auction.min_bid_coins else v_auction.highest_bid_coins+v_auction.bid_increment_coins end;
  if p_amount<v_required then raise exception 'BID_TOO_LOW'; end if;

  if v_auction.highest_bidder_id=v_player then
    v_delta:=p_amount-coalesce(v_auction.highest_bid_coins,0);
    if v_delta<=0 then raise exception 'BID_TOO_LOW'; end if;
    select coins into v_balance from public.players where id=v_player and account_status='active' for update;
    if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
    if v_balance<v_delta then raise exception 'NOT_ENOUGH_COINS'; end if;
    update public.players set coins=coins-v_delta where id=v_player returning coins into v_balance;
  else
    select coins into v_balance from public.players where id=v_player and account_status='active' for update;
    if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
    if v_balance<p_amount then raise exception 'NOT_ENOUGH_COINS'; end if;
    update public.players set coins=coins-p_amount where id=v_player returning coins into v_balance;

    if v_auction.highest_bidder_id is not null and coalesce(v_auction.highest_bid_coins,0)>0 then
      update public.players set coins=coins+v_auction.highest_bid_coins where id=v_auction.highest_bidder_id;
    end if;
  end if;

  insert into private.economy_auction_bids(auction_id,bidder_id,amount_coins)
  values(v_auction.id,v_player,p_amount);
  update public.economy_auctions
  set highest_bid_coins=p_amount,highest_bidder_id=v_player
  where id=v_auction.id;

  return jsonb_build_object('ok',true,'auctionId',v_auction.id,'amountCoins',p_amount,'coins',v_balance,
    'minimumNextBid',p_amount+v_auction.bid_increment_coins,'endsAt',v_auction.ends_at);
end;
$$;

grant execute on function public.place_economy_auction_bid(uuid,bigint) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.economy_auctions;
  exception when duplicate_object then null; end;
end $$;
alter table public.economy_auctions replica identity full;
