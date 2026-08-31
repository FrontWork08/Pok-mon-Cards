-- Economy 2.1: modest booster price relief.
-- Goal: lower active booster prices by about 10% without breaking the 5k coin
-- floor or the 15-diamond minimum, and keep future automatic repricing aligned.

update public.economy_policy
set coin_pack_ceiling=90000,
    notes=coalesce(notes,'{}'::jsonb) || jsonb_build_object(
      'boosterPriceMultiplier',0.90,
      'boosterPriceRelief','2026-08-31',
      'coinPackFloor',5000,
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
            5000::bigint,
            (round((undiscounted_price::numeric*0.90)/500.0)*500)::bigint
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

select private.refresh_pack_economy();
