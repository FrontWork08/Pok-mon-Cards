-- Reprice rare-dense boosters and make duplicate-sale quotes scale to large collections.

create or replace function private.refresh_pack_economy()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rows integer;
begin
  with pack_values as (
    select p.id,p.cards_per_pack,
           coalesce(max(c.market_price_usd),0)::numeric as max_card_usd,
           coalesce(avg(c.market_price_usd) filter(where c.market_price_usd>0),0)::numeric as avg_card_usd,
           count(c.*)::numeric as total_cards,
           count(*) filter(
             where public.rarity_tier(c.rarity)>=3
                or lower(coalesce(c.rarity,'')) like '%classic collection%'
           )::numeric as rare_like_cards
    from public.packs p
    left join public.cards c on c.set_id=p.set_id
    where p.active
    group by p.id,p.cards_per_pack
  ), standard as (
    select id,cards_per_pack,max_card_usd,avg_card_usd,total_cards,rare_like_cards,
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
             when max_card_usd>=800 then 4000
             when max_card_usd>=700 then 3500
             when max_card_usd>=600 then 2500
             when max_card_usd>=500 then 2000
             when max_card_usd>=400 then 1500
             when max_card_usd>=200 then 1000
             else 500
           end::bigint as standard_price
    from pack_values
  ), priced as (
    select id,currency,
           case
             when currency='diamonds' then standard_price
             when total_cards>0 and rare_like_cards/nullif(total_cards,0)>=0.80 then
               greatest(
                 standard_price,
                 (ceil((avg_card_usd*cards_per_pack*0.75*25)/500.0)*500)::bigint
               )
             else standard_price
           end::bigint as price
    from standard
  )
  update public.packs p
  set currency=x.currency,price=x.price
  from priced x
  where p.id=x.id
    and (p.currency is distinct from x.currency or p.price is distinct from x.price);

  get diagnostics v_rows=row_count;
  return v_rows;
end;
$$;

revoke all on function private.refresh_pack_economy() from public,anon,authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

create or replace function public.get_my_duplicate_sale_cards()
returns jsonb
language sql
security definer
set search_path=''
as $$
  with me as (
    select auth.uid() as player_id
  ), owned as (
    select pc.quantity,
           c.id,c.pokemon_name,c.set_name,c.set_id,c.rarity,c.image_small,
           c.market_price_usd,c.market_price_source,
           public.rarity_tier(c.rarity) as rarity_tier,
           public.rarity_pull_weight(c.rarity) as rarity_weight
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join me
    where me.player_id is not null
      and pc.player_id=me.player_id
      and pc.quantity>1
  ), owned_sets as (
    select distinct set_id from owned
  ), set_rare_totals as (
    select c.set_id,
           sum(public.rarity_pull_weight(c.rarity))
             filter(where public.rarity_tier(c.rarity)>=3) as rare_weight_total
    from public.cards c
    join owned_sets s on s.set_id=c.set_id
    group by c.set_id
  ), set_caps as (
    select p.set_id,min(p.price*4)::bigint as coin_pack_cap
    from public.packs p
    join owned_sets s on s.set_id=p.set_id
    where p.active=true and p.currency='coins'
    group by p.set_id
  ), quoted as (
    select o.*,
           private.duplicate_sale_base_value(o.market_price_usd) as base_coins,
           private.duplicate_sale_rarity_multiplier(o.rarity) as rarity_multiplier,
           case when o.rarity_tier>=3 and rt.rare_weight_total>0
                then o.rarity_weight/rt.rare_weight_total else null end as drop_chance,
           cap.coin_pack_cap
    from owned o
    left join set_rare_totals rt on rt.set_id=o.set_id
    left join set_caps cap on cap.set_id=o.set_id
  ), multiplied as (
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
  ), final_quotes as (
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
      'id',id,'pokemon_name',pokemon_name,'set_name',set_name,'rarity',rarity,
      'image_small',image_small,'market_price_usd',market_price_usd,'market_price_source',market_price_source
    ),
    'sale',jsonb_build_object(
      'baseCoins',base_coins,'rarityTier',rarity_tier,'rarityMultiplier',rarity_multiplier,
      'dropChancePct',case when drop_chance is null then null else drop_chance*100 end,
      'dropMultiplier',drop_multiplier,'coinPackCap',coin_pack_cap,'unitCoins',unit_coins
    )
  ) order by unit_coins desc,market_price_usd desc nulls last,pokemon_name),'[]'::jsonb)
  from final_quotes
$$;

revoke all on function public.get_my_duplicate_sale_cards() from public,anon,authenticated;
grant execute on function public.get_my_duplicate_sale_cards() to authenticated;

select private.refresh_pack_economy();

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Boosters com alta concentração de raras agora têm preço mínimo compatível com o valor médio entregue',
    'Venda de repetidas otimizada para coleções grandes sem timeout'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
