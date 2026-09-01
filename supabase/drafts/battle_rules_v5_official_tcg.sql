-- Battle Rules v5: virtual-energy auto duel based on official Pokemon TCG battle rules.
-- Keeps the app's 1-card / best-of-3 / Draft 3 format, but resolves each revealed
-- card matchup as a turn-based duel instead of a static power comparison.

create or replace function private.battle_v5_hash_roll(p_key text)
returns numeric
language sql
immutable
parallel safe
set search_path=''
as $$
  select ((('x'||substr(md5(coalesce(p_key,'')),1,8))::bit(32)::bigint) / 4294967295.0)::numeric;
$$;

create or replace function private.battle_v5_attack_plan(
  p_attacker_card_id text,
  p_defender_card_id text,
  p_energy integer,
  p_attacker_damage numeric,
  p_defender_damage numeric,
  p_blocked_attack text default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_attacker public.cards%rowtype;
  v_defender public.cards%rowtype;
  v_attack jsonb;
  v_text text;
  v_damage_text text;
  v_name text;
  v_cost integer;
  v_base numeric;
  v_raw numeric;
  v_effective numeric;
  v_expected numeric;
  v_score numeric;
  v_best_score numeric := -1e18;
  v_best jsonb := null;
  v_match text[];
  v_attacker_type text;
  v_defender_hp numeric;
  v_remaining_hp numeric;
  v_rule jsonb;
  v_rule_text text;
  v_weakness_multiplier numeric := 1;
  v_weakness_bonus numeric := 0;
  v_resistance numeric := 0;
  v_dynamic_kind text := 'static';
  v_dynamic_count integer := 0;
  v_per_unit numeric := 0;
  v_discard integer := 0;
  v_cooldown_all integer := 0;
  v_cooldown_attack integer := 0;
  v_status text := null;
  v_status_chance numeric := 1;
  v_recoil numeric := 0;
  v_heal numeric := 0;
  v_interval integer := 1;
  v_effect_notes text[];
  v_status_bonus numeric := 0;
begin
  select * into v_attacker from public.cards where id=p_attacker_card_id;
  select * into v_defender from public.cards where id=p_defender_card_id;
  if v_attacker.id is null or v_defender.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  v_attacker_type := coalesce(v_attacker.types[1],'Colorless');
  v_defender_hp := greatest(10,least(1000,coalesce(
    nullif(regexp_replace(coalesce(v_defender.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50
  )));
  v_remaining_hp := greatest(0,v_defender_hp-coalesce(p_defender_damage,0));

  if jsonb_typeof(v_defender.tcg_data->'weaknesses')='array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'weaknesses') loop
      if lower(coalesce(v_rule->>'type',''))=lower(v_attacker_type) then
        v_rule_text:=coalesce(v_rule->>'value','');
        v_match:=regexp_match(v_rule_text,'[×x]([0-9]+)');
        if v_match is not null then v_weakness_multiplier:=greatest(1,v_match[1]::numeric); end if;
        v_match:=regexp_match(v_rule_text,'[+]([0-9]+)');
        if v_match is not null then v_weakness_bonus:=greatest(0,v_match[1]::numeric); end if;
      end if;
    end loop;
  end if;
  if jsonb_typeof(v_defender.tcg_data->'resistances')='array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'resistances') loop
      if lower(coalesce(v_rule->>'type',''))=lower(v_attacker_type) then
        v_match:=regexp_match(coalesce(v_rule->>'value',''),'-([0-9]+)');
        if v_match is not null then v_resistance:=greatest(0,v_match[1]::numeric); end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_attacker.tcg_data->'attacks')<>'array' then return null; end if;

  for v_attack in select value from jsonb_array_elements(v_attacker.tcg_data->'attacks') loop
    v_name:=coalesce(nullif(v_attack->>'name',''),'Ataque');
    if p_blocked_attack is not null and lower(v_name)=lower(p_blocked_attack) then continue; end if;

    v_cost:=coalesce(
      nullif(regexp_replace(coalesce(v_attack->>'convertedEnergyCost',''),'[^0-9]','','g'),'')::integer,
      case when jsonb_typeof(v_attack->'cost')='array' then jsonb_array_length(v_attack->'cost') else 0 end,
      0
    );
    v_cost:=greatest(0,least(12,v_cost));
    if coalesce(p_energy,0)<v_cost then continue; end if;

    v_text:=lower(coalesce(v_attack->>'text',''));
    v_damage_text:=coalesce(v_attack->>'damage','');
    v_match:=regexp_match(v_damage_text,'([0-9]+)');
    v_base:=case when v_match is null then 0 else v_match[1]::numeric end;
    v_raw:=v_base;
    v_dynamic_kind:='static';
    v_dynamic_count:=0;
    v_per_unit:=0;
    v_discard:=0;
    v_cooldown_all:=0;
    v_cooldown_attack:=0;
    v_status:=null;
    v_status_chance:=1;
    v_recoil:=0;
    v_heal:=0;
    v_effect_notes:=array[]::text[];
    v_status_bonus:=0;

    if position('+' in v_damage_text)>0 then
      if v_text ~ 'if this pok[eé]mon has any damage counter' then
        v_match:=regexp_match(v_text,'does ([0-9]+) more damage');
        if v_match is not null and coalesce(p_attacker_damage,0)>0 then
          v_raw:=v_raw+v_match[1]::numeric;
          v_effect_notes:=array_append(v_effect_notes,'bônus por dano no atacante');
        end if;
      end if;

      v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each damage counter on this pok[eé]mon');
      if v_match is not null then
        v_raw:=v_raw+(floor(coalesce(p_attacker_damage,0)/10)*v_match[1]::numeric);
        v_effect_notes:=array_append(v_effect_notes,'bônus por contadores de dano');
      end if;

      v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each .*energy.*discard');
      if v_match is null and v_text like '%discard any amount%energy%' then
        v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each card you discarded');
      end if;
      if v_match is not null then
        v_per_unit:=v_match[1]::numeric;
        v_dynamic_count:=greatest(0,least(coalesce(p_energy,0),12));
        v_raw:=v_raw+v_per_unit*v_dynamic_count;
        v_dynamic_kind:='energy_discard_bonus';
        v_discard:=v_dynamic_count;
        v_effect_notes:=array_append(v_effect_notes,'dano variável por Energia descartada');
      end if;

      v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each energy attached to this pok[eé]mon');
      if v_match is not null then
        v_raw:=v_raw+v_match[1]::numeric*greatest(0,coalesce(p_energy,0));
        v_effect_notes:=array_append(v_effect_notes,'bônus por Energia anexada');
      end if;
    end if;

    if v_damage_text ~ '[×x*]' then
      v_match:=regexp_match(v_text,'flip ([0-9]+) coins?');
      if v_match is not null and v_text like '%for each heads%' then
        v_dynamic_kind:='coin_multiplier';
        v_dynamic_count:=greatest(1,least(v_match[1]::integer,20));
        v_per_unit:=v_base;
        v_raw:=v_per_unit*v_dynamic_count*0.5;
        v_effect_notes:=array_append(v_effect_notes,'dano por cara em moeda');
      else
        v_match:=regexp_match(v_text,'discard up to ([0-9]+).*energy cards? from your hand');
        if v_match is not null and v_text like '%for each card%' then
          v_dynamic_kind:='virtual_hand_energy_multiplier';
          v_dynamic_count:=greatest(0,least(v_match[1]::integer,10));
          v_per_unit:=v_base;
          v_raw:=v_per_unit*v_dynamic_count;
          v_effect_notes:=array_append(v_effect_notes,'Energia virtual da mão aplicada ao multiplicador');
        else
          v_match:=regexp_match(v_text,'for each energy attached to this pok[eé]mon');
          if v_match is not null then
            v_raw:=v_base*greatest(0,coalesce(p_energy,0));
            v_effect_notes:=array_append(v_effect_notes,'multiplicador por Energia anexada');
          end if;
        end if;
      end if;
    end if;

    if v_text like '%discard all energy from this pokémon%' or v_text like '%discard all energy from this pokemon%' then
      v_discard:=greatest(v_discard,coalesce(p_energy,0));
      v_effect_notes:=array_append(v_effect_notes,'descarta toda a Energia');
    else
      v_match:=regexp_match(v_text,'discard ([0-9]+) energy from this pok[eé]mon');
      if v_match is not null then
        v_discard:=greatest(v_discard,v_match[1]::integer);
        v_effect_notes:=array_append(v_effect_notes,'descarta Energia');
      elsif v_text ~ 'discard (an|a) energy from this pok[eé]mon' then
        v_discard:=greatest(v_discard,1);
        v_effect_notes:=array_append(v_effect_notes,'descarta 1 Energia');
      end if;
    end if;

    if v_text like '%during your next turn, this pokémon can''t attack%' or v_text like '%during your next turn, this pokemon can''t attack%' then
      v_cooldown_all:=1;
      v_effect_notes:=array_append(v_effect_notes,'não pode atacar no próximo turno');
    elsif (v_text like '%during your next turn, this pokémon can''t use%' or v_text like '%during your next turn, this pokemon can''t use%') then
      v_cooldown_attack:=1;
      v_effect_notes:=array_append(v_effect_notes,'ataque bloqueado no próximo turno');
    end if;

    if v_text like '%is now paralyzed%' then v_status:='paralyzed'; v_status_bonus:=55; end if;
    if v_text like '%is now asleep%' then v_status:='asleep'; v_status_bonus:=35; end if;
    if v_text like '%is now confused%' then v_status:='confused'; v_status_bonus:=30; end if;
    if v_text like '%is now poisoned%' then v_status:='poisoned'; v_status_bonus:=20; end if;
    if v_text like '%is now burned%' then v_status:='burned'; v_status_bonus:=25; end if;
    if v_status is not null then
      if v_text like '%flip a coin%' and (v_text like '%if heads%' or v_text like '%if tails%') then v_status_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'condição especial: '||v_status);
    end if;

    v_match:=regexp_match(v_text,'([0-9]+) damage to itself');
    if v_match is not null then v_recoil:=v_match[1]::numeric; v_effect_notes:=array_append(v_effect_notes,'dano de recuo'); end if;
    v_match:=regexp_match(v_text,'heal ([0-9]+) damage from this pok[eé]mon');
    if v_match is not null then v_heal:=v_match[1]::numeric; v_effect_notes:=array_append(v_effect_notes,'cura'); end if;

    if v_text like '%don''t apply weakness and resistance%' or v_text like '%do not apply weakness and resistance%' then
      v_effective:=greatest(0,v_raw);
    else
      v_effective:=greatest(0,v_raw*v_weakness_multiplier+v_weakness_bonus-v_resistance);
    end if;
    v_expected:=v_effective;

    v_interval:=greatest(
      1,
      least(12,v_discard),
      case when v_cooldown_all>0 then 2 else 1 end,
      case when v_cooldown_attack>0 then 2 else 1 end
    );

    if v_remaining_hp>0 and v_expected>=v_remaining_hp then
      v_score:=1000000000+v_expected-v_cost;
    else
      v_score:=v_expected/v_interval+v_status_bonus-v_recoil*0.5+v_heal*0.2-v_cost*0.05;
    end if;

    if v_score>v_best_score then
      v_best_score:=v_score;
      v_best:=jsonb_build_object(
        'attackName',v_name,
        'energyCost',v_cost,
        'energyCostSymbols',coalesce(v_attack->'cost','[]'::jsonb),
        'damageText',v_damage_text,
        'attackText',coalesce(v_attack->>'text',''),
        'rawDamage',round(v_raw,2),
        'effectiveDamage',round(v_effective,2),
        'dynamicKind',v_dynamic_kind,
        'dynamicCount',v_dynamic_count,
        'perUnitDamage',v_per_unit,
        'discardEnergy',least(greatest(v_discard,0),coalesce(p_energy,0)),
        'cooldownAll',v_cooldown_all,
        'cooldownAttack',v_cooldown_attack,
        'inflictStatus',v_status,
        'statusChance',v_status_chance,
        'recoilDamage',v_recoil,
        'healDamage',v_heal,
        'weaknessMultiplier',v_weakness_multiplier,
        'weaknessBonus',v_weakness_bonus,
        'resistance',v_resistance,
        'advantage',case when v_weakness_multiplier>1 or v_weakness_bonus>0 then 'weakness' when v_resistance>0 then 'resisted' else 'neutral' end,
        'effectNotes',to_jsonb(v_effect_notes),
        'selectionScore',round(v_score,2)
      );
    end if;
  end loop;

  return v_best;
end;
$$;

create or replace function private.battle_simulate_duel_v5(
  p_battle_id uuid,
  p_round_no integer,
  p_challenger_card_id text,
  p_opponent_card_id text
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  c public.cards%rowtype;
  o public.cards%rowtype;
  c_profile jsonb;
  o_profile jsonb;
  c_hp numeric;
  o_hp numeric;
  c_damage numeric:=0;
  o_damage numeric:=0;
  c_energy integer:=0;
  o_energy integer:=0;
  c_turns integer:=0;
  o_turns integer:=0;
  c_major text:=null;
  o_major text:=null;
  c_poison boolean:=false;
  o_poison boolean:=false;
  c_burn boolean:=false;
  o_burn boolean:=false;
  c_cooldown_all integer:=0;
  o_cooldown_all integer:=0;
  c_blocked_attack text:=null;
  o_blocked_attack text:=null;
  c_blocked_turns integer:=0;
  o_blocked_turns integer:=0;
  c_first boolean;
  v_is_c boolean;
  v_half integer;
  v_plan jsonb;
  v_attack_name text;
  v_raw numeric;
  v_effective numeric;
  v_energy_before integer;
  v_discard integer;
  v_status text;
  v_status_chance numeric;
  v_recoil numeric;
  v_heal numeric;
  v_coin_count integer;
  v_heads integer;
  v_i integer;
  v_ability jsonb;
  v_ability_text text;
  v_match text[];
  v_ignore_defender_effects boolean;
  v_trace jsonb:='[]'::jsonb;
  v_winner_side text:=null;
  v_resolution text:=null;
  c_last_attack text:=null;
  o_last_attack text:=null;
  c_last_damage numeric:=0;
  o_last_damage numeric:=0;
  c_damage_dealt numeric:=0;
  o_damage_dealt numeric:=0;
  c_last_advantage text:='neutral';
  o_last_advantage text:='neutral';
begin
  select * into c from public.cards where id=p_challenger_card_id;
  select * into o from public.cards where id=p_opponent_card_id;
  if c.id is null or o.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  c_profile:=public.battle_card_profile(c.id);
  o_profile:=public.battle_card_profile(o.id);
  c_hp:=(c_profile->>'hp')::numeric;
  o_hp:=(o_profile->>'hp')::numeric;
  c_first:=private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':first')>=0.5;

  for v_half in 1..80 loop
    v_is_c:=case when c_first then mod(v_half,2)=1 else mod(v_half,2)=0 end;

    if v_is_c then
      c_turns:=c_turns+1;
      c_energy:=least(12,c_energy+1);
      v_energy_before:=c_energy;

      if v_half=1 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','first_player_no_attack','energy',c_energy));
      elsif c_major='paralyzed' then
        c_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','paralyzed_skip','energy',c_energy));
      elsif c_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','asleep_skip','energy',c_energy));
      elsif c_cooldown_all>0 then
        c_cooldown_all:=c_cooldown_all-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','cooldown_skip','energy',c_energy));
      else
        v_plan:=private.battle_v5_attack_plan(c.id,o.id,c_energy,c_damage,o_damage,case when c_blocked_turns>0 then c_blocked_attack else null end);
        if c_blocked_turns>0 then c_blocked_turns:=c_blocked_turns-1; if c_blocked_turns=0 then c_blocked_attack:=null; end if; end if;
        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          if c_major='confused' and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':confused')<0.5 then
            c_damage:=least(c_hp,c_damage+30);
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_raw:=(v_plan->>'rawDamage')::numeric;
            if v_plan->>'dynamicKind'='coin_multiplier' then
              v_heads:=0; v_coin_count:=coalesce((v_plan->>'dynamicCount')::integer,0);
              for v_i in 1..v_coin_count loop
                if private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              v_raw:=coalesce((v_plan->>'perUnitDamage')::numeric,0)*v_heads;
            end if;
            v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0)-coalesce((v_plan->>'resistance')::numeric,0));
            v_ignore_defender_effects:=lower(coalesce(v_plan->>'attackText','')) like '%damage isn''t affected by any effects on your opponent%';
            if not v_ignore_defender_effects and jsonb_typeof(o.tcg_data->'abilities')='array' then
              for v_ability in select value from jsonb_array_elements(o.tcg_data->'abilities') loop
                v_ability_text:=lower(coalesce(v_ability->>'text',''));
                if o_damage=0 and v_effective>=o_hp and v_ability_text like '%full hp%' and v_ability_text like '%would be knocked out by damage%' and v_ability_text like '%remaining hp becomes 10%' then
                  v_effective:=greatest(0,o_hp-10);
                end if;
                v_match:=regexp_match(v_ability_text,'takes ([0-9]+) less damage from attacks');
                if v_match is not null then v_effective:=greatest(0,v_effective-v_match[1]::numeric); end if;
                v_match:=regexp_match(v_ability_text,'damage done to this pok[eé]mon by attacks is reduced by ([0-9]+)');
                if v_match is not null then v_effective:=greatest(0,v_effective-v_match[1]::numeric); end if;
              end loop;
            end if;
            o_damage:=least(o_hp,o_damage+v_effective);
            c_damage_dealt:=c_damage_dealt+v_effective;
            c_last_attack:=v_attack_name; c_last_damage:=v_effective; c_last_advantage:=coalesce(v_plan->>'advantage','neutral');
            v_heal:=coalesce((v_plan->>'healDamage')::numeric,0); if v_heal>0 then c_damage:=greatest(0,c_damage-v_heal); end if;
            v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then c_damage:=least(c_hp,c_damage+v_recoil); end if;
            v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); c_energy:=greatest(0,c_energy-v_discard);
            c_cooldown_all:=greatest(c_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
            if coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then c_blocked_attack:=v_attack_name; c_blocked_turns:=1; end if;
            v_status:=v_plan->>'inflictStatus'; v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
            if v_status is not null and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':status')<=v_status_chance then
              if v_status='poisoned' then o_poison:=true;
              elsif v_status='burned' then o_burn:=true;
              else o_major:=v_status; end if;
            end if;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','attack','attack',v_attack_name,'energyBefore',v_energy_before,'energyAfter',c_energy,'damage',round(v_effective,2),'defenderRemainingHp',greatest(0,o_hp-o_damage),'effects',coalesce(v_plan->'effectNotes','[]'::jsonb)));
          end if;
        else
          v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','charging','energy',c_energy));
        end if;
      end if;
    else
      o_turns:=o_turns+1;
      o_energy:=least(12,o_energy+1);
      v_energy_before:=o_energy;

      if v_half=1 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','first_player_no_attack','energy',o_energy));
      elsif o_major='paralyzed' then
        o_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','paralyzed_skip','energy',o_energy));
      elsif o_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','asleep_skip','energy',o_energy));
      elsif o_cooldown_all>0 then
        o_cooldown_all:=o_cooldown_all-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','cooldown_skip','energy',o_energy));
      else
        v_plan:=private.battle_v5_attack_plan(o.id,c.id,o_energy,o_damage,c_damage,case when o_blocked_turns>0 then o_blocked_attack else null end);
        if o_blocked_turns>0 then o_blocked_turns:=o_blocked_turns-1; if o_blocked_turns=0 then o_blocked_attack:=null; end if; end if;
        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          if o_major='confused' and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':confused')<0.5 then
            o_damage:=least(o_hp,o_damage+30);
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_raw:=(v_plan->>'rawDamage')::numeric;
            if v_plan->>'dynamicKind'='coin_multiplier' then
              v_heads:=0; v_coin_count:=coalesce((v_plan->>'dynamicCount')::integer,0);
              for v_i in 1..v_coin_count loop
                if private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              v_raw:=coalesce((v_plan->>'perUnitDamage')::numeric,0)*v_heads;
            end if;
            v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0)-coalesce((v_plan->>'resistance')::numeric,0));
            v_ignore_defender_effects:=lower(coalesce(v_plan->>'attackText','')) like '%damage isn''t affected by any effects on your opponent%';
            if not v_ignore_defender_effects and jsonb_typeof(c.tcg_data->'abilities')='array' then
              for v_ability in select value from jsonb_array_elements(c.tcg_data->'abilities') loop
                v_ability_text:=lower(coalesce(v_ability->>'text',''));
                if c_damage=0 and v_effective>=c_hp and v_ability_text like '%full hp%' and v_ability_text like '%would be knocked out by damage%' and v_ability_text like '%remaining hp becomes 10%' then
                  v_effective:=greatest(0,c_hp-10);
                end if;
                v_match:=regexp_match(v_ability_text,'takes ([0-9]+) less damage from attacks');
                if v_match is not null then v_effective:=greatest(0,v_effective-v_match[1]::numeric); end if;
                v_match:=regexp_match(v_ability_text,'damage done to this pok[eé]mon by attacks is reduced by ([0-9]+)');
                if v_match is not null then v_effective:=greatest(0,v_effective-v_match[1]::numeric); end if;
              end loop;
            end if;
            c_damage:=least(c_hp,c_damage+v_effective);
            o_damage_dealt:=o_damage_dealt+v_effective;
            o_last_attack:=v_attack_name; o_last_damage:=v_effective; o_last_advantage:=coalesce(v_plan->>'advantage','neutral');
            v_heal:=coalesce((v_plan->>'healDamage')::numeric,0); if v_heal>0 then o_damage:=greatest(0,o_damage-v_heal); end if;
            v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then o_damage:=least(o_hp,o_damage+v_recoil); end if;
            v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); o_energy:=greatest(0,o_energy-v_discard);
            o_cooldown_all:=greatest(o_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
            if coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then o_blocked_attack:=v_attack_name; o_blocked_turns:=1; end if;
            v_status:=v_plan->>'inflictStatus'; v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
            if v_status is not null and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':status')<=v_status_chance then
              if v_status='poisoned' then c_poison:=true;
              elsif v_status='burned' then c_burn:=true;
              else c_major:=v_status; end if;
            end if;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','attack','attack',v_attack_name,'energyBefore',v_energy_before,'energyAfter',o_energy,'damage',round(v_effective,2),'defenderRemainingHp',greatest(0,c_hp-c_damage),'effects',coalesce(v_plan->'effectNotes','[]'::jsonb)));
          end if;
        else
          v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','charging','energy',o_energy));
        end if;
      end if;
    end if;

    if c_damage>=c_hp or o_damage>=o_hp then
      if c_damage>=c_hp and o_damage>=o_hp then
        v_winner_side:=case when private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':sudden')>=0.5 then 'challenger' else 'opponent' end;
        v_resolution:='simultaneous_ko_sudden_death';
      elsif o_damage>=o_hp then v_winner_side:='challenger'; v_resolution:='knockout';
      else v_winner_side:='opponent'; v_resolution:='knockout'; end if;
      exit;
    end if;

    if c_poison then c_damage:=least(c_hp,c_damage+10); end if;
    if o_poison then o_damage:=least(o_hp,o_damage+10); end if;
    if c_burn then
      c_damage:=least(c_hp,c_damage+20);
      if private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':c_burn')>=0.5 then c_burn:=false; end if;
    end if;
    if o_burn then
      o_damage:=least(o_hp,o_damage+20);
      if private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':o_burn')>=0.5 then o_burn:=false; end if;
    end if;
    if c_major='asleep' and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':c_sleep')>=0.5 then c_major:=null; end if;
    if o_major='asleep' and private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':o_sleep')>=0.5 then o_major:=null; end if;

    if c_damage>=c_hp or o_damage>=o_hp then
      if c_damage>=c_hp and o_damage>=o_hp then
        v_winner_side:=case when private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':'||v_half||':checkup_sudden')>=0.5 then 'challenger' else 'opponent' end;
        v_resolution:='checkup_simultaneous_sudden_death';
      elsif o_damage>=o_hp then v_winner_side:='challenger'; v_resolution:='pokemon_checkup_ko';
      else v_winner_side:='opponent'; v_resolution:='pokemon_checkup_ko'; end if;
      exit;
    end if;
  end loop;

  if v_winner_side is null then
    if greatest(0,c_hp-c_damage)>greatest(0,o_hp-o_damage) then v_winner_side:='challenger';
    elsif greatest(0,o_hp-o_damage)>greatest(0,c_hp-c_damage) then v_winner_side:='opponent';
    elsif c_damage_dealt>o_damage_dealt then v_winner_side:='challenger';
    elsif o_damage_dealt>c_damage_dealt then v_winner_side:='opponent';
    else v_winner_side:=case when private.battle_v5_hash_roll(p_battle_id::text||':'||p_round_no||':turn_limit')>=0.5 then 'challenger' else 'opponent' end; end if;
    v_resolution:='turn_limit';
  end if;

  return jsonb_build_object(
    'rulesVersion',5,
    'engine','official_tcg_virtual_energy',
    'firstPlayer',case when c_first then 'challenger' else 'opponent' end,
    'winnerSide',v_winner_side,
    'resolution',v_resolution,
    'trace',v_trace,
    'challenger',c_profile||jsonb_build_object(
      'attackName',coalesce(c_last_attack,'Sem ataque'),
      'effectiveDamage',round(c_last_damage,2),
      'totalDamageDealt',round(c_damage_dealt,2),
      'damageTaken',round(c_damage,2),
      'remainingHp',greatest(0,round(c_hp-c_damage,2)),
      'energyAtEnd',c_energy,
      'turnsTaken',c_turns,
      'turnsToKnockout',c_turns,
      'knockedOut',c_damage>=c_hp,
      'advantage',c_last_advantage,
      'virtualEnergy',true
    ),
    'opponent',o_profile||jsonb_build_object(
      'attackName',coalesce(o_last_attack,'Sem ataque'),
      'effectiveDamage',round(o_last_damage,2),
      'totalDamageDealt',round(o_damage_dealt,2),
      'damageTaken',round(o_damage,2),
      'remainingHp',greatest(0,round(o_hp-o_damage,2)),
      'energyAtEnd',o_energy,
      'turnsTaken',o_turns,
      'turnsToKnockout',o_turns,
      'knockedOut',o_damage>=o_hp,
      'advantage',o_last_advantage,
      'virtualEnergy',true
    )
  );
