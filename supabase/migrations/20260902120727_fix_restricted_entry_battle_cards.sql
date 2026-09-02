create or replace function private.battle_v6_entry_setup_turns(p_card_id text)
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select case
    when exists(
      select 1
      from public.cards c
      cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'abilities','[]'::jsonb)) a
      where c.id=p_card_id
        and (
          lower(coalesce(a->>'text','')) like '%put this pokémon into play only with the effect of%'
          or lower(coalesce(a->>'text','')) like '%put this pokemon into play only with the effect of%'
        )
    ) then 1
    else 0
  end;
$$;

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
  where n.nspname='private' and p.proname='battle_simulate_duel_v6'
  limit 1;

  if v_def is null then raise exception 'BATTLE_SIMULATE_DUEL_V6_NOT_FOUND'; end if;

  if strpos(v_def,'c_entry_setup integer:=private.battle_v6_entry_setup_turns')=0 then
    v_old := '  c_cooldown_all integer:=0;'||chr(10)||
             '  o_cooldown_all integer:=0;';
    v_new := '  c_cooldown_all integer:=0;'||chr(10)||
             '  o_cooldown_all integer:=0;'||chr(10)||
             '  c_entry_setup integer:=private.battle_v6_entry_setup_turns(p_challenger_card_id);'||chr(10)||
             '  o_entry_setup integer:=private.battle_v6_entry_setup_turns(p_opponent_card_id);';

    if strpos(v_def,v_old)=0 then raise exception 'ENTRY_SETUP_DECLARATION_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  if strpos(v_def,'''entry_setup_skip''')=0 then
    v_old := '      if v_half=1 and not private.battle_v6_has_go_first_override(c.id,c_energy) then';
    v_new := '      if c_entry_setup>0 then'||chr(10)||
             '        c_entry_setup:=c_entry_setup-1;'||chr(10)||
             '        v_trace:=v_trace||jsonb_build_array(jsonb_build_object(''halfTurn'',v_half,''side'',''challenger'',''event'',''entry_setup_skip'',''energy'',c_energy,''reason'',''restricted_entry_ability''));'||chr(10)||
             '      elsif v_half=1 and not private.battle_v6_has_go_first_override(c.id,c_energy) then';
    if strpos(v_def,v_old)=0 then raise exception 'CHALLENGER_ENTRY_SETUP_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);

    v_old := '      if v_half=1 and not private.battle_v6_has_go_first_override(o.id,o_energy) then';
    v_new := '      if o_entry_setup>0 then'||chr(10)||
             '        o_entry_setup:=o_entry_setup-1;'||chr(10)||
             '        v_trace:=v_trace||jsonb_build_array(jsonb_build_object(''halfTurn'',v_half,''side'',''opponent'',''event'',''entry_setup_skip'',''energy'',o_energy,''reason'',''restricted_entry_ability''));'||chr(10)||
             '      elsif v_half=1 and not private.battle_v6_has_go_first_override(o.id,o_energy) then';
    if strpos(v_def,v_old)=0 then raise exception 'OPPONENT_ENTRY_SETUP_ANCHOR_NOT_FOUND'; end if;
    v_def:=replace(v_def,v_old,v_new);
  end if;

  execute v_def;
end
$patch$;

create or replace function public.battle_card_power(p_card_id text)
returns numeric
language plpgsql
stable
security definer
set search_path='public'
as $$
declare
  c cards%rowtype;
  v_hp numeric;
  v_attack numeric:=0;
  v_damage numeric;
  v_abilities numeric:=0;
  v_setup_penalty numeric:=1;
  a jsonb;
  m text[];
begin
  select * into c from cards where id=p_card_id;
  if c.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  v_hp:=greatest(
    30,
    least(
      400,
      coalesce(
        nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,
        50
      )
    )
  );

  if jsonb_typeof(c.tcg_data->'attacks')='array' then
    for a in select value from jsonb_array_elements(c.tcg_data->'attacks')
    loop
      m:=regexp_match(coalesce(a->>'damage',''),'([0-9]+)');
      v_damage:=case when m is null then 0 else m[1]::numeric end;
      v_attack:=greatest(v_attack,v_damage);
    end loop;
  end if;

  if jsonb_typeof(c.tcg_data->'abilities')='array' then
    v_abilities:=jsonb_array_length(c.tcg_data->'abilities');
  end if;

  if private.battle_v6_entry_setup_turns(p_card_id)>0 then
    v_setup_penalty:=0.88;
  end if;

  return round((v_hp*.62+v_attack*.30+v_abilities*6)*v_setup_penalty,2);
end;
$$;

update private.ranked_bot_card_pool p
set battle_power=public.battle_card_power(p.card_id),updated_at=now()
where private.battle_v6_entry_setup_turns(p.card_id)>0;

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
  v_palafin jsonb;
  v_shedinja jsonb;
  v_palafin_trace text;
  v_shedinja_trace text;
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

  v_palafin:=private.battle_simulate_duel_v6(
    '00000000-0000-0000-0000-000000000003'::uuid,
    1,'svp-126','me2pt5-271','regression:palafin-entry-cooldown',false
  );

  v_shedinja:=private.battle_simulate_duel_v6(
    '00000000-0000-0000-0000-000000000004'::uuid,
    1,'swsh4-66','bw6-95','regression:shedinja-entry',false
  );

  v_palafin_trace:=coalesce(v_palafin->'trace','[]'::jsonb)::text;
  v_shedinja_trace:=coalesce(v_shedinja->'trace','[]'::jsonb)::text;

  return jsonb_build_object(
    'ok',
      (v_vikavolt->>'winnerSide'='challenger')
      and (v_slaking->>'winnerSide'='opponent')
      and coalesce((v_old_direct->>'rawDamage')::numeric,0)>=10
      and coalesce((v_coin_direct->>'rawDamage')::numeric,0)=40
      and coalesce((v_coin_direct->>'coinGateCount')::integer,0)=1
      and coalesce((v_coin_direct->>'coinGateHeads')::integer,0)=1
      and position('entry_setup_skip' in v_palafin_trace)>0
      and position('cooldown_skip' in v_palafin_trace)>0
      and position('entry_setup_skip' in v_shedinja_trace)>0
      and private.battle_v6_entry_setup_turns('svp-126')=1
      and private.battle_v6_entry_setup_turns('swsh4-66')=1,
    'vikavoltWinner',v_vikavolt->>'winnerSide',
    'slakingWinner',v_slaking->>'winnerSide',
    'oldDirectDamage',coalesce((v_old_direct->>'rawDamage')::numeric,0),
    'coinDirectDamage',coalesce((v_coin_direct->>'rawDamage')::numeric,0),
    'coinDirectGate',coalesce((v_coin_direct->>'coinGateCount')::integer,0),
    'coinDirectHeads',coalesce((v_coin_direct->>'coinGateHeads')::integer,0),
    'palafinEntrySetup',position('entry_setup_skip' in v_palafin_trace)>0,
    'palafinCooldown',position('cooldown_skip' in v_palafin_trace)>0,
    'shedinjaEntrySetup',position('entry_setup_skip' in v_shedinja_trace)>0
  );
end;
$$;

do $$
declare
  v_result jsonb;
begin
  v_result:=private.battle_v6_regression_suite();
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception 'BATTLE_V6_RESTRICTED_ENTRY_REGRESSION_FAILED: %',v_result;
  end if;
end $$;
