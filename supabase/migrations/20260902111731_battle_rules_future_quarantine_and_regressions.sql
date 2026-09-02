-- Harden TCG v6 against future parser regressions.
-- 1) Do not confuse a parenthetical Bench note with a Bench-only target.
-- 2) Preserve coin gates for fixed damage stored only in attack text.
-- 3) Snapshot reviewed attack signatures and quarantine future complex/changed rules from ranked.
-- 4) Keep a server-side regression suite for known failure modes.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='battle_v6_attack_plan'
  limit 1;

  if v_def is null then raise exception 'BATTLE_V6_ATTACK_PLAN_NOT_FOUND'; end if;

  v_old := 'if v_base=0 and v_text not like ''%benched pokémon%'' then';
  v_new := 'if v_base=0 then';
  if strpos(v_def,v_old)>0 then
    v_def:=replace(v_def,v_old,v_new);
  end if;

  if strpos(v_def,'dano textual condicionado a cara')=0 then
    v_old := '    -- Attack gates.'||chr(10)||'    if v_text like ''%flip a coin. if tails, this attack does nothing%'' then';
    v_new := '    -- Attack gates.'||chr(10)||
      '    if coalesce(v_damage_text,'''')='''' and v_text ~ ''flip a coin.*if heads, this attack does [0-9]+ damage'' then'||chr(10)||
      '      v_coin_gate_count:=greatest(v_coin_gate_count,1);'||chr(10)||
      '      v_coin_gate_heads:=greatest(v_coin_gate_heads,1);'||chr(10)||
      '      v_expected_raw:=v_expected_raw*0.5;'||chr(10)||
      '      v_effect_notes:=array_append(v_effect_notes,''dano textual condicionado a cara'');'||chr(10)||
      '    end if;'||chr(10)||chr(10)||
      '    if v_text like ''%flip a coin. if tails, this attack does nothing%'' then';

    if strpos(v_def,v_old)=0 then raise exception 'COIN_GATE_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  execute v_def;
end
$patch$;

create table if not exists private.battle_rule_attack_baseline(
  card_id text not null references public.cards(id) on delete cascade,
  attack_signature text not null,
  attack_name text not null,
  reviewed_at timestamptz not null default now(),
  review_source text not null default 'catalog_baseline_2026_09_02',
  primary key(card_id,attack_signature)
);

alter table private.battle_rule_attack_baseline enable row level security;

drop policy if exists battle_rule_attack_baseline_no_direct_access
on private.battle_rule_attack_baseline;
create policy battle_rule_attack_baseline_no_direct_access
on private.battle_rule_attack_baseline
for all to public
using(false) with check(false);

create table if not exists private.battle_rule_coverage_issues(
  card_id text not null references public.cards(id) on delete cascade,
  attack_signature text not null,
  attack_index integer not null,
  attack_name text not null,
  severity text not null check(severity in ('warn','block')),
  reason text not null,
  attack_text text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key(card_id,attack_signature)
);

alter table private.battle_rule_coverage_issues enable row level security;

drop policy if exists battle_rule_coverage_issues_no_direct_access
on private.battle_rule_coverage_issues;
create policy battle_rule_coverage_issues_no_direct_access
on private.battle_rule_coverage_issues
for all to public
using(false) with check(false);

create index if not exists battle_rule_coverage_issues_open_idx
on private.battle_rule_coverage_issues(card_id,severity)
where resolved_at is null;

insert into private.battle_rule_attack_baseline(card_id,attack_signature,attack_name,review_source)
select
  c.id,
  md5(
    coalesce(a.attack->>'name','')||'|'||
    coalesce(a.attack->>'damage','')||'|'||
    coalesce(a.attack->>'text','')||'|'||
    coalesce((a.attack->'cost')::text,'')||'|'||
    coalesce(a.attack->>'convertedEnergyCost','')
  ),
  coalesce(a.attack->>'name','Ataque'),
  'catalog_baseline_2026_09_02'
