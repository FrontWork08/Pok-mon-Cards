-- Economy 2.1 atomic sink actions.

create or replace function private.economy_v2_live_for_players()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select c.phase='completed' from public.release_campaigns c where c.code='trainer_collection_1_0_beta_transition' and c.active=true limit 1),false) $$;

create or replace function private.economy_v2_actor_allowed(p_actor uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select private.economy_v2_live_for_players() or exists(select 1 from public.admin_members a where a.player_id=p_actor) $$;

create or replace function private.spend_player_coins(
  p_player uuid,p_amount bigint,p_sink_type text,p_metadata jsonb default '{}'::jsonb,p_guild_id text default null
)
returns bigint language plpgsql security definer set search_path=''
as $$
declare v_balance bigint;
begin
  if p_player is null or p_amount is null or p_amount<=0 then raise exception 'INVALID_SPEND'; end if;
  if auth.uid() is distinct from p_player and not exists(select 1 from public.admin_members a where a.player_id=auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if not private.economy_v2_actor_allowed(p_player) then raise exception 'ECONOMY_V2_NOT_LIVE'; end if;
  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true)
     and not exists(select 1 from public.admin_members a where a.player_id=p_player) then raise exception 'APP_MAINTENANCE'; end if;
  select coins into v_balance from public.players where id=p_player and account_status='active' for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
  if v_balance<p_amount then raise exception 'NOT_ENOUGH_COINS'; end if;
  update public.players set coins=coins-p_amount where id=p_player returning coins into v_balance;
  insert into private.economy_sink_ledger(player_id,guild_id,sink_type,amount_coins,metadata)
  values(p_player,p_guild_id,p_sink_type,p_amount,coalesce(p_metadata,'{}'::jsonb));
  return v_balance;
end;
$$;

create or replace function private.current_luxury_rotation_ids(p_player uuid)
returns setof text language sql stable security definer set search_path=''
as $$
with state as (
  select date_trunc('week',now())::date week_start,
    coalesce((select r.reroll_count from public.player_luxury_rotation r where r.player_id=p_player and r.week_start=date_trunc('week',now())::date),0) rerolls
)
select i.id from public.economy_store_items i cross join state s
where i.active=true
  and coalesce((i.metadata->>'luxuryOnly')::boolean,false)=true
  and coalesce((i.metadata->>'notForDirectSale')::boolean,false)=false
  and (i.limited_starts_at is null or i.limited_starts_at<=now())
  and (i.limited_ends_at is null or i.limited_ends_at>now())
order by md5(i.id||':'||p_player::text||':'||s.week_start::text||':'||s.rerolls::text)
limit 4
$$;

create or replace function public.purchase_economy_item(p_item_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_player uuid:=auth.uid(); v_item public.economy_store_items%rowtype; v_owned integer:=0;
  v_balance bigint; v_theme text; v_username text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_item from public.economy_store_items where id=p_item_id and active=true
    and (limited_starts_at is null or limited_starts_at<=now())
    and (limited_ends_at is null or limited_ends_at>now());
  if not found then raise exception 'ITEM_NOT_AVAILABLE'; end if;
  if coalesce((v_item.metadata->>'notForDirectSale')::boolean,false) then raise exception 'ITEM_NOT_FOR_SALE'; end if;
  if coalesce((v_item.metadata->>'luxuryOnly')::boolean,false)
     and not exists(select 1 from private.current_luxury_rotation_ids(v_player) x where x=v_item.id) then
    raise exception 'ITEM_NOT_IN_LUXURY_ROTATION';
  end if;
  select coalesce(quantity,0) into v_owned from public.player_economy_items
  where player_id=v_player and item_id=v_item.id for update;
  if not found then v_owned:=0; end if;
  if v_owned>=v_item.max_purchases_per_player then raise exception 'ITEM_ALREADY_OWNED'; end if;
  v_balance:=private.spend_player_coins(v_player,v_item.price_coins,'store_purchase',
    jsonb_build_object('itemId',v_item.id,'category',v_item.category,'name',v_item.name));
  insert into public.player_economy_items(player_id,item_id,quantity,purchased_at)
  values(v_player,v_item.id,1,now())
  on conflict(player_id,item_id) do update set quantity=public.player_economy_items.quantity+1,purchased_at=now();

  if v_item.category in ('profile_frame','profile_background') then
    insert into public.player_cosmetics(player_id,cosmetic_id)
    values(v_player,coalesce(v_item.metadata->>'cosmeticId',v_item.id))
    on conflict(player_id,cosmetic_id) do nothing;
  elsif v_item.category='shop_theme' then
    v_theme:=v_item.metadata->>'themeStyle';
    select username into v_username from public.players where id=v_player;
    insert into public.player_shops(player_id,name,theme_style)
    values(v_player,left(v_username||' Card Shop',32),coalesce(v_theme,'guild'))
    on conflict(player_id) do update set theme_style=coalesce(v_theme,public.player_shops.theme_style),updated_at=now();
  elsif v_item.category='booster_fx' then
    update public.players set equipped_booster_fx_id=v_item.id where id=v_player;
  elsif v_item.category='title' then
    update public.players set equipped_economy_title_id=v_item.id where id=v_player;
  end if;
  return jsonb_build_object('ok',true,'itemId',v_item.id,'category',v_item.category,'coins',v_balance,'ownedQuantity',v_owned+1);
end;
$$;

create or replace function public.equip_economy_item(p_item_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_item public.economy_store_items%rowtype; v_theme text; v_username text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select i.* into v_item from public.economy_store_items i
  join public.player_economy_items pi on pi.item_id=i.id and pi.player_id=v_player
  where i.id=p_item_id and pi.quantity>0;
  if not found then raise exception 'ITEM_NOT_OWNED'; end if;
  if v_item.category='profile_frame' then
    update public.players set equipped_frame_id=coalesce(v_item.metadata->>'cosmeticId',v_item.id) where id=v_player;
  elsif v_item.category='profile_background' then
    update public.players set equipped_background_id=coalesce(v_item.metadata->>'cosmeticId',v_item.id) where id=v_player;
  elsif v_item.category='shop_theme' then
    v_theme:=v_item.metadata->>'themeStyle'; select username into v_username from public.players where id=v_player;
    insert into public.player_shops(player_id,name,theme_style)
    values(v_player,left(v_username||' Card Shop',32),coalesce(v_theme,'guild'))
    on conflict(player_id) do update set theme_style=coalesce(v_theme,public.player_shops.theme_style),updated_at=now();
  elsif v_item.category='booster_fx' then update public.players set equipped_booster_fx_id=v_item.id where id=v_player;
  elsif v_item.category='title' then update public.players set equipped_economy_title_id=v_item.id where id=v_player;
  else raise exception 'ITEM_NOT_EQUIPPABLE';
  end if;
  return jsonb_build_object('ok',true,'itemId',v_item.id,'category',v_item.category);
end;
$$;

create or replace function private.prestige_next_cost(p_level integer)
returns bigint language sql immutable set search_path=''
as $$
select case greatest(0,p_level)
  when 0 then 250000 when 1 then 500000 when 2 then 1000000 when 3 then 2500000 when 4 then 5000000
  else 5000000+((greatest(0,p_level)-4)::bigint*1000000) end
$$;

create or replace function public.purchase_trainer_prestige()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_level integer:=0; v_cost bigint; v_balance bigint; v_total bigint:=0; v_player_level integer:=1;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select level into v_player_level from public.players where id=v_player;
  if coalesce(v_player_level,1)<5 and not exists(select 1 from public.admin_members a where a.player_id=v_player) then raise exception 'PRESTIGE_REQUIRES_LEVEL_5'; end if;
  insert into public.player_prestige(player_id) values(v_player) on conflict(player_id) do nothing;
  select prestige_level,total_spent_coins into v_level,v_total from public.player_prestige where player_id=v_player for update;
  v_cost:=private.prestige_next_cost(v_level);
  v_balance:=private.spend_player_coins(v_player,v_cost,'trainer_prestige',jsonb_build_object('fromLevel',v_level,'toLevel',v_level+1));
  update public.player_prestige set prestige_level=v_level+1,total_spent_coins=total_spent_coins+v_cost,updated_at=now()
  where player_id=v_player returning total_spent_coins into v_total;
  if v_level+1>=1 then insert into public.player_economy_items(player_id,item_id,quantity) values(v_player,'title_collector',1) on conflict(player_id,item_id) do nothing; end if;
  if v_level+1>=3 then insert into public.player_economy_items(player_id,item_id,quantity) values(v_player,'trophy_million',1) on conflict(player_id,item_id) do nothing; end if;
  if v_level+1>=5 then insert into public.player_economy_items(player_id,item_id,quantity) values(v_player,'trophy_legend',1) on conflict(player_id,item_id) do nothing; end if;
  return jsonb_build_object('ok',true,'prestigeLevel',v_level+1,'stars',greatest(0,v_level+1-5),'spentCoins',v_cost,'totalSpentCoins',v_total,'coins',v_balance,'nextCost',private.prestige_next_cost(v_level+1));
end;
$$;

create or replace function public.reroll_luxury_shop()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_week date:=date_trunc('week',now())::date; v_rerolls integer:=0; v_cost bigint; v_balance bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  insert into public.player_luxury_rotation(player_id,week_start,reroll_count) values(v_player,v_week,0)
  on conflict(player_id) do update
  set week_start=case when public.player_luxury_rotation.week_start<>v_week then v_week else public.player_luxury_rotation.week_start end,
      reroll_count=case when public.player_luxury_rotation.week_start<>v_week then 0 else public.player_luxury_rotation.reroll_count end,
      updated_at=now();
  select reroll_count into v_rerolls from public.player_luxury_rotation where player_id=v_player for update;
  v_cost:=15000+least(v_rerolls,10)*5000;
  v_balance:=private.spend_player_coins(v_player,v_cost,'luxury_reroll',jsonb_build_object('reroll',v_rerolls+1));
  update public.player_luxury_rotation set reroll_count=reroll_count+1,updated_at=now() where player_id=v_player returning reroll_count into v_rerolls;
  return jsonb_build_object('ok',true,'rerollCount',v_rerolls,'spentCoins',v_cost,'coins',v_balance,'nextCost',15000+least(v_rerolls,10)*5000,
    'itemIds',(select coalesce(jsonb_agg(x),'[]'::jsonb) from private.current_luxury_rotation_ids(v_player) x));
end;
$$;

create or replace function public.apply_card_economy_style(p_card_id text,p_item_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_item public.economy_store_items%rowtype; v_cost bigint; v_balance bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.player_cards where player_id=v_player and card_id=p_card_id and quantity>0) then raise exception 'CARD_NOT_OWNED'; end if;
  select i.* into v_item from public.economy_store_items i
  join public.player_economy_items pi on pi.item_id=i.id and pi.player_id=v_player and pi.quantity>0
  where i.id=p_item_id and i.category='card_style';
  if not found then raise exception 'STYLE_NOT_OWNED'; end if;
  v_cost:=greatest(1,coalesce((v_item.metadata->>'applyCost')::bigint,15000));
  v_balance:=private.spend_player_coins(v_player,v_cost,'card_customization',jsonb_build_object('cardId',p_card_id,'styleItemId',p_item_id));
  insert into public.player_card_customizations(player_id,card_id,style_item_id,applied_at)
  values(v_player,p_card_id,p_item_id,now())
  on conflict(player_id,card_id) do update set style_item_id=excluded.style_item_id,applied_at=now();
  return jsonb_build_object('ok',true,'cardId',p_card_id,'styleItemId',p_item_id,'spentCoins',v_cost,'coins',v_balance);
end;
$$;

create or replace function public.apply_deck_economy_style(p_deck_id uuid,p_item_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_item public.economy_store_items%rowtype; v_cost bigint; v_balance bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.decks where id=p_deck_id and player_id=v_player) then raise exception 'DECK_NOT_OWNED'; end if;
  select i.* into v_item from public.economy_store_items i
  join public.player_economy_items pi on pi.item_id=i.id and pi.player_id=v_player and pi.quantity>0
  where i.id=p_item_id and i.category='deck_style';
  if not found then raise exception 'STYLE_NOT_OWNED'; end if;
  v_cost:=greatest(1,coalesce((v_item.metadata->>'applyCost')::bigint,10000));
  v_balance:=private.spend_player_coins(v_player,v_cost,'deck_customization',jsonb_build_object('deckId',p_deck_id,'styleItemId',p_item_id));
  update public.decks set style_item_id=p_item_id,updated_at=now() where id=p_deck_id and player_id=v_player;
  return jsonb_build_object('ok',true,'deckId',p_deck_id,'styleItemId',p_item_id,'spentCoins',v_cost,'coins',v_balance);
end;
$$;

create or replace function public.upgrade_collection_museum()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_level integer:=0; v_cost bigint; v_balance bigint; v_total bigint:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  insert into public.player_museum_progress(player_id) values(v_player) on conflict(player_id) do nothing;
  select level,total_spent_coins into v_level,v_total from public.player_museum_progress where player_id=v_player for update;
  if v_level>=5 then raise exception 'MUSEUM_MAX_LEVEL'; end if;
  v_cost:=case v_level when 0 then 50000 when 1 then 150000 when 2 then 350000 when 3 then 750000 else 1500000 end;
  v_balance:=private.spend_player_coins(v_player,v_cost,'museum_upgrade',jsonb_build_object('fromLevel',v_level,'toLevel',v_level+1));
  update public.player_museum_progress set level=v_level+1,total_spent_coins=total_spent_coins+v_cost,updated_at=now()
  where player_id=v_player returning total_spent_coins into v_total;
  return jsonb_build_object('ok',true,'level',v_level+1,'slots',3+(v_level+1)*3,'spentCoins',v_cost,'totalSpentCoins',v_total,'coins',v_balance);
end;
$$;

create or replace function public.set_collection_museum_card(p_slot integer,p_card_id text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_level integer:=0; v_slots integer:=3;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(level,0) into v_level from public.player_museum_progress where player_id=v_player;
  if not found then v_level:=0; end if;
  v_slots:=3+v_level*3;
  if p_slot<1 or p_slot>v_slots then raise exception 'MUSEUM_SLOT_LOCKED'; end if;
  if not exists(select 1 from public.player_cards where player_id=v_player and card_id=p_card_id and quantity>0) then raise exception 'CARD_NOT_OWNED'; end if;
  delete from public.player_museum_cards where player_id=v_player and card_id=p_card_id and slot<>p_slot;
  insert into public.player_museum_cards(player_id,slot,card_id,updated_at) values(v_player,p_slot,p_card_id,now())
  on conflict(player_id,slot) do update set card_id=excluded.card_id,updated_at=now();
  return jsonb_build_object('ok',true,'slot',p_slot,'cardId',p_card_id,'slots',v_slots);
end;
$$;

create or replace function public.boost_market_listing(p_listing_id uuid,p_tier text default '24h')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_listing public.market_listings%rowtype; v_cost bigint; v_duration interval; v_until timestamptz; v_balance bigint;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_listing from public.market_listings where id=p_listing_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND'; end if;
  if v_listing.seller_id<>v_player then raise exception 'FORBIDDEN'; end if;
  if v_listing.status<>'active' then raise exception 'LISTING_NOT_ACTIVE'; end if;
  case p_tier when '6h' then v_cost:=15000;v_duration:=interval '6 hours'
    when '24h' then v_cost:=50000;v_duration:=interval '24 hours'
    when '72h' then v_cost:=120000;v_duration:=interval '72 hours'
    else raise exception 'INVALID_BOOST_TIER'; end case;
  v_balance:=private.spend_player_coins(v_player,v_cost,'market_listing_boost',jsonb_build_object('listingId',p_listing_id,'tier',p_tier));
  v_until:=greatest(now(),coalesce(v_listing.boosted_until,now()))+v_duration;
  update public.market_listings set boosted_until=v_until,boost_tier=p_tier,updated_at=now() where id=p_listing_id;
  return jsonb_build_object('ok',true,'listingId',p_listing_id,'tier',p_tier,'boostedUntil',v_until,'spentCoins',v_cost,'coins',v_balance);
end;
$$;

create or replace function public.boost_my_market_shop(p_tier text default '24h')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid(); v_cost bigint; v_duration interval; v_until timestamptz; v_balance bigint; v_username text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  case p_tier when '24h' then v_cost:=30000;v_duration:=interval '24 hours'
    when '72h' then v_cost:=80000;v_duration:=interval '72 hours'
    when '168h' then v_cost:=180000;v_duration:=interval '168 hours'
    else raise exception 'INVALID_SHOP_BOOST_TIER'; end case;
  v_balance:=private.spend_player_coins(v_player,v_cost,'market_shop_highlight',jsonb_build_object('tier',p_tier));
  select username into v_username from public.players where id=v_player;
  insert into public.player_shops(player_id,name,theme_style,highlight_until)
  values(v_player,left(v_username||' Card Shop',32),'guild',now()+v_duration)
  on conflict(player_id) do update set highlight_until=greatest(now(),coalesce(public.player_shops.highlight_until,now()))+v_duration,updated_at=now()
  returning highlight_until into v_until;
  return jsonb_build_object('ok',true,'highlightUntil',v_until,'tier',p_tier,'spentCoins',v_cost,'coins',v_balance);
end;
$$;

grant execute on function public.purchase_economy_item(text) to authenticated;
grant execute on function public.equip_economy_item(text) to authenticated;
grant execute on function public.purchase_trainer_prestige() to authenticated;
grant execute on function public.reroll_luxury_shop() to authenticated;
grant execute on function public.apply_card_economy_style(text,text) to authenticated;
grant execute on function public.apply_deck_economy_style(uuid,text) to authenticated;
grant execute on function public.upgrade_collection_museum() to authenticated;
grant execute on function public.set_collection_museum_card(integer,text) to authenticated;
grant execute on function public.boost_market_listing(uuid,text) to authenticated;
grant execute on function public.boost_my_market_shop(text) to authenticated;
