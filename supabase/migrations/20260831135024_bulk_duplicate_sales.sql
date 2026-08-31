create or replace function public.sell_all_duplicate_cards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid:=auth.uid();
  v_row record;
  v_sale_quantity integer;
  v_unit_coins bigint;
  v_total_coins bigint:=0;
  v_total_quantity bigint:=0;
  v_unique_sold integer:=0;
  v_skipped_unique integer:=0;
  v_skipped_copies bigint:=0;
  v_rarity_tier smallint;
  v_base_coins bigint;
  v_rarity_multiplier numeric;
  v_drop_chance numeric;
  v_drop_multiplier numeric;
  v_coin_pack_cap bigint;
  v_new_balance bigint;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;

  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then
    raise exception 'APP_MAINTENANCE';
  end if;

  if exists(
    select 1
    from public.admin_game_events
    where event_type='free_boosters'
      and active=true
      and starts_at<=now()
      and ends_at>now()
  ) then
    raise exception 'DUPLICATE_SALES_PAUSED_DURING_FREE_EVENT';
  end if;

  perform 1
  from public.players
  where id=v_player_id and account_status='active'
  for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  for v_row in
    select pc.card_id,pc.quantity,c.market_price_usd,c.rarity
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player_id
      and pc.quantity>1
    order by pc.card_id
    for update of pc
  loop
    v_sale_quantity:=greatest(0,v_row.quantity-1);
    if v_sale_quantity<=0 then continue; end if;

    if v_row.market_price_usd is null or v_row.market_price_usd<=0 then
      v_skipped_unique:=v_skipped_unique+1;
      v_skipped_copies:=v_skipped_copies+v_sale_quantity;
      continue;
    end if;

    v_unit_coins:=private.duplicate_sale_coin_value(v_row.card_id);
    if coalesce(v_unit_coins,0)<=0 then
      v_skipped_unique:=v_skipped_unique+1;
      v_skipped_copies:=v_skipped_copies+v_sale_quantity;
      continue;
    end if;

    v_rarity_tier:=public.rarity_tier(v_row.rarity);
    v_base_coins:=private.duplicate_sale_base_value(v_row.market_price_usd);
    v_rarity_multiplier:=private.duplicate_sale_rarity_multiplier(v_row.rarity);
    v_drop_chance:=private.duplicate_sale_drop_chance(v_row.card_id);
    v_drop_multiplier:=private.duplicate_sale_drop_multiplier(v_row.card_id);

    select min(ceil(p.price::numeric*1.5))::bigint
      into v_coin_pack_cap
    from public.packs p
    join public.cards c on c.set_id=p.set_id
    where c.id=v_row.card_id
      and p.active=true
      and p.currency='coins';

    update public.player_cards
    set quantity=1
    where player_id=v_player_id and card_id=v_row.card_id;

    insert into private.card_duplicate_sales(
      player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins,
      rarity_tier,rarity_multiplier,drop_chance_pct,drop_multiplier,coin_pack_cap
    )
    values(
      v_player_id,v_row.card_id,v_sale_quantity,v_row.market_price_usd,v_unit_coins,
      v_unit_coins*v_sale_quantity,v_rarity_tier,v_rarity_multiplier,
      case when v_drop_chance is null then null else v_drop_chance*100 end,
      v_drop_multiplier,v_coin_pack_cap
    );

    v_total_coins:=v_total_coins+(v_unit_coins*v_sale_quantity);
    v_total_quantity:=v_total_quantity+v_sale_quantity;
    v_unique_sold:=v_unique_sold+1;
  end loop;

  if v_total_quantity>0 then
    update public.players
    set coins=coins+v_total_coins
    where id=v_player_id
    returning coins into v_new_balance;

    perform private.battle_pass_record_event(v_player_id,'market_sell',1);
  else
    select coins into v_new_balance
    from public.players
    where id=v_player_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'uniqueCardsSold',v_unique_sold,
    'quantitySold',v_total_quantity,
    'coinsEarned',v_total_coins,
    'skippedUniqueCards',v_skipped_unique,
    'skippedCopies',v_skipped_copies,
    'coins',v_new_balance
  );
end;
$$;

revoke execute on function public.sell_all_duplicate_cards() from public,anon;
grant execute on function public.sell_all_duplicate_cards() to authenticated;