from public.cards c
cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) a(attack)
on conflict do nothing;

create or replace function private.audit_card_battle_rules()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_attack jsonb;
  v_ord bigint;
  v_sig text;
  v_name text;
  v_damage text;
  v_text text;
  v_simple boolean;
begin
  delete from private.battle_rule_coverage_issues
  where card_id=new.id and resolved_at is null;

  if jsonb_typeof(new.tcg_data->'attacks')<>'array' then
    return new;
  end if;

  for v_attack,v_ord in
    select value,ordinality
    from jsonb_array_elements(new.tcg_data->'attacks') with ordinality
  loop
    v_name:=coalesce(v_attack->>'name','Ataque');
    v_damage:=trim(coalesce(v_attack->>'damage',''));
    v_text:=trim(coalesce(v_attack->>'text',''));
    v_sig:=md5(
      coalesce(v_name,'')||'|'||
      coalesce(v_damage,'')||'|'||
      coalesce(v_text,'')||'|'||
      coalesce((v_attack->'cost')::text,'')||'|'||
      coalesce(v_attack->>'convertedEnergyCost','')
    );

    if exists(
      select 1
      from private.battle_rule_attack_baseline b
      where b.card_id=new.id and b.attack_signature=v_sig
    ) then
      continue;
    end if;

    v_simple := v_damage ~ '^[0-9]+$' and v_text='';

    if v_simple then
      insert into private.battle_rule_attack_baseline(
        card_id,attack_signature,attack_name,review_source
      )
      values(new.id,v_sig,v_name,'auto_simple_numeric')
      on conflict do nothing;
    else
      insert into private.battle_rule_coverage_issues(
        card_id,attack_signature,attack_index,attack_name,severity,reason,attack_text
      )
      values(
        new.id,v_sig,v_ord::integer,v_name,'block',
        'NEW_OR_CHANGED_COMPLEX_ATTACK_REQUIRES_RULE_REVIEW',
        nullif(v_text,'')
      )
      on conflict(card_id,attack_signature) do update
      set attack_index=excluded.attack_index,
          attack_name=excluded.attack_name,
          severity='block',
          reason=excluded.reason,
          attack_text=excluded.attack_text,
          detected_at=now(),
          resolved_at=null;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_00_audit_card_battle_rules on public.cards;
create trigger trg_00_audit_card_battle_rules
after insert or update of tcg_data
on public.cards
for each row execute function private.audit_card_battle_rules();

