-- Lower booster prices while preserving chase-card progression.
-- Packs remain in Coins below US$ 800 and switch to Diamonds at US$ 800+.
-- Coin tiers are reduced by roughly 30-40%; Diamond tiers are reduced more
-- aggressively because active-player Diamond balances are much lower.

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
        when max_card_usd >= 5000 then 50
        when max_card_usd >= 4000 then 45
        when max_card_usd >= 3000 then 40
        when max_card_usd >= 2000 then 32
        when max_card_usd >= 1500 then 24
        when max_card_usd >= 1250 then 18
        when max_card_usd >= 1000 then 13
        when max_card_usd >= 900 then 8
        when max_card_usd >= 800 then 5
        when max_card_usd >= 700 then 70000
        when max_card_usd >= 600 then 60000
        when max_card_usd >= 500 then 50000
        when max_card_usd >= 400 then 40000
        when max_card_usd >= 300 then 30000
        when max_card_usd >= 200 then 18000
        when max_card_usd >= 150 then 11000
        when max_card_usd >= 100 then 7500
        when max_card_usd >= 50 then 3500
        when max_card_usd >= 25 then 1800
        else 750
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
      'Preços de boosters reduzidos novamente: Coins agora vão de 750 a 70.000 e Diamantes de 5 a 50, mantendo progressão pela chase card'
    ]::text[]
  ) item
)
where version='0.1.1 • OTA 28/08';
