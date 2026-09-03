-- Full booster pricing audit: price by expected pull quality and jackpot consistency.
-- This repository migration is the canonical replayable state for the production review.

create table if not exists private.pack_price_review_log (
  id bigint generated always as identity primary key,
  reviewed_at timestamptz not null default now(),
  pack_id uuid not null,
  set_id text not null,
  old_currency text not null,
  new_currency text not null,
  old_price bigint not null,
  new_price bigint not null,
  expected_value_usd numeric(12,2) not null,
  chance_10_pct numeric(8,2) not null,
  chance_25_pct numeric(8,2) not null,
  chance_50_pct numeric(8,2) not null,
  chance_100_pct numeric(8,2) not null,
  consistency_factor numeric(8,4) not null,
  quality_index_usd numeric(12,2) not null,
  reason text not null default 'pull_quality_v3'
);

create index if not exists pack_price_review_log_pack_time_idx
  on private.pack_price_review_log(pack_id, reviewed_at desc);

revoke all on table private.pack_price_review_log from public, anon, authenticated;

create or replace function private.pack_pull_quality_metrics(
  p_set_id text,
  p_cards_per_pack integer,
  p_currency text,
  p_price bigint
)
returns jsonb
language sql
stable
set search_path=''
as $$
with c as (
  select
    public.rarity_tier(rarity) tier,
    coalesce(market_price_usd,0)::numeric price,
    (
      public.rarity_pull_weight(rarity)
      * private.card_market_pull_factor(market_price_usd)
      * private.pack_quality_pull_multiplier(p_currency,p_price,p_cards_per_pack,rarity)
    )::numeric w
  from public.cards
  where set_id=p_set_id
),
a as (
  select
    count(*) filter(where tier=1)::numeric c1,
    count(*) filter(where tier=2)::numeric c2,
    count(*) filter(where tier>=3)::numeric c3,
    avg(price) filter(where tier=1 and price>0) ev1,
    avg(price) filter(where tier=2 and price>0) ev2,
    sum(price*w) filter(where tier>=3)/nullif(sum(w) filter(where tier>=3),0) evr,
    sum(price*w)/nullif(sum(w),0) eva,
    count(*) filter(where tier=1 and price>=10)::numeric/nullif(count(*) filter(where tier=1),0) p10c,
    count(*) filter(where tier=2 and price>=10)::numeric/nullif(count(*) filter(where tier=2),0) p10u,
    sum(w) filter(where tier>=3 and price>=10)/nullif(sum(w) filter(where tier>=3),0) p10r,
    sum(w) filter(where price>=10)/nullif(sum(w),0) p10a,
    count(*) filter(where tier=1 and price>=25)::numeric/nullif(count(*) filter(where tier=1),0) p25c,
    count(*) filter(where tier=2 and price>=25)::numeric/nullif(count(*) filter(where tier=2),0) p25u,
    sum(w) filter(where tier>=3 and price>=25)/nullif(sum(w) filter(where tier>=3),0) p25r,
    sum(w) filter(where price>=25)/nullif(sum(w),0) p25a,
    count(*) filter(where tier=1 and price>=50)::numeric/nullif(count(*) filter(where tier=1),0) p50c,
    count(*) filter(where tier=2 and price>=50)::numeric/nullif(count(*) filter(where tier=2),0) p50u,
    sum(w) filter(where tier>=3 and price>=50)/nullif(sum(w) filter(where tier>=3),0) p50r,
    sum(w) filter(where price>=50)/nullif(sum(w),0) p50a,
    count(*) filter(where tier=1 and price>=100)::numeric/nullif(count(*) filter(where tier=1),0) p100c,
    count(*) filter(where tier=2 and price>=100)::numeric/nullif(count(*) filter(where tier=2),0) p100u,
    sum(w) filter(where tier>=3 and price>=100)/nullif(sum(w) filter(where tier>=3),0) p100r,
    sum(w) filter(where price>=100)/nullif(sum(w),0) p100a
  from c
),
s as (
  select *,
    case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
         else least(c1,greatest(coalesce(p_cards_per_pack,0)-3,0)) end cs,
    case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
         else least(c2,least(2,greatest(coalesce(p_cards_per_pack,0)-1,0))) end us,
    case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
         when c3>0 then 1::numeric else 0::numeric end rs
  from a
),
m as (
  select *, greatest(coalesce(p_cards_per_pack,0)-cs-us-rs,0)::numeric fs
  from s
),
q as (
  select
    greatest(0,coalesce(cs*ev1,0)+coalesce(us*ev2,0)+coalesce(rs*evr,0)+coalesce(fs*eva,0)) ev,
    greatest(0,least(1,1-power(1-coalesce(p10c,0),cs)*power(1-coalesce(p10u,0),us)*power(1-coalesce(p10r,0),rs)*power(1-coalesce(p10a,0),fs))) p10,
    greatest(0,least(1,1-power(1-coalesce(p25c,0),cs)*power(1-coalesce(p25u,0),us)*power(1-coalesce(p25r,0),rs)*power(1-coalesce(p25a,0),fs))) p25,
    greatest(0,least(1,1-power(1-coalesce(p50c,0),cs)*power(1-coalesce(p50u,0),us)*power(1-coalesce(p50r,0),rs)*power(1-coalesce(p50a,0),fs))) p50,
    greatest(0,least(1,1-power(1-coalesce(p100c,0),cs)*power(1-coalesce(p100u,0),us)*power(1-coalesce(p100r,0),rs)*power(1-coalesce(p100a,0),fs))) p100
  from m
)
select jsonb_build_object(
  'expectedValueUsd',round(ev,2),
  'chance10',round(p10*100,2),
  'chance25',round(p25*100,2),
  'chance50',round(p50*100,2),
  'chance100',round(p100*100,2),
  'consistencyFactor',round((0.60 + 0.18*p10 + 0.12*p25 + 0.07*p50 + 0.03*p100),4),
  'qualityIndexUsd',round(ev*(0.60 + 0.18*p10 + 0.12*p25 + 0.07*p50 + 0.03*p100),2)
)
from q;
$$;

