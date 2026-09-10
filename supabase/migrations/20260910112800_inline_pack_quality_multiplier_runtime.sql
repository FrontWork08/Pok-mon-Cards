create or replace function private.pack_quality_pull_multiplier(p_currency text,p_price bigint,p_cards_per_pack integer,p_rarity text)
returns numeric
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_tier smallint:=public.rarity_tier(p_rarity);
  v_currency text:=coalesce(p_currency,'coins');
  v_price bigint:=coalesce(p_price,0);
  v_cards integer:=coalesce(p_cards_per_pack,0);
  v_base numeric;
  v_lucky numeric:=greatest(1::numeric,least(2::numeric,coalesce(nullif(current_setting('app.booster_lucky_multiplier',true),'')::numeric,1::numeric)));
begin
  if v_tier<4 then return 1.00::numeric; end if;

  if v_tier>=7 then
    v_base:=case
      when (v_currency='coins' and v_price>=20000) or (v_currency='diamonds' and v_price>=18) then 1.30
      when (v_currency='coins' and v_price>=12500) or (v_currency='diamonds' and v_price>=10) then 1.24
      else 1.18 end;
  elsif v_tier>=6 then
    v_base:=case
      when (v_currency='coins' and v_price>=20000) or (v_currency='diamonds' and v_price>=18) then 1.27
      when (v_currency='coins' and v_price>=12500) or (v_currency='diamonds' and v_price>=10) then 1.21
      else 1.16 end;
  elsif v_tier>=5 then
    v_base:=case
      when (v_currency='coins' and v_price>=20000) or (v_currency='diamonds' and v_price>=18) then 1.24
      when (v_currency='coins' and v_price>=12500) or (v_currency='diamonds' and v_price>=10) then 1.18
      else 1.14 end;
  else
    v_base:=case
      when (v_currency='coins' and v_price>=20000) or (v_currency='diamonds' and v_price>=18) then 1.20
      when (v_currency='coins' and v_price>=12500) or (v_currency='diamonds' and v_price>=10) then 1.15
      else 1.10 end;
  end if;

  v_base:=least(1.45::numeric,v_base*case when v_cards<=4 then 1.12::numeric else 1.00::numeric end);
  return v_base*v_lucky;
end;
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
  if v_mismatches<>0 then raise exception 'PACK_QUALITY_INLINE_VALIDATION_FAILED_NORMAL:%',v_mismatches; end if;

  perform set_config('app.booster_lucky_multiplier','2',true);
  select count(*)::integer into v_mismatches
  from (select distinct currency,price,cards_per_pack from public.packs where active) p
  cross join (select distinct rarity from public.cards) r
  where private.pack_quality_pull_multiplier_legacy(p.currency,p.price,p_cards_per_pack=>p.cards_per_pack,p_rarity=>r.rarity)
        is distinct from private.pack_quality_pull_multiplier(p.currency,p.price,p.cards_per_pack,r.rarity);
  if v_mismatches<>0 then raise exception 'PACK_QUALITY_INLINE_VALIDATION_FAILED_LUCKY:%',v_mismatches; end if;

  perform set_config('app.booster_lucky_multiplier','1',true);
end;
$validation$;
