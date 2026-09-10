create table if not exists private.pack_set_runtime_stats (
  set_id text primary key,
  total_cards bigint not null default 0,
  common_count bigint not null default 0,
  uncommon_count bigint not null default 0,
  rare_count bigint not null default 0,
  common_priced_count bigint not null default 0,
  common_price_sum numeric not null default 0,
  uncommon_priced_count bigint not null default 0,
  uncommon_price_sum numeric not null default 0,
  rare_weight_sum numeric not null default 0,
  rare_weighted_value_sum numeric not null default 0,
  all_weight_sum numeric not null default 0,
  all_weighted_value_sum numeric not null default 0,
  refreshed_at timestamptz not null default now()
);

revoke all on table private.pack_set_runtime_stats from public, anon, authenticated;
grant select, insert, update, delete on table private.pack_set_runtime_stats to service_role;

insert into private.pack_set_runtime_stats(
  set_id,total_cards,common_count,uncommon_count,rare_count,
  common_priced_count,common_price_sum,uncommon_priced_count,uncommon_price_sum,
  rare_weight_sum,rare_weighted_value_sum,all_weight_sum,all_weighted_value_sum,refreshed_at
)
select
  c.set_id,
  count(*)::bigint,
  count(*) filter(where public.rarity_tier(c.rarity)=1)::bigint,
  count(*) filter(where public.rarity_tier(c.rarity)=2)::bigint,
  count(*) filter(where public.rarity_tier(c.rarity)>=3)::bigint,
  count(*) filter(where public.rarity_tier(c.rarity)=1 and c.market_price_usd>0)::bigint,
  coalesce(sum(c.market_price_usd) filter(where public.rarity_tier(c.rarity)=1 and c.market_price_usd>0),0),
  count(*) filter(where public.rarity_tier(c.rarity)=2 and c.market_price_usd>0)::bigint,
  coalesce(sum(c.market_price_usd) filter(where public.rarity_tier(c.rarity)=2 and c.market_price_usd>0),0),
  coalesce(sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0),0),
  coalesce(sum(c.market_price_usd*public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0),0),
  coalesce(sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where c.market_price_usd>0),0),
  coalesce(sum(c.market_price_usd*public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd)) filter(where c.market_price_usd>0),0),
  now()
from public.cards c
group by c.set_id
on conflict(set_id) do update set
  total_cards=excluded.total_cards,
  common_count=excluded.common_count,
  uncommon_count=excluded.uncommon_count,
  rare_count=excluded.rare_count,
  common_priced_count=excluded.common_priced_count,
  common_price_sum=excluded.common_price_sum,
  uncommon_priced_count=excluded.uncommon_priced_count,
  uncommon_price_sum=excluded.uncommon_price_sum,
  rare_weight_sum=excluded.rare_weight_sum,
  rare_weighted_value_sum=excluded.rare_weighted_value_sum,
  all_weight_sum=excluded.all_weight_sum,
  all_weighted_value_sum=excluded.all_weighted_value_sum,
  refreshed_at=excluded.refreshed_at;

create or replace function private.pack_expected_value_usd_raw(p_set_id text,p_cards_per_pack integer)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with stats as (
    select
      count(*)::numeric as total_cards,
      count(*) filter(where public.rarity_tier(c.rarity)=1)::numeric as common_count,
      count(*) filter(where public.rarity_tier(c.rarity)=2)::numeric as uncommon_count,
      count(*) filter(where public.rarity_tier(c.rarity)>=3)::numeric as rare_count,
      avg(c.market_price_usd) filter(where public.rarity_tier(c.rarity)=1 and c.market_price_usd>0) as avg_common,
      avg(c.market_price_usd) filter(where public.rarity_tier(c.rarity)=2 and c.market_price_usd>0) as avg_uncommon,
      sum(c.market_price_usd*public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd))
        filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0)
      / nullif(sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd))
        filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0),0) as weighted_rare,
      sum(c.market_price_usd*public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd))
        filter(where c.market_price_usd>0)
      / nullif(sum(public.rarity_pull_weight(c.rarity)*private.card_market_pull_factor(c.market_price_usd))
        filter(where c.market_price_usd>0),0) as weighted_all
    from public.cards c
    where c.set_id=p_set_id
  ), slots as (
    select *,
      case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric else least(common_count,greatest(coalesce(p_cards_per_pack,0)-3,0))::numeric end as common_slots,
      case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric else least(uncommon_count,least(2,greatest(coalesce(p_cards_per_pack,0)-1,0)))::numeric end as uncommon_slots
    from stats
  ), calc as (
    select *,case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric when rare_count>0 and coalesce(p_cards_per_pack,0)>0 then 1::numeric else 0::numeric end as rare_slots
    from slots
  )
  select round(greatest(0,
    case when coalesce(p_cards_per_pack,0)<=4 then coalesce(p_cards_per_pack,0)*coalesce(weighted_all,0)
    else coalesce(common_slots*avg_common,0)+coalesce(uncommon_slots*avg_uncommon,0)+coalesce(rare_slots*weighted_rare,0)
      +coalesce(greatest(coalesce(p_cards_per_pack,0)-common_slots-uncommon_slots-rare_slots,0)*weighted_all,0) end
  ),2)
  from calc;
