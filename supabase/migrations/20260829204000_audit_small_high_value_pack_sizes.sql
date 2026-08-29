-- Audit all active small/high-value packs and enforce a dynamic size cap.
-- The cap only reduces risky packs; inexpensive small sets keep their existing size.

CREATE OR REPLACE FUNCTION private.recommended_pack_card_count(p_set_id text, p_current integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with s as (
    select
      count(c.*)::integer as total_cards,
      count(*) filter(where public.rarity_tier(c.rarity)>=3)::integer as rare_cards,
      coalesce(max(c.market_price_usd),0)::numeric as max_usd,
      coalesce(avg(c.market_price_usd) filter(where c.market_price_usd>0),0)::numeric as avg_usd
    from public.cards c
    where c.set_id=p_set_id
  )
  select greatest(1,
    case
      when total_cards<=6
        and (avg_usd>=25 or max_usd>=100)
        then least(coalesce(p_current,1),1)

      when total_cards<=10
        and (avg_usd>=50 or max_usd>=500)
        then least(coalesce(p_current,1),1)

      when total_cards<=10
        and (
          avg_usd>=15 or max_usd>=100
          or rare_cards::numeric/nullif(total_cards,0)>=0.80
        )
        then least(coalesce(p_current,1),2)

      when total_cards<=17
        and (
          avg_usd>=25 or max_usd>=100
          or rare_cards::numeric/nullif(total_cards,0)>=0.80
        )
        then least(coalesce(p_current,1),2)

      when total_cards<=25
        and (avg_usd>=75 or max_usd>=500)
        then least(coalesce(p_current,1),2)

      when total_cards<=25
        and (
          avg_usd>=20 or max_usd>=100
          or rare_cards::numeric/nullif(total_cards,0)>=0.80
        )
        then least(coalesce(p_current,1),3)

      when total_cards<=40
        and (avg_usd>=75 or max_usd>=1000)
        then least(coalesce(p_current,1),2)

      when total_cards<=40
        and (
          avg_usd>=30 or max_usd>=250
          or rare_cards::numeric/nullif(total_cards,0)>=0.80
        )
        then least(coalesce(p_current,1),4)

      when total_cards<=60
        and rare_cards::numeric/nullif(total_cards,0)>=0.80
        and avg_usd>=50
        then least(coalesce(p_current,1),4)

      when total_cards<=60
        and (
          avg_usd>=50
          or (max_usd>=400 and avg_usd>=25)
        )
        then least(coalesce(p_current,1),5)

      when total_cards<=60
        and rare_cards::numeric/nullif(total_cards,0)>=0.80
        and (avg_usd>=20 or max_usd>=150)
        then least(coalesce(p_current,1),5)

      else coalesce(p_current,1)
    end
  )::integer
  from s;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_pack_economy()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_size_rows integer := 0;
  v_price_rows integer := 0;
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
      private.pack_expected_value_usd(p.set_id,p.cards_per_pack) as expected_value_usd,
      coalesce(avg(c.market_price_usd) filter(where c.market_price_usd>0),0)::numeric as avg_card_usd,
      count(c.*)::numeric as total_cards,
      count(*) filter(
        where public.rarity_tier(c.rarity)>=3
           or lower(coalesce(c.rarity,'')) like '%classic collection%'
      )::numeric as rare_like_cards
    from public.packs p
    left join public.cards c on c.set_id=p.set_id
    where p.active
    group by p.id,p.set_id,p.cards_per_pack
  ),
  standard as (
    select
      *,
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
        when max_card_usd>=800 then 4000
        when max_card_usd>=700 then 3500
        when max_card_usd>=600 then 2500
        when max_card_usd>=500 then 2000
        when max_card_usd>=400 then 1500
        when max_card_usd>=200 then 1000
        else 500
      end::bigint as standard_price
    from pack_values
  ),
  priced as (
    select
      id,
      currency,
      case
        when currency='diamonds' then standard_price
        else least(
          100000::bigint,
          greatest(
            standard_price,
            (ceil((coalesce(expected_value_usd,0)*25)/500.0)*500)::bigint,
            case
              when total_cards>0
               and rare_like_cards/nullif(total_cards,0)>=0.80
              then (ceil((avg_card_usd*cards_per_pack*0.75*25)/500.0)*500)::bigint
              else 0::bigint
            end
          )
        )
      end::bigint as price
    from standard
  )
  update public.packs p
  set currency=x.currency,
      price=x.price
  from priced x
  where p.id=x.id
    and (
      p.currency is distinct from x.currency
      or p.price is distinct from x.price
    );

  get diagnostics v_price_rows=row_count;
  return v_size_rows+v_price_rows;
end;
$function$;

revoke all on function private.recommended_pack_card_count(text,integer)
from public,anon,authenticated;
grant execute on function private.recommended_pack_card_count(text,integer) to service_role;

revoke all on function private.refresh_pack_economy()
from public,anon,authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

select private.refresh_pack_economy();

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Auditoria geral de boosters pequenos/caros aplicada: tamanho do pack agora é limitado automaticamente pelo tamanho do set, valor médio, chase card e concentração de raras',
    'Boosters promocionais e mini-sets de alto valor foram reduzidos para evitar ganhar grande parte do valor do set em poucas aberturas',
    'A proteção passa a ser reaplicada automaticamente junto do recálculo de economia após futuras atualizações de preços'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
