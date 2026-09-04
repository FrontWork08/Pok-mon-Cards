create table if not exists public.player_booster_luck (
  player_id uuid primary key references public.players(id) on delete cascade,
  lucky_2x_uses integer not null default 0 check (lucky_2x_uses >= 0 and lucky_2x_uses <= 100000),
  updated_at timestamptz not null default now()
);

alter table public.player_booster_luck enable row level security;
drop policy if exists player_booster_luck_select_own on public.player_booster_luck;
create policy player_booster_luck_select_own on public.player_booster_luck
for select to authenticated using (player_id = auth.uid());

create table if not exists public.player_gamepasses (
  player_id uuid not null references public.players(id) on delete cascade,
  gamepass_id text not null,
  active boolean not null default true,
  granted_by uuid references public.players(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note text,
  primary key (player_id, gamepass_id),
  constraint player_gamepasses_id_check check (gamepass_id in ('booster_auto_open'))
);

alter table public.player_gamepasses enable row level security;
drop policy if exists player_gamepasses_select_own on public.player_gamepasses;
create policy player_gamepasses_select_own on public.player_gamepasses
for select to authenticated using (player_id = auth.uid());

alter table public.economy_store_items drop constraint if exists economy_store_items_category_check;
alter table public.economy_store_items add constraint economy_store_items_category_check
check (category = any (array[
  'profile_frame'::text,'profile_background'::text,'card_style'::text,'deck_style'::text,
  'shop_theme'::text,'booster_fx'::text,'title'::text,'trophy'::text,'guild_decor'::text,'consumable'::text
]));

insert into public.economy_store_items(
  id,category,name,description,icon,price_coins,rarity,active,max_purchases_per_player,metadata,sort_order
) values (
  'lucky_2x_5','consumable','2× Lucky • 5 Boosters',
  'Dobra a força do peso de sorte das raridades altas nas próximas 5 aberturas de booster. Cada booster consome 1 carga.',
  'sparkles',20000,'rare',true,999,
  jsonb_build_object('effect','lucky_2x','charges',5,'consumable',true,'giftable',true),35
)
on conflict(id) do update set
  category=excluded.category,name=excluded.name,description=excluded.description,icon=excluded.icon,
  price_coins=excluded.price_coins,rarity=excluded.rarity,active=excluded.active,
  max_purchases_per_player=excluded.max_purchases_per_player,metadata=excluded.metadata,sort_order=excluded.sort_order;

create or replace function private.pack_quality_pull_multiplier(
  p_currency text,
  p_price bigint,
  p_cards_per_pack integer,
  p_rarity text
)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with base as (
    select case
      when public.rarity_tier(p_rarity)<4 then 1.00::numeric
      else least(
        1.45::numeric,
        (
          case
            when public.rarity_tier(p_rarity)>=7 then
              case
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.30
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.24
                else 1.18
              end
            when public.rarity_tier(p_rarity)>=6 then
              case
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.27
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.21
                else 1.16
              end
            when public.rarity_tier(p_rarity)>=5 then
              case
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.24
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.18
                else 1.14
              end
            else
              case
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.20
                when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500)
                  or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.15
                else 1.10
              end
          end
        ) * case when coalesce(p_cards_per_pack,0)<=4 then 1.12 else 1.00 end
      )
    end as multiplier
  )
  select case
    when public.rarity_tier(p_rarity)<4 then 1.00::numeric
    else multiplier * greatest(
      1::numeric,
      least(2::numeric,coalesce(nullif(current_setting('app.booster_lucky_multiplier',true),'')::numeric,1::numeric))
    )
  end
  from base;
$function$;

