-- Raise Coin booster prices so they scale much more aggressively with the
-- most valuable card in each set. Diamond threshold remains US$ 800.

create or replace function private.refresh_pack_economy()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rows integer;
begin
  with pack_values as (
    select
      p.id,
      coalesce(max(c.market_price_usd), 0)::numeric as max_card_usd
    from public.packs p
    left join public.cards c on c.set_id = p.set_id
    where p.active
    group by p.id
  ), priced as (
    select
      id,
      case
        when max_card_usd >= 800 then 'diamonds'
        else 'coins'
      end as currency,
      case
        when max_card_usd >= 5000 then 100
        when max_card_usd >= 4000 then 90
        when max_card_usd >= 3000 then 75
        when max_card_usd >= 2000 then 60
        when max_card_usd >= 1500 then 45
        when max_card_usd >= 1250 then 35
        when max_card_usd >= 1000 then 25
        when max_card_usd >= 900 then 15
        when max_card_usd >= 800 then 10
        when max_card_usd >= 700 then 600000
        when max_card_usd >= 600 then 400000
        when max_card_usd >= 500 then 250000
        when max_card_usd >= 400 then 150000
        when max_card_usd >= 300 then 100000
        when max_card_usd >= 200 then 60000
        when max_card_usd >= 150 then 35000
        when max_card_usd >= 100 then 20000
        when max_card_usd >= 50 then 10000
        when max_card_usd >= 25 then 5000
        else 2500
      end::bigint as price
    from pack_values
  )
  update public.packs p
  set currency = x.currency,
      price = x.price
  from priced x
  where p.id = x.id
    and (
      p.currency is distinct from x.currency
      or p.price is distinct from x.price
    );

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

revoke all on function private.refresh_pack_economy()
from public, anon, authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

select private.refresh_pack_economy();

update public.app_update_logs
set changes = (
  select array_agg(distinct item order by item)
  from unnest(
    changes || array[
      'Packs de Coins agora ficam muito mais caros conforme o valor da chase card, chegando a 600.000 Coins antes do corte de US$ 800 para Diamantes'
    ]::text[]
  ) item
)
where version='0.1.1 • OTA 28/08';