$function$;

create or replace function private.pack_expected_value_usd_cached(p_set_id text,p_cards_per_pack integer)
returns numeric
language sql
stable
set search_path to ''
as $function$
  with stats as (
    select
      s.total_cards::numeric as total_cards,
      s.common_count::numeric as common_count,
      s.uncommon_count::numeric as uncommon_count,
      s.rare_count::numeric as rare_count,
      s.common_price_sum/nullif(s.common_priced_count,0) as avg_common,
      s.uncommon_price_sum/nullif(s.uncommon_priced_count,0) as avg_uncommon,
      s.rare_weighted_value_sum/nullif(s.rare_weight_sum,0) as weighted_rare,
      s.all_weighted_value_sum/nullif(s.all_weight_sum,0) as weighted_all
    from private.pack_set_runtime_stats s
    where s.set_id=p_set_id
    union all
    select 0::numeric,0::numeric,0::numeric,0::numeric,null::numeric,null::numeric,null::numeric,null::numeric
    where not exists(select 1 from private.pack_set_runtime_stats s where s.set_id=p_set_id)
    limit 1
  ), slots as (
    select *,
      case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric else least(common_count,greatest(coalesce(p_cards_per_pack,0)-3,0))::numeric end as common_slots,
      case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric else least(uncommon_count,least(2,greatest(coalesce(p_cards_per_pack,0)-1,0)))::numeric end as uncommon_slots
    from stats
  ), calc as (
    select *,case when coalesce(p_cards_per_pack,0)<=4 then 0::numeric when rare_count>0 and coalesce(p_cards_per_pack,0)>0 then 1::numeric else 0::numeric end as rare_slots
    from slots
  )
  select round(greatest(0,
    case when coalesce(p_cards_per_pack,0)<=4 then coalesce(p_cards_per_pack,0)*coalesce(weighted_all,0)
    else coalesce(common_slots*avg_common,0)+coalesce(uncommon_slots*avg_uncommon,0)+coalesce(rare_slots*weighted_rare,0)
      +coalesce(greatest(coalesce(p_cards_per_pack,0)-common_slots-uncommon_slots-rare_slots,0)*weighted_all,0) end
  ),2)
  from calc;
$function$;

do $validation$
declare v_mismatches integer;
begin
  select count(*)::integer into v_mismatches
  from (select distinct p.set_id,p.cards_per_pack from public.packs p where p.active) x
  where private.pack_expected_value_usd_raw(x.set_id,x.cards_per_pack)
        is distinct from private.pack_expected_value_usd_cached(x.set_id,x.cards_per_pack);
  if v_mismatches<>0 then raise exception 'PACK_EV_CACHE_VALIDATION_FAILED:%',v_mismatches; end if;
end;
$validation$;

create or replace function private.maintain_pack_set_runtime_stats()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old_tier smallint;
  v_new_tier smallint;
  v_old_weight numeric:=0;
  v_new_weight numeric:=0;
  v_old_price numeric:=0;
  v_new_price numeric:=0;