create or replace function private.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_normalized text;
  v_code public.redeem_codes%rowtype;
  v_uses integer;
  v_coins bigint;
  v_diamonds bigint;
  v_reward_coins bigint;
  v_reward_diamonds bigint;
  v_card_id text;
  v_card_quantity integer;
  v_lucky_uses integer;
  v_lucky_remaining integer;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  v_normalized := upper(regexp_replace(trim(coalesce(p_code,'')), '\s+', '', 'g'));
  if v_normalized !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'INVALID_CODE'; end if;

  select * into v_code from public.redeem_codes where code = v_normalized for update;
  if not found then raise exception 'CODE_NOT_FOUND'; end if;
  if not v_code.active then raise exception 'CODE_INACTIVE'; end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then raise exception 'CODE_EXPIRED'; end if;
  if exists(select 1 from public.code_redemptions where code_id=v_code.id and player_id=v_actor) then raise exception 'CODE_ALREADY_REDEEMED'; end if;

  select count(*) into v_uses from public.code_redemptions where code_id=v_code.id;
  if v_code.max_total_uses is not null and v_uses >= v_code.max_total_uses then raise exception 'CODE_LIMIT_REACHED'; end if;

  v_reward_coins := greatest(0,least(100000000,coalesce((v_code.reward->>'coins')::bigint,0)));
  v_reward_diamonds := greatest(0,least(1000000,coalesce((v_code.reward->>'diamonds')::bigint,0)));
  v_card_id := nullif(v_code.reward->>'cardId','');
  v_card_quantity := greatest(0,least(99,coalesce((v_code.reward->>'cardQuantity')::integer,0)));
  v_lucky_uses := greatest(0,least(10000,coalesce((v_code.reward->>'lucky2xUses')::integer,0)));

  if v_reward_coins=0 and v_reward_diamonds=0 and (v_card_id is null or v_card_quantity=0) and v_lucky_uses=0 then raise exception 'EMPTY_REWARD'; end if;
  if v_card_id is not null and not exists(select 1 from public.cards where id=v_card_id) then raise exception 'CARD_NOT_FOUND'; end if;

  update public.players set coins=coins+v_reward_coins,diamonds=diamonds+v_reward_diamonds
  where id=v_actor returning coins,diamonds into v_coins,v_diamonds;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_card_id is not null and v_card_quantity>0 then
    insert into public.player_cards(player_id,card_id,quantity) values(v_actor,v_card_id,v_card_quantity)
    on conflict(player_id,card_id) do update set quantity=public.player_cards.quantity+excluded.quantity;
  end if;

  if v_lucky_uses>0 then
    insert into public.player_booster_luck(player_id,lucky_2x_uses,updated_at)
    values(v_actor,v_lucky_uses,now())
    on conflict(player_id) do update
      set lucky_2x_uses=least(100000,public.player_booster_luck.lucky_2x_uses+excluded.lucky_2x_uses),updated_at=now()
    returning lucky_2x_uses into v_lucky_remaining;
  else
    select coalesce(lucky_2x_uses,0) into v_lucky_remaining from public.player_booster_luck where player_id=v_actor;
    v_lucky_remaining:=coalesce(v_lucky_remaining,0);
  end if;

  insert into public.code_redemptions(code_id,player_id,reward_snapshot) values(v_code.id,v_actor,v_code.reward);
  return jsonb_build_object('code',v_code.code,'reward',v_code.reward,'coins',v_coins,'diamonds',v_diamonds,'lucky2xRemaining',v_lucky_remaining);
exception
  when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_REWARD';
end;
$function$;