end;
$$;

create or replace function public.server_resolve_battle_round(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  b public.battles%rowtype;
  c_card text;
  o_card text;
  v_sim jsonb;
  c_stats jsonb;
  o_stats jsonb;
  c_power numeric;
  o_power numeric;
  c_roll numeric;
  o_roll numeric;
  v_winner uuid;
  v_result jsonb;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true); end if;

  select card_id into c_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;
  select card_id into o_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;
  if c_card is null or o_card is null then return jsonb_build_object('waiting',true,'round',b.active_round); end if;

  v_sim:=private.battle_simulate_duel_v5(b.id,b.active_round,c_card,o_card);
  c_stats:=v_sim->'challenger';
  o_stats:=v_sim->'opponent';
  v_winner:=case when v_sim->>'winnerSide'='challenger' then b.challenger_id else b.opponent_id end;
  c_power:=coalesce((c_stats->>'totalDamageDealt')::numeric,0)+coalesce((c_stats->>'remainingHp')::numeric,0);
  o_power:=coalesce((o_stats->>'totalDamageDealt')::numeric,0)+coalesce((o_stats->>'remainingHp')::numeric,0);
  c_roll:=private.battle_v5_hash_roll(b.id::text||':'||b.active_round||':score:c');
  o_roll:=private.battle_v5_hash_roll(b.id::text||':'||b.active_round||':score:o');

  v_result:=public.server_finish_battle_round(b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner);

  update public.battle_rounds
  set challenger_combat=c_stats||jsonb_build_object('firstPlayer',(v_sim->>'firstPlayer')='challenger','resolution',v_sim->>'resolution','rulesVersion',5),
      opponent_combat=o_stats||jsonb_build_object('firstPlayer',(v_sim->>'firstPlayer')='opponent','resolution',v_sim->>'resolution','rulesVersion',5),
      rules_version=5
  where battle_id=b.id and round_no=b.active_round;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'tcg_v5_resolved',jsonb_build_object(
    'round',b.active_round,'winnerId',v_winner,'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution','trace',v_sim->'trace'
  ));

  return v_result||jsonb_build_object(
    'round',b.active_round,
    'challengerCardId',c_card,
    'opponentCardId',o_card,
    'challengerCombat',c_stats,
    'opponentCombat',o_stats,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'rulesVersion',5
  );
end;
$$;

revoke all on function private.battle_v5_hash_roll(text) from public,anon,authenticated;
revoke all on function private.battle_v5_attack_plan(text,text,integer,numeric,numeric,text) from public,anon,authenticated;
revoke all on function private.battle_simulate_duel_v5(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;
