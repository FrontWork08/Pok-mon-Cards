create or replace function private.pack_quality_pull_multiplier_legacy(p_currency text,p_price bigint,p_cards_per_pack integer,p_rarity text)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with base as (
    select case
      when public.rarity_tier(p_rarity)<4 then 1.00::numeric
      else least(
        1.45::numeric,
        (case
          when public.rarity_tier(p_rarity)>=7 then case
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.30
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.24
            else 1.18 end
          when public.rarity_tier(p_rarity)>=6 then case
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.27
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.21
            else 1.16 end
          when public.rarity_tier(p_rarity)>=5 then case
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.24
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.18
            else 1.14 end
          else case
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=20000) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=18) then 1.20
            when (coalesce(p_currency,'coins')='coins' and coalesce(p_price,0)>=12500) or (coalesce(p_currency,'coins')='diamonds' and coalesce(p_price,0)>=10) then 1.15
            else 1.10 end
        end)::numeric * case when coalesce(p_cards_per_pack,0)<=4 then 1.12 else 1.00 end
      )
    end as multiplier
  )
  select case
    when public.rarity_tier(p_rarity)<4 then 1.00::numeric
    else multiplier*greatest(1::numeric,least(2::numeric,coalesce(nullif(current_setting('app.booster_lucky_multiplier',true),'')::numeric,1::numeric)))
  end
  from base;
$function$;

create or replace function private.pack_quality_pull_multiplier(p_currency text,p_price bigint,p_cards_per_pack integer,p_rarity text)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with input as (
    select public.rarity_tier(p_rarity) tier,coalesce(p_currency,'coins') currency,coalesce(p_price,0) price,
      coalesce(p_cards_per_pack,0) cards_per_pack,
      greatest(1::numeric,least(2::numeric,coalesce(nullif(current_setting('app.booster_lucky_multiplier',true),'')::numeric,1::numeric))) lucky
  ), base as (
    select *,case
      when tier<4 then 1.00::numeric
      else least(1.45::numeric,(case
        when tier>=7 then case when (currency='coins' and price>=20000) or (currency='diamonds' and price>=18) then 1.30 when (currency='coins' and price>=12500) or (currency='diamonds' and price>=10) then 1.24 else 1.18 end
        when tier>=6 then case when (currency='coins' and price>=20000) or (currency='diamonds' and price>=18) then 1.27 when (currency='coins' and price>=12500) or (currency='diamonds' and price>=10) then 1.21 else 1.16 end
        when tier>=5 then case when (currency='coins' and price>=20000) or (currency='diamonds' and price>=18) then 1.24 when (currency='coins' and price>=12500) or (currency='diamonds' and price>=10) then 1.18 else 1.14 end
        else case when (currency='coins' and price>=20000) or (currency='diamonds' and price>=18) then 1.20 when (currency='coins' and price>=12500) or (currency='diamonds' and price>=10) then 1.15 else 1.10 end
      end)::numeric*case when cards_per_pack<=4 then 1.12 else 1.00 end) end multiplier
    from input
  )
  select case when tier<4 then 1.00::numeric else multiplier*lucky end from base;
$function$;

do $validation$
declare v_mismatches integer;
begin
  perform set_config('app.booster_lucky_multiplier','1',true);
  select count(*)::integer into v_mismatches
  from (select distinct currency,price,cards_per_pack from public.packs where active) p
  cross join (select distinct rarity from public.cards) r
  where private.pack_quality_pull_multiplier_legacy(p.currency,p.price,p.cards_per_pack,r.rarity)
        is distinct from private.pack_quality_pull_multiplier(p.currency,p.price,p.cards_per_pack,r.rarity);
  if v_mismatches<>0 then raise exception 'PACK_QUALITY_MULTIPLIER_VALIDATION_FAILED_NORMAL:%',v_mismatches; end if;
  perform set_config('app.booster_lucky_multiplier','2',true);
  select count(*)::integer into v_mismatches
  from (select distinct currency,price,cards_per_pack from public.packs where active) p
  cross join (select distinct rarity from public.cards) r
  where private.pack_quality_pull_multiplier_legacy(p.currency,p.price,p.cards_per_pack,r.rarity)
        is distinct from private.pack_quality_pull_multiplier(p.currency,p.price,p.cards_per_pack,r.rarity);
  if v_mismatches<>0 then raise exception 'PACK_QUALITY_MULTIPLIER_VALIDATION_FAILED_LUCKY:%',v_mismatches; end if;
  perform set_config('app.booster_lucky_multiplier','1',true);
end;
$validation$;
