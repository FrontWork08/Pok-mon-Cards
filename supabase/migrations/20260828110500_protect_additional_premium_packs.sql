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
      case
        when p.set_id in (
          'rsv10pt5',
          'svp',
          'swsh8',
          'swsh11',
          'sv4pt5',
          'sv8pt5',
          'zsv10pt5'
        )
          or (
            p.release_date is not null
            and p.release_date <= current_date - interval '5 years'
          )
        then 'diamonds'
        else 'coins'
      end as currency,
      greatest(
        0,
        coalesce(extract(year from age(current_date, p.release_date))::int, 0)
      ) as age_years,
      coalesce(max(c.market_price_usd), 0)::numeric as max_card_usd
    from public.packs p
    left join public.cards c on c.set_id = p.set_id
    where p.active
    group by p.id, p.set_id, p.release_date
  ), priced as (
    select
      id,
      currency,
      case
        when currency = 'diamonds' then
          least(
            100,
            greatest(
              5,
              (
                case
                  when age_years >= 25 then 60
                  when age_years >= 20 then 45
                  when age_years >= 15 then 30
                  when age_years >= 10 then 20
                  else 10
                end
                + ceil(sqrt(greatest(max_card_usd, 0)) * 1.4)::int
              )
            )
          )::bigint
        else
          greatest(
            500,
            (
              round(
                (
                  500
                  + least(1500, sqrt(greatest(max_card_usd, 0)) * 25)
                ) / 50
              ) * 50
            )::bigint
          )
      end as price
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

select private.refresh_pack_economy();
