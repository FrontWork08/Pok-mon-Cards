-- Further lower coin booster prices without changing diamond prices.
-- Optimize "sell all duplicates" to handle large collections atomically.
-- Keep price-aware pull-quality bands aligned with the lower coin prices.

update public.economy_policy
set coin_pack_ceiling=60000,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'boosterPriceMultiplier',0.60,
      'boosterCoinPriceMultiplier',0.60,
      'boosterDiamondPriceMultiplier',0.90,
      'boosterCoinPriceRelief','2026-09-01-more',
      'coinPackFloor',3000,
      'diamondPackFloor',15
    ),
    updated_at=now()
where id=1;

create or replace function private.refresh_pack_economy()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_size_rows integer:=0; v_price_rows integer:=0;
begin
  update public.packs p
  set cards_per_pack=private.recommended_pack_card_count(p.set_id,p.cards_per_pack)
  where p.active and private.recommended_pack_card_count(p.set_id,p.cards_per_pack)<p.cards_per_pack;
  get diagnostics v_size_rows=row_count;

  with pack_values as (
    select
      p.id,
      p.cards_per_pack,
      coalesce(max(c.market_price_usd),0)::numeric as max_card_usd,
      private.pack_expected_value_usd(p.set_id,p.cards_per_pack) as expected_value_usd
    from public.packs p
    left join public.cards c on c.set_id=p.set_id
    where p.active
    group by p.id,p.set_id,p.cards_per_pack
  ), standard as (
    select *,
      case when max_card_usd>=980 then 'diamonds' else 'coins' end as currency,
      case
        when max_card_usd>=5000 then 100
        when max_card_usd>=4000 then 90
        when max_card_usd>=3000 then 75
        when max_card_usd>=2000 then 60
        when max_card_usd>=1500 then 45
        when max_card_usd>=1250 then 35
        when max_card_usd>=1000 then 25
        when max_card_usd>=980 then 15
        when max_card_usd>=800 then 50000
        when max_card_usd>=700 then 40000
        when max_card_usd>=600 then 30000
        when max_card_usd>=500 then 25000
        when max_card_usd>=400 then 20000
        when max_card_usd>=300 then 16000
        when max_card_usd>=200 then 12000
        when max_card_usd>=100 then 8000
        else 5000
      end::bigint as standard_price
    from pack_values
  ), base_price as (
    select
      id,
      currency,
      case
        when currency='diamonds' then standard_price
        else least(
          100000::bigint,
          greatest(
            5000::bigint,
            standard_price,
            (ceil((coalesce(expected_value_usd,0)*500)/1000.0)*1000)::bigint
          )
        )
      end::bigint as undiscounted_price
    from standard
  ), priced as (
    select
      id,
      currency,
      case
        when currency='diamonds' then
          greatest(15::bigint,round(undiscounted_price::numeric*0.90)::bigint)
        else
          greatest(
            3000::bigint,
            (round((undiscounted_price::numeric*0.60)/500.0)*500)::bigint
          )
      end::bigint as price
    from base_price
  )
  update public.packs p
  set currency=x.currency,
      price=x.price
  from priced x
  where p.id=x.id
    and (p.currency is distinct from x.currency or p.price is distinct from x.price);

  get diagnostics v_price_rows=row_count;
  return v_size_rows+v_price_rows;
end;
$$;

create or replace function private.pack_quality_pull_multiplier(
  p_currency text,
  p_price bigint,
  p_cards_per_pack integer,
  p_rarity text
)
returns numeric
language sql
immutable
parallel safe
set search_path=''
as $$
  select case
    when public.rarity_tier(p_rarity)<4 then 1.00::numeric
    else least(
      1.45::numeric,
      (
        case
          when public.rarity_tier(p_rarity)>=7 then
            case
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=40000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=60) then 1.30
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=30) then 1.24
              else 1.18
            end
          when public.rarity_tier(p_rarity)>=6 then
            case
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=40000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=60) then 1.27
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=30) then 1.21
              else 1.16
            end
          when public.rarity_tier(p_rarity)>=5 then
            case
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=40000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=60) then 1.24
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=30) then 1.18
              else 1.14
            end
          else
            case
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=40000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=60) then 1.20
              when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000)
                or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=30) then 1.15
              else 1.10
            end
        end
      )
      * case when coalesce(p_cards_per_pack,0)<=4 then 1.12 else 1.00 end
    )
  end;
$$;