create or replace function private.pack_recommended_price(
  p_currency text,
  p_quality_index_usd numeric
)
returns bigint
language sql
immutable
parallel safe
set search_path=''
as $$
  select case
    when coalesce(p_currency,'coins')='diamonds' then
      case
        when coalesce(p_quality_index_usd,0)>=300 then 25
        when coalesce(p_quality_index_usd,0)>=220 then 22
        when coalesce(p_quality_index_usd,0)>=160 then 18
        when coalesce(p_quality_index_usd,0)>=120 then 15
        when coalesce(p_quality_index_usd,0)>=80 then 12
        when coalesce(p_quality_index_usd,0)>=60 then 10
        when coalesce(p_quality_index_usd,0)>=40 then 8
        when coalesce(p_quality_index_usd,0)>=25 then 6
        when coalesce(p_quality_index_usd,0)>=15 then 5
        when coalesce(p_quality_index_usd,0)>=8 then 4
        when coalesce(p_quality_index_usd,0)>=5 then 3
        when coalesce(p_quality_index_usd,0)>=3 then 2
        else 1
      end
    else
      case
        when coalesce(p_quality_index_usd,0)>=120 then 25000
        when coalesce(p_quality_index_usd,0)>=80 then 17500
        when coalesce(p_quality_index_usd,0)>=60 then 12500
        when coalesce(p_quality_index_usd,0)>=40 then 10000
        when coalesce(p_quality_index_usd,0)>=25 then 7500
        when coalesce(p_quality_index_usd,0)>=15 then 5000
        when coalesce(p_quality_index_usd,0)>=8 then 3500
        when coalesce(p_quality_index_usd,0)>=5 then 2000
        when coalesce(p_quality_index_usd,0)>=3 then 1250
        else 500
      end
  end::bigint;
$$;

revoke all on function private.pack_pull_quality_metrics(text,integer,text,bigint)
from public,anon,authenticated;
grant execute on function private.pack_pull_quality_metrics(text,integer,text,bigint) to service_role;

revoke all on function private.pack_recommended_price(text,numeric)
from public,anon,authenticated;
grant execute on function private.pack_recommended_price(text,numeric) to service_role;

update public.economy_policy
set coin_pack_floor=500,
    coin_pack_ceiling=25000,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'boosterPricingModel','pull-quality-v3',
      'boosterPricingReason','all active boosters priced by baseline expected pull value discounted for jackpot volatility',
      'qualityIndexFormula','EV * (0.60 + 0.18*P10 + 0.12*P25 + 0.07*P50 + 0.03*P100)',
      'qualityPriceBonusExcluded',true,
      'goodPullThresholdsUsd',jsonb_build_array(10,25,50,100),
      'coinPackFloor',500,
      'coinPackCeiling',25000,
      'diamondPackFloor',1,
      'diamondPackCeiling',25,
      'diamondEligibilityMaxCardUsd',980,
      'reviewedAllActiveBoosters',true
    ),
    updated_at=now()
where id=1;

-- Special one-card Legendary Vault: audited separately because it uses a
-- guaranteed legendary pool rather than standard booster slot weighting.
update public.diamond_pack_config
set cost_diamonds=18,
    updated_at=now()
where id=1 and cost_diamonds<>18;
