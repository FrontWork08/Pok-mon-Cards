-- Price coin boosters by consistent expected pull value instead of a single chase card.
-- Keep the 25k coin ceiling and the existing diamond threshold/pricing.
-- This prevents low-EV sets with one expensive jackpot card from being priced as premium packs.

update public.economy_policy
set coin_pack_ceiling=25000,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'boosterPricingModel','expected-pull-value-v1',
      'boosterPricingReason','high coin prices only for packs with consistently strong modeled pulls',
      'coinPackFloor',2500,
      'coinPackCeiling',25000,
      'premiumExpectedValueUsd',120,
      'highExpectedValueUsd',80,
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
            when expected_value_usd>=80 then 20000
            when expected_value_usd>=60 then 15000
            when expected_value_usd>=40 then 12500
            when expected_value_usd>=25 then 10000
            when expected_value_usd>=15 then 8000
            when expected_value_usd>=8 then 6000
            when expected_value_usd>=4 then 4000
            else 2500
          end::bigint
      end as price
    from pack_values
  )
  update public.packs p
  set currency=x.currency,
      price=least(
        case when x.currency='coins' then 25000::bigint else x.price end,
        x.price
      )
  from priced x
  where p.id=x.id
    and (p.currency is distinct from x.currency or p.price is distinct from x.price);

  get diagnostics v_price_rows=row_count;
  return v_size_rows+v_price_rows;
end;
$$;

select private.refresh_pack_economy();