create or replace function public.purchase_economy_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_owned integer:=0;
  v_balance bigint;
  v_theme text;
  v_username text;
  v_charges integer:=0;
  v_lucky_remaining integer:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_item from public.economy_store_items
  where id=p_item_id and active=true and (limited_starts_at is null or limited_starts_at<=now()) and (limited_ends_at is null or limited_ends_at>now());
  if not found then raise exception 'ITEM_NOT_AVAILABLE'; end if;
  if coalesce((v_item.metadata->>'notForDirectSale')::boolean,false) then raise exception 'ITEM_NOT_FOR_SALE'; end if;
  if coalesce((v_item.metadata->>'luxuryOnly')::boolean,false)
    and not exists(select 1 from private.current_luxury_rotation_ids(v_player) x where x=v_item.id)
  then raise exception 'ITEM_NOT_IN_LUXURY_ROTATION'; end if;

  select coalesce(quantity,0) into v_owned from public.player_economy_items where player_id=v_player and item_id=v_item.id for update;
  if not found then v_owned:=0; end if;
  if v_owned>=v_item.max_purchases_per_player then raise exception 'ITEM_ALREADY_OWNED'; end if;

  v_balance:=private.spend_player_coins(v_player,v_item.price_coins,'store_purchase',jsonb_build_object('itemId',v_item.id,'category',v_item.category,'name',v_item.name));
  insert into public.player_economy_items(player_id,item_id,quantity,purchased_at) values(v_player,v_item.id,1,now())
  on conflict(player_id,item_id) do update set quantity=public.player_economy_items.quantity+1,purchased_at=now();

  if v_item.category in ('profile_frame','profile_background') then
    insert into public.player_cosmetics(player_id,cosmetic_id)
    values(v_player,coalesce(v_item.metadata->>'cosmeticId',v_item.id)) on conflict(player_id,cosmetic_id) do nothing;
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
  elsif v_item.category='consumable' and v_item.metadata->>'effect'='lucky_2x' then
    v_charges:=greatest(1,least(1000,coalesce((v_item.metadata->>'charges')::integer,1)));
    insert into public.player_booster_luck(player_id,lucky_2x_uses,updated_at)
    values(v_player,v_charges,now())
    on conflict(player_id) do update
      set lucky_2x_uses=least(100000,public.player_booster_luck.lucky_2x_uses+excluded.lucky_2x_uses),updated_at=now()
    returning lucky_2x_uses into v_lucky_remaining;
  end if;

  return jsonb_build_object('ok',true,'itemId',v_item.id,'category',v_item.category,'coins',v_balance,'ownedQuantity',v_owned+1,'lucky2xRemaining',v_lucky_remaining);
end;
$function$;

create or replace function public.gift_trainer_store_item(p_item_id text,p_recipient_id uuid,p_message text default '')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sender uuid:=auth.uid();
  v_item public.economy_store_items%rowtype;
  v_recipient_owned integer:=0;
  v_balance bigint;
  v_sender_name text;
  v_recipient_name text;
  v_message text:=left(trim(coalesce(p_message,'')),180);
  v_gift_id uuid;
  v_cosmetic_id text;
  v_charges integer:=0;
