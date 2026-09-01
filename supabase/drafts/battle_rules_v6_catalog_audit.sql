-- Battle Rules v6
-- Exhaustive-catalog hardening of the 1v1 TCG-inspired duel.
-- Keeps the app's Quick / Mystery / Draft 3 formats, but models common
-- physical Pokemon TCG attack/ability semantics with compatible virtual Energy.

create or replace function private.battle_v6_hash_roll(p_key text)
returns numeric
language sql
immutable
parallel safe
set search_path=''
as $$
  select ((('x'||substr(md5(coalesce(p_key,'')),1,8))::bit(32)::bigint) / 4294967295.0)::numeric;
$$;

create or replace function private.battle_v6_can_attack(
  p_attacker_card_id text,
  p_defender_card_id text
)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare
  v_attacker public.cards%rowtype;
  v_defender public.cards%rowtype;
  v_ability jsonb;
  v_text text;
  v_def_classes text;
  v_match text[];
begin
  select * into v_attacker from public.cards where id=p_attacker_card_id;
  select * into v_defender from public.cards where id=p_defender_card_id;
  if v_attacker.id is null or v_defender.id is null then return false; end if;

  v_def_classes:=lower(coalesce(v_defender.tcg_data->'subtypes','[]'::jsonb)::text);

  if jsonb_typeof(v_attacker.tcg_data->'abilities')='array' then
    for v_ability in select value from jsonb_array_elements(v_attacker.tcg_data->'abilities') loop
      v_text:=lower(coalesce(v_ability->>'text',''));

      -- Slaking ex / equivalent: the opponent's Active Pokemon itself counts as in play.
      if v_text like '%if your opponent has no pokémon ex or pokémon v in play%this pokémon can''t attack%'
         or v_text like '%if your opponent has no pokemon ex or pokemon v in play%this pokemon can''t attack%' then
        if not (
          v_def_classes ~ '"ex"'
          or v_def_classes ~ '"v"'
          or v_def_classes ~ '"vmax"'
          or v_def_classes ~ '"vstar"'
          or v_def_classes ~ '"v-union"'
        ) then return false; end if;
      end if;

      -- Board-count requirements cannot be met in the isolated 1v1 round when they
      -- explicitly require more than one allied Pokemon in play.
      v_match:=regexp_match(v_text,'can''t attack unless you have ([0-9]+) or more .*pok[eé]mon in play');
      if v_match is not null and v_match[1]::integer>1 then return false; end if;
    end loop;
  end if;

  return true;
end;
$$;

create or replace function private.battle_v6_matches_class(
  p_card_id text,
  p_class text
)
returns boolean
language plpgsql
stable
set search_path=''
as $body$
declare
  v_card public.cards%rowtype;
  v_classes text;
  v_has_ability boolean:=false;
begin
  if coalesce(p_class,'all')='all' then return true; end if;
  select * into v_card from public.cards where id=p_card_id;
  if v_card.id is null then return false; end if;
  v_classes:=lower(coalesce(v_card.tcg_data->'subtypes','[]'::jsonb)::text);
  v_has_ability:=jsonb_typeof(v_card.tcg_data->'abilities')='array'
    and jsonb_array_length(v_card.tcg_data->'abilities')>0;
  return case lower(p_class)
    when 'ex' then v_classes ~ '"ex"'
    when 'v' then v_classes ~ '"v"' or v_classes ~ '"vmax"' or v_classes ~ '"vstar"' or v_classes ~ '"v-union"'
    when 'vmax' then v_classes ~ '"vmax"'
    when 'gx' then v_classes ~ '"gx"'
    when 'basic' then v_classes ~ '"basic"'
    when 'ability' then v_has_ability
    else true
  end;
end;
$body$;

