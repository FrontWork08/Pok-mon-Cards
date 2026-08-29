-- Increase mission / battle-pass coin rewards and add secure duplicate-card sales.
-- Duplicate-sale rate: US$ 0.50 = 100 Coins; US$ 1.00 = 200 Coins.
-- One copy of each card is always protected in the player's collection.

create table if not exists private.card_duplicate_sales (
  id bigserial primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_market_price_usd numeric(14,2) not null check (unit_market_price_usd > 0),
  unit_coins bigint not null check (unit_coins > 0),
  total_coins bigint not null check (total_coins > 0),
  created_at timestamptz not null default now()
);

create index if not exists card_duplicate_sales_player_created_idx
  on private.card_duplicate_sales(player_id, created_at desc);

create index if not exists card_duplicate_sales_card_idx
  on private.card_duplicate_sales(card_id);

create or replace function public.sell_duplicate_cards(
  p_card_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid := auth.uid();
  v_inventory integer;
  v_market_price numeric;
  v_unit_coins bigint;
  v_total_coins bigint;
  v_new_balance bigint;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_card_id is null or btrim(p_card_id) = '' or p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    raise exception 'INVALID_SALE';
  end if;

  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then
    raise exception 'APP_MAINTENANCE';
  end if;

  perform 1 from public.players
  where id=v_player_id and account_status='active'
  for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  select pc.quantity, c.market_price_usd
    into v_inventory, v_market_price
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  where pc.player_id=v_player_id and pc.card_id=p_card_id
  for update of pc;

  if not found then raise exception 'CARD_NOT_OWNED'; end if;
  if v_market_price is null or v_market_price <= 0 then raise exception 'CARD_WITHOUT_MARKET_PRICE'; end if;
  if v_inventory <= 1 then raise exception 'NO_DUPLICATES'; end if;
  if p_quantity > (v_inventory - 1) then raise exception 'KEEP_ONE_COPY'; end if;

  v_unit_coins := greatest(10, round((v_market_price * 200) / 10.0) * 10)::bigint;
  v_total_coins := v_unit_coins * p_quantity;

  update public.player_cards
  set quantity=quantity-p_quantity
  where player_id=v_player_id and card_id=p_card_id;

  update public.players
  set coins=coins+v_total_coins
  where id=v_player_id
  returning coins into v_new_balance;

  insert into private.card_duplicate_sales(
    player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins
  )
  values(v_player_id,p_card_id,p_quantity,v_market_price,v_unit_coins,v_total_coins);

  perform private.battle_pass_record_event(v_player_id,'market_sell',1);

  return jsonb_build_object(
    'ok',true,
    'cardId',p_card_id,
    'quantitySold',p_quantity,
    'remainingQuantity',v_inventory-p_quantity,
    'marketPriceUsd',v_market_price,
    'unitCoins',v_unit_coins,
    'coinsEarned',v_total_coins,
    'coins',v_new_balance
  );
end;
$$;

revoke all on function public.sell_duplicate_cards(text,integer)
from public, anon, authenticated;
grant execute on function public.sell_duplicate_cards(text,integer) to authenticated;

create or replace function private.calculate_mission_progress(
  p_player_id uuid,
  p_event_type text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_progress bigint:=0;
begin
  case p_event_type
    when 'pack_opened' then
      select count(*) into v_progress from public.pack_openings
      where player_id=p_player_id and opened_at>=p_period_start and opened_at<p_period_end;
    when 'battle_completed' then
      select count(*) into v_progress from public.battles
      where status='completed' and completed_at>=p_period_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'battle_won' then
      select count(*) into v_progress from public.battles
      where status='completed' and winner_id=p_player_id and completed_at>=p_period_start and completed_at<p_period_end;
    when 'ranked_match' then
      select count(*) into v_progress from public.battles
      where status='completed' and is_ranked and completed_at>=p_period_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'ranked_win' then
      select count(*) into v_progress from public.battles
      where status='completed' and is_ranked and winner_id=p_player_id
        and completed_at>=p_period_start and completed_at<p_period_end;
    when 'trade_completed' then
      select count(*) into v_progress from public.trades
      where status='completed' and updated_at>=p_period_start and updated_at<p_period_end
        and (sender_id=p_player_id or receiver_id=p_player_id);
    when 'market_listing' then
      select count(*) into v_progress from public.market_listings
      where seller_id=p_player_id and created_at>=p_period_start and created_at<p_period_end;
    when 'market_sale' then
      select
        (select count(*) from public.market_listings
         where seller_id=p_player_id and status='sold'
           and sold_at>=p_period_start and sold_at<p_period_end)
        +
        (select count(*) from private.card_duplicate_sales
         where player_id=p_player_id
           and created_at>=p_period_start and created_at<p_period_end)
      into v_progress;
    when 'card_discovered' then
      select count(*) into v_progress from public.player_cards
      where player_id=p_player_id and first_obtained_at>=p_period_start and first_obtained_at<p_period_end;
    else v_progress:=0;
  end case;
  return least(v_progress,2147483647)::integer;
end;
$$;

update public.mission_definitions_v2
set reward_coins = case id
  when 'd_open_1' then 1400
  when 'd_open_3' then 3600
  when 'd_battle_2' then 3000
  when 'd_ranked_1' then 2600
  when 'd_win_1' then 4200
  when 'd_trade_1' then 3000
  when 'd_list_1' then 2200
  when 'w_open_15' then 24000
  when 'w_battle_10' then 19200
  when 'w_ranked_5' then 21600
  when 'w_ranked_win_3' then 28800
  when 'w_win_5' then 30000
  when 'w_trade_3' then 21600
  when 'w_sales_2' then 18000
  when 'w_collect_20' then 26400
  else reward_coins
end,
updated_at=now()
where id in (
  'd_open_1','d_open_3','d_battle_2','d_ranked_1','d_win_1','d_trade_1','d_list_1',
  'w_open_15','w_battle_10','w_ranked_5','w_ranked_win_3','w_win_5','w_trade_3','w_sales_2','w_collect_20'
);

with next_rewards as (
  select
    d.season_id,
    d.level,
    d.track,
    (round((((1490 + (20 * d.level))::numeric) * 1.20) / 50.0) * 50)::bigint as new_coins
  from public.battle_pass_reward_definitions d
  where d.season_id='season_2026_01'
    and d.reward ? 'coins'
)
update public.battle_pass_reward_definitions d
set reward=jsonb_set(d.reward,'{coins}',to_jsonb(n.new_coins),true),
    label=regexp_replace(d.label,'^🪙 [0-9]+','🪙 ' || n.new_coins::text)
from next_rewards n
where d.season_id=n.season_id and d.level=n.level and d.track=n.track;