begin
  if v_sender is null then raise exception 'UNAUTHORIZED'; end if;
  if p_recipient_id is null or p_recipient_id=v_sender then raise exception 'INVALID_GIFT_RECIPIENT'; end if;
  if not exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=v_sender and f.addressee_id=p_recipient_id) or (f.requester_id=p_recipient_id and f.addressee_id=v_sender))) then raise exception 'GIFT_RECIPIENT_NOT_FRIEND'; end if;
  select username into v_sender_name from public.players where id=v_sender and account_status='active'; if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
  select username into v_recipient_name from public.players where id=p_recipient_id and account_status='active'; if not found then raise exception 'GIFT_RECIPIENT_NOT_AVAILABLE'; end if;
  select * into v_item from public.economy_store_items where id=p_item_id and active=true and (limited_starts_at is null or limited_starts_at<=now()) and (limited_ends_at is null or limited_ends_at>now());
  if not found then raise exception 'ITEM_NOT_AVAILABLE'; end if;
  if coalesce((v_item.metadata->>'notForDirectSale')::boolean,false) then raise exception 'ITEM_NOT_GIFTABLE'; end if;
  if coalesce((v_item.metadata->>'luxuryOnly')::boolean,false) and not exists(select 1 from private.current_luxury_rotation_ids(v_sender) x where x=v_item.id) then raise exception 'ITEM_NOT_IN_LUXURY_ROTATION'; end if;
  select coalesce(quantity,0) into v_recipient_owned from public.player_economy_items where player_id=p_recipient_id and item_id=v_item.id for update; if not found then v_recipient_owned:=0; end if;
  if v_recipient_owned>=v_item.max_purchases_per_player then raise exception 'GIFT_RECIPIENT_ALREADY_OWNS'; end if;

  v_balance:=private.spend_player_coins(v_sender,v_item.price_coins,'store_gift',jsonb_build_object('itemId',v_item.id,'category',v_item.category,'name',v_item.name,'recipientId',p_recipient_id,'recipientName',v_recipient_name));
  insert into public.player_economy_items(player_id,item_id,quantity,purchased_at) values(p_recipient_id,v_item.id,1,now())
  on conflict(player_id,item_id) do update set quantity=public.player_economy_items.quantity+1,purchased_at=now();

  if v_item.category in ('profile_frame','profile_background') then
    v_cosmetic_id:=coalesce(v_item.metadata->>'cosmeticId',v_item.id);
    insert into public.player_cosmetics(player_id,cosmetic_id) values(p_recipient_id,v_cosmetic_id) on conflict(player_id,cosmetic_id) do nothing;
  elsif v_item.category='consumable' and v_item.metadata->>'effect'='lucky_2x' then
    v_charges:=greatest(1,least(1000,coalesce((v_item.metadata->>'charges')::integer,1)));
    insert into public.player_booster_luck(player_id,lucky_2x_uses,updated_at) values(p_recipient_id,v_charges,now())
    on conflict(player_id) do update set lucky_2x_uses=least(100000,public.player_booster_luck.lucky_2x_uses+excluded.lucky_2x_uses),updated_at=now();
  end if;

  insert into public.trainer_store_gifts(sender_id,recipient_id,item_id,price_coins,message)
  values(v_sender,p_recipient_id,v_item.id,v_item.price_coins,v_message) returning id into v_gift_id;
  insert into public.notifications(player_id,type,title,body,metadata)
  values(
    p_recipient_id,'store_gift','🎁 Você recebeu um presente!',
    case when v_message<>'' then '@'||v_sender_name||' enviou '||v_item.name||'. Recado: “'||v_message||'”' else '@'||v_sender_name||' enviou '||v_item.name||' para você.' end,
    jsonb_build_object('route','/store','giftId',v_gift_id,'senderId',v_sender,'senderName',v_sender_name,'itemId',v_item.id,'itemName',v_item.name,'itemIcon',v_item.icon,'itemRarity',v_item.rarity,'giftMessage',v_message,'type','store_gift')
  );
  return jsonb_build_object('ok',true,'giftId',v_gift_id,'recipientId',p_recipient_id,'recipientName',v_recipient_name,'itemId',v_item.id,'itemName',v_item.name,'spentCoins',v_item.price_coins,'coins',v_balance,'message',v_message);
end;
$function$;

