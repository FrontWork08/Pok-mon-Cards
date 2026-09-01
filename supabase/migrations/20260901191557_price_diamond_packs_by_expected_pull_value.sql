-- Reprice diamond boosters by expected pull value instead of a single chase card.
-- Keep diamond eligibility based on max card >= $980, but make low-index diamond packs cheap.
-- Preserve the relationship between premium price tiers and quality pull boost.

update public.economy_policy
set notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
  'diamondBoosterPricingModel','expected-pull-value-v2',
  'diamondBoosterPricingReason','diamond price follows expected pull strength, not a single jackpot card',
  'diamondPackFloor',1,
  'diamondPackCeiling',25,
  'diamondEvUnder3',1,
  'diamondEv3To5',2,
  'diamondEv5To8',3,
  'diamondEv8To15',4,
  'diamondEv15To25',5,
  'diamondEv25To40',6,
  'diamondEv40To60',8,
  'diamondEv60To80',10,
  'diamondEv80To120',12,
  'diamondEv120To160',15,
  'diamondEv160To220',18,
  'diamondEv220To300',22,
  'diamondEv300Plus',25
),
updated_at=now()
where id=1;

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
as $function$
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
      )
      * case when coalesce(p_cards_per_pack,0)<=4 then 1.12 else 1.00 end
    )
  end;
$function$;

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
          case
            when expected_value_usd>=300 then 25
            when expected_value_usd>=220 then 22
            when expected_value_usd>=160 then 18
            when expected_value_usd>=120 then 15
            when expected_value_usd>=80 then 12
            when expected_value_usd>=60 then 10
            when expected_value_usd>=40 then 8
            when expected_value_usd>=25 then 6
            when expected_value_usd>=15 then 5
            when expected_value_usd>=8 then 4
            when expected_value_usd>=5 then 3
            when expected_value_usd>=3 then 2
            else 1
          end::bigint
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