begin
  if tg_op<>'INSERT' then
    v_old_tier:=public.rarity_tier(old.rarity);
    v_old_price:=coalesce(old.market_price_usd,0);
    if v_old_price>0 then v_old_weight:=public.rarity_pull_weight(old.rarity)*private.card_market_pull_factor(old.market_price_usd); end if;
    update private.pack_set_runtime_stats s set
      total_cards=greatest(0,s.total_cards-1),
      common_count=greatest(0,s.common_count-case when v_old_tier=1 then 1 else 0 end),
      uncommon_count=greatest(0,s.uncommon_count-case when v_old_tier=2 then 1 else 0 end),
      rare_count=greatest(0,s.rare_count-case when v_old_tier>=3 then 1 else 0 end),
      common_priced_count=greatest(0,s.common_priced_count-case when v_old_tier=1 and v_old_price>0 then 1 else 0 end),
      common_price_sum=greatest(0,s.common_price_sum-case when v_old_tier=1 and v_old_price>0 then v_old_price else 0 end),
      uncommon_priced_count=greatest(0,s.uncommon_priced_count-case when v_old_tier=2 and v_old_price>0 then 1 else 0 end),
      uncommon_price_sum=greatest(0,s.uncommon_price_sum-case when v_old_tier=2 and v_old_price>0 then v_old_price else 0 end),
      rare_weight_sum=greatest(0,s.rare_weight_sum-case when v_old_tier>=3 and v_old_price>0 then v_old_weight else 0 end),
      rare_weighted_value_sum=greatest(0,s.rare_weighted_value_sum-case when v_old_tier>=3 and v_old_price>0 then v_old_price*v_old_weight else 0 end),
      all_weight_sum=greatest(0,s.all_weight_sum-case when v_old_price>0 then v_old_weight else 0 end),
      all_weighted_value_sum=greatest(0,s.all_weighted_value_sum-case when v_old_price>0 then v_old_price*v_old_weight else 0 end),
      refreshed_at=now()
    where s.set_id=old.set_id;
  end if;

  if tg_op<>'DELETE' then
    v_new_tier:=public.rarity_tier(new.rarity);
    v_new_price:=coalesce(new.market_price_usd,0);
    if v_new_price>0 then v_new_weight:=public.rarity_pull_weight(new.rarity)*private.card_market_pull_factor(new.market_price_usd); end if;
    insert into private.pack_set_runtime_stats(
      set_id,total_cards,common_count,uncommon_count,rare_count,
      common_priced_count,common_price_sum,uncommon_priced_count,uncommon_price_sum,
      rare_weight_sum,rare_weighted_value_sum,all_weight_sum,all_weighted_value_sum,refreshed_at
    ) values(
      new.set_id,1,
      case when v_new_tier=1 then 1 else 0 end,
      case when v_new_tier=2 then 1 else 0 end,
      case when v_new_tier>=3 then 1 else 0 end,
      case when v_new_tier=1 and v_new_price>0 then 1 else 0 end,
      case when v_new_tier=1 and v_new_price>0 then v_new_price else 0 end,
      case when v_new_tier=2 and v_new_price>0 then 1 else 0 end,
      case when v_new_tier=2 and v_new_price>0 then v_new_price else 0 end,
      case when v_new_tier>=3 and v_new_price>0 then v_new_weight else 0 end,
      case when v_new_tier>=3 and v_new_price>0 then v_new_price*v_new_weight else 0 end,
      case when v_new_price>0 then v_new_weight else 0 end,
      case when v_new_price>0 then v_new_price*v_new_weight else 0 end,
      now()
    ) on conflict(set_id) do update set
      total_cards=private.pack_set_runtime_stats.total_cards+1,
      common_count=private.pack_set_runtime_stats.common_count+excluded.common_count,
      uncommon_count=private.pack_set_runtime_stats.uncommon_count+excluded.uncommon_count,
      rare_count=private.pack_set_runtime_stats.rare_count+excluded.rare_count,
      common_priced_count=private.pack_set_runtime_stats.common_priced_count+excluded.common_priced_count,
      common_price_sum=private.pack_set_runtime_stats.common_price_sum+excluded.common_price_sum,
      uncommon_priced_count=private.pack_set_runtime_stats.uncommon_priced_count+excluded.uncommon_priced_count,
      uncommon_price_sum=private.pack_set_runtime_stats.uncommon_price_sum+excluded.uncommon_price_sum,
      rare_weight_sum=private.pack_set_runtime_stats.rare_weight_sum+excluded.rare_weight_sum,
      rare_weighted_value_sum=private.pack_set_runtime_stats.rare_weighted_value_sum+excluded.rare_weighted_value_sum,
      all_weight_sum=private.pack_set_runtime_stats.all_weight_sum+excluded.all_weight_sum,
      all_weighted_value_sum=private.pack_set_runtime_stats.all_weighted_value_sum+excluded.all_weighted_value_sum,
      refreshed_at=now();
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

drop trigger if exists cards_pack_runtime_stats_insert on public.cards;
drop trigger if exists cards_pack_runtime_stats_update on public.cards;
drop trigger if exists cards_pack_runtime_stats_delete on public.cards;
create trigger cards_pack_runtime_stats_insert after insert on public.cards for each row execute function private.maintain_pack_set_runtime_stats();
create trigger cards_pack_runtime_stats_update after update of set_id,rarity,market_price_usd on public.cards for each row
when (old.set_id is distinct from new.set_id or old.rarity is distinct from new.rarity or old.market_price_usd is distinct from new.market_price_usd)
execute function private.maintain_pack_set_runtime_stats();
create trigger cards_pack_runtime_stats_delete after delete on public.cards for each row execute function private.maintain_pack_set_runtime_stats();

create or replace function private.pack_expected_value_usd(p_set_id text,p_cards_per_pack integer)
returns numeric
language sql
stable
set search_path to ''
as $function$
  select private.pack_expected_value_usd_cached(p_set_id,p_cards_per_pack);
$function$;
