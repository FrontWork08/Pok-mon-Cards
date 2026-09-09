create table if not exists private.card_set_sale_stats (
  set_id text primary key,
  rare_weight_total numeric not null default 0 check (rare_weight_total >= 0),
  refreshed_at timestamptz not null default now()
);

revoke all on table private.card_set_sale_stats from public, anon, authenticated;
grant select, insert, update, delete on table private.card_set_sale_stats to service_role;

insert into private.card_set_sale_stats(set_id,rare_weight_total,refreshed_at)
select
  c.set_id,
  coalesce(sum(public.rarity_pull_weight(c.rarity)) filter(where public.rarity_tier(c.rarity)>=3),0)::numeric,
  now()
from public.cards c
group by c.set_id
on conflict(set_id) do update
set rare_weight_total=excluded.rare_weight_total,
    refreshed_at=excluded.refreshed_at;

create or replace function private.card_sale_rare_weight(p_rarity text)
returns numeric
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select case
    when public.rarity_tier(p_rarity)>=3 then public.rarity_pull_weight(p_rarity)
    else 0::numeric
  end;
$function$;

create or replace function private.maintain_card_set_sale_stats()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old_weight numeric:=0;
  v_new_weight numeric:=0;
begin
  if tg_op='INSERT' then
    if new.set_id is not null then
      v_new_weight:=private.card_sale_rare_weight(new.rarity);
      insert into private.card_set_sale_stats(set_id,rare_weight_total,refreshed_at)
      values(new.set_id,v_new_weight,now())
      on conflict(set_id) do update
      set rare_weight_total=greatest(0,private.card_set_sale_stats.rare_weight_total+excluded.rare_weight_total),
          refreshed_at=now();
    end if;
    return new;
  elsif tg_op='DELETE' then
    if old.set_id is not null then
      v_old_weight:=private.card_sale_rare_weight(old.rarity);
      update private.card_set_sale_stats
      set rare_weight_total=greatest(0,rare_weight_total-v_old_weight),refreshed_at=now()
      where set_id=old.set_id;
    end if;
    return old;
  end if;

  if old.set_id is distinct from new.set_id or old.rarity is distinct from new.rarity then
    if old.set_id is not null then
      v_old_weight:=private.card_sale_rare_weight(old.rarity);
      update private.card_set_sale_stats
      set rare_weight_total=greatest(0,rare_weight_total-v_old_weight),refreshed_at=now()
      where set_id=old.set_id;
    end if;
    if new.set_id is not null then
      v_new_weight:=private.card_sale_rare_weight(new.rarity);
      insert into private.card_set_sale_stats(set_id,rare_weight_total,refreshed_at)
      values(new.set_id,v_new_weight,now())
      on conflict(set_id) do update
      set rare_weight_total=greatest(0,private.card_set_sale_stats.rare_weight_total+excluded.rare_weight_total),
          refreshed_at=now();
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists cards_sale_stats_insert on public.cards;
drop trigger if exists cards_sale_stats_update on public.cards;
drop trigger if exists cards_sale_stats_delete on public.cards;

create trigger cards_sale_stats_insert
after insert on public.cards
for each row execute function private.maintain_card_set_sale_stats();

create trigger cards_sale_stats_update
after update of set_id,rarity on public.cards
for each row execute function private.maintain_card_set_sale_stats();

create trigger cards_sale_stats_delete
after delete on public.cards
for each row execute function private.maintain_card_set_sale_stats();

create or replace function private.duplicate_sale_drop_chance(p_card_id text)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select case
    when public.rarity_tier(c.rarity)<3 then null
    else public.rarity_pull_weight(c.rarity)/nullif(s.rare_weight_total,0)
  end
  from public.cards c
  left join private.card_set_sale_stats s on s.set_id=c.set_id
  where c.id=p_card_id;
$function$;

