-- Lower the minimum active coin booster price from 750 to 500.
-- Keep every other EV tier and the 25k ceiling unchanged.

update public.economy_policy
set coin_pack_floor=500,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'coinPackFloor',500,
      'evTierUnder3',500
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
            else 500
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
