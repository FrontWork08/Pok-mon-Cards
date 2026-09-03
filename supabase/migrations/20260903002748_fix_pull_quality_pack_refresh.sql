-- Fix the optimized pull-quality refresh after the production audit.
-- Explicit tier columns avoid the ambiguous set_id reference from the first optimized draft.

create or replace function private.refresh_pack_economy()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_size_rows integer:=0;
  v_price_rows integer:=0;
begin
  update public.packs p
  set cards_per_pack=private.recommended_pack_card_count(p.set_id,p.cards_per_pack)
  where p.active
    and private.recommended_pack_card_count(p.set_id,p.cards_per_pack)<p.cards_per_pack;
  get diagnostics v_size_rows=row_count;

  with tier_stats as (
    select
      c.set_id,
      public.rarity_tier(c.rarity) tier,
      count(*)::numeric cnt,
      avg(coalesce(c.market_price_usd,0)) filter(where coalesce(c.market_price_usd,0)>0) avg_price,
      max(coalesce(c.market_price_usd,0)) max_price,
      sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) bw,
      sum(coalesce(c.market_price_usd,0)*public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) bw_value,
      sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where coalesce(c.market_price_usd,0)>=10) bw10,
      sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where coalesce(c.market_price_usd,0)>=25) bw25,
      sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where coalesce(c.market_price_usd,0)>=50) bw50,
      sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where coalesce(c.market_price_usd,0)>=100) bw100,
      count(*) filter(where coalesce(c.market_price_usd,0)>=10)::numeric cnt10,
      count(*) filter(where coalesce(c.market_price_usd,0)>=25)::numeric cnt25,
      count(*) filter(where coalesce(c.market_price_usd,0)>=50)::numeric cnt50,
      count(*) filter(where coalesce(c.market_price_usd,0)>=100)::numeric cnt100
    from public.cards c
    group by c.set_id,public.rarity_tier(c.rarity)
  ),
  pack_tiers as (
    select
      p.id,
      p.set_id,
      p.price old_price,
      p.currency old_currency,
      p.cards_per_pack,
      ts.tier,ts.cnt,ts.avg_price,ts.max_price,
      ts.bw,ts.bw_value,ts.bw10,ts.bw25,ts.bw50,ts.bw100,
      ts.cnt10,ts.cnt25,ts.cnt50,ts.cnt100,
      case
        when ts.tier<4 then 1.00::numeric
        else least(
          1.45::numeric,
          (case
            when ts.tier>=7 then 1.18
            when ts.tier>=6 then 1.16
            when ts.tier>=5 then 1.14
            else 1.10
          end)::numeric
          * case when p.cards_per_pack<=4 then 1.12 else 1.00 end
        )
      end qm
    from public.packs p
    join tier_stats ts on ts.set_id=p.set_id
    where p.active
  ),
  ps as (
    select
      id,set_id,old_price,old_currency,cards_per_pack,
      coalesce(max(max_price),0)::numeric max_card_usd,
      coalesce(sum(cnt) filter(where tier=1),0) c1,
      coalesce(sum(cnt) filter(where tier=2),0) c2,
      coalesce(sum(cnt) filter(where tier>=3),0) c3,
      coalesce(max(avg_price) filter(where tier=1),0) ev1,
      coalesce(max(avg_price) filter(where tier=2),0) ev2,
      coalesce(sum(bw_value*qm) filter(where tier>=3)/nullif(sum(bw*qm) filter(where tier>=3),0),0) evr,
      coalesce(sum(bw_value*qm)/nullif(sum(bw*qm),0),0) eva,
      coalesce(sum(cnt10) filter(where tier=1)/nullif(sum(cnt) filter(where tier=1),0),0) p10c,
      coalesce(sum(cnt10) filter(where tier=2)/nullif(sum(cnt) filter(where tier=2),0),0) p10u,
      coalesce(sum(cnt25) filter(where tier=1)/nullif(sum(cnt) filter(where tier=1),0),0) p25c,
      coalesce(sum(cnt25) filter(where tier=2)/nullif(sum(cnt) filter(where tier=2),0),0) p25u,
      coalesce(sum(cnt50) filter(where tier=1)/nullif(sum(cnt) filter(where tier=1),0),0) p50c,
      coalesce(sum(cnt50) filter(where tier=2)/nullif(sum(cnt) filter(where tier=2),0),0) p50u,
      coalesce(sum(cnt100) filter(where tier=1)/nullif(sum(cnt) filter(where tier=1),0),0) p100c,
      coalesce(sum(cnt100) filter(where tier=2)/nullif(sum(cnt) filter(where tier=2),0),0) p100u,
      coalesce(sum(bw10*qm) filter(where tier>=3)/nullif(sum(bw*qm) filter(where tier>=3),0),0) p10r,
      coalesce(sum(bw25*qm) filter(where tier>=3)/nullif(sum(bw*qm) filter(where tier>=3),0),0) p25r,
      coalesce(sum(bw50*qm) filter(where tier>=3)/nullif(sum(bw*qm) filter(where tier>=3),0),0) p50r,
      coalesce(sum(bw100*qm) filter(where tier>=3)/nullif(sum(bw*qm) filter(where tier>=3),0),0) p100r,
      coalesce(sum(bw10*qm)/nullif(sum(bw*qm),0),0) p10a,
      coalesce(sum(bw25*qm)/nullif(sum(bw*qm),0),0) p25a,
      coalesce(sum(bw50*qm)/nullif(sum(bw*qm),0),0) p50a,
      coalesce(sum(bw100*qm)/nullif(sum(bw*qm),0),0) p100a
    from pack_tiers
    group by id,set_id,old_price,old_currency,cards_per_pack
  ),
  slots as (
    select *,
      case when cards_per_pack<=4 then 0::numeric else least(c1,greatest(cards_per_pack-3,0)) end cs,
      case when cards_per_pack<=4 then 0::numeric else least(c2,least(2,greatest(cards_per_pack-1,0))) end us,
      case when cards_per_pack<=4 then 0::numeric when c3>0 then 1::numeric else 0::numeric end rs
    from ps
  ),
  q as (
    select *,greatest(cards_per_pack-cs-us-rs,0)::numeric fs
    from slots
  ),
  metrics as (
    select *,
      greatest(0,coalesce(cs*ev1,0)+coalesce(us*ev2,0)+coalesce(rs*evr,0)+coalesce(fs*eva,0)) ev,
      greatest(0,least(1,1-power(1-p10c,cs)*power(1-p10u,us)*power(1-p10r,rs)*power(1-p10a,fs))) p10,
      greatest(0,least(1,1-power(1-p25c,cs)*power(1-p25u,us)*power(1-p25r,rs)*power(1-p25a,fs))) p25,
      greatest(0,least(1,1-power(1-p50c,cs)*power(1-p50u,us)*power(1-p50r,rs)*power(1-p50a,fs))) p50,
      greatest(0,least(1,1-power(1-p100c,cs)*power(1-p100u,us)*power(1-p100r,rs)*power(1-p100a,fs))) p100
    from q
  ),
  scored as (
    select *,
      (0.60+0.18*p10+0.12*p25+0.07*p50+0.03*p100) consistency,
      ev*(0.60+0.18*p10+0.12*p25+0.07*p50+0.03*p100) qi
    from metrics
  ),
  priced as (
    select *,
      case when max_card_usd>=980 then 'diamonds' else 'coins' end new_currency,
      private.pack_recommended_price(
        case when max_card_usd>=980 then 'diamonds' else 'coins' end,
        qi
      ) new_price
    from scored
  ),
  logged as (
    insert into private.pack_price_review_log(
      pack_id,set_id,old_currency,new_currency,old_price,new_price,
      expected_value_usd,chance_10_pct,chance_25_pct,chance_50_pct,chance_100_pct,
      consistency_factor,quality_index_usd,reason
    )
    select
      id,set_id,old_currency,new_currency,old_price,new_price,
      round(ev,2),round(p10*100,2),round(p25*100,2),round(p50*100,2),round(p100*100,2),
      round(consistency,4),round(qi,2),'pull_quality_v3'
    from priced
    where old_currency is distinct from new_currency or old_price is distinct from new_price
    returning pack_id
  )
  update public.packs p
  set currency=x.new_currency,
      price=x.new_price
  from priced x
  where p.id=x.id
    and (p.currency is distinct from x.new_currency or p.price is distinct from x.new_price);

  get diagnostics v_price_rows=row_count;
  return v_size_rows+v_price_rows;
end;
$$;

revoke all on function private.refresh_pack_economy()
from public,anon,authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

-- Apply once. Re-running is idempotent once every active pack is in its tier.
select private.refresh_pack_economy();