create or replace function private.duplicate_sale_drop_multiplier(p_card_id text)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with target as (
    select
      public.rarity_tier(c.rarity) as tier,
      case
        when public.rarity_tier(c.rarity)<3 then null
        else public.rarity_pull_weight(c.rarity)/nullif(s.rare_weight_total,0)
      end as chance
    from public.cards c
    left join private.card_set_sale_stats s on s.set_id=c.set_id
    where c.id=p_card_id
  )
  select case
    when tier<=1 then 0.80
    when tier=2 then 0.90
    when chance>=0.05 then 0.85
    when chance>=0.02 then 1.00
    when chance>=0.01 then 1.10
    when chance>=0.005 then 1.20
    when chance>=0.002 then 1.35
    when chance>=0.001 then 1.50
    when chance>=0.0005 then 1.70
    else 2.00
  end::numeric
  from target;
$function$;

create or replace function public.get_my_duplicate_sale_cards()
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  with me as (
    select auth.uid() as player_id
  ),
  owned as (
    select
      pc.quantity,
      c.id,c.pokemon_name,c.set_name,c.set_id,c.rarity,c.image_small,
      c.market_price_usd,c.market_price_source,
      public.rarity_tier(c.rarity) as rarity_tier,
      public.rarity_pull_weight(c.rarity) as rarity_weight,
      s.rare_weight_total
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    left join private.card_set_sale_stats s on s.set_id=c.set_id
    cross join me
    where me.player_id is not null
      and pc.player_id=me.player_id
      and pc.quantity>1
  ),
  owned_sets as (
    select distinct set_id from owned
  ),
  set_caps as (
    select p.set_id,min(ceil(p.price::numeric*1.5))::bigint as coin_pack_cap
    from public.packs p
    join owned_sets s on s.set_id=p.set_id
    where p.active=true and p.currency='coins'
    group by p.set_id
  ),
  quoted as (
    select
      o.*,
      private.duplicate_sale_base_value(o.market_price_usd) as base_coins,
      private.duplicate_sale_rarity_multiplier(o.rarity) as rarity_multiplier,
      case
        when o.rarity_tier>=3 and o.rare_weight_total>0
        then o.rarity_weight/o.rare_weight_total
        else null
      end as drop_chance,
      cap.coin_pack_cap
    from owned o
    left join set_caps cap on cap.set_id=o.set_id
  ),
  multiplied as (
    select q.*,
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
  final_quotes as (
    select m.*,
      case
        when market_price_usd is null or market_price_usd<=0 then 0
        else least(
          greatest(10,round((base_coins*rarity_multiplier*drop_multiplier)/10.0)*10)::bigint,
          coalesce(coin_pack_cap,9223372036854775807::bigint)
        )
      end as unit_coins
    from multiplied m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'quantity',quantity,
    'cards',jsonb_build_object(
      'id',id,
      'pokemon_name',pokemon_name,
      'set_name',set_name,
      'rarity',rarity,
      'image_small',image_small,
      'market_price_usd',market_price_usd,
      'market_price_source',market_price_source
    ),
    'sale',jsonb_build_object(
      'baseCoins',base_coins,
      'rarityTier',rarity_tier,
      'rarityMultiplier',rarity_multiplier,
      'dropChancePct',case when drop_chance is null then null else drop_chance*100 end,
      'dropMultiplier',drop_multiplier,
      'coinPackCap',coin_pack_cap,
      'unitCoins',unit_coins
    )
  ) order by unit_coins desc,market_price_usd desc nulls last,pokemon_name),'[]'::jsonb)
  from final_quotes;
$function$;

create or replace function public.sell_all_duplicate_cards()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      public.rarity_pull_weight(c.rarity) as rarity_weight,
      stats.rare_weight_total
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    left join public.player_card_metadata meta
      on meta.player_id=pc.player_id and meta.card_id=pc.card_id and meta.locked=true
    left join private.card_set_sale_stats stats on stats.set_id=c.set_id
    where pc.player_id=v_player_id
      and pc.quantity>1
      and meta.card_id is null
    for update of pc
  ),
  owned_sets as materialized (
    select distinct set_id from owned
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
        when o.rarity_tier>=3 and o.rare_weight_total>0
          then o.rarity_weight/o.rare_weight_total
        else null
      end as drop_chance,
      cap.coin_pack_cap
    from owned o
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
$function$;