create or replace function private.battle_v6_defense_adjustment(
  p_attacker_card_id text,
  p_defender_card_id text,
  p_defender_damage numeric,
  p_incoming_damage numeric,
  p_roll_key text
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_attacker public.cards%rowtype;
  v_defender public.cards%rowtype;
  v_attacker_classes text;
  v_has_ability boolean:=false;
  v_ability jsonb;
  v_text text;
  v_damage numeric:=greatest(0,coalesce(p_incoming_damage,0));
  v_def_hp numeric;
  v_match text[];
  v_effect_immune boolean:=false;
  v_reactive_damage numeric:=0;
  v_reactive_status text:=null;
  v_roll numeric;
  v_is_ex boolean:=false;
  v_is_v boolean:=false;
  v_is_vmax boolean:=false;
  v_is_gx boolean:=false;
  v_is_basic boolean:=false;
begin
  select * into v_attacker from public.cards where id=p_attacker_card_id;
  select * into v_defender from public.cards where id=p_defender_card_id;
  if v_attacker.id is null or v_defender.id is null then
    return jsonb_build_object('damage',v_damage,'effectImmune',false,'reactiveDamage',0);
  end if;

  v_attacker_classes:=lower(coalesce(v_attacker.tcg_data->'subtypes','[]'::jsonb)::text);
  v_is_ex:=v_attacker_classes ~ '"ex"' or v_attacker_classes ~ '"ex team plasma"';
  v_is_v:=v_attacker_classes ~ '"v"' or v_attacker_classes ~ '"vmax"' or v_attacker_classes ~ '"vstar"' or v_attacker_classes ~ '"v-union"';
  v_is_vmax:=v_attacker_classes ~ '"vmax"';
  v_is_gx:=v_attacker_classes ~ '"gx"';
  v_is_basic:=v_attacker_classes ~ '"basic"';
  v_has_ability:=jsonb_typeof(v_attacker.tcg_data->'abilities')='array'
    and jsonb_array_length(v_attacker.tcg_data->'abilities')>0;

  v_def_hp:=greatest(10,least(1000,coalesce(
    nullif(regexp_replace(coalesce(v_defender.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50
  )));

  if jsonb_typeof(v_defender.tcg_data->'abilities')='array' then
    for v_ability in select value from jsonb_array_elements(v_defender.tcg_data->'abilities') loop
      v_text:=lower(coalesce(v_ability->>'text',''));

      -- Flat reductions.
      v_match:=regexp_match(v_text,'takes ([0-9]+) less damage from attacks');
      if v_match is not null then v_damage:=greatest(0,v_damage-v_match[1]::numeric); end if;
      v_match:=regexp_match(v_text,'damage done to this pok[eé]mon by attacks is reduced by ([0-9]+)');
      if v_match is not null then v_damage:=greatest(0,v_damage-v_match[1]::numeric); end if;
      v_match:=regexp_match(v_text,'any damage done to this pok[eé]mon by attacks is reduced by ([0-9]+)');
      if v_match is not null then v_damage:=greatest(0,v_damage-v_match[1]::numeric); end if;

      -- Full-HP survival abilities.
      if coalesce(p_defender_damage,0)=0
         and v_damage>=v_def_hp
         and v_text like '%would be knocked out by damage from an attack%'
         and v_text like '%remaining hp becomes 10%' then
        if v_text like '%flip a coin%' then
          v_roll:=private.battle_v6_hash_roll(p_roll_key||':survive:'||coalesce(v_ability->>'name',''));
          if v_roll>=0.5 then v_damage:=greatest(0,v_def_hp-10); end if;
        else
          v_damage:=greatest(0,v_def_hp-10);
        end if;
      end if;

      -- Coin-flip damage prevention.
      if v_damage>0
         and v_text like '%if any damage is done to this pokémon by attacks%'
         and v_text like '%flip a coin%'
         and v_text like '%if heads, prevent that damage%' then
        if private.battle_v6_hash_roll(p_roll_key||':prevent:'||coalesce(v_ability->>'name',''))>=0.5 then
          v_damage:=0;
        end if;
      end if;

      -- Class-based attack prevention.
      if v_text like '%prevent all damage done to this pokémon by attacks from your opponent''s pokémon ex and pokémon v%'
         and (v_is_ex or v_is_v) then v_damage:=0; end if;
      if v_text like '%prevent all damage done to this pokémon by attacks from your opponent''s pokémon v and pokémon-gx%'
         and (v_is_v or v_is_gx) then v_damage:=0; end if;
      if v_text like '%prevent all damage done to this pokémon by attacks from your opponent''s pokémon vmax%'
         and v_is_vmax then v_damage:=0; end if;
      if v_text like '%prevent all damage from attacks done to this pokémon by your opponent''s pokémon that have an ability%'
         and v_has_ability then v_damage:=0; end if;
      if v_text like '%prevent all damage done to this pokémon by attacks from basic pokémon%'
         and v_is_basic then v_damage:=0; end if;

      -- Effects immunity (damage remains unless the ability says "including damage").
      if (
        v_text like '%prevent all effects of attacks from your opponent''s pokémon done to this pokémon%'
        or v_text like '%prevent all effects of attacks used by your opponent''s pokémon done to this pokémon%'
      ) and v_text like '%damage is not an effect%' then
        v_effect_immune:=true;
      end if;

      if v_text like '%prevent all effects of attacks, including damage%'
         and (
           (v_text like '%pokémon-gx%' and v_is_gx)
           or (v_text like '%pokémon-ex%' and v_is_ex)
           or (v_text like '%pokémon v%' and v_is_v)
         ) then
        v_effect_immune:=true;
        v_damage:=0;
      end if;

      -- Reactive damage/status even if the defender is Knocked Out.
      if v_damage>0 and v_text like '%damaged by an attack%' then
        v_match:=regexp_match(v_text,'put ([0-9]+) damage counters? on the attacking pok[eé]mon');
        if v_match is not null then
          v_reactive_damage:=greatest(v_reactive_damage,v_match[1]::numeric*10);
        end if;
        if v_text like '%attacking pokémon is now burned%' then v_reactive_status:='burned'; end if;
        if v_text like '%attacking pokémon is now poisoned%' then v_reactive_status:='poisoned'; end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'damage',greatest(0,v_damage),
    'effectImmune',v_effect_immune,
    'reactiveDamage',greatest(0,v_reactive_damage),
    'reactiveStatus',v_reactive_status
  );
end;
$$;

create or replace function private.battle_v6_attack_plan(
  p_attacker_card_id text,
  p_defender_card_id text,
  p_energy integer,
  p_defender_energy integer,
  p_attacker_damage numeric,
  p_defender_damage numeric,
  p_defender_special boolean,
  p_ignore_defender_weakness boolean,
  p_blocked_attacks text[] default null
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
  v_expected_raw numeric;
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
  v_heal_equal boolean:=false;
  v_interval integer := 1;
  v_effect_notes text[];
  v_status_bonus numeric := 0;
  v_coin_gate_count integer:=0;
  v_coin_gate_heads integer:=0;
  v_coin_bonus_count integer:=0;
  v_coin_bonus_per_head numeric:=0;
  v_coin_until_tails boolean:=false;
  v_coin_multiplier boolean:=false;
  v_ignore_weakness_resistance boolean:=false;
  v_ignore_resistance boolean:=false;
  v_defender_energy_discard integer:=0;
  v_defender_energy_discard_chance numeric:=1;
  v_defender_energy_discard_coins integer:=0;
  v_self_reduction_next numeric:=0;
  v_self_prevent_next boolean:=false;
  v_self_prevent_chance numeric:=1;
  v_self_prevent_class text:='all';
  v_cooldown_attack_permanent boolean:=false;
  v_ignore_defender_effects boolean:=false;
  v_defender_cannot_attack_next boolean:=false;
  v_defender_outgoing_reduction_next numeric:=0;
  v_self_no_weakness_next boolean:=false;
  v_self_reactive_damage_next numeric:=0;
  v_self_prevent_damage_cap_next numeric:=0;
  v_inflict_self_major text:=null;
  v_direct_damage_counters numeric:=0;
  v_defender_classes text;
  v_defender_retreat integer:=0;
  v_heal_all boolean:=false;
  v_defender_attack_gate_chance numeric:=0;
  v_lock_defender_best boolean:=false;
begin
  select * into v_attacker from public.cards where id=p_attacker_card_id;
  select * into v_defender from public.cards where id=p_defender_card_id;
  if v_attacker.id is null or v_defender.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  if not private.battle_v6_can_attack(v_attacker.id,v_defender.id) then return null; end if;

  v_attacker_type := coalesce(v_attacker.types[1],'Colorless');
  v_defender_classes:=lower(coalesce(v_defender.tcg_data->'subtypes','[]'::jsonb)::text);
  v_defender_retreat:=greatest(0,least(10,coalesce(nullif(regexp_replace(coalesce(v_defender.tcg_data->>'convertedRetreatCost',''),'[^0-9]','','g'),'')::integer,0)));
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

  if coalesce(p_ignore_defender_weakness,false) then
    v_weakness_multiplier:=1;
    v_weakness_bonus:=0;
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
    if exists (
      select 1 from unnest(coalesce(p_blocked_attacks,array[]::text[])) x
      where lower(x)=lower(v_name)
    ) then continue; end if;

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
    v_expected_raw:=v_base;
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
    v_heal_equal:=false;
    v_effect_notes:=array[]::text[];
    v_status_bonus:=0;
    v_coin_gate_count:=0;
    v_coin_gate_heads:=0;
    v_coin_bonus_count:=0;
    v_coin_bonus_per_head:=0;
    v_coin_until_tails:=false;
    v_coin_multiplier:=false;
    v_ignore_weakness_resistance:=false;
    v_ignore_resistance:=false;
    v_defender_energy_discard:=0;
    v_defender_energy_discard_chance:=1;
    v_defender_energy_discard_coins:=0;
    v_self_reduction_next:=0;
    v_self_prevent_next:=false;
    v_self_prevent_chance:=1;
    v_self_prevent_class:='all';
    v_cooldown_attack_permanent:=false;
    v_ignore_defender_effects:=false;
    v_defender_cannot_attack_next:=false;
    v_defender_outgoing_reduction_next:=0;
    v_self_no_weakness_next:=false;
    v_self_reactive_damage_next:=0;
    v_self_prevent_damage_cap_next:=0;
    v_inflict_self_major:=null;
    v_direct_damage_counters:=0;
    v_heal_all:=false;
    v_defender_attack_gate_chance:=0;
    v_lock_defender_best:=false;

    -- Text-only attacks that can target any opposing Pokemon target the Active in this 1v1 format.
    if v_base=0 and v_text not like '%benched pokémon%' then
      v_match:=regexp_match(v_text,'(?:this attack )?does ([0-9]+) damage to (?:1|each) of your opponent''s pok[eé]mon');
      if v_match is null then v_match:=regexp_match(v_text,'choose 1 of your opponent''s pok[eé]mon.*this attack does ([0-9]+) damage to that pok[eé]mon'); end if;
      if v_match is null then v_match:=regexp_match(v_text,'does ([0-9]+) damage to each defending pok[eé]mon'); end if;
      if v_match is not null then
        v_raw:=v_match[1]::numeric;
        v_expected_raw:=v_raw;
        v_effect_notes:=array_append(v_effect_notes,'dano direcionado ao Pokémon Ativo');
      end if;
    end if;

    -- Non-random conditional damage.
    if v_text ~ 'if this pok[eé]mon has any damage counter' then
      v_match:=regexp_match(v_text,'does ([0-9]+) more damage');
      if v_match is not null and coalesce(p_attacker_damage,0)>0 then
        v_raw:=v_raw+v_match[1]::numeric;
        v_expected_raw:=v_expected_raw+v_match[1]::numeric;
        v_effect_notes:=array_append(v_effect_notes,'bônus por dano no atacante');
      end if;
    end if;

    v_match:=regexp_match(v_text,'(?:does )?([0-9]+) more damage for each damage counter on this pok[eé]mon');
    if v_match is not null then
      v_raw:=v_raw+(floor(coalesce(p_attacker_damage,0)/10)*v_match[1]::numeric);
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por contadores de dano do atacante');
    end if;

    v_match:=regexp_match(v_text,'(?:does )?([0-9]+) more damage for each damage counter on (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)');
    if v_match is not null then
      v_raw:=v_raw+(floor(coalesce(p_defender_damage,0)/10)*v_match[1]::numeric);
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por contadores de dano do defensor');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) (?:already )?has any damage counters? on it, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_damage,0)>0 then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_expected_raw+v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'bônus porque o defensor já está ferido');
    end if;

    v_match:=regexp_match(v_text,'this attack does ([0-9]+) damage for each damage counter on this pok[eé]mon');
    if v_match is not null then
      v_raw:=floor(coalesce(p_attacker_damage,0)/10)*v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'dano por contadores do atacante');
    end if;

    v_match:=regexp_match(v_text,'(?:does )?([0-9]+) less damage for each damage counter on this pok[eé]mon');
    if v_match is not null then
      v_raw:=greatest(0,v_raw-floor(coalesce(p_attacker_damage,0)/10)*v_match[1]::numeric);
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'penalidade por contadores de dano');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is (?:a |an )?pok[eé]mon ex or pok[eé]mon v, this attack does ([0-9]+) more damage');
    if v_match is not null and (
      v_defender_classes ~ '"ex"' or v_defender_classes ~ '"v"' or v_defender_classes ~ '"vmax"' or v_defender_classes ~ '"vstar"' or v_defender_classes ~ '"v-union"'
    ) then
      v_raw:=v_raw+v_match[1]::numeric; v_expected_raw:=v_expected_raw+v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Pokémon ex/V');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is an evolution pok[eé]mon, this attack does ([0-9]+) more damage');
    if v_match is not null and not (v_defender_classes ~ '"basic"') then
      v_raw:=v_raw+v_match[1]::numeric; v_expected_raw:=v_expected_raw+v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Pokémon de Evolução');
    end if;

    v_match:=regexp_match(v_text,'if your opponent''s active pok[eé]mon is affected by a special condition, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_special,false) then
      v_raw:=v_raw+v_match[1]::numeric; v_expected_raw:=v_expected_raw+v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Condição Especial');
    end if;

    v_match:=regexp_match(v_text,'(?:does )?([0-9]+) more damage (?:for each|times the amount of)(?: [a-z]+)? energy attached to this pok[eé]mon');
    if v_match is not null then
      v_raw:=v_raw+v_match[1]::numeric*greatest(0,coalesce(p_energy,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por Energia anexada');
    end if;

    v_match:=regexp_match(v_text,'(?:does )?([0-9]+) more damage (?:for each|times the amount of)(?: [a-z]+)? energy attached to (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)');
    if v_match is not null then
      v_raw:=v_raw+v_match[1]::numeric*greatest(0,coalesce(p_defender_energy,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus pela Energia do defensor');
    end if;

    v_match:=regexp_match(v_text,'(?:this attack )?does ([0-9]+) damage times the amount of(?: [a-z]+)? energy attached to (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)');
    if v_match is not null then
      v_raw:=v_match[1]::numeric*greatest(0,coalesce(p_defender_energy,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'dano multiplicado pela Energia do defensor');
    end if;

    v_match:=regexp_match(v_text,'(?:this attack )?does ([0-9]+) more damage for each colorless in your opponent''s active pok[eé]mon''s retreat cost');
    if v_match is not null then
      v_raw:=v_raw+v_match[1]::numeric*v_defender_retreat;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus pelo custo de Recuo do defensor');
    end if;

    -- Energy-discard damage bonuses (Rayquaza VMAX style).
    v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each .*energy.*discard');
    if v_match is null and v_text like '%discard any amount%energy%' then
      v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each card you discarded');
    end if;
    if v_match is not null then
      v_per_unit:=v_match[1]::numeric;
      v_dynamic_count:=greatest(0,least(coalesce(p_energy,0),12));
      v_raw:=v_raw+v_per_unit*v_dynamic_count;
      v_expected_raw:=v_raw;
      v_dynamic_kind:='energy_discard_bonus';
      v_discard:=v_dynamic_count;
      v_effect_notes:=array_append(v_effect_notes,'dano variável por Energia descartada');
    end if;

    -- Multipliers from virtual Energy in hand (Twin Cannons style).
    if v_damage_text ~ '[×x*]' then
      v_match:=regexp_match(v_text,'discard up to ([0-9]+).*energy cards? from your hand');
      if v_match is not null and v_text like '%for each card%' then
        v_dynamic_kind:='virtual_hand_energy_multiplier';
        v_dynamic_count:=greatest(0,least(v_match[1]::integer,10));
        v_per_unit:=v_base;
        v_raw:=v_per_unit*v_dynamic_count;
        v_expected_raw:=v_raw;
        v_effect_notes:=array_append(v_effect_notes,'Energia virtual da mão aplicada ao multiplicador');
      elsif v_text ~ 'for each energy attached to this pok[eé]mon' then
        v_raw:=v_base*greatest(0,coalesce(p_energy,0));
        v_expected_raw:=v_raw;
        v_effect_notes:=array_append(v_effect_notes,'multiplicador por Energia anexada');
      end if;
    end if;

    -- Coin-driven damage.
    if v_text like '%flip a coin until you get tails%' then
      v_coin_until_tails:=true;
      v_match:=regexp_match(v_text,'does ([0-9]+) (?:more )?damage (?:times|for) (?:the number of )?heads');
      if v_match is null then v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each heads'); end if;
      if v_match is not null then
        v_coin_bonus_per_head:=v_match[1]::numeric;
        v_coin_multiplier:=v_damage_text ~ '[×x*]';
        if v_coin_multiplier then v_raw:=0; v_expected_raw:=v_coin_bonus_per_head;
        else v_expected_raw:=v_raw+v_coin_bonus_per_head; end if;
        v_effect_notes:=array_append(v_effect_notes,'moedas até sair coroa');
      end if;
    else
      v_match:=regexp_match(v_text,'flip ([0-9]+) coins?');
      if v_match is not null and v_text ~ '(?:for each heads|times the number of heads)' then
        v_coin_bonus_count:=greatest(1,least(v_match[1]::integer,20));
        v_match:=regexp_match(v_text,'does ([0-9]+) (?:more )?damage (?:times|for) (?:the number of )?heads');
        if v_match is null then v_match:=regexp_match(v_text,'does ([0-9]+) more damage for each heads'); end if;
        if v_match is not null then
          v_coin_bonus_per_head:=v_match[1]::numeric;
          v_coin_multiplier:=v_damage_text ~ '[×x*]';
          if v_coin_multiplier then
            v_raw:=0;
            v_expected_raw:=v_coin_bonus_per_head*v_coin_bonus_count*0.5;
          else
            v_expected_raw:=v_raw+v_coin_bonus_per_head*v_coin_bonus_count*0.5;
          end if;
          v_effect_notes:=array_append(v_effect_notes,'dano por caras');
        end if;
      end if;

      if v_text like '%flip a coin%' then
        v_match:=regexp_match(v_text,'if heads, this attack does ([0-9]+) more damage');
        if v_match is not null then
          v_coin_bonus_count:=greatest(v_coin_bonus_count,1);
          v_coin_bonus_per_head:=greatest(v_coin_bonus_per_head,v_match[1]::numeric);
          v_expected_raw:=v_expected_raw+v_match[1]::numeric*0.5;
          v_effect_notes:=array_append(v_effect_notes,'bônus de dano por cara');
        else
          v_match:=regexp_match(v_text,'if heads, this attack does [0-9]+ damage plus ([0-9]+) more damage');
          if v_match is not null then
            v_coin_bonus_count:=greatest(v_coin_bonus_count,1);
            v_coin_bonus_per_head:=greatest(v_coin_bonus_per_head,v_match[1]::numeric);
            v_expected_raw:=v_expected_raw+v_match[1]::numeric*0.5;
            v_effect_notes:=array_append(v_effect_notes,'bônus de dano por cara');
          end if;
        end if;
      end if;
    end if;

    if v_text like '%if your opponent''s active pokémon has no damage counters on it before this attack does damage, this attack does nothing%'
       and coalesce(p_defender_damage,0)<=0 then
      v_raw:=0;
      v_expected_raw:=0;
      v_effect_notes:=array_append(v_effect_notes,'ataque exige defensor já ferido');
    end if;

    -- Attack gates.
    if v_text like '%flip a coin. if tails, this attack does nothing%' then
      v_coin_gate_count:=1; v_coin_gate_heads:=1;
      v_expected_raw:=v_expected_raw*0.5;
      v_effect_notes:=array_append(v_effect_notes,'ataque depende de cara');
    end if;
    v_match:=regexp_match(v_text,'flip ([0-9]+) coins?.*if (?:either|any) of them is tails, this attack does nothing');
    if v_match is not null then
      v_coin_gate_count:=greatest(1,least(v_match[1]::integer,10));
      v_coin_gate_heads:=v_coin_gate_count;
      v_expected_raw:=v_expected_raw*power(0.5,v_coin_gate_count);
      v_effect_notes:=array_append(v_effect_notes,'ataque exige todas as moedas em cara');
    end if;

    -- Energy discard from self.
    if v_text like '%discard all energy from this pokémon%' or v_text like '%discard all energy from this pokemon%' then
      v_discard:=greatest(v_discard,coalesce(p_energy,0));
      v_effect_notes:=array_append(v_effect_notes,'descarta toda a Energia');
    else
      v_match:=regexp_match(v_text,'discard ([0-9]+)(?: [a-z]+)? energy (?:attached to |from )this pok[eé]mon');
      if v_match is not null then
        v_discard:=greatest(v_discard,v_match[1]::integer);
        v_effect_notes:=array_append(v_effect_notes,'descarta Energia');
      elsif v_text ~ 'discard (an|a)(?: [a-z]+)? energy (?:attached to |from )this pok[eé]mon' then
        v_discard:=greatest(v_discard,1);
        v_effect_notes:=array_append(v_effect_notes,'descarta 1 Energia');
      end if;
    end if;

    -- Energy discard from the opposing Active Pokemon.
    v_match:=regexp_match(v_text,'flip ([0-9]+) coins?.*for each heads, discard (?:an|a) energy (?:card )?(?:attached to |from )?(?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)');
    if v_match is not null then
      v_defender_energy_discard_coins:=greatest(1,least(v_match[1]::integer,20));
      v_defender_energy_discard:=0;
      v_effect_notes:=array_append(v_effect_notes,'descarta Energia do defensor por cara');
    elsif (
      v_text ~ 'discard (an|a) energy (?:card )?(?:attached to |from )(?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)'
      or v_text ~ 'discard an energy card attached to the defending pok[eé]mon'
    ) then
      v_defender_energy_discard:=1;
      if v_text like '%flip a coin%' then v_defender_energy_discard_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'descarta Energia do defensor');
    end if;

    v_match:=regexp_match(v_text,'put ([0-9]+) energy attached to this pok[eé]mon into your hand');
    if v_match is not null then
      v_discard:=greatest(v_discard,v_match[1]::integer);
      v_effect_notes:=array_append(v_effect_notes,'Energia volta para a mão');
    elsif v_text ~ 'put an energy attached to this pok[eé]mon into your hand' then
      v_discard:=greatest(v_discard,1);
      v_effect_notes:=array_append(v_effect_notes,'1 Energia volta para a mão');
    end if;

    -- Cooldowns.
    if v_text like '%during your next turn, this pokémon can''t attack%'
       or v_text like '%during your next turn, this pokemon can''t attack%'
       or v_text like '%this pokémon can''t attack during your next turn%' then
      v_cooldown_all:=1;
      v_effect_notes:=array_append(v_effect_notes,'não pode atacar no próximo turno');
    elsif v_text like '%during your next turn, this pokémon can''t use%'
       or v_text like '%during your next turn, this pokemon can''t use%'
       or v_text ~ 'this pok[eé]mon can.t use .+ during your next turn'
       or v_text like '%you can''t use this attack during your next turn%' then
      v_cooldown_attack:=1;
      v_effect_notes:=array_append(v_effect_notes,'ataque bloqueado no próximo turno');
    elsif v_text like '%can''t use this attack again as long as%' or v_text like '%cannot use this attack again as long as%' then
      v_cooldown_attack_permanent:=true;
      v_effect_notes:=array_append(v_effect_notes,'ataque não pode ser reutilizado enquanto permanecer em jogo');
    end if;

    if v_text like '%during your opponent''s next turn, the defending pokémon can''t use attacks%'
       or v_text like '%during your opponent''s next turn, your opponent''s active pokémon can''t attack%' then
      v_defender_cannot_attack_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'defensor não pode atacar no próximo turno');
    end if;

    if v_text like '%if the defending pokémon is a basic pokémon%can''t attack during your opponent''s next turn%'
       and v_defender_classes ~ '"basic"' then
      v_defender_cannot_attack_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'Pokémon Básico defensor não pode atacar');
    end if;
    if v_text like '%if the defending pokémon is an evolution pokémon%can''t attack during your opponent''s next turn%'
       and not (v_defender_classes ~ '"basic"') then
      v_defender_cannot_attack_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'Pokémon de Evolução defensor não pode atacar');
    end if;

    v_match:=regexp_match(v_text,'during your opponent''s next turn, the defending pok[eé]mon''s attacks do ([0-9]+) less damage');
    if v_match is not null then
      v_defender_outgoing_reduction_next:=v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'reduz dano dos ataques do defensor no próximo turno');
    end if;

    -- Opponent next-turn attack interference.
    if v_text like '%if the defending pokémon tries to attack during your opponent''s next turn%'
       and v_text like '%if tails, that attack does nothing%' then
      v_defender_attack_gate_chance:=0.5;
      v_effect_notes:=array_append(v_effect_notes,'ataque do defensor pode falhar');
    end if;
    if v_text like '%choose 1 of the defending pokémon''s attacks%can''t use that attack during your opponent''s next turn%'
       or v_text like '%choose 1 of your opponent''s active pokémon''s attacks%can''t use that attack during your opponent''s next turn%' then
      v_lock_defender_best:=true;
      v_effect_notes:=array_append(v_effect_notes,'bloqueia melhor ataque do defensor');
    end if;

    if v_text like '%both active pokémon are now asleep%' then
      v_status:='asleep'; v_inflict_self_major:='asleep'; v_status_bonus:=35;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Adormecidos');
    elsif v_text like '%both active pokémon are now confused%' then
      v_status:='confused'; v_inflict_self_major:='confused'; v_status_bonus:=30;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Confusos');
    end if;

    v_match:=regexp_match(v_text,'(?:put|place) ([0-9]+) damage counters? on (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon|1 of your opponent''s pok[eé]mon)');
    if v_match is not null then
      v_direct_damage_counters:=greatest(v_direct_damage_counters,v_match[1]::numeric*10);
      v_effect_notes:=array_append(v_effect_notes,'coloca contadores de dano diretamente');
    end if;

    -- Special Conditions.
    if v_text like '%is now paralyzed%' then v_status:='paralyzed'; v_status_bonus:=55; end if;
    if v_text like '%is now asleep%' then v_status:='asleep'; v_status_bonus:=35; end if;
    if v_text like '%is now confused%' then v_status:='confused'; v_status_bonus:=30; end if;
    if v_text like '%is now poisoned%' then v_status:='poisoned'; v_status_bonus:=20; end if;
    if v_text like '%is now burned%' then v_status:='burned'; v_status_bonus:=25; end if;
    if v_status is not null then
      if v_text like '%flip a coin%' and (v_text like '%if heads%' or v_text like '%if tails%') then v_status_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'condição especial: '||v_status);
    end if;

    -- Recoil and healing.
    v_match:=regexp_match(v_text,'([0-9]+) damage to itself');
    if v_match is not null then v_recoil:=v_match[1]::numeric; v_effect_notes:=array_append(v_effect_notes,'dano de recuo'); end if;
    v_match:=regexp_match(v_text,'heal ([0-9]+) damage from (?:this pok[eé]mon|1 of your pok[eé]mon|each of your pok[eé]mon)');
    if v_match is not null then v_heal:=v_match[1]::numeric; v_effect_notes:=array_append(v_effect_notes,'cura'); end if;
    v_match:=regexp_match(v_text,'remove ([0-9]+) damage counters? from (?:this pok[eé]mon|1 of your pok[eé]mon)');
    if v_match is not null then v_heal:=greatest(v_heal,v_match[1]::numeric*10); v_effect_notes:=array_append(v_effect_notes,'remove contadores de dano'); end if;
    if v_text like '%heal all damage from this pokémon%' then v_heal_all:=true; v_effect_notes:=array_append(v_effect_notes,'cura todo o dano'); end if;
    if v_text like '%heal from this pokémon the same amount of damage you did%'
       or v_text like '%heal from this pokemon the same amount of damage you did%' then
      v_heal_equal:=true;
      v_effect_notes:=array_append(v_effect_notes,'cura igual ao dano causado');
    end if;

    if v_text like '%during your opponent''s next turn, this pokémon has no weakness%' then
      v_self_no_weakness_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'sem Fraqueza no próximo turno');
    end if;

    v_match:=regexp_match(v_text,'during your opponent''s next turn, if this pok[eé]mon is damaged by an attack.*(?:put|place) ([0-9]+) damage counters? on the attacking pok[eé]mon');
    if v_match is not null then
      v_self_reactive_damage_next:=v_match[1]::numeric*10;
      v_effect_notes:=array_append(v_effect_notes,'contra-dano no próximo turno');
    end if;

    v_match:=regexp_match(v_text,'during your opponent''s next turn, if this pok[eé]mon would be damaged by an attack, prevent that attack''s damage done to this pok[eé]mon if that damage is ([0-9]+) or less');
    if v_match is not null then
      v_self_prevent_damage_cap_next:=v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'previne dano baixo no próximo turno');
    end if;

    if v_text like '%during your opponent''s next turn%prevent all effects of attacks, including damage, done to this pokémon%' then
      v_self_prevent_next:=true;
      v_self_prevent_class:='all';
      v_effect_notes:=array_append(v_effect_notes,'previne todos os efeitos e dano no próximo turno');
    end if;

    -- Next-turn protection on the attacker.
    v_match:=regexp_match(v_text,'during your opponent''s next turn, this pok[eé]mon takes ([0-9]+) less damage from attacks');
    if v_match is not null then
      v_self_reduction_next:=greatest(v_self_reduction_next,v_match[1]::numeric);
      v_effect_notes:=array_append(v_effect_notes,'redução de dano no próximo turno');
    end if;
    v_match:=regexp_match(v_text,'during your opponent''s next turn, any damage done to this pok[eé]mon by attacks is reduced by ([0-9]+)');
    if v_match is not null then
      v_self_reduction_next:=greatest(v_self_reduction_next,v_match[1]::numeric);
      v_effect_notes:=array_append(v_effect_notes,'redução de dano no próximo turno');
    end if;
    if v_text like '%during your opponent''s next turn%prevent all damage%done to this pokémon%' then
      v_self_prevent_next:=true;
      if v_text like '%flip a coin%' and v_text like '%if heads%' then v_self_prevent_chance:=0.5; end if;
      if v_text like '%from pokémon-ex%' or v_text like '%from pokémon ex%' then v_self_prevent_class:='ex';
      elsif v_text like '%from pokémon vmax%' then v_self_prevent_class:='vmax';
      elsif v_text like '%from pokémon v%' then v_self_prevent_class:='v';
      elsif v_text like '%from basic pokémon%' then v_self_prevent_class:='basic';
      else v_self_prevent_class:='all'; end if;
      v_effect_notes:=array_append(v_effect_notes,'previne dano no próximo turno ('||v_self_prevent_class||')');
    end if;

    -- Weakness / Resistance bypass.
    v_ignore_weakness_resistance:=
      v_text like '%don''t apply weakness and resistance%'
      or v_text like '%do not apply weakness and resistance%'
      or v_text like '%damage isn''t affected by weakness or resistance%'
      or v_text like '%damage is not affected by weakness or resistance%';
    v_ignore_resistance:=
      not v_ignore_weakness_resistance
      and (
        v_text like '%damage isn''t affected by resistance%'
        or v_text like '%damage is not affected by resistance%'
        or v_text like '%don''t apply resistance%'
      );

    if v_ignore_weakness_resistance then
      v_effective:=greatest(0,v_expected_raw);
    elsif v_ignore_resistance then
      v_effective:=greatest(0,v_expected_raw*v_weakness_multiplier+v_weakness_bonus);
    else
      v_effective:=greatest(0,v_expected_raw*v_weakness_multiplier+v_weakness_bonus-v_resistance);
    end if;
    v_expected:=v_effective;

    v_interval:=greatest(
      1,
      least(12,v_discard),
      case when v_cooldown_all>0 then 2 else 1 end,
      case when v_cooldown_attack>0 then 2 else 1 end
    );

    if v_remaining_hp>0 and (v_expected+v_direct_damage_counters)>=v_remaining_hp then
      v_score:=1000000000+v_expected+v_direct_damage_counters-v_cost;
    else
      v_score:=(v_expected+v_direct_damage_counters)/v_interval
        +v_status_bonus
        +v_self_reduction_next*0.25
        +case when v_self_prevent_next then 45 else 0 end
        +case when v_self_no_weakness_next then 22 else 0 end
        +v_self_reactive_damage_next*0.30
        +case when v_self_prevent_damage_cap_next>0 then 28 else 0 end
        +case when v_defender_energy_discard>0 or v_defender_energy_discard_coins>0 then 18 else 0 end
        +case when v_lock_defender_best then 28 else 0 end
        +case when v_defender_cannot_attack_next then 45 else 0 end
        +v_defender_outgoing_reduction_next*0.35
        +v_defender_attack_gate_chance*35
        -v_recoil*0.5
        +v_heal*0.2
        +case when v_heal_equal then v_expected*0.15 else 0 end
        -v_cost*0.05;
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
        'expectedRawDamage',round(v_expected_raw,2),
        'effectiveDamage',round(v_effective,2),
        'dynamicKind',v_dynamic_kind,
        'dynamicCount',v_dynamic_count,
        'perUnitDamage',v_per_unit,
        'discardEnergy',least(greatest(v_discard,0),coalesce(p_energy,0)),
        'defenderEnergyDiscard',v_defender_energy_discard,
        'defenderEnergyDiscardChance',v_defender_energy_discard_chance,
        'defenderEnergyDiscardCoins',v_defender_energy_discard_coins,
        'cooldownAll',v_cooldown_all,
        'cooldownAttack',v_cooldown_attack,
        'cooldownAttackPermanent',v_cooldown_attack_permanent,
        'ignoreDefenderEffects',v_ignore_defender_effects,
        'defenderCannotAttackNext',v_defender_cannot_attack_next,
        'defenderOutgoingReductionNext',v_defender_outgoing_reduction_next,
        'defenderAttackGateChance',v_defender_attack_gate_chance,
        'lockDefenderBest',v_lock_defender_best,
        'inflictStatus',v_status,
        'statusChance',v_status_chance,
        'recoilDamage',v_recoil,
        'healDamage',v_heal,
        'healEqualDamage',v_heal_equal,
        'healAll',v_heal_all
      ) || jsonb_build_object(
        'selfReductionNext',v_self_reduction_next,
        'selfPreventNext',v_self_prevent_next,
        'selfPreventChance',v_self_prevent_chance,
        'selfPreventClass',v_self_prevent_class,
        'selfNoWeaknessNext',v_self_no_weakness_next,
        'selfReactiveDamageNext',v_self_reactive_damage_next,
        'selfPreventDamageCapNext',v_self_prevent_damage_cap_next,
        'inflictSelfMajor',v_inflict_self_major,
        'directDamageCounters',v_direct_damage_counters,
        'coinGateCount',v_coin_gate_count,
        'coinGateHeads',v_coin_gate_heads,
        'coinBonusCount',v_coin_bonus_count,
        'coinBonusPerHead',v_coin_bonus_per_head,
        'coinUntilTails',v_coin_until_tails,
        'coinMultiplier',v_coin_multiplier,
        'weaknessMultiplier',v_weakness_multiplier,
        'weaknessBonus',v_weakness_bonus,
        'resistance',v_resistance,
        'advantage',case when v_weakness_multiplier>1 or v_weakness_bonus>0 then 'weakness' when v_resistance>0 then 'resisted' else 'neutral' end,
        'ignoreWeaknessResistance',v_ignore_weakness_resistance,
        'ignoreResistance',v_ignore_resistance,
        'inflictPoison',v_text like '%is now poisoned%',
        'inflictBurn',v_text like '%is now burned%',
        'inflictMajor',case
          when v_text like '%is now paralyzed%' then 'paralyzed'
          when v_text like '%is now asleep%' then 'asleep'
          when v_text like '%is now confused%' then 'confused'
          else null end,
        'effectNotes',to_jsonb(v_effect_notes),
        'selectionScore',round(v_score,2)
      );
    end if;
  end loop;

  return v_best;
