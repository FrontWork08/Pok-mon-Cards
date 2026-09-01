-- Lower coin booster prices aggressively for low expected-value packs.
-- Keep high prices reserved for consistently strong modeled pulls.
-- Diamond pack pricing remains unchanged.

update public.economy_policy
set coin_pack_ceiling=25000,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'boosterPricingModel','expected-pull-value-v2',
      'boosterPricingReason','low-index packs are cheap; premium prices are reserved for consistently strong pulls',
      'coinPackFloor',750,
      'coinPackCeiling',25000,
      'evTierUnder3',750,
      'evTier3To5',1250,
      'evTier5To8',2000,
      'evTier8To15',3500,
      'evTier15To25',5000,
      'evTier25To40',7500,
      'evTier40To60',10000,
      'evTier60To80',12500,
      'evTier80To120',17500,
      'evTier120Plus',25000
    ),
    updated_at=now()
where id=1;

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

  with pack_values as (
    select
      p.id,
      p.cards_per_pack,
      coalesce(max(c.market_price_usd),0)::numeric as max_card_usd,
      coalesce(private.pack_expected_value_usd(p.set_id,p.cards_per_pack),0)::numeric as expected_value_usd
    from public.packs p
    left join public.cards c on c.set_id=p.set_id
    where p.active
    group by p.id,p.set_id,p.cards_per_pack
  ),
  priced as (
    select
      id,
      case when max_card_usd>=980 then 'diamonds' else 'coins' end as currency,
      case
        when max_card_usd>=980 then
          greatest(
            15::bigint,
            round(
              (
                case
                  when max_card_usd>=5000 then 100
                  when max_card_usd>=4000 then 90
                  when max_card_usd>=3000 then 75
                  when max_card_usd>=2000 then 60
                  when max_card_usd>=1500 then 45
                  when max_card_usd>=1250 then 35
                  when max_card_usd>=1000 then 25
                  else 15
                end
              )::numeric * 0.90
            )::bigint
          )
        else
          case
            when expected_value_usd>=120 then 25000
            when expected_value_usd>=80 then 17500
            when expected_value_usd>=60 then 12500
            when expected_value_usd>=40 then 10000
            when expected_value_usd>=25 then 7500
            when expected_value_usd>=15 then 5000
            when expected_value_usd>=8 then 3500
            when expected_value_usd>=5 then 2000
            when expected_value_usd>=3 then 1250
            else 750
          end::bigint
      end as price
    from pack_values
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

select private.refresh_pack_economy();