create or replace function public.server_idempotent_open_pack(p_player_id uuid,p_pack_id uuid,p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_scope text:='open_pack:'||p_pack_id::text;
  v_lucky_before integer:=0;
  v_lucky_after integer:=0;
  v_lucky_used boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations where player_id=p_player_id and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;

  insert into public.player_booster_luck(player_id,lucky_2x_uses) values(p_player_id,0) on conflict(player_id) do nothing;
  select lucky_2x_uses into v_lucky_before from public.player_booster_luck where player_id=p_player_id for update;
  v_lucky_used:=coalesce(v_lucky_before,0)>0;
  perform set_config('app.booster_lucky_multiplier',case when v_lucky_used then '2' else '1' end,true);

  v_result:=public.server_open_pack(p_player_id,p_pack_id);
  if v_lucky_used then
    update public.player_booster_luck set lucky_2x_uses=greatest(0,lucky_2x_uses-1),updated_at=now()
    where player_id=p_player_id returning lucky_2x_uses into v_lucky_after;
  else
    v_lucky_after:=coalesce(v_lucky_before,0);
  end if;

  update public.pack_openings
  set pricing_context=coalesce(pricing_context,'{}'::jsonb)||jsonb_build_object(
    'lucky2xApplied',v_lucky_used,'luckyMultiplier',case when v_lucky_used then 2 else 1 end,'luckyRemaining',v_lucky_after
  )
  where id=nullif(v_result->>'openingId','')::uuid;

  v_result:=v_result||jsonb_build_object('lucky2xApplied',v_lucky_used,'luckyMultiplier',case when v_lucky_used then 2 else 1 end,'lucky2xRemaining',v_lucky_after);
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(p_player_id,v_scope,p_operation_id,v_result);
  return v_result;
end;
$function$;

create or replace function public.server_idempotent_auto_open_packs(p_player_id uuid,p_pack_id uuid,p_quantity integer,p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_scope text;
  v_saved jsonb;
  v_result jsonb;
  v_cards jsonb:='[]'::jsonb;
  v_i integer;
  v_lucky integer:=0;
  v_lucky_used boolean;
  v_lucky_used_count integer:=0;
  v_total_coins bigint:=0;
  v_total_diamonds integer:=0;
  v_currency text;
  v_price bigint;
  v_last_coins bigint;
  v_last_diamonds integer;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>50 then raise exception 'INVALID_AUTO_OPEN_QUANTITY'; end if;
  if not exists(select 1 from public.player_gamepasses g where g.player_id=p_player_id and g.gamepass_id='booster_auto_open' and g.active=true) then raise exception 'AUTO_OPEN_GAMEPASS_REQUIRED'; end if;
  if not exists(select 1 from public.packs p where p.id=p_pack_id and p.active=true) then raise exception 'PACK_NOT_FOUND'; end if;

  v_scope:='auto_open:'||p_pack_id::text||':'||p_quantity::text;
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_saved from private.idempotency_operations where player_id=p_player_id and scope=v_scope and operation_id=p_operation_id;
  if found then return v_saved; end if;

  insert into public.player_booster_luck(player_id,lucky_2x_uses) values(p_player_id,0) on conflict(player_id) do nothing;
  select lucky_2x_uses into v_lucky from public.player_booster_luck where player_id=p_player_id for update;

  for v_i in 1..p_quantity loop
    v_lucky_used:=v_lucky>0;
    perform set_config('app.booster_lucky_multiplier',case when v_lucky_used then '2' else '1' end,true);
    v_result:=public.server_open_pack(p_player_id,p_pack_id);
    v_currency:=coalesce(v_result->>'currency','coins');
    v_price:=coalesce((v_result->>'pricePaid')::bigint,0);
    if v_currency='diamonds' then v_total_diamonds:=v_total_diamonds+v_price::integer; else v_total_coins:=v_total_coins+v_price; end if;
    v_cards:=v_cards||coalesce(v_result->'cards','[]'::jsonb);
    v_last_coins:=coalesce((v_result->>'coins')::bigint,v_last_coins);
    v_last_diamonds:=coalesce((v_result->>'diamonds')::integer,v_last_diamonds);
    if v_lucky_used then
      v_lucky:=v_lucky-1;
      v_lucky_used_count:=v_lucky_used_count+1;
    end if;
    update public.pack_openings
    set pricing_context=coalesce(pricing_context,'{}'::jsonb)||jsonb_build_object(
      'autoOpen',true,'autoOpenBatchId',p_operation_id,'autoOpenIndex',v_i,
      'lucky2xApplied',v_lucky_used,'luckyMultiplier',case when v_lucky_used then 2 else 1 end
    )
    where id=nullif(v_result->>'openingId','')::uuid;
  end loop;

  update public.player_booster_luck set lucky_2x_uses=v_lucky,updated_at=now() where player_id=p_player_id;
  v_saved:=jsonb_build_object(
    'batchId',p_operation_id,'packId',p_pack_id,'quantity',p_quantity,'cards',v_cards,
    'totalCoinsSpent',v_total_coins,'totalDiamondsSpent',v_total_diamonds,
    'coins',v_last_coins,'diamonds',v_last_diamonds,
    'lucky2xUsedCount',v_lucky_used_count,'lucky2xRemaining',v_lucky
  );
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(p_player_id,v_scope,p_operation_id,v_saved);
  return v_saved;
end;
$function$;

revoke all on function public.server_idempotent_auto_open_packs(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.server_idempotent_auto_open_packs(uuid,uuid,integer,uuid) to service_role;

create or replace function public.get_my_booster_perks()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_lucky integer:=0;
  v_auto boolean:=false;
  v_owner text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(lucky_2x_uses,0) into v_lucky from public.player_booster_luck where player_id=v_player;
  v_lucky:=coalesce(v_lucky,0);
  select exists(select 1 from public.player_gamepasses where player_id=v_player and gamepass_id='booster_auto_open' and active=true) into v_auto;
  select p.username into v_owner
  from public.admin_members a join public.players p on p.id=a.player_id
  where a.role='owner' order by a.created_at limit 1;
  return jsonb_build_object(
    'lucky2xUses',v_lucky,'autoOpenGamepass',v_auto,
    'purchaseMethod','manual_real_money','contactOwnerUsername',v_owner,'maxAutoOpenQuantity',50
  );
end;
$function$;

grant execute on function public.get_my_booster_perks() to authenticated;

create or replace function public.server_owner_set_booster_auto_gamepass(p_actor_id uuid,p_target_ids uuid[],p_enabled boolean,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer:=0;
  v_items jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id and role='owner') then raise exception 'OWNER_ONLY'; end if;
  if coalesce(array_length(p_target_ids,1),0)<1 or array_length(p_target_ids,1)>100 then raise exception 'INVALID_TARGETS'; end if;
  if exists(select 1 from unnest(p_target_ids) t(id) left join public.players p on p.id=t.id where p.id is null) then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.player_gamepasses(player_id,gamepass_id,active,granted_by,granted_at,updated_at,note)
  select distinct id,'booster_auto_open',coalesce(p_enabled,false),p_actor_id,now(),now(),left(nullif(trim(coalesce(p_note,'')),''),300)
  from unnest(p_target_ids) t(id)
  on conflict(player_id,gamepass_id) do update set
    active=excluded.active,granted_by=excluded.granted_by,
    granted_at=case when excluded.active then now() else public.player_gamepasses.granted_at end,
    updated_at=now(),note=excluded.note;

  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'active',coalesce(p_enabled,false)) order by p.username),'[]'::jsonb)
  into v_count,v_items from public.players p where p.id=any(p_target_ids);
  return jsonb_build_object('gamepassId','booster_auto_open','enabled',coalesce(p_enabled,false),'recipientCount',v_count,'recipients',v_items);
end;
$function$;

revoke all on function public.server_owner_set_booster_auto_gamepass(uuid,uuid[],boolean,text) from public,anon,authenticated;
grant execute on function public.server_owner_set_booster_auto_gamepass(uuid,uuid[],boolean,text) to service_role;

create or replace function public.server_owner_list_booster_auto_gamepasses(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.admin_members where player_id=p_actor_id and role='owner') then raise exception 'OWNER_ONLY'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'playerId',g.player_id,'username',p.username,'active',g.active,
      'grantedAt',g.granted_at,'updatedAt',g.updated_at,'note',g.note
    ) order by p.username)
    from public.player_gamepasses g join public.players p on p.id=g.player_id
    where g.gamepass_id='booster_auto_open'
  ),'[]'::jsonb);
end;
$function$;

revoke all on function public.server_owner_list_booster_auto_gamepasses(uuid) from public,anon,authenticated;
grant execute on function public.server_owner_list_booster_auto_gamepasses(uuid) to service_role;