create or replace function public.sell_all_duplicate_cards()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid:=auth.uid();
  v_total_coins bigint:=0;
  v_total_quantity bigint:=0;
  v_unique_sold integer:=0;
  v_skipped_unique integer:=0;
  v_skipped_copies bigint:=0;
  v_new_balance bigint:=0;
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

  with owned as materialized (
    select
      pc.card_id,
      pc.quantity,
      c.set_id,
      c.rarity,
      c.market_price_usd,
      public.rarity_tier(c.rarity) as rarity_tier,
      public.rarity_pull_weight(c.rarity) as rarity_weight
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player_id
      and pc.quantity>1
    for update of pc
  ),
  owned_sets as materialized (
    select distinct set_id from owned
  ),
  set_rare_totals as materialized (
    select
      c.set_id,
      sum(public.rarity_pull_weight(c.rarity))
        filter(where public.rarity_tier(c.rarity)>=3) as rare_weight_total
    from public.cards c
    join owned_sets s on s.set_id=c.set_id
    group by c.set_id
  ),
  set_caps as materialized (
    select
      p.set_id,
      min(ceil(p.price::numeric*1.5))::bigint as coin_pack_cap
    from public.packs p
    join owned_sets s on s.set_id=p.set_id
    where p.active=true and p.currency='coins'
    group by p.set_id
  ),
  quoted as materialized (
    select
      o.*,
      greatest(o.quantity-1,0)::integer as sale_quantity,
      private.duplicate_sale_base_value(o.market_price_usd) as base_coins,
      private.duplicate_sale_rarity_multiplier(o.rarity) as rarity_multiplier,
      case
        when o.rarity_tier>=3 and rt.rare_weight_total>0
          then o.rarity_weight/rt.rare_weight_total
        else null
      end as drop_chance,
      cap.coin_pack_cap
    from owned o
    left join set_rare_totals rt on rt.set_id=o.set_id
    left join set_caps cap on cap.set_id=o.set_id
  ),
  multiplied as materialized (
    select
      q.*,
      case
        when rarity_tier<=1 then 0.80
        when rarity_tier=2 then 0.90
        when drop_chance>=0.05 then 0.85
        when drop_chance>=0.02 then 1.00
        when drop_chance>=0.01 then 1.10
        when drop_chance>=0.005 then 1.20
        when drop_chance>=0.002 then 1.35
        when drop_chance>=0.001 then 1.50
        when drop_chance>=0.0005 then 1.70
        else 2.00
      end::numeric as drop_multiplier
    from quoted q
  ),
  final_quotes as materialized (
    select
      m.*,
      case
        when market_price_usd is null or market_price_usd<=0 then 0::bigint
        else least(
          greatest(
            10,
            round((base_coins*rarity_multiplier*drop_multiplier)/10.0)*10
          )::bigint,
          coalesce(coin_pack_cap,9223372036854775807::bigint)
        )
      end as unit_coins
    from multiplied m
  ),
  sellable as materialized (
    select *
    from final_quotes
    where sale_quantity>0 and unit_coins>0
  ),
  skipped as materialized (
    select
      count(*)::integer as skipped_unique,
      coalesce(sum(sale_quantity),0)::bigint as skipped_copies
    from final_quotes
    where sale_quantity>0 and unit_coins<=0
  ),
  updated as (
    update public.player_cards pc
    set quantity=1
    from sellable s
    where pc.player_id=v_player_id
      and pc.card_id=s.card_id
      and pc.quantity>1
    returning pc.card_id
  ),
  logged as (
    insert into private.card_duplicate_sales(
      player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins,
      rarity_tier,rarity_multiplier,drop_chance_pct,drop_multiplier,coin_pack_cap
    )
    select
      v_player_id,
      s.card_id,
      s.sale_quantity,
      s.market_price_usd,
      s.unit_coins,
      s.unit_coins*s.sale_quantity,
      s.rarity_tier,
      s.rarity_multiplier,
      case when s.drop_chance is null then null else s.drop_chance*100 end,
      s.drop_multiplier,
      s.coin_pack_cap
    from sellable s
    join updated u on u.card_id=s.card_id
    returning quantity,total_coins
  ),
  totals as (
    select
      count(*)::integer as unique_sold,
      coalesce(sum(quantity),0)::bigint as total_quantity,
      coalesce(sum(total_coins),0)::bigint as total_coins
    from logged
  )
  select
    t.unique_sold,
    t.total_quantity,
    t.total_coins,
    s.skipped_unique,
    s.skipped_copies
  into
    v_unique_sold,
    v_total_quantity,
    v_total_coins,
    v_skipped_unique,
    v_skipped_copies
  from totals t
  cross join skipped s;

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

select private.refresh_pack_economy();