create or replace function private.battle_card_rules_ready(p_card_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select not exists(
    select 1
    from private.battle_rule_coverage_issues i
    where i.card_id=p_card_id
      and i.severity='block'
      and i.resolved_at is null
  );
$$;

delete from private.ranked_bot_card_pool p
where not private.battle_card_rules_ready(p.card_id);

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='sync_ranked_bot_card_power'
  limit 1;

  if v_def is not null
     and strpos(v_def,'private.battle_card_rules_ready(new.id)')=0 then
    v_old := '  if coalesce(array_length(new.pokedex_numbers,1),0)>0'||chr(10)||
             '     and jsonb_typeof(new.tcg_data->''attacks'')=''array'''||chr(10)||
             '     and jsonb_array_length(new.tcg_data->''attacks'')>0'||chr(10)||
             '  then';
    v_new := '  if coalesce(array_length(new.pokedex_numbers,1),0)>0'||chr(10)||
             '     and jsonb_typeof(new.tcg_data->''attacks'')=''array'''||chr(10)||
             '     and jsonb_array_length(new.tcg_data->''attacks'')>0'||chr(10)||
             '     and private.battle_card_rules_ready(new.id)'||chr(10)||
             '  then';
    if strpos(v_def,v_old)=0 then raise exception 'BOT_POOL_RULE_GUARD_ANCHOR_NOT_FOUND'; end if;
    execute replace(v_def,v_old,v_new);
  end if;
end
$patch$;

do $patch$
declare
  v_name text;
  v_def text;
  v_old text;
  v_new text;
begin
  foreach v_name in array array['server_lock_battle_card','server_pick_battle_draft_card']
  loop
    select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name
    limit 1;

    if v_def is null then raise exception '%_NOT_FOUND',upper(v_name); end if;
    if strpos(v_def,'BATTLE_RULE_REVIEW_REQUIRED')>0 then continue; end if;

    v_old := '  ) then raise exception ''NOT_OWNED''; end if;';
    v_new := '  ) then raise exception ''NOT_OWNED''; end if;'||chr(10)||chr(10)||
             '  if not private.battle_card_rules_ready(p_card_id) then'||chr(10)||
             '    raise exception ''BATTLE_RULE_REVIEW_REQUIRED'';'||chr(10)||
             '  end if;';

    if strpos(v_def,v_old)=0 then
      raise exception '%_RULE_GUARD_ANCHOR_NOT_FOUND',upper(v_name);
    end if;

    execute replace(v_def,v_old,v_new);
  end loop;
end
$patch$;

create or replace function private.battle_v6_regression_suite()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_vikavolt jsonb;
  v_slaking jsonb;
  v_old_direct jsonb;
  v_coin_direct jsonb;
begin
  v_vikavolt:=private.battle_simulate_duel_v6(
    '00000000-0000-0000-0000-000000000001'::uuid,
    1,'me5-26','swshp-SWSH007','regression:vikavolt',true
  );

  v_slaking:=private.battle_simulate_duel_v6(
    '00000000-0000-0000-0000-000000000002'::uuid,
    1,'sv8-147','sv3-24','regression:slaking',true
  );

  v_old_direct:=private.battle_v6_attack_plan(
    'base5-2','swshp-SWSH007',
    12,12,0,0,false,false,null,0,false,false,false,null,
    false,false,false,false,false,null,0
  );

  v_coin_direct:=private.battle_v6_attack_plan(
    'pl3-20','swshp-SWSH007',
    12,12,0,0,false,false,null,0,false,false,false,null,
    false,false,false,false,false,null,0,
    array['Heat Blast']::text[]
  );

  return jsonb_build_object(
    'ok',
      (v_vikavolt->>'winnerSide'='challenger')
      and (v_slaking->>'winnerSide'='opponent')
      and coalesce((v_old_direct->>'rawDamage')::numeric,0)>=10
      and coalesce((v_coin_direct->>'rawDamage')::numeric,0)=40
      and coalesce((v_coin_direct->>'coinGateCount')::integer,0)=1
      and coalesce((v_coin_direct->>'coinGateHeads')::integer,0)=1,
    'vikavoltWinner',v_vikavolt->>'winnerSide',
    'slakingWinner',v_slaking->>'winnerSide',
    'oldDirectDamage',coalesce((v_old_direct->>'rawDamage')::numeric,0),
    'coinDirectDamage',coalesce((v_coin_direct->>'rawDamage')::numeric,0),
    'coinDirectGate',coalesce((v_coin_direct->>'coinGateCount')::integer,0),
    'coinDirectHeads',coalesce((v_coin_direct->>'coinGateHeads')::integer,0)
  );
end;
$$;

create or replace function private.battle_rule_coverage_health()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'baselineAttacks',(select count(*) from private.battle_rule_attack_baseline),
    'openBlocks',(select count(*) from private.battle_rule_coverage_issues where severity='block' and resolved_at is null),
    'blockedCards',(select count(distinct card_id) from private.battle_rule_coverage_issues where severity='block' and resolved_at is null),
    'regression',private.battle_v6_regression_suite()
  );
$$;

do $$
declare
  v_result jsonb;
begin
  v_result:=private.battle_v6_regression_suite();
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'BATTLE_V6_REGRESSION_FAILED: %',v_result;
  end if;
end $$;