end;
$$;

create or replace function private.battle_simulate_duel_v6(
  p_battle_id uuid,
  p_round_no integer,
  p_challenger_card_id text,
  p_opponent_card_id text,
  p_seed text default null,
  p_first_challenger boolean default null
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
  c_reduce_next numeric:=0;
  o_reduce_next numeric:=0;
  c_prevent_next_class text:=null;
  o_prevent_next_class text:=null;
  c_attack_gate_next numeric:=0;
  o_attack_gate_next numeric:=0;
  c_disable_best_next integer:=0;
  o_disable_best_next integer:=0;
  c_outgoing_reduction_next numeric:=0;
  o_outgoing_reduction_next numeric:=0;
  c_no_weakness_next boolean:=false;
  o_no_weakness_next boolean:=false;
  c_reactive_next numeric:=0;
  o_reactive_next numeric:=0;
  c_prevent_damage_cap_next numeric:=0;
  o_prevent_damage_cap_next numeric:=0;
  c_first boolean;
  v_seed text;
  v_is_c boolean;
  v_half integer;
  v_plan jsonb;
  v_probe jsonb;
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
  v_required_heads integer;
  v_i integer;
  v_def jsonb;
  v_effect_immune boolean;
  v_reactive numeric;
  v_reactive_status text;
  v_attack_failed boolean;
  v_direct numeric;
  v_blocked text[];
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
  v_seed:=coalesce(p_seed,p_battle_id::text||':'||p_round_no);
  c_first:=coalesce(p_first_challenger,private.battle_v6_hash_roll(v_seed||':first')>=0.5);

  for v_half in 1..80 loop
    v_is_c:=case when c_first then mod(v_half,2)=1 else mod(v_half,2)=0 end;

    if v_is_c then
      c_turns:=c_turns+1;
      c_energy:=least(12,c_energy+1);
      v_energy_before:=c_energy;
      v_attack_failed:=false;

      if v_half=1 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','first_player_no_attack','energy',c_energy));
      elsif c_major='paralyzed' then
        c_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','paralyzed_skip','energy',c_energy));
      elsif c_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','asleep_skip','energy',c_energy));
      elsif c_cooldown_all>0 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','cooldown_skip','energy',c_energy));
      elsif c_attack_gate_next>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':attack_gate')<c_attack_gate_next then
        c_attack_gate_next:=0;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','attack_gate_failed','energy',c_energy));
      else
        c_attack_gate_next:=0;
        v_blocked:=array[]::text[];
        if c_blocked_turns>0 and c_blocked_attack is not null then v_blocked:=array_append(v_blocked,c_blocked_attack); end if;
        if c_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,o_damage,(o_major is not null or o_poison or o_burn),o_no_weakness_next,v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          c_disable_best_next:=c_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,o_damage,(o_major is not null or o_poison or o_burn),o_no_weakness_next,v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';

          if c_major='confused' and private.battle_v6_hash_roll(v_seed||':'||v_half||':confused')<0.5 then
            c_damage:=least(c_hp,c_damage+30);
            v_attack_failed:=true;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_coin_count:=coalesce((v_plan->>'coinGateCount')::integer,0);
            v_required_heads:=coalesce((v_plan->>'coinGateHeads')::integer,0);
            if v_coin_count>0 then
              v_heads:=0;
              for v_i in 1..v_coin_count loop
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':gate:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','attack_coin_failed','attack',v_attack_name,'heads',v_heads,'coins',v_coin_count));
              end if;
            end if;

            if not v_attack_failed then
              v_raw:=coalesce((v_plan->>'rawDamage')::numeric,0);

              if coalesce((v_plan->>'coinUntilTails')::boolean,false) then
                v_heads:=0;
                for v_i in 1..20 loop
                  exit when private.battle_v6_hash_roll(v_seed||':'||v_half||':until:'||v_i)<0.5;
                  v_heads:=v_heads+1;
                end loop;
                if coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_heads:=0; v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                for v_i in 1..v_coin_count loop
                  if private.battle_v6_hash_roll(v_seed||':'||v_half||':bonus:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                end loop;
                if coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              end if;

              if c_outgoing_reduction_next>0 then v_raw:=greatest(0,v_raw-c_outgoing_reduction_next); end if;

              if coalesce((v_plan->>'ignoreWeaknessResistance')::boolean,false) then
                v_effective:=greatest(0,v_raw);
              elsif coalesce((v_plan->>'ignoreResistance')::boolean,false) then
                v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0));
              else
                v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0)-coalesce((v_plan->>'resistance')::numeric,0));
              end if;

              if o_prevent_next_class is not null and private.battle_v6_matches_class(c.id,o_prevent_next_class) then v_effective:=0;
              elsif o_prevent_damage_cap_next>0 and v_effective<=o_prevent_damage_cap_next then v_effective:=0;
              elsif o_reduce_next>0 then v_effective:=greatest(0,v_effective-o_reduce_next); end if;

              if coalesce((v_plan->>'ignoreDefenderEffects')::boolean,false) then
                v_def:=jsonb_build_object('damage',v_effective,'effectImmune',false,'reactiveDamage',0);
              else
                v_def:=private.battle_v6_defense_adjustment(c.id,o.id,o_damage,v_effective,v_seed||':'||v_half||':def');
              end if;
              v_effective:=coalesce((v_def->>'damage')::numeric,v_effective);
              v_effect_immune:=coalesce((v_def->>'effectImmune')::boolean,false);
              v_reactive:=coalesce((v_def->>'reactiveDamage')::numeric,0);
              v_reactive_status:=v_def->>'reactiveStatus';

              o_damage:=least(o_hp,o_damage+v_effective);
              v_direct:=case when not v_effect_immune then coalesce((v_plan->>'directDamageCounters')::numeric,0) else 0 end;
              if v_direct>0 then o_damage:=least(o_hp,o_damage+v_direct); end if;
              c_damage_dealt:=c_damage_dealt+v_effective+v_direct;
              if o_reactive_next>0 and v_effective>0 then c_damage:=least(c_hp,c_damage+o_reactive_next); end if;
              c_last_attack:=v_attack_name; c_last_damage:=v_effective; c_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if coalesce((v_plan->>'healAll')::boolean,false) then c_damage:=0;
              elsif v_heal>0 then c_damage:=greatest(0,c_damage-v_heal); end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then c_damage:=least(c_hp,c_damage+v_recoil); end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); c_energy:=greatest(0,c_energy-v_discard);
              c_cooldown_all:=greatest(c_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then c_blocked_attack:=v_attack_name; c_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then c_blocked_attack:=v_attack_name; c_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then c_reduce_next:=greatest(c_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then c_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then c_reactive_next:=greatest(c_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then c_prevent_damage_cap_next:=greatest(c_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' then c_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'selfPreventNext')::boolean,false)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_prevent')<=coalesce((v_plan->>'selfPreventChance')::numeric,1)
              then c_prevent_next_class:=coalesce(v_plan->>'selfPreventClass','all'); end if;

              if not v_effect_immune then
                if coalesce((v_plan->>'defenderEnergyDiscardCoins')::integer,0)>0 then
                  v_heads:=0; v_coin_count:=(v_plan->>'defenderEnergyDiscardCoins')::integer;
                  for v_i in 1..v_coin_count loop
                    if private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard_coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                  end loop;
                  o_energy:=greatest(0,o_energy-v_heads);
                elsif coalesce((v_plan->>'defenderEnergyDiscard')::integer,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard')<=coalesce((v_plan->>'defenderEnergyDiscardChance')::numeric,1)
                then o_energy:=greatest(0,o_energy-(v_plan->>'defenderEnergyDiscard')::integer); end if;
                if coalesce((v_plan->>'defenderAttackGateChance')::numeric,0)>0 then o_attack_gate_next:=greatest(o_attack_gate_next,(v_plan->>'defenderAttackGateChance')::numeric); end if;
                if coalesce((v_plan->>'defenderCannotAttackNext')::boolean,false) then o_cooldown_all:=greatest(o_cooldown_all,1); end if;
                if coalesce((v_plan->>'defenderOutgoingReductionNext')::numeric,0)>0 then o_outgoing_reduction_next:=greatest(o_outgoing_reduction_next,(v_plan->>'defenderOutgoingReductionNext')::numeric); end if;
                if coalesce((v_plan->>'lockDefenderBest')::boolean,false) then o_disable_best_next:=greatest(o_disable_best_next,1); end if;

                v_status:=coalesce(v_plan->>'inflictMajor',v_plan->>'inflictStatus');
                v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) then o_poison:=true; end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) then o_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') then o_major:=v_status; end if;
                end if;
              end if;

              if v_reactive>0 then c_damage:=least(c_hp,c_damage+v_reactive); end if;
              if v_reactive_status='poisoned' then c_poison:=true; elsif v_reactive_status='burned' then c_burn:=true; end if;

              v_trace:=v_trace||jsonb_build_array(jsonb_build_object(
                'halfTurn',v_half,'side','challenger','event','attack','attack',v_attack_name,
                'energyBefore',v_energy_before,'energyAfter',c_energy,
                'damage',round(v_effective,2),'defenderRemainingHp',greatest(0,o_hp-o_damage),
                'effects',coalesce(v_plan->'effectNotes','[]'::jsonb)
              ));
            end if;
          end if;
        else
          v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','charging_or_restricted','energy',c_energy));
        end if;
      end if;

    else
      o_turns:=o_turns+1;
      o_energy:=least(12,o_energy+1);
      v_energy_before:=o_energy;
      v_attack_failed:=false;

      if v_half=1 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','first_player_no_attack','energy',o_energy));
      elsif o_major='paralyzed' then
        o_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','paralyzed_skip','energy',o_energy));
      elsif o_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','asleep_skip','energy',o_energy));
      elsif o_cooldown_all>0 then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','cooldown_skip','energy',o_energy));
      elsif o_attack_gate_next>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':attack_gate')<o_attack_gate_next then
        o_attack_gate_next:=0;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','attack_gate_failed','energy',o_energy));
      else
        o_attack_gate_next:=0;
        v_blocked:=array[]::text[];
        if o_blocked_turns>0 and o_blocked_attack is not null then v_blocked:=array_append(v_blocked,o_blocked_attack); end if;
        if o_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,c_damage,(c_major is not null or c_poison or c_burn),c_no_weakness_next,v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          o_disable_best_next:=o_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,c_damage,(c_major is not null or c_poison or c_burn),c_no_weakness_next,v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';

          if o_major='confused' and private.battle_v6_hash_roll(v_seed||':'||v_half||':confused')<0.5 then
            o_damage:=least(o_hp,o_damage+30);
            v_attack_failed:=true;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_coin_count:=coalesce((v_plan->>'coinGateCount')::integer,0);
            v_required_heads:=coalesce((v_plan->>'coinGateHeads')::integer,0);
            if v_coin_count>0 then
              v_heads:=0;
              for v_i in 1..v_coin_count loop
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':gate:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','attack_coin_failed','attack',v_attack_name,'heads',v_heads,'coins',v_coin_count));
              end if;
            end if;

            if not v_attack_failed then
              v_raw:=coalesce((v_plan->>'rawDamage')::numeric,0);

              if coalesce((v_plan->>'coinUntilTails')::boolean,false) then
                v_heads:=0;
                for v_i in 1..20 loop
                  exit when private.battle_v6_hash_roll(v_seed||':'||v_half||':until:'||v_i)<0.5;
                  v_heads:=v_heads+1;
                end loop;
                if coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_heads:=0; v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                for v_i in 1..v_coin_count loop
                  if private.battle_v6_hash_roll(v_seed||':'||v_half||':bonus:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                end loop;
                if coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              end if;

              if o_outgoing_reduction_next>0 then v_raw:=greatest(0,v_raw-o_outgoing_reduction_next); end if;

              if coalesce((v_plan->>'ignoreWeaknessResistance')::boolean,false) then
                v_effective:=greatest(0,v_raw);
              elsif coalesce((v_plan->>'ignoreResistance')::boolean,false) then
                v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0));
              else
                v_effective:=greatest(0,v_raw*coalesce((v_plan->>'weaknessMultiplier')::numeric,1)+coalesce((v_plan->>'weaknessBonus')::numeric,0)-coalesce((v_plan->>'resistance')::numeric,0));
              end if;

              if c_prevent_next_class is not null and private.battle_v6_matches_class(o.id,c_prevent_next_class) then v_effective:=0;
              elsif c_prevent_damage_cap_next>0 and v_effective<=c_prevent_damage_cap_next then v_effective:=0;
              elsif c_reduce_next>0 then v_effective:=greatest(0,v_effective-c_reduce_next); end if;

              if coalesce((v_plan->>'ignoreDefenderEffects')::boolean,false) then
                v_def:=jsonb_build_object('damage',v_effective,'effectImmune',false,'reactiveDamage',0);
              else
                v_def:=private.battle_v6_defense_adjustment(o.id,c.id,c_damage,v_effective,v_seed||':'||v_half||':def');
              end if;
              v_effective:=coalesce((v_def->>'damage')::numeric,v_effective);
              v_effect_immune:=coalesce((v_def->>'effectImmune')::boolean,false);
              v_reactive:=coalesce((v_def->>'reactiveDamage')::numeric,0);
              v_reactive_status:=v_def->>'reactiveStatus';

              c_damage:=least(c_hp,c_damage+v_effective);
              v_direct:=case when not v_effect_immune then coalesce((v_plan->>'directDamageCounters')::numeric,0) else 0 end;
              if v_direct>0 then c_damage:=least(c_hp,c_damage+v_direct); end if;
              o_damage_dealt:=o_damage_dealt+v_effective+v_direct;
              if c_reactive_next>0 and v_effective>0 then o_damage:=least(o_hp,o_damage+c_reactive_next); end if;
              o_last_attack:=v_attack_name; o_last_damage:=v_effective; o_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if coalesce((v_plan->>'healAll')::boolean,false) then o_damage:=0;
              elsif v_heal>0 then o_damage:=greatest(0,o_damage-v_heal); end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then o_damage:=least(o_hp,o_damage+v_recoil); end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); o_energy:=greatest(0,o_energy-v_discard);
              o_cooldown_all:=greatest(o_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then o_blocked_attack:=v_attack_name; o_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then o_blocked_attack:=v_attack_name; o_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then o_reduce_next:=greatest(o_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then o_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then o_reactive_next:=greatest(o_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then o_prevent_damage_cap_next:=greatest(o_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' then o_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'selfPreventNext')::boolean,false)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_prevent')<=coalesce((v_plan->>'selfPreventChance')::numeric,1)
              then o_prevent_next_class:=coalesce(v_plan->>'selfPreventClass','all'); end if;

              if not v_effect_immune then
                if coalesce((v_plan->>'defenderEnergyDiscardCoins')::integer,0)>0 then
                  v_heads:=0; v_coin_count:=(v_plan->>'defenderEnergyDiscardCoins')::integer;
                  for v_i in 1..v_coin_count loop
                    if private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard_coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                  end loop;
                  c_energy:=greatest(0,c_energy-v_heads);
                elsif coalesce((v_plan->>'defenderEnergyDiscard')::integer,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard')<=coalesce((v_plan->>'defenderEnergyDiscardChance')::numeric,1)
                then c_energy:=greatest(0,c_energy-(v_plan->>'defenderEnergyDiscard')::integer); end if;
                if coalesce((v_plan->>'defenderAttackGateChance')::numeric,0)>0 then c_attack_gate_next:=greatest(c_attack_gate_next,(v_plan->>'defenderAttackGateChance')::numeric); end if;
                if coalesce((v_plan->>'defenderCannotAttackNext')::boolean,false) then c_cooldown_all:=greatest(c_cooldown_all,1); end if;
                if coalesce((v_plan->>'defenderOutgoingReductionNext')::numeric,0)>0 then c_outgoing_reduction_next:=greatest(c_outgoing_reduction_next,(v_plan->>'defenderOutgoingReductionNext')::numeric); end if;
                if coalesce((v_plan->>'lockDefenderBest')::boolean,false) then c_disable_best_next:=greatest(c_disable_best_next,1); end if;

                v_status:=coalesce(v_plan->>'inflictMajor',v_plan->>'inflictStatus');
                v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) then c_poison:=true; end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) then c_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') then c_major:=v_status; end if;
                end if;
              end if;

              if v_reactive>0 then o_damage:=least(o_hp,o_damage+v_reactive); end if;
              if v_reactive_status='poisoned' then o_poison:=true; elsif v_reactive_status='burned' then o_burn:=true; end if;

              v_trace:=v_trace||jsonb_build_array(jsonb_build_object(
                'halfTurn',v_half,'side','opponent','event','attack','attack',v_attack_name,
                'energyBefore',v_energy_before,'energyAfter',o_energy,
                'damage',round(v_effective,2),'defenderRemainingHp',greatest(0,c_hp-c_damage),
                'effects',coalesce(v_plan->'effectNotes','[]'::jsonb)
              ));
            end if;
          end if;
        else
          v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','charging_or_restricted','energy',o_energy));
        end if;
      end if;
    end if;

    -- Expire effects whose wording is limited to the just-finished turn.
    if v_is_c then
      o_reduce_next:=0;
      o_prevent_next_class:=null;
      o_no_weakness_next:=false;
      o_reactive_next:=0;
      o_prevent_damage_cap_next:=0;
      c_outgoing_reduction_next:=0;
      c_attack_gate_next:=0;
      c_disable_best_next:=0;
      if c_cooldown_all>0 then c_cooldown_all:=c_cooldown_all-1; end if;
      if c_blocked_turns>0 and c_blocked_turns<99 then
        c_blocked_turns:=c_blocked_turns-1;
        if c_blocked_turns=0 then c_blocked_attack:=null; end if;
      end if;
    else
      c_reduce_next:=0;
      c_prevent_next_class:=null;
      c_no_weakness_next:=false;
      c_reactive_next:=0;
      c_prevent_damage_cap_next:=0;
      o_outgoing_reduction_next:=0;
      o_attack_gate_next:=0;
      o_disable_best_next:=0;
      if o_cooldown_all>0 then o_cooldown_all:=o_cooldown_all-1; end if;
      if o_blocked_turns>0 and o_blocked_turns<99 then
        o_blocked_turns:=o_blocked_turns-1;
        if o_blocked_turns=0 then o_blocked_attack:=null; end if;
      end if;
    end if;

    if c_damage>=c_hp or o_damage>=o_hp then
      if c_damage>=c_hp and o_damage>=o_hp then
        v_winner_side:=case when private.battle_v6_hash_roll(v_seed||':'||v_half||':sudden')>=0.5 then 'challenger' else 'opponent' end;
        v_resolution:='simultaneous_ko_sudden_death';
      elsif o_damage>=o_hp then v_winner_side:='challenger'; v_resolution:='knockout';
      else v_winner_side:='opponent'; v_resolution:='knockout'; end if;
      exit;
    end if;

    -- Pokemon Checkup after every turn.
    if c_poison then c_damage:=least(c_hp,c_damage+10); end if;
    if o_poison then o_damage:=least(o_hp,o_damage+10); end if;
    if c_burn then
      c_damage:=least(c_hp,c_damage+20);
      if private.battle_v6_hash_roll(v_seed||':'||v_half||':c_burn')>=0.5 then c_burn:=false; end if;
    end if;
    if o_burn then
      o_damage:=least(o_hp,o_damage+20);
      if private.battle_v6_hash_roll(v_seed||':'||v_half||':o_burn')>=0.5 then o_burn:=false; end if;
    end if;
    if c_major='asleep' and private.battle_v6_hash_roll(v_seed||':'||v_half||':c_sleep')>=0.5 then c_major:=null; end if;
    if o_major='asleep' and private.battle_v6_hash_roll(v_seed||':'||v_half||':o_sleep')>=0.5 then o_major:=null; end if;

    if c_damage>=c_hp or o_damage>=o_hp then
      if c_damage>=c_hp and o_damage>=o_hp then
        v_winner_side:=case when private.battle_v6_hash_roll(v_seed||':'||v_half||':checkup_sudden')>=0.5 then 'challenger' else 'opponent' end;
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
    else v_winner_side:=case when private.battle_v6_hash_roll(v_seed||':turn_limit')>=0.5 then 'challenger' else 'opponent' end; end if;
    v_resolution:='turn_limit';
  end if;

  return jsonb_build_object(
    'rulesVersion',6,
    'engine','official_tcg_1v1_virtual_energy_v6',
    'firstPlayer',case when c_first then 'challenger' else 'opponent' end,
    'winnerSide',v_winner_side,
    'resolution',v_resolution,
    'seedDigest',substr(md5(v_seed),1,12),
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
  v_seed text;
  v_first boolean;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true); end if;

  select card_id into c_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;
  select card_id into o_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;
  if c_card is null or o_card is null then return jsonb_build_object('waiting',true,'round',b.active_round); end if;

  v_seed:=gen_random_uuid()::text;
  v_first:=random()>=0.5;
  v_sim:=private.battle_simulate_duel_v6(b.id,b.active_round,c_card,o_card,v_seed,v_first);
  c_stats:=v_sim->'challenger';
  o_stats:=v_sim->'opponent';
  v_winner:=case when v_sim->>'winnerSide'='challenger' then b.challenger_id else b.opponent_id end;
  c_power:=coalesce((c_stats->>'totalDamageDealt')::numeric,0)+coalesce((c_stats->>'remainingHp')::numeric,0);
  o_power:=coalesce((o_stats->>'totalDamageDealt')::numeric,0)+coalesce((o_stats->>'remainingHp')::numeric,0);
  c_roll:=private.battle_v6_hash_roll(v_seed||':score:c');
  o_roll:=private.battle_v6_hash_roll(v_seed||':score:o');

  v_result:=public.server_finish_battle_round(b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner);

  update public.battle_rounds
  set challenger_combat=c_stats||jsonb_build_object('firstPlayer',(v_sim->>'firstPlayer')='challenger','resolution',v_sim->>'resolution','rulesVersion',6),
      opponent_combat=o_stats||jsonb_build_object('firstPlayer',(v_sim->>'firstPlayer')='opponent','resolution',v_sim->>'resolution','rulesVersion',6),
      rules_version=6
  where battle_id=b.id and round_no=b.active_round;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'tcg_v6_resolved',jsonb_build_object(
    'round',b.active_round,'winnerId',v_winner,'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution','seedDigest',v_sim->>'seedDigest','trace',v_sim->'trace'
  ));

  return v_result||jsonb_build_object(
    'round',b.active_round,
    'challengerCardId',c_card,
    'opponentCardId',o_card,
    'challengerCombat',c_stats,
    'opponentCombat',o_stats,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'rulesVersion',6
  );
end;
$$;

revoke all on function private.battle_v6_hash_roll(text) from public,anon,authenticated;
revoke all on function private.battle_v6_can_attack(text,text) from public,anon,authenticated;
revoke all on function private.battle_v6_matches_class(text,text) from public,anon,authenticated;
revoke all on function private.battle_v6_defense_adjustment(text,text,numeric,numeric,text) from public,anon,authenticated;
revoke all on function private.battle_v6_attack_plan(text,text,integer,integer,numeric,numeric,boolean,boolean,text[]) from public,anon,authenticated;
revoke all on function private.battle_simulate_duel_v6(uuid,integer,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;
