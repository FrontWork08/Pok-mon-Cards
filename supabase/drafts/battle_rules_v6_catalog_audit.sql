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
  p_class text,
  p_burned boolean
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
  v_primary_type text;
begin
  if coalesce(p_class,'all')='all' then return true; end if;
  select * into v_card from public.cards where id=p_card_id;
  if v_card.id is null then return false; end if;

  v_classes:=lower(coalesce(v_card.tcg_data->'subtypes','[]'::jsonb)::text);
  v_primary_type:=lower(coalesce(v_card.types[1],'Colorless'));
  v_has_ability:=jsonb_typeof(v_card.tcg_data->'abilities')='array'
    and jsonb_array_length(v_card.tcg_data->'abilities')>0;

  return case lower(p_class)
    when 'ex' then v_classes ~ '"ex"'
    when 'v' then v_classes ~ '"v"' or v_classes ~ '"vmax"' or v_classes ~ '"vstar"' or v_classes ~ '"v-union"'
    when 'vmax' then v_classes ~ '"vmax"'
    when 'gx' then v_classes ~ '"gx"'
    when 'gx_or_ex' then v_classes ~ '"gx"' or v_classes ~ '"ex"'
    when 'basic' then v_classes ~ '"basic"'
    when 'basic_non_colorless' then v_classes ~ '"basic"' and v_primary_type<>'colorless'
    when 'evolution' then not (v_classes ~ '"basic"')
    when 'tag_team' then v_classes ~ '"tag team"'
    when 'ancient' then v_classes ~ '"ancient"'
    when 'ultra_beast' then v_classes ~ '"ultra beast"'
    when 'ability' then v_has_ability
    when 'burned' then coalesce(p_burned,false)
    else false
  end;
end;
$body$;

create or replace function private.battle_v6_self_status_payoff(p_card_id text,p_status text)
returns numeric
language plpgsql
stable
set search_path=''
as $payoff$
declare
  v_card public.cards%rowtype;
  v_attack jsonb;
  v_text text;
  v_match text[];
  v_best numeric:=0;
  v_name text;
begin
  select * into v_card from public.cards where id=p_card_id;
  if v_card.id is null or jsonb_typeof(v_card.tcg_data->'attacks')<>'array' then return 0; end if;
  v_name:=lower(coalesce(v_card.pokemon_name,''));

  for v_attack in select value from jsonb_array_elements(v_card.tcg_data->'attacks') loop
    v_text:=lower(coalesce(v_attack->>'text',''));

    if lower(coalesce(p_status,''))='poisoned' and (
      v_text like '%if this pokémon is poisoned, this attack does%'
      or v_text like '%if this pokemon is poisoned, this attack does%'
      or position('if '||v_name||' is poisoned, this attack does' in v_text)>0
    ) then
      v_match:=regexp_match(v_text,'this attack does [0-9]+ damage plus ([0-9]+) more damage');
      if v_match is null then v_match:=regexp_match(v_text,'this attack does ([0-9]+) more damage'); end if;
      if v_match is not null then v_best:=greatest(v_best,v_match[1]::numeric); end if;
    elsif lower(coalesce(p_status,''))='burned' and (
      v_text like '%if this pokémon is burned, this attack does%'
      or v_text like '%if this pokemon is burned, this attack does%'
      or position('if '||v_name||' is burned, this attack does' in v_text)>0
    ) then
      v_match:=regexp_match(v_text,'this attack does [0-9]+ damage plus ([0-9]+) more damage');
      if v_match is null then v_match:=regexp_match(v_text,'this attack does ([0-9]+) more damage'); end if;
      if v_match is not null then v_best:=greatest(v_best,v_match[1]::numeric); end if;
    elsif lower(coalesce(p_status,''))='special' and (
      v_text like '%if this pokémon is affected by a special condition, this attack does%'
      or v_text like '%if this pokemon is affected by a special condition, this attack does%'
    ) then
      v_match:=regexp_match(v_text,'this attack does [0-9]+ damage plus ([0-9]+) more damage');
      if v_match is null then v_match:=regexp_match(v_text,'this attack does ([0-9]+) more damage'); end if;
      if v_match is not null then v_best:=greatest(v_best,v_match[1]::numeric); end if;
    end if;
  end loop;
  return v_best;
end;
$payoff$;

create or replace function private.battle_v6_copy_source_attack(
  p_defender_card_id text,
  p_energy integer,
  p_require_source_energy boolean,
  p_gx_used boolean,
  p_vstar_used boolean
)
returns jsonb
language plpgsql
stable
set search_path=''
as $copy$
declare
  v_card public.cards%rowtype;
  v_attack jsonb;
  v_text text;
  v_damage text;
  v_match text[];
  v_base numeric;
  v_cost integer;
  v_score numeric;
  v_best_score numeric:=-1e18;
  v_best jsonb:=null;
begin
  select * into v_card from public.cards where id=p_defender_card_id;
  if v_card.id is null or jsonb_typeof(v_card.tcg_data->'attacks')<>'array' then return null; end if;

  for v_attack in select value from jsonb_array_elements(v_card.tcg_data->'attacks') loop
    v_text:=lower(coalesce(v_attack->>'text',''));
    if v_text like '%choose 1 of your opponent''s%attacks and use it as this attack%' then continue; end if;
    if coalesce(p_gx_used,false) and v_text like '%you can''t use more than 1 gx attack in a game%' then continue; end if;
    if coalesce(p_vstar_used,false) and v_text like '%you can''t use more than 1 vstar power in a game%' then continue; end if;

    v_cost:=coalesce(
      nullif(regexp_replace(coalesce(v_attack->>'convertedEnergyCost',''),'[^0-9]','','g'),'')::integer,
      case when jsonb_typeof(v_attack->'cost')='array' then jsonb_array_length(v_attack->'cost') else 0 end,
      0
    );
    if coalesce(p_require_source_energy,false) and coalesce(p_energy,0)<v_cost then continue; end if;

    v_damage:=coalesce(v_attack->>'damage','');
    v_match:=regexp_match(v_damage,'([0-9]+)');
    v_base:=case when v_match is null then 0 else v_match[1]::numeric end;
    v_score:=v_base;

    if v_text like '%is knocked out%' or v_text like '%will be knocked out%' then v_score:=v_score+500; end if;
    if v_text like '%take another turn after this one%' then v_score:=v_score+180; end if;
    if v_text like '%is now paralyzed%' then v_score:=v_score+65; end if;
    if v_text like '%is now asleep%' then v_score:=v_score+40; end if;
    if v_text like '%is now confused%' then v_score:=v_score+35; end if;
    if v_text like '%is now poisoned%' or v_text like '%is now burned%' then v_score:=v_score+30; end if;
    if v_text ~ '(put|place) [0-9]+ damage counters?' then
      v_match:=regexp_match(v_text,'(?:put|place) ([0-9]+) damage counters?');
      if v_match is not null then v_score:=v_score+v_match[1]::numeric*10; end if;
    end if;
    if v_text like '%damage for each%' or v_text like '%more damage%' then v_score:=v_score+25; end if;

    if v_score>v_best_score then
      v_best_score:=v_score;
      v_best:=v_attack||jsonb_build_object('copySourceScore',round(v_score,2));
    end if;
  end loop;

  return v_best;
end;
$copy$;

create or replace function private.battle_v6_has_go_first_override(p_card_id text,p_energy integer)
returns boolean
language sql
stable
set search_path=''
as $firstturn$
  select exists(
    select 1
    from public.cards c
    cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) a
    where c.id=p_card_id
      and lower(coalesce(a->>'text','')) like '%if you go first, you can use this attack on your first turn%'
      and greatest(0,least(12,coalesce(
        nullif(regexp_replace(coalesce(a->>'convertedEnergyCost',''),'[^0-9]','','g'),'')::integer,
        case when jsonb_typeof(a->'cost')='array' then jsonb_array_length(a->'cost') else 0 end,
        0
      )))<=coalesce(p_energy,0)
  );
$firstturn$;

create or replace function private.battle_v6_turn_ability_effects(p_card_id text)
returns jsonb
language plpgsql
stable
set search_path=''
as $ability$
declare
  v_card public.cards%rowtype;
  v_ability jsonb;
  v_text text;
  v_match text[];
  v_extra_energy integer:=0;
  v_heal numeric:=0;
  v_heal_chance numeric:=1;
  v_cure boolean:=false;
begin
  select * into v_card from public.cards where id=p_card_id;
  if v_card.id is null or jsonb_typeof(v_card.tcg_data->'abilities')<>'array' then
    return jsonb_build_object('extraEnergy',0,'heal',0,'healChance',1,'cureSpecial',false);
  end if;
  for v_ability in select value from jsonb_array_elements(v_card.tcg_data->'abilities') loop
    v_text:=lower(coalesce(v_ability->>'text',''));
    if v_text ~ 'once during your turn.*attach (?:a|1) basic [a-z]+ energy card from your hand to this pok[eé]mon'
       or v_text ~ 'once during your turn.*attach (?:a|1)(?: basic)? [a-z]+ energy card from your discard pile to this pok[eé]mon' then
      v_extra_energy:=greatest(v_extra_energy,1);
    end if;
    v_match:=regexp_match(v_text,'once during your turn.*heal ([0-9]+) damage from (?:your active pok[eé]mon|this pok[eé]mon)');
    if v_match is not null then
      v_heal:=greatest(v_heal,v_match[1]::numeric);
      if v_text like '%flip a coin%' and v_text like '%if heads%' then v_heal_chance:=least(v_heal_chance,0.5); end if;
    end if;
    if v_text like '%whenever you attach an energy card from your hand to this pokémon%remove all special conditions from it%' then
      v_cure:=true;
    end if;
  end loop;
  return jsonb_build_object('extraEnergy',v_extra_energy,'heal',v_heal,'healChance',v_heal_chance,'cureSpecial',v_cure);
end;
$ability$;

create or replace function private.battle_v6_status_immune(p_card_id text,p_status text)
returns boolean
language sql
stable
set search_path=''
as $immune$
  select exists(
    select 1
    from public.cards c
    cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'abilities','[]'::jsonb)) a
    where c.id=p_card_id
      and (
        lower(coalesce(a->>'text','')) like '%this pokémon can''t be '||lower(p_status)||'%'
        or lower(coalesce(a->>'text','')) like '%this pokemon can''t be '||lower(p_status)||'%'
        or lower(coalesce(a->>'text','')) like '%this pokémon cannot be '||lower(p_status)||'%'
      )
  );
$immune$;

create or replace function private.battle_v6_energy_attachment_punish(p_card_id text)
returns numeric
language plpgsql
stable
set search_path=''
as $punish$
declare
  v_card public.cards%rowtype;
  v_ability jsonb;
  v_text text;
  v_match text[];
  v_damage numeric:=0;
begin
  select * into v_card from public.cards where id=p_card_id;
  if v_card.id is null or jsonb_typeof(v_card.tcg_data->'abilities')<>'array' then return 0; end if;
  for v_ability in select value from jsonb_array_elements(v_card.tcg_data->'abilities') loop
    v_text:=lower(coalesce(v_ability->>'text',''));
    v_match:=regexp_match(v_text,'whenever your opponent attaches an energy card from their hand to 1 of their pok[eé]mon, put ([0-9]+) damage counters? on that pok[eé]mon');
    if v_match is not null then v_damage:=greatest(v_damage,v_match[1]::numeric*10); end if;
  end loop;
  return v_damage;
end;
$punish$;

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
        v_match:=regexp_match(v_text,'(?:put|place) ([0-9]+) damage counters? on the attacking pok[eé]mon');
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
  p_attacker_last_damage_received numeric,
  p_attacker_poison boolean,
  p_attacker_burn boolean,
  p_attacker_major text,
  p_defender_damage numeric,
  p_defender_special boolean,
  p_defender_poison boolean,
  p_defender_burn boolean,
  p_defender_major text,
  p_ignore_defender_weakness boolean,
  p_gx_used boolean,
  p_vstar_used boolean,
  p_second_player_first_turn boolean,
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
  v_status_coin_count integer:=0;
  v_status_heads_min integer:=0;
  v_status_heads_max integer:=0;
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
  v_self_reactive_multiplier_next numeric:=0;
  v_self_reactive_chance_next numeric:=1;
  v_self_reactive_status_next text:=null;
  v_self_prevent_damage_cap_next numeric:=0;
  v_inflict_self_major text:=null;
  v_inflict_poison boolean:=false;
  v_inflict_burn boolean:=false;
  v_inflict_self_poison boolean:=false;
  v_inflict_self_burn boolean:=false;
  v_clear_self_special boolean:=false;
  v_clear_self_poison boolean:=false;
  v_clear_defender_special boolean:=false;
  v_direct_damage_counters numeric:=0;
  v_defender_classes text;
  v_defender_retreat integer:=0;
  v_heal_all boolean:=false;
  v_self_energy_gain integer:=0;
  v_self_energy_gain_chance numeric:=1;
  v_defender_energy_return integer:=0;
  v_required_self_discard integer:=0;
  v_instant_knockout boolean:=false;
  v_knockout_coin_count integer:=0;
  v_knockout_heads_required integer:=0;
  v_self_knockout boolean:=false;
  v_both_knockout boolean:=false;
  v_delayed_knockout_next boolean:=false;
  v_defender_heal_block_next boolean:=false;
  v_extra_turn boolean:=false;
  v_extra_turn_on_knockout boolean:=false;
  v_defender_attack_gate_chance numeric:=0;
  v_lock_defender_best boolean:=false;
  v_original_text text;
  v_copy_source jsonb;
  v_copy_source_name text:=null;
  v_copy_chance numeric:=1;
  v_copy_requires_energy boolean:=false;
  v_uses_gx_limit boolean:=false;
  v_uses_vstar_limit boolean:=false;
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

    v_original_text:=lower(coalesce(v_attack->>'text',''));
    v_text:=v_original_text;
    if coalesce(p_gx_used,false) and v_original_text like '%you can''t use more than 1 gx attack in a game%' then continue; end if;
    if coalesce(p_vstar_used,false) and v_original_text like '%you can''t use more than 1 vstar power in a game%' then continue; end if;
    if coalesce(p_second_player_first_turn,false)
       and v_original_text like '%if you go second, you can''t use this attack during your first turn%' then continue; end if;

    -- Conditions that can be evaluated exactly in the isolated 1v1 state.
    if v_original_text like '%if this pokémon has no damage counters on it, this attack does nothing%'
       and coalesce(p_attacker_damage,0)<=0 then continue; end if;
    if v_original_text like '%if poliwrath was damaged by an attack during your opponent''s last turn, this attack does nothing%'
       and coalesce(p_attacker_last_damage_received,0)>0 then continue; end if;

    if (
      v_original_text like '%if the defending pokémon is not asleep, this attack does nothing%'
      or v_original_text like '%you can''t use this attack unless the defending pokémon is asleep%'
    ) and lower(coalesce(p_defender_major,''))<>'asleep' then continue; end if;
    if v_original_text like '%this attack can be used if this pokémon is asleep. if it is not asleep, this attack does nothing%'
       and lower(coalesce(p_attacker_major,''))<>'asleep' then continue; end if;

    if v_original_text like '%if your opponent''s active pokémon isn''t confused, this attack does nothing%'
       and lower(coalesce(p_defender_major,''))<>'confused' then continue; end if;
    if v_original_text like '%if your opponent''s active pokémon isn''t burned, this attack does nothing%'
       and not coalesce(p_defender_burn,false) then continue; end if;
    if v_original_text like '%if your opponent''s active pokémon isn''t a pokémon ex, this attack does nothing%'
       and not (v_defender_classes ~ '"ex"') then continue; end if;

    if v_original_text like '%this attack can''t be used unless sabrina''s abra and the defending pokémon have the same number of energy cards attached to them%'
       and coalesce(p_energy,0)<>coalesce(p_defender_energy,0) then continue; end if;
    if v_original_text like '%if light venomoth and the defending pokémon have a different number of energy cards attached to them, this attack does nothing%'
       and coalesce(p_energy,0)<>coalesce(p_defender_energy,0) then continue; end if;

    -- This round has no Bench, Stadium, Prize area, Lost Zone, Tools, or evolution/bench-transition event.
    if v_original_text like '%if there is no stadium in play, this attack does nothing%'
       or v_original_text like '%if there is no stadium card in play, this attack does nothing%'
       or v_original_text like '%discard a stadium in play. if you can''t, this attack does nothing%'
       or v_original_text like '%if you have 4 or fewer benched pokémon, this attack does nothing%'
       or v_original_text like '%if you don''t have lunatone on your bench, this attack does nothing%'
       or v_original_text like '%if you don''t have uxie and azelf on your bench, this attack does nothing%'
       or v_original_text like '%if don''t have uxie lv.x and azelf lv.x in play, this attack does nothing%'
       or v_original_text like '%if your opponent has no benched pokémon, this attack does nothing%'
       or v_original_text like '%this attack can''t be used if your opponent has no benched pokémon%'
       or v_original_text like '%you can use this attack only if you have 10 or more cards in the lost zone%'
       or v_original_text like '%if the defending pokémon has no pokémon tool card attached to it, this attack does nothing%'
       or v_original_text like '%if this pokémon didn''t move from the bench to the active spot this turn, this attack does nothing%'
       or v_original_text like '%if this pokémon didn''t move from the bench to the active spot this turn, this attack does nothing%'
       or v_original_text like '%if this pokémon didn''t evolve from loudred during this turn, this attack does nothing%'
    then continue; end if;

    if v_original_text like '%prize card%' and (
      v_original_text like '%you can use this attack only if%'
      or v_original_text like '%if your opponent doesn''t have exactly%'
      or v_original_text like '%if you have more prize cards remaining%'
    ) then continue; end if;

    -- No hand is simulated. Explicit nonzero hand-count requirements therefore fail.
    if v_original_text ~ 'if you don.t have exactly [1-9][0-9]* cards in your hand, this attack does nothing'
       or v_original_text like '%if your opponent has 5 or fewer cards in their hand, this attack does nothing%'
       or v_original_text like '%if you have less cards in your hand than your opponent%if you have more or the same number of cards in your hand as your opponent, this attack does nothing%'
    then continue; end if;

    v_copy_source:=null;
    v_copy_source_name:=null;
    v_copy_chance:=1;
    v_copy_requires_energy:=false;
    v_uses_gx_limit:=v_original_text like '%you can''t use more than 1 gx attack in a game%';
    v_uses_vstar_limit:=v_original_text like '%you can''t use more than 1 vstar power in a game%';

    if v_original_text like '%choose 1 of your opponent''s%attacks and use it as this attack%' then
      -- Prize-card-only copy attacks have no legal trigger in this isolated 1v1 format.
      if v_original_text like '%only if your opponent has exactly 2 prize cards remaining%' then continue; end if;

      v_copy_requires_energy:=
        v_original_text like '%doesn''t have the necessary energy to use that attack%'
        or v_original_text like '%does not have the necessary energy to use that attack%';
      if v_original_text like '%flip a coin%' and v_original_text like '%if heads%' then v_copy_chance:=0.5; end if;

      v_copy_source:=private.battle_v6_copy_source_attack(
        v_defender.id,p_energy,v_copy_requires_energy,p_gx_used,p_vstar_used
      );
      if v_copy_source is null then continue; end if;

      v_copy_source_name:=coalesce(nullif(v_copy_source->>'name',''),'Ataque copiado');
      v_name:=v_name||' → '||v_copy_source_name;
      v_text:=lower(coalesce(v_copy_source->>'text',''));
      v_uses_gx_limit:=v_uses_gx_limit or v_text like '%you can''t use more than 1 gx attack in a game%';
      v_uses_vstar_limit:=v_uses_vstar_limit or v_text like '%you can''t use more than 1 vstar power in a game%';
      v_damage_text:=coalesce(v_copy_source->>'damage','');
    else
      v_damage_text:=coalesce(v_attack->>'damage','');
    end if;
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
    v_status_coin_count:=0;
    v_status_heads_min:=0;
    v_status_heads_max:=0;
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
    v_self_reactive_multiplier_next:=0;
    v_self_reactive_chance_next:=1;
    v_self_reactive_status_next:=null;
    v_self_prevent_damage_cap_next:=0;
    v_inflict_self_major:=null;
    v_inflict_poison:=false;
    v_inflict_burn:=false;
    v_inflict_self_poison:=false;
    v_inflict_self_burn:=false;
    v_clear_self_special:=false;
    v_clear_self_poison:=false;
    v_clear_defender_special:=false;
    v_direct_damage_counters:=0;
    v_heal_all:=false;
    v_self_energy_gain:=0;
    v_self_energy_gain_chance:=1;
    v_defender_energy_return:=0;
    v_required_self_discard:=0;
    v_instant_knockout:=false;
    v_knockout_coin_count:=0;
    v_knockout_heads_required:=0;
    v_self_knockout:=false;
    v_both_knockout:=false;
    v_delayed_knockout_next:=false;
    v_defender_heal_block_next:=false;
    v_extra_turn:=false;
    v_extra_turn_on_knockout:=false;
    v_defender_attack_gate_chance:=0;
    v_lock_defender_best:=false;
    if v_copy_source is not null then
      v_effect_notes:=array_append(v_effect_notes,'copia o ataque rival: '||v_copy_source_name);
      if v_copy_chance<1 then
        v_coin_gate_count:=1;
        v_coin_gate_heads:=1;
      end if;
    end if;

    -- The isolated round has no Bench, Prize Cards, Tools, or discard-pile Pokémon.
    -- Multipliers driven entirely by those zones therefore use a zero count.
    if v_damage_text ~ '[×x*]' and (
      v_text ~ 'damage (?:times the number of|for each).*benched pok[eé]mon'
      or v_text ~ 'damage (?:times the number of|for each).*prize cards?'
      or v_text ~ 'damage (?:times the number of|for each).*pok[eé]mon in your discard pile'
      or v_text ~ 'damage (?:times the number of|for each).*pok[eé]mon tool'
    ) then
      v_raw:=0;
      v_expected_raw:=0;
      v_effect_notes:=array_append(v_effect_notes,'contador de zona externa = 0 no duelo 1x1');
    end if;

    if v_text like '%if this pokémon didn''t move from the bench to the active spot this turn, this attack does nothing%'
       or v_text like '%if this pokemon didn''t move from the bench to the active spot this turn, this attack does nothing%' then
      v_raw:=0;
      v_expected_raw:=0;
      v_effect_notes:=array_append(v_effect_notes,'condição de entrada pelo Banco não existe no duelo 1x1');
    end if;

    if v_text ~ 'you can use this attack only if your opponent has exactly [0-9]+ prize cards remaining' then
      continue;
    end if;

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

    if v_text like '%if this pokémon was damaged by an attack during your opponent''s last turn%this attack does that much more damage%'
       or v_text like '%if this pokemon was damaged by an attack during your opponent''s last turn%this attack does that much more damage%' then
      v_raw:=v_raw+greatest(0,coalesce(p_attacker_last_damage_received,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus igual ao dano recebido no turno anterior');
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

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is poisoned, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_poison,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Pokémon Envenenado');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is poisoned, this attack does [0-9]+ damage plus ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_poison,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus legado contra Pokémon Envenenado');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is burned, this attack does [0-9]+ damage plus ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_burn,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus legado contra Pokémon Queimado');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is affected by (?:a|any) special conditions?, this attack does [0-9]+ damage plus ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_special,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus legado contra Condição Especial');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is burned, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_burn,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Pokémon Queimado');
    end if;

    v_match:=regexp_match(v_text,'if (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) is affected by (?:a|any) special conditions?, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_defender_special,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus contra Condição Especial');
    end if;

    -- Bonuses based on the attacker's own Special Condition.
    v_match:=regexp_match(v_text,'if this pok[eé]mon is poisoned, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_attacker_poison,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por atacante Envenenado');
    end if;
    v_match:=regexp_match(v_text,'if this pok[eé]mon is burned, this attack does ([0-9]+) more damage');
    if v_match is not null and coalesce(p_attacker_burn,false) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por atacante Queimado');
    end if;
    v_match:=regexp_match(v_text,'if this pok[eé]mon is affected by a special condition, this attack does ([0-9]+) more damage');
    if v_match is not null and (coalesce(p_attacker_poison,false) or coalesce(p_attacker_burn,false) or p_attacker_major is not null) then
      v_raw:=v_raw+v_match[1]::numeric;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'bônus por Condição Especial no atacante');
    end if;

    -- Legacy wording names the attacking Pokémon instead of saying "this Pokémon".
    if position('if '||lower(coalesce(v_attacker.pokemon_name,''))||' is poisoned' in v_text)>0 and coalesce(p_attacker_poison,false) then
      v_match:=regexp_match(v_text,'this attack does [0-9]+ damage plus ([0-9]+) more damage');
      if v_match is null then v_match:=regexp_match(v_text,'this attack does ([0-9]+) more damage'); end if;
      if v_match is not null then
        v_raw:=v_raw+v_match[1]::numeric; v_expected_raw:=v_raw;
        v_effect_notes:=array_append(v_effect_notes,'bônus por atacante Envenenado (texto legado)');
      end if;
    end if;
    if position('if '||lower(coalesce(v_attacker.pokemon_name,''))||' is burned' in v_text)>0 and coalesce(p_attacker_burn,false) then
      v_match:=regexp_match(v_text,'this attack does [0-9]+ damage plus ([0-9]+) more damage');
      if v_match is null then v_match:=regexp_match(v_text,'this attack does ([0-9]+) more damage'); end if;
      if v_match is not null then
        v_raw:=v_raw+v_match[1]::numeric; v_expected_raw:=v_raw;
        v_effect_notes:=array_append(v_effect_notes,'bônus por atacante Queimado (texto legado)');
      end if;
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

    v_match:=regexp_match(v_text,'(?:this attack )?does ([0-9]+) damage for each(?: [a-z]+)? energy attached to this pok[eé]mon');
    if v_match is not null then
      v_raw:=v_match[1]::numeric*greatest(0,coalesce(p_energy,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'dano por Energia do atacante');
    end if;

    v_match:=regexp_match(v_text,'(?:this attack )?does ([0-9]+) damage for each(?: [a-z]+)? energy attached to (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon|all of your opponent''s pok[eé]mon)');
    if v_match is not null then
      v_raw:=v_match[1]::numeric*greatest(0,coalesce(p_defender_energy,0));
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'dano por Energia do defensor');
    end if;

    if v_text like '%damage to the defending pokémon equal to half the defending pokémon''s remaining hp%rounded up to the nearest 10%' then
      v_raw:=ceil(v_remaining_hp/20.0)*10;
      v_expected_raw:=v_raw;
      v_effect_notes:=array_append(v_effect_notes,'metade do HP restante arredondada');
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
      v_match:=regexp_match(v_text,'does ([0-9]+) (?:more )?damage (?:times the number of|for each|for the number of) heads');
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
        v_match:=regexp_match(v_text,'does ([0-9]+) (?:more )?damage (?:times the number of|for each|for the number of) heads');
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

    if v_text like '%if the defending pokémon is not asleep, this attack does nothing%'
       and lower(coalesce(p_defender_major,''))<>'asleep' then
      v_raw:=0;
      v_expected_raw:=0;
      v_effect_notes:=array_append(v_effect_notes,'ataque exige defensor Adormecido');
    end if;

    if v_text like '%flip a coin%' and v_text like '%if tails%' and v_text like '%this attack does nothing%' then
      v_coin_gate_count:=greatest(v_coin_gate_count,1);
      v_coin_gate_heads:=greatest(v_coin_gate_heads,1);
      v_effect_notes:=array_append(v_effect_notes,'ataque exige cara');
    end if;

    if v_text ~ 'flip 2 coins?.*if (?:both of them|both) (?:are )?tails, this attack does nothing' then
      v_coin_gate_count:=greatest(v_coin_gate_count,2);
      v_coin_gate_heads:=greatest(v_coin_gate_heads,1);
      v_effect_notes:=array_append(v_effect_notes,'ataque falha apenas com duas coroas');
    end if;

    if v_text ~ 'flip 2 coins?.*if (?:1 or both of them|either of them|any of them) (?:is|are)? ?tails, this attack does nothing' then
      v_coin_gate_count:=greatest(v_coin_gate_count,2);
      v_coin_gate_heads:=greatest(v_coin_gate_heads,2);
      v_effect_notes:=array_append(v_effect_notes,'ataque exige duas caras');
    end if;

    if v_text ~ 'flip 2 coins?.*if (?:both|both of them) (?:are )?heads, this attack does [0-9]+ more damage' then
      v_match:=regexp_match(v_text,'if (?:both|both of them) (?:are )?heads, this attack does ([0-9]+) more damage');
      if v_match is not null then
        -- Encode as a special 2-coin bonus; the simulator applies it only at 2 heads.
        v_coin_bonus_count:=greatest(v_coin_bonus_count,2);
        v_coin_bonus_per_head:=greatest(v_coin_bonus_per_head,v_match[1]::numeric);
        v_expected_raw:=v_expected_raw+v_match[1]::numeric*0.25;
        v_dynamic_kind:='both_heads_bonus';
        v_effect_notes:=array_append(v_effect_notes,'bônus somente com duas caras');
      end if;
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

    -- Mandatory additional Energy payment on legacy attacks.
    -- Color is abstracted by virtual Energy, but named Special Energy has no equivalent and is unavailable.
    if v_text like '%plasma energy%' and v_text like '%attack does nothing%' then continue; end if;
    if v_text like '%voltaic lightning energy%' and v_text like '%attack does nothing%' then continue; end if;

    v_match:=regexp_match(v_text,'discard ([0-9]+)(?: basic)?(?: [a-z]+)? energy cards? attached to [^.,]+(?: or this attack does nothing|.*if you can.t discard(?: cards)?[^.]*this attack does nothing)');
    if v_match is not null then
      v_required_self_discard:=greatest(v_required_self_discard,v_match[1]::integer);
    end if;

    if v_text ~ 'discard (?:a|an)(?: basic)?(?: [a-z]+)? energy card attached to [^.,]+ or this attack does nothing'
       or v_text ~ 'discard (?:a|an) basic energy card attached to [^.,]+ or this attack does nothing' then
      v_required_self_discard:=greatest(v_required_self_discard,1);
    end if;

    if v_text ~ 'discard 1 [a-z]+ energy card and 1 [a-z]+ energy card attached to [^.,]+ or this attack does nothing' then
      v_required_self_discard:=greatest(v_required_self_discard,2);
    end if;

    if v_text ~ 'discard all(?: [a-z]+)? energy cards? attached to [^.,]+ or this attack does nothing' then
      if coalesce(p_energy,0)<=0 then continue; end if;
      v_required_self_discard:=greatest(v_required_self_discard,coalesce(p_energy,0));
    end if;

    if v_required_self_discard>coalesce(p_energy,0) then continue; end if;
    if v_required_self_discard>0 then
      v_discard:=greatest(v_discard,v_required_self_discard);
      v_effect_notes:=array_append(v_effect_notes,'custo adicional obrigatório de Energia');
    end if;

    -- Explicit mandatory hand/discard-pile resources are unavailable in the isolated duel.
    if (
      v_text like '%from your hand%' or v_text like '%in your discard pile%'
    ) and v_text like '%attack does nothing%' and (
      v_text like '%if you can''t%' or v_text like '%if you don''t%' or v_text like '%if you have fewer than%'
    ) then
      continue;
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
      v_text ~ 'discard (an|a)(?: special)? energy (?:card )?(?:attached to |from )(?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)'
      or v_text ~ 'discard (?:an|a)(?: special)? energy (?:card )?attached to the defending pok[eé]mon'
      or v_text like '%if the defending pokémon has any energy cards attached to it%choose 1 of them and discard it%'
    ) then
      v_defender_energy_discard:=1;
      if v_text like '%flip a coin%' then v_defender_energy_discard_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'descarta Energia do defensor');
    end if;

    if v_text ~ 'put all energy attached to this pok[eé]mon into your hand' then
      v_discard:=greatest(v_discard,coalesce(p_energy,0));
      v_effect_notes:=array_append(v_effect_notes,'toda Energia volta para a mão');
    end if;

    v_match:=regexp_match(v_text,'put ([0-9]+) energy attached to this pok[eé]mon into your hand');
    if v_match is not null then
      v_discard:=greatest(v_discard,v_match[1]::integer);
      v_effect_notes:=array_append(v_effect_notes,'Energia volta para a mão');
    elsif v_text ~ 'put an energy attached to this pok[eé]mon into your hand' then
      v_discard:=greatest(v_discard,1);
      v_effect_notes:=array_append(v_effect_notes,'1 Energia volta para a mão');
    end if;

    -- Virtual-Energy translation for attacks that attach Energy to this Active Pokémon.
    v_match:=regexp_match(v_text,'search your deck for up to ([0-9]+)(?: basic)? [a-z]+ energy cards? and attach them to this pok[eé]mon');
    if v_match is not null then
      v_self_energy_gain:=greatest(v_self_energy_gain,least(6,v_match[1]::integer));
      v_effect_notes:=array_append(v_effect_notes,'acelera Energia virtual a partir do deck');
    elsif v_text ~ 'search your deck for (?:a|1)(?: basic)? [a-z]+ energy card and attach it to this pok[eé]mon' then
      v_self_energy_gain:=greatest(v_self_energy_gain,1);
      v_effect_notes:=array_append(v_effect_notes,'acelera 1 Energia virtual a partir do deck');
    end if;

    v_match:=regexp_match(v_text,'attach (?:up to )?([0-9]+)(?: basic)? [a-z]+ energy cards? from your discard pile to this pok[eé]mon');
    if v_match is not null then
      v_self_energy_gain:=greatest(v_self_energy_gain,least(6,v_match[1]::integer));
      if v_text like '%flip a coin%' and v_text like '%if heads%' then v_self_energy_gain_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'anexa Energia virtual ao atacante');
    elsif v_text ~ 'attach (?:an|a)(?: basic)? [a-z]+ energy card from your discard pile to this pok[eé]mon'
       or v_text ~ 'attach (?:an|a) energy card from your discard pile to this pok[eé]mon' then
      v_self_energy_gain:=greatest(v_self_energy_gain,1);
      if v_text like '%flip a coin%' and v_text like '%if heads%' then v_self_energy_gain_chance:=0.5; end if;
      v_effect_notes:=array_append(v_effect_notes,'anexa 1 Energia virtual ao atacante');
    end if;

    v_match:=regexp_match(v_text,'(?:you may )?(?:put|return) ([0-9]+) energy attached to your opponent''s active pok[eé]mon (?:into|to) their hand');
    if v_match is not null then
      v_defender_energy_return:=greatest(v_defender_energy_return,v_match[1]::integer);
      v_effect_notes:=array_append(v_effect_notes,'Energia do defensor volta para a mão');
    elsif v_text ~ '(?:put|return) an energy attached to your opponent''s active pok[eé]mon (?:into|to) their hand'
       or v_text ~ 'you may put an energy attached to your opponent''s active pok[eé]mon into their hand' then
      v_defender_energy_return:=greatest(v_defender_energy_return,1);
      v_effect_notes:=array_append(v_effect_notes,'1 Energia do defensor volta para a mão');
    end if;

    if v_text like '%shuffle all energy from each of your opponent''s pokémon into their deck%'
       or v_text like '%shuffle all energy from all of their pokémon into their deck%' then
      v_defender_energy_return:=greatest(v_defender_energy_return,coalesce(p_defender_energy,0));
      v_effect_notes:=array_append(v_effect_notes,'remove toda Energia do defensor');
    end if;

    if v_text ~ 'if 1 of your pok[eé]mon used .+ during your last turn, this attack can.t be used'
       or v_text ~ 'if one of your pok[eé]mon used .+ during your last turn, this attack can.t be used' then
      v_cooldown_attack:=greatest(v_cooldown_attack,1);
      v_effect_notes:=array_append(v_effect_notes,'não pode repetir no turno seguinte');
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

    v_match:=regexp_match(v_text,'during your opponent''s next turn, (?:the defending pok[eé]mon''s attacks|attacks used by the defending pok[eé]mon) do ([0-9]+) less damage');
    if v_match is not null then
      v_defender_outgoing_reduction_next:=v_match[1]::numeric;
      v_effect_notes:=array_append(v_effect_notes,'reduz dano dos ataques do defensor no próximo turno');
    end if;

    -- Direct Knock Out effects.
    if v_text like '%both active pokémon are knocked out%'
       or v_text like '%both active pokemon are knocked out%'
       or (
         position('both '||lower(coalesce(v_attacker.pokemon_name,''))||' and the defending pokémon are now knocked out' in v_text)>0
         or position('both '||lower(coalesce(v_attacker.pokemon_name,''))||' and the defending pokemon are now knocked out' in v_text)>0
       ) then
      v_both_knockout:=true;
      v_effect_notes:=array_append(v_effect_notes,'nocaute simultâneo dos dois Ativos');
    end if;

    if trim(v_text) in ('this pokémon is knocked out.','this pokemon is knocked out.')
       or v_text like '%then, this pokémon is knocked out.%'
       or v_text like '%then, this pokemon is knocked out.%' then
      v_self_knockout:=true;
      v_effect_notes:=array_append(v_effect_notes,'atacante é nocauteado pelo próprio ataque');
    end if;

    if v_text ~ 'flip 2 coins?.*if (?:both|both of them) (?:are )?heads, (?:the defending pok[eé]mon|your opponent''s active pok[eé]mon) is knocked out' then
      v_knockout_coin_count:=2;
      v_knockout_heads_required:=2;
      v_effect_notes:=array_append(v_effect_notes,'nocaute do defensor exige duas caras');
    elsif v_text ~ 'flip a coin.*if heads, (?:the defending pok[eé]mon|your opponent''s active pok[eé]mon) is knocked out' then
      v_knockout_coin_count:=1;
      v_knockout_heads_required:=1;
      v_effect_notes:=array_append(v_effect_notes,'nocaute do defensor exige cara');
    end if;

    if v_text like '%if your opponent''s active pokémon is affected by a special condition%it is knocked out%'
       and coalesce(p_defender_special,false) then
      v_instant_knockout:=true;
      v_effect_notes:=array_append(v_effect_notes,'nocaute por Condição Especial');
    end if;
    if v_text like '%if your opponent''s active pokémon is a basic pokémon%it is knocked out%'
       and v_defender_classes ~ '"basic"' then
      v_instant_knockout:=true;
      v_effect_notes:=array_append(v_effect_notes,'nocaute de Pokémon Básico');
    end if;
    if v_text like '%at the end of your opponent''s next turn%the defending pokémon will be knocked out%' then
      v_delayed_knockout_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'nocaute atrasado no fim do próximo turno');
    end if;

    if v_text like '%the defending pokémon can''t be healed during your opponent''s next turn%' then
      v_defender_heal_block_next:=true;
      v_effect_notes:=array_append(v_effect_notes,'bloqueia cura no próximo turno');
    end if;

    if v_text like '%take another turn after this one%' then
      if v_text like '%if your opponent''s pokémon is knocked out by this attack%'
         or v_text like '%if your opponent''s pokemon is knocked out by this attack%' then
        v_extra_turn_on_knockout:=true;
        v_effect_notes:=array_append(v_effect_notes,'turno extra somente após nocaute');
      else
        v_extra_turn:=true;
        v_effect_notes:=array_append(v_effect_notes,'concede um turno extra');
      end if;
    end if;

    -- Opponent next-turn attack interference.
    if (v_text like '%if the defending pokémon tries to attack during your opponent''s next turn%'
        or v_text like '%during your opponent''s next turn, if the defending pokémon tries to use an attack%')
       and (v_text like '%if tails, that attack does nothing%' or v_text like '%if tails, that attack doesn''t happen%') then
      v_defender_attack_gate_chance:=0.5;
      v_effect_notes:=array_append(v_effect_notes,'ataque do defensor pode falhar');
    end if;
    if v_text like '%choose 1 of the defending pokémon''s attacks%can''t use that attack during your opponent''s next turn%'
       or v_text like '%choose 1 of your opponent''s active pokémon''s attacks%can''t use that attack during your opponent''s next turn%' then
      v_lock_defender_best:=true;
      v_effect_notes:=array_append(v_effect_notes,'bloqueia melhor ataque do defensor');
    end if;

    if v_text like '%both active pokémon are now asleep%' or v_text like '%both this pokémon and the defending pokémon are now asleep%' then
      v_status:='asleep'; v_inflict_self_major:='asleep'; v_status_bonus:=35;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Adormecidos');
    elsif v_text like '%both active pokémon are now confused%' or v_text like '%both this pokémon and the defending pokémon are now confused%' then
      v_status:='confused'; v_inflict_self_major:='confused'; v_status_bonus:=30;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Confusos');
    end if;

    v_match:=regexp_match(v_text,'(?:put|place) ([0-9]+) damage counters? on (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon|1 of your opponent''s pok[eé]mon)');
    if v_match is not null then
      v_direct_damage_counters:=greatest(v_direct_damage_counters,v_match[1]::numeric*10);
      v_effect_notes:=array_append(v_effect_notes,'coloca contadores de dano diretamente');
    end if;

    v_match:=regexp_match(v_text,'(?:put|place) ([0-9]+) damage counters? on your opponent''s pok[eé]mon in any way you like');
    if v_match is not null then
      v_direct_damage_counters:=greatest(v_direct_damage_counters,v_match[1]::numeric*10);
      v_effect_notes:=array_append(v_effect_notes,'contadores distribuídos aplicados ao Ativo no 1x1');
    end if;

    -- Special Conditions. Keep defender and self conditions strictly separate.
    -- Old cards often name the attacker instead of saying "this Pokémon".
    if v_text like '%both active pokémon are now paralyzed%'
       or v_text like '%both this pokémon and the defending pokémon are now paralyzed%' then
      v_status:='paralyzed'; v_inflict_self_major:='paralyzed'; v_status_bonus:=55;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Paralisados');
    elsif v_text like '%both active pokémon are now asleep%'
       or v_text like '%both this pokémon and the defending pokémon are now asleep%' then
      v_status:='asleep'; v_inflict_self_major:='asleep'; v_status_bonus:=35;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Adormecidos');
    elsif v_text like '%both active pokémon are now confused%'
       or v_text like '%both this pokémon and the defending pokémon are now confused%' then
      v_status:='confused'; v_inflict_self_major:='confused'; v_status_bonus:=30;
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Confusos');
    end if;

    if v_text like '%both active pokémon are now poisoned%'
       or v_text like '%both this pokémon and the defending pokémon are now poisoned%' then
      v_inflict_poison:=true; v_inflict_self_poison:=true; v_status_bonus:=greatest(v_status_bonus,20);
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Envenenados');
    end if;
    if v_text like '%both active pokémon are now burned%'
       or v_text like '%both this pokémon and the defending pokémon are now burned%' then
      v_inflict_burn:=true; v_inflict_self_burn:=true; v_status_bonus:=greatest(v_status_bonus,25);
      v_effect_notes:=array_append(v_effect_notes,'ambos ficam Queimados');
    end if;

    -- Conditions explicitly aimed at the opponent / Defending Pokémon.
    if v_text like '%defending pokémon is now paralyzed%'
       or v_text like '%opponent''s active pokémon is now paralyzed%' then
      v_status:='paralyzed'; v_status_bonus:=greatest(v_status_bonus,55);
    elsif v_text like '%defending pokémon is now asleep%'
       or v_text like '%opponent''s active pokémon is now asleep%' then
      v_status:='asleep'; v_status_bonus:=greatest(v_status_bonus,35);
    elsif v_text like '%defending pokémon is now confused%'
       or v_text like '%opponent''s active pokémon is now confused%' then
      v_status:='confused'; v_status_bonus:=greatest(v_status_bonus,30);
    end if;

    if v_text like '%defending pokémon is now poisoned%'
       or v_text like '%opponent''s active pokémon is now poisoned%' then
      v_inflict_poison:=true; v_status_bonus:=greatest(v_status_bonus,20);
    end if;
    if v_text like '%defending pokémon is now burned%'
       or v_text like '%opponent''s active pokémon is now burned%' then
      v_inflict_burn:=true; v_status_bonus:=greatest(v_status_bonus,25);
    end if;

    -- Conditions explicitly aimed at the attacker.
    if v_text like '%this pokémon is now paralyzed%'
       or position(lower(coalesce(v_attacker.pokemon_name,''))||' is now paralyzed' in v_text)>0
       or (v_copy_source is not null and position(lower(coalesce(v_defender.pokemon_name,''))||' is now paralyzed' in v_text)>0) then
      v_inflict_self_major:='paralyzed';
      v_effect_notes:=array_append(v_effect_notes,'atacante fica Paralisado');
    elsif v_text like '%this pokémon is now asleep%'
       or position(lower(coalesce(v_attacker.pokemon_name,''))||' is now asleep' in v_text)>0
       or (v_copy_source is not null and position(lower(coalesce(v_defender.pokemon_name,''))||' is now asleep' in v_text)>0) then
      v_inflict_self_major:='asleep';
      v_effect_notes:=array_append(v_effect_notes,'atacante fica Adormecido');
    elsif v_text like '%this pokémon is now confused%'
       or position(lower(coalesce(v_attacker.pokemon_name,''))||' is now confused' in v_text)>0
       or (v_copy_source is not null and position(lower(coalesce(v_defender.pokemon_name,''))||' is now confused' in v_text)>0) then
      v_inflict_self_major:='confused';
      v_effect_notes:=array_append(v_effect_notes,'atacante fica Confuso');
    end if;

    if v_text like '%this pokémon is now poisoned%'
       or position(lower(coalesce(v_attacker.pokemon_name,''))||' is now poisoned' in v_text)>0
       or (v_copy_source is not null and position(lower(coalesce(v_defender.pokemon_name,''))||' is now poisoned' in v_text)>0) then
      v_inflict_self_poison:=true;
      v_effect_notes:=array_append(v_effect_notes,'atacante fica Envenenado');
    end if;
    if v_text like '%this pokémon is now burned%'
       or position(lower(coalesce(v_attacker.pokemon_name,''))||' is now burned' in v_text)>0
       or (v_copy_source is not null and position(lower(coalesce(v_defender.pokemon_name,''))||' is now burned' in v_text)>0) then
      v_inflict_self_burn:=true;
      v_effect_notes:=array_append(v_effect_notes,'atacante fica Queimado');
    end if;

    -- Coin outcome tied to an opponent Special Condition.
    if v_status is not null or v_inflict_poison or v_inflict_burn then
      v_match:=regexp_match(v_text,'flip ([0-9]+) coins?');
      if v_match is not null then
        v_status_coin_count:=greatest(1,least(v_match[1]::integer,20));
        if v_text ~ 'if (?:both|all)(?: of them)? (?:are )?heads.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_heads_min:=v_status_coin_count; v_status_heads_max:=v_status_coin_count;
        elsif v_text ~ 'if (?:either|1 or both|one or both)(?: of them| of the coins)? (?:is|are )?heads.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_heads_min:=1; v_status_heads_max:=v_status_coin_count;
        elsif v_text ~ 'if (?:you get |at least )?2 or more heads.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)'
           or v_text ~ 'if (?:at least )?2 (?:of them )?are heads.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_heads_min:=2; v_status_heads_max:=v_status_coin_count;
        elsif v_text ~ 'if (?:you get )?at least 1 heads?.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_heads_min:=1; v_status_heads_max:=v_status_coin_count;
        elsif v_text ~ 'if (?:both|all)(?: of them)? (?:are )?tails.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_heads_min:=0; v_status_heads_max:=0;
        else
          v_status_coin_count:=0;
        end if;
      elsif v_text like '%flip a coin%' then
        if v_text ~ 'if heads.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_coin_count:=1; v_status_heads_min:=1; v_status_heads_max:=1;
        elsif v_text ~ 'if tails.*(?:defending pok[eé]mon|opponent''s active pok[eé]mon).*is now (?:paralyzed|asleep|confused|poisoned|burned)' then
          v_status_coin_count:=1; v_status_heads_min:=0; v_status_heads_max:=0;
        end if;
      end if;
      if v_status is not null then v_effect_notes:=array_append(v_effect_notes,'condição especial no defensor: '||v_status); end if;
    end if;

    if v_text like '%remove all special conditions from this pokémon%'
       or v_text like '%remove all special conditions from this pokemon%'
       or position('remove all special conditions from '||lower(coalesce(v_attacker.pokemon_name,'')) in v_text)>0 then
      v_clear_self_special:=true;
      v_effect_notes:=array_append(v_effect_notes,'remove Condições Especiais do atacante');
    end if;
    if v_text like '%remove that special condition from this pokémon%'
       or v_text like '%remove that special condition from this pokemon%'
       or position('remove the special condition poisoned from '||lower(coalesce(v_attacker.pokemon_name,'')) in v_text)>0 then
      v_clear_self_poison:=true;
      v_effect_notes:=array_append(v_effect_notes,'remove Poison do atacante');
    end if;
    if v_text like '%remove all special conditions from the defending pokémon%'
       or v_text like '%remove all special conditions from that pokémon%'
       or v_text like '%remove all special conditions from your opponent''s active pokémon%' then
      v_clear_defender_special:=true;
      v_effect_notes:=array_append(v_effect_notes,'remove Condições Especiais do defensor');
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

    -- Next-turn counter effects. They resolve even if this Pokémon is Knocked Out by the triggering attack.
    v_match:=regexp_match(v_text,'during your opponent''s next turn, if (?:this pok[eé]mon|[^,.]+) is damaged by (?:an opponent''s |an )?attack.*(?:put|place) ([0-9]+) damage counters? on the attacking pok[eé]mon');
    if v_match is not null then
      v_self_reactive_damage_next:=greatest(v_self_reactive_damage_next,v_match[1]::numeric*10);
      v_effect_notes:=array_append(v_effect_notes,'contra-dano fixo no próximo turno');
    end if;

    if v_text ~ 'during your opponent''s next turn, if (?:this pok[eé]mon|[^,.]+) is damaged by (?:an opponent''s |an )?attack.*put damage counters on the attacking pok[eé]mon equal to the damage done to (?:this pok[eé]mon|[^.]+)' then
      v_self_reactive_multiplier_next:=greatest(v_self_reactive_multiplier_next,1);
      v_effect_notes:=array_append(v_effect_notes,'contra-dano igual ao dano recebido');
    end if;

    if v_text ~ 'if an attack (?:does damage to|damages) [^.]+ during your opponent''s next turn.*(?:attacks|does) (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon) for an equal amount of damage'
       or v_text ~ 'if an attack (?:does damage to|damages) [^.]+ during your opponent''s next turn.*(?:attacks|does) the defending pok[eé]mon for an equal amount of damage'
       or v_text ~ 'if an attack (?:does damage to|damages) [^.]+ during your opponent''s next turn.*does an equal amount of damage to (?:your opponent''s active pok[eé]mon|the defending pok[eé]mon)' then
      v_self_reactive_multiplier_next:=greatest(v_self_reactive_multiplier_next,1);
      if v_text like '%flip a coin%if heads%' then v_self_reactive_chance_next:=least(v_self_reactive_chance_next,0.5); end if;
      v_effect_notes:=array_append(v_effect_notes,'contra-ataque igual ao dano recebido');
    end if;

    if v_text ~ 'if an attack does damage to [^.]+ during your opponent''s next turn.*flip a coin.*if heads.*(?:attacks|does) your opponent''s active pok[eé]mon for double that amount of damage' then
      v_self_reactive_multiplier_next:=greatest(v_self_reactive_multiplier_next,2);
      v_self_reactive_chance_next:=least(v_self_reactive_chance_next,0.5);
      v_effect_notes:=array_append(v_effect_notes,'contra-ataque dobrado com moeda');
    end if;

    v_match:=regexp_match(v_text,'if an attack does damage to [^.]+ during your opponent''s next turn.*(?:attacks|does) your opponent''s active pok[eé]mon for ([0-9]+) damage');
    if v_match is not null then
      v_self_reactive_damage_next:=greatest(v_self_reactive_damage_next,v_match[1]::numeric);
      if v_text like '%flip a coin%if heads%' then v_self_reactive_chance_next:=least(v_self_reactive_chance_next,0.5); end if;
      v_effect_notes:=array_append(v_effect_notes,'contra-ataque fixo no próximo turno');
    end if;

    if v_text ~ 'during your opponent''s next turn, whenever your opponent''s attack damages [^.]+.*opponent''s active pok[eé]mon is now poisoned'
       or v_text ~ 'during your opponent''s next turn, if (?:this pok[eé]mon|[^,.]+) is damaged by (?:an opponent''s |an )?attack.*attacking pok[eé]mon is now poisoned' then
      v_self_reactive_status_next:='poisoned';
      -- This condition belongs to the future reactive trigger, not to the attack that sets it up.
      if v_text ~ 'during your opponent''s next turn.*(?:opponent''s active pok[eé]mon|attacking pok[eé]mon) is now poisoned' then
        v_inflict_poison:=false;
        if v_status='poisoned' then v_status:=null; end if;
      end if;
      v_effect_notes:=array_append(v_effect_notes,'contra-status Poison no próximo turno');
    elsif v_text ~ 'during your opponent''s next turn, if (?:this pok[eé]mon|[^,.]+) is damaged by (?:an opponent''s |an )?attack.*attacking pok[eé]mon is now burned' then
      v_self_reactive_status_next:='burned';
      if v_text ~ 'during your opponent''s next turn.*attacking pok[eé]mon is now burned' then
        v_inflict_burn:=false;
        if v_status='burned' then v_status:=null; end if;
      end if;
      v_effect_notes:=array_append(v_effect_notes,'contra-status Burn no próximo turno');
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
    if v_text like '%during your opponent''s next turn%'
       and v_text like '%prevent all damage%done to this pokémon%' then
      v_self_prevent_next:=true;
      if v_text like '%flip a coin%' and v_text like '%if heads%' then v_self_prevent_chance:=0.5; end if;

      if v_text like '%from basic non-colorless pokémon%' then v_self_prevent_class:='basic_non_colorless';
      elsif v_text like '%from evolution pokémon%' then v_self_prevent_class:='evolution';
      elsif v_text like '%from pokémon-gx and pokémon-ex%' or v_text like '%from pokémon gx and pokémon ex%' then v_self_prevent_class:='gx_or_ex';
      elsif v_text like '%from tag team pokémon%' then v_self_prevent_class:='tag_team';
      elsif v_text like '%from ancient pokémon%' then v_self_prevent_class:='ancient';
      elsif v_text like '%from ultra beasts%' then v_self_prevent_class:='ultra_beast';
      elsif v_text like '%from burned pokémon%' then v_self_prevent_class:='burned';
      elsif v_text like '%from pokémon that have an ability%' then v_self_prevent_class:='ability';
      elsif v_text like '%from pokémon-ex%' or v_text like '%from pokémon ex%' then v_self_prevent_class:='ex';
      elsif v_text like '%from pokémon vmax%' then v_self_prevent_class:='vmax';
      elsif v_text like '%from pokémon v%' then v_self_prevent_class:='v';
      elsif v_text like '%from basic pokémon%' then v_self_prevent_class:='basic';
      else v_self_prevent_class:='all'; end if;

      v_effect_notes:=array_append(v_effect_notes,'previne dano no próximo turno ('||v_self_prevent_class||')');
    end if;

    v_ignore_defender_effects:=
      exists(
        select 1
        from jsonb_array_elements(coalesce(v_attacker.tcg_data->'abilities','[]'::jsonb)) ab
        where lower(coalesce(ab->>'text','')) like '%damage from attacks used by this pokémon isn''t affected by any effects on your opponent''s active pokémon%'
           or lower(coalesce(ab->>'text','')) like '%damage from attacks used by this pokemon isn''t affected by any effects on your opponent''s active pokemon%'
      )
      or v_text like '%damage isn''t affected by any effects on your opponent''s active pokémon%'
      or v_text like '%damage isn''t affected by any effects on the defending pokémon%'
      or v_text like '%damage is not affected by any effects on your opponent''s active pokémon%'
      or v_text like '%damage isn''t affected by weakness, resistance,%any other effects%'
      or v_text like '%damage isn''t affected by weakness, resistance, poké-powers%'
      or v_text like '%damage isn''t affected by weakness, resistance, pokémon powers%';

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

    if v_instant_knockout and not v_self_knockout and not v_both_knockout then
      v_score:=2000000000-v_cost;
    elsif v_both_knockout then
      v_score:=500000-v_cost;
    elsif v_self_knockout and v_remaining_hp>0 and (v_expected+v_direct_damage_counters)<v_remaining_hp then
      v_score:=-1000000000-v_cost;
    elsif v_self_knockout and v_remaining_hp>0 and (v_expected+v_direct_damage_counters)>=v_remaining_hp then
      v_score:=500000-v_cost;
    elsif v_remaining_hp>0 and (v_expected+v_direct_damage_counters)>=v_remaining_hp then
      v_score:=1000000000+v_expected+v_direct_damage_counters-v_cost;
    else
      v_score:=(v_expected+v_direct_damage_counters)/v_interval
        +v_status_bonus
        -case v_inflict_self_major when 'paralyzed' then 45 when 'asleep' then 28 when 'confused' then 18 else 0 end
        -case when v_inflict_self_poison then 14 else 0 end
        -case when v_inflict_self_burn then 18 else 0 end
        +case when v_inflict_self_poison then private.battle_v6_self_status_payoff(v_attacker.id,'poisoned')*greatest(1,v_weakness_multiplier)*0.65 else 0 end
        +case when v_inflict_self_burn then private.battle_v6_self_status_payoff(v_attacker.id,'burned')*greatest(1,v_weakness_multiplier)*0.65 else 0 end
        +case when v_inflict_self_major is not null then private.battle_v6_self_status_payoff(v_attacker.id,'special')*greatest(1,v_weakness_multiplier)*0.4 else 0 end
        +case when v_clear_self_special and (coalesce(p_attacker_poison,false) or coalesce(p_attacker_burn,false) or p_attacker_major is not null) then 28 else 0 end
        +case when v_clear_self_poison and coalesce(p_attacker_poison,false) then 16 else 0 end
        -case when v_clear_defender_special and coalesce(p_defender_special,false) then 8 else 0 end
        +v_self_reduction_next*0.25
        +case when v_self_prevent_next then 45 else 0 end
        +case when v_self_no_weakness_next then 22 else 0 end
        +v_self_reactive_damage_next*0.30*v_self_reactive_chance_next
        +v_self_reactive_multiplier_next*45*v_self_reactive_chance_next
        +case when v_self_reactive_status_next='poisoned' then 18 when v_self_reactive_status_next='burned' then 22 else 0 end
        +case when v_self_prevent_damage_cap_next>0 then 28 else 0 end
        +case when v_defender_energy_discard>0 or v_defender_energy_discard_coins>0 then 18 else 0 end
        +case when v_lock_defender_best then 28 else 0 end
        +v_self_energy_gain*18
        +v_defender_energy_return*18
        +case when v_knockout_coin_count=1 and v_knockout_heads_required=1 then 220 else 0 end
        +case when v_knockout_coin_count=2 and v_knockout_heads_required=2 then 180 else 0 end
        +case when v_delayed_knockout_next then 160 else 0 end
        +case when v_defender_heal_block_next then 24 else 0 end
        +case when v_extra_turn then 70 else 0 end
        +case when v_extra_turn_on_knockout then 35 else 0 end
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
        'attackText',case when v_copy_source is not null then coalesce(v_copy_source->>'text','') else coalesce(v_attack->>'text','') end,
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
        'statusCoinCount',v_status_coin_count,
        'statusHeadsMin',v_status_heads_min,
        'statusHeadsMax',v_status_heads_max,
        'recoilDamage',v_recoil,
        'healDamage',v_heal,
        'healEqualDamage',v_heal_equal,
        'healAll',v_heal_all
      ) || jsonb_build_object(
        'selfReductionNext',v_self_reduction_next,
        'selfEnergyGain',v_self_energy_gain,
        'selfEnergyGainChance',v_self_energy_gain_chance,
        'defenderEnergyReturn',v_defender_energy_return,
        'instantKnockout',v_instant_knockout,
        'knockoutCoinCount',v_knockout_coin_count,
        'knockoutHeadsRequired',v_knockout_heads_required,
        'selfKnockout',v_self_knockout,
        'bothKnockout',v_both_knockout,
        'delayedKnockoutNext',v_delayed_knockout_next,
        'defenderHealBlockNext',v_defender_heal_block_next,
        'extraTurn',v_extra_turn,
        'extraTurnOnKnockout',v_extra_turn_on_knockout,
        'usesGxLimit',v_uses_gx_limit,
        'usesVstarLimit',v_uses_vstar_limit,
        'copiedAttack',v_copy_source is not null,
        'copiedAttackName',v_copy_source_name,
        'selfPreventNext',v_self_prevent_next,
        'selfPreventChance',v_self_prevent_chance,
        'selfPreventClass',v_self_prevent_class,
        'selfNoWeaknessNext',v_self_no_weakness_next,
        'selfReactiveDamageNext',v_self_reactive_damage_next,
        'selfReactiveMultiplierNext',v_self_reactive_multiplier_next,
        'selfReactiveChanceNext',v_self_reactive_chance_next,
        'selfReactiveStatusNext',v_self_reactive_status_next,
        'selfPreventDamageCapNext',v_self_prevent_damage_cap_next,
        'inflictSelfMajor',v_inflict_self_major,
        'inflictSelfPoison',v_inflict_self_poison,
        'inflictSelfBurn',v_inflict_self_burn,
        'clearSelfSpecial',v_clear_self_special,
        'clearSelfPoison',v_clear_self_poison,
        'clearDefenderSpecial',v_clear_defender_special,
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
        'inflictPoison',v_inflict_poison,
        'inflictBurn',v_inflict_burn,
        'inflictMajor',v_status,
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
  c_reactive_multiplier_next numeric:=0;
  o_reactive_multiplier_next numeric:=0;
  c_reactive_chance_next numeric:=1;
  o_reactive_chance_next numeric:=1;
  c_reactive_status_next text:=null;
  o_reactive_status_next text:=null;
  c_prevent_damage_cap_next numeric:=0;
  o_prevent_damage_cap_next numeric:=0;
  c_delayed_ko_next boolean:=false;
  o_delayed_ko_next boolean:=false;
  c_heal_block_next boolean:=false;
  o_heal_block_next boolean:=false;
  c_gx_used boolean:=false;
  o_gx_used boolean:=false;
  c_vstar_used boolean:=false;
  o_vstar_used boolean:=false;
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
  v_gate_heads integer;
  v_bonus_heads integer;
  v_status_heads integer;
  v_status_coin_count integer;
  v_status_heads_min integer;
  v_status_heads_max integer;
  v_status_success boolean;
  v_required_heads integer;
  v_i integer;
  v_def jsonb;
  v_effect_immune boolean;
  v_reactive numeric;
  v_reactive_status text;
  v_reactive_counter numeric;
  v_attack_failed boolean;
  v_extra_turn boolean:=false;
  v_direct numeric;
  v_turn_ability jsonb;
  v_attach_count integer;
  v_attach_punish numeric;
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
  c_last_received_attack numeric:=0;
  o_last_received_attack numeric:=0;
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
  v_is_c:=c_first;

  for v_half in 1..80 loop
    v_extra_turn:=false;

    if v_is_c then
      o_last_received_attack:=0;
      c_turns:=c_turns+1;
      v_turn_ability:=private.battle_v6_turn_ability_effects(c.id);
      v_attach_count:=1+coalesce((v_turn_ability->>'extraEnergy')::integer,0);
      c_energy:=least(12,c_energy+v_attach_count);
      if not c_heal_block_next and coalesce((v_turn_ability->>'heal')::numeric,0)>0
         and private.battle_v6_hash_roll(v_seed||':'||v_half||':turn_heal')<=coalesce((v_turn_ability->>'healChance')::numeric,1)
      then c_damage:=greatest(0,c_damage-(v_turn_ability->>'heal')::numeric); end if;
      if coalesce((v_turn_ability->>'cureSpecial')::boolean,false) then c_major:=null; c_poison:=false; c_burn:=false; end if;
      v_attach_punish:=private.battle_v6_energy_attachment_punish(o.id);
      if v_attach_punish>0 then c_damage:=least(c_hp,c_damage+v_attach_punish*v_attach_count); end if;
      v_energy_before:=c_energy;
      v_attack_failed:=false;

      if v_half=1 and not private.battle_v6_has_go_first_override(c.id,c_energy) then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','first_player_no_attack','energy',c_energy));
      elsif c_major='paralyzed' then
        c_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','paralyzed_skip','energy',c_energy));
      elsif c_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','asleep_skip','energy',c_energy));
      elsif c_cooldown_all>0 then
        c_cooldown_all:=c_cooldown_all-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','cooldown_skip','energy',c_energy));
      elsif c_attack_gate_next>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':attack_gate')<c_attack_gate_next then
        c_attack_gate_next:=0;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','attack_gate_failed','energy',c_energy));
      else
        c_attack_gate_next:=0;
        v_blocked:=array[]::text[];
        if v_half=1 then
          v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'text','')) not like '%if you go first, you can use this attack on your first turn%'),array[]::text[]);
        end if;
        if c_blocked_turns>0 and c_blocked_attack is not null then v_blocked:=array_append(v_blocked,c_blocked_attack); end if;
        if c_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,c_last_received_attack,c_poison,c_burn,c_major,o_damage,(o_major is not null or o_poison or o_burn),o_poison,o_burn,o_major,o_no_weakness_next,c_gx_used,c_vstar_used,(c_turns=1 and not c_first),v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          c_disable_best_next:=c_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,c_last_received_attack,c_poison,c_burn,c_major,o_damage,(o_major is not null or o_poison or o_burn),o_poison,o_burn,o_major,o_no_weakness_next,c_gx_used,c_vstar_used,(c_turns=1 and not c_first),v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          v_gate_heads:=-1; v_bonus_heads:=-1;
          if coalesce((v_plan->>'usesGxLimit')::boolean,false) then c_gx_used:=true; end if;
          if coalesce((v_plan->>'usesVstarLimit')::boolean,false) then c_vstar_used:=true; end if;
          v_extra_turn:=coalesce((v_plan->>'extraTurn')::boolean,false);

          if c_major='confused' and private.battle_v6_hash_roll(v_seed||':'||v_half||':confused')<0.5 then
            c_damage:=least(c_hp,c_damage+30);
            v_attack_failed:=true;
            v_extra_turn:=false;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_coin_count:=coalesce((v_plan->>'coinGateCount')::integer,0);
            v_required_heads:=coalesce((v_plan->>'coinGateHeads')::integer,0);
            if v_coin_count>0 then
              v_heads:=0;
              for v_i in 1..v_coin_count loop
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':gate:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              v_gate_heads:=v_heads;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_extra_turn:=false;
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
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_heads:=0; v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                for v_i in 1..v_coin_count loop
                  if private.battle_v6_hash_roll(v_seed||':'||v_half||':bonus:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                end loop;
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
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

              if o_prevent_next_class is not null and private.battle_v6_matches_class(c.id,o_prevent_next_class,c_burn) then v_effective:=0;
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
              o_last_received_attack:=v_effective;
              v_direct:=case when not v_effect_immune then coalesce((v_plan->>'directDamageCounters')::numeric,0) else 0 end;
              if v_direct>0 then o_damage:=least(o_hp,o_damage+v_direct); end if;
              c_damage_dealt:=c_damage_dealt+v_effective+v_direct;
              if coalesce((v_plan->>'extraTurnOnKnockout')::boolean,false) and o_damage>=o_hp then v_extra_turn:=true; end if;
              if v_effective>0 and (o_reactive_next>0 or o_reactive_multiplier_next>0 or o_reactive_status_next is not null)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':stored_reactive')<=o_reactive_chance_next then
                v_reactive_counter:=greatest(0,o_reactive_next+o_reactive_multiplier_next*v_effective);
                if v_reactive_counter>0 then c_damage:=least(c_hp,c_damage+v_reactive_counter); end if;
                if o_reactive_status_next='poisoned' and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true;
                elsif o_reactive_status_next='burned' and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
              end if;
              c_last_attack:=v_attack_name; c_last_damage:=v_effective; c_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if not c_heal_block_next then
                if coalesce((v_plan->>'healAll')::boolean,false) then c_damage:=0;
                elsif v_heal>0 then c_damage:=greatest(0,c_damage-v_heal); end if;
              end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then c_damage:=least(c_hp,c_damage+v_recoil); end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); c_energy:=greatest(0,c_energy-v_discard);
              if coalesce((v_plan->>'selfEnergyGain')::integer,0)>0
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_energy_gain')<=coalesce((v_plan->>'selfEnergyGainChance')::numeric,1)
              then c_energy:=least(12,c_energy+(v_plan->>'selfEnergyGain')::integer); end if;
              c_cooldown_all:=greatest(c_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then c_blocked_attack:=v_attack_name; c_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then c_blocked_attack:=v_attack_name; c_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then c_reduce_next:=greatest(c_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then c_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then c_reactive_next:=greatest(c_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveMultiplierNext')::numeric,0)>0 then c_reactive_multiplier_next:=greatest(c_reactive_multiplier_next,(v_plan->>'selfReactiveMultiplierNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveChanceNext')::numeric,1)<1 then c_reactive_chance_next:=least(c_reactive_chance_next,(v_plan->>'selfReactiveChanceNext')::numeric); end if;
              if coalesce(v_plan->>'selfReactiveStatusNext','')<>'' then c_reactive_status_next:=v_plan->>'selfReactiveStatusNext'; end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then c_prevent_damage_cap_next:=greatest(c_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce((v_plan->>'inflictSelfPoison')::boolean,false) and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; end if;
              if coalesce((v_plan->>'inflictSelfBurn')::boolean,false) and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' and not private.battle_v6_status_immune(c.id,v_plan->>'inflictSelfMajor') then c_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'clearSelfSpecial')::boolean,false) then c_poison:=false; c_burn:=false; c_major:=null; end if;
              if coalesce((v_plan->>'clearSelfPoison')::boolean,false) then c_poison:=false; end if;
              if coalesce((v_plan->>'selfKnockout')::boolean,false) or coalesce((v_plan->>'bothKnockout')::boolean,false) then c_damage:=c_hp; end if;
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
                if coalesce((v_plan->>'defenderEnergyReturn')::integer,0)>0 then o_energy:=greatest(0,o_energy-(v_plan->>'defenderEnergyReturn')::integer); end if;
                if coalesce((v_plan->>'bothKnockout')::boolean,false) then o_damage:=o_hp;
                elsif coalesce((v_plan->>'knockoutCoinCount')::integer,0)>0 then
                  v_heads:=0; v_coin_count:=(v_plan->>'knockoutCoinCount')::integer;
                  for v_i in 1..v_coin_count loop
                    if private.battle_v6_hash_roll(v_seed||':'||v_half||':ko_coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                  end loop;
                  if v_heads>=coalesce((v_plan->>'knockoutHeadsRequired')::integer,v_coin_count) then o_damage:=o_hp; end if;
                elsif coalesce((v_plan->>'instantKnockout')::boolean,false) then o_damage:=o_hp; end if;
                if coalesce((v_plan->>'extraTurnOnKnockout')::boolean,false) and o_damage>=o_hp then v_extra_turn:=true; end if;
                if coalesce((v_plan->>'delayedKnockoutNext')::boolean,false) then o_delayed_ko_next:=true; end if;
                if coalesce((v_plan->>'defenderHealBlockNext')::boolean,false) then o_heal_block_next:=true; end if;
                if coalesce((v_plan->>'defenderAttackGateChance')::numeric,0)>0 then o_attack_gate_next:=greatest(o_attack_gate_next,(v_plan->>'defenderAttackGateChance')::numeric); end if;
                if coalesce((v_plan->>'defenderCannotAttackNext')::boolean,false) then o_cooldown_all:=greatest(o_cooldown_all,1); end if;
                if coalesce((v_plan->>'defenderOutgoingReductionNext')::numeric,0)>0 then o_outgoing_reduction_next:=greatest(o_outgoing_reduction_next,(v_plan->>'defenderOutgoingReductionNext')::numeric); end if;
                if coalesce((v_plan->>'lockDefenderBest')::boolean,false) then o_disable_best_next:=greatest(o_disable_best_next,1); end if;

                v_status:=coalesce(v_plan->>'inflictMajor',v_plan->>'inflictStatus');
                v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
                v_status_coin_count:=coalesce((v_plan->>'statusCoinCount')::integer,0);
                v_status_heads_min:=coalesce((v_plan->>'statusHeadsMin')::integer,0);
                v_status_heads_max:=coalesce((v_plan->>'statusHeadsMax')::integer,v_status_coin_count);
                if v_status_coin_count>0 then
                  if coalesce((v_plan->>'coinBonusCount')::integer,0)=v_status_coin_count and v_bonus_heads>=0 then
                    v_status_heads:=v_bonus_heads;
                  elsif coalesce((v_plan->>'coinGateCount')::integer,0)=v_status_coin_count and v_gate_heads>=0 then
                    v_status_heads:=v_gate_heads;
                  else
                    v_status_heads:=0;
                    for v_i in 1..v_status_coin_count loop
                      if private.battle_v6_hash_roll(v_seed||':'||v_half||':statuscoin:'||v_i)>=0.5 then v_status_heads:=v_status_heads+1; end if;
                    end loop;
                  end if;
                  v_status_success:=v_status_heads between v_status_heads_min and v_status_heads_max;
                else
                  v_status_success:=private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance;
                end if;
                if v_status_success then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') and not private.battle_v6_status_immune(o.id,v_status) then o_major:=v_status; end if;
                end if;
                if coalesce((v_plan->>'clearDefenderSpecial')::boolean,false) then o_poison:=false; o_burn:=false; o_major:=null; end if;
              end if;

              if v_reactive>0 then c_damage:=least(c_hp,c_damage+v_reactive); end if;
              if v_reactive_status='poisoned' and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true;
              elsif v_reactive_status='burned' and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;

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
      c_last_received_attack:=0;
      o_turns:=o_turns+1;
      v_turn_ability:=private.battle_v6_turn_ability_effects(o.id);
      v_attach_count:=1+coalesce((v_turn_ability->>'extraEnergy')::integer,0);
      o_energy:=least(12,o_energy+v_attach_count);
      if not o_heal_block_next and coalesce((v_turn_ability->>'heal')::numeric,0)>0
         and private.battle_v6_hash_roll(v_seed||':'||v_half||':turn_heal')<=coalesce((v_turn_ability->>'healChance')::numeric,1)
      then o_damage:=greatest(0,o_damage-(v_turn_ability->>'heal')::numeric); end if;
      if coalesce((v_turn_ability->>'cureSpecial')::boolean,false) then o_major:=null; o_poison:=false; o_burn:=false; end if;
      v_attach_punish:=private.battle_v6_energy_attachment_punish(c.id);
      if v_attach_punish>0 then o_damage:=least(o_hp,o_damage+v_attach_punish*v_attach_count); end if;
      v_energy_before:=o_energy;
      v_attack_failed:=false;

      if v_half=1 and not private.battle_v6_has_go_first_override(o.id,o_energy) then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','first_player_no_attack','energy',o_energy));
      elsif o_major='paralyzed' then
        o_major:=null;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','paralyzed_skip','energy',o_energy));
      elsif o_major='asleep' then
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','asleep_skip','energy',o_energy));
      elsif o_cooldown_all>0 then
        o_cooldown_all:=o_cooldown_all-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','cooldown_skip','energy',o_energy));
      elsif o_attack_gate_next>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':attack_gate')<o_attack_gate_next then
        o_attack_gate_next:=0;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','attack_gate_failed','energy',o_energy));
      else
        o_attack_gate_next:=0;
        v_blocked:=array[]::text[];
        if v_half=1 then
          v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce(o.tcg_data->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'text','')) not like '%if you go first, you can use this attack on your first turn%'),array[]::text[]);
        end if;
        if o_blocked_turns>0 and o_blocked_attack is not null then v_blocked:=array_append(v_blocked,o_blocked_attack); end if;
        if o_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,o_last_received_attack,o_poison,o_burn,o_major,c_damage,(c_major is not null or c_poison or c_burn),c_poison,c_burn,c_major,c_no_weakness_next,o_gx_used,o_vstar_used,(o_turns=1 and c_first),v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          o_disable_best_next:=o_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,o_last_received_attack,o_poison,o_burn,o_major,c_damage,(c_major is not null or c_poison or c_burn),c_poison,c_burn,c_major,c_no_weakness_next,o_gx_used,o_vstar_used,(o_turns=1 and c_first),v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          v_gate_heads:=-1; v_bonus_heads:=-1;
          if coalesce((v_plan->>'usesGxLimit')::boolean,false) then o_gx_used:=true; end if;
          if coalesce((v_plan->>'usesVstarLimit')::boolean,false) then o_vstar_used:=true; end if;
          v_extra_turn:=coalesce((v_plan->>'extraTurn')::boolean,false);

          if o_major='confused' and private.battle_v6_hash_roll(v_seed||':'||v_half||':confused')<0.5 then
            o_damage:=least(o_hp,o_damage+30);
            v_attack_failed:=true;
            v_extra_turn:=false;
            v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','confusion_tails','selfDamage',30,'attack',v_attack_name));
          else
            v_coin_count:=coalesce((v_plan->>'coinGateCount')::integer,0);
            v_required_heads:=coalesce((v_plan->>'coinGateHeads')::integer,0);
            if v_coin_count>0 then
              v_heads:=0;
              for v_i in 1..v_coin_count loop
                if private.battle_v6_hash_roll(v_seed||':'||v_half||':gate:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
              end loop;
              v_gate_heads:=v_heads;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_extra_turn:=false;
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
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_heads:=0; v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                for v_i in 1..v_coin_count loop
                  if private.battle_v6_hash_roll(v_seed||':'||v_half||':bonus:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                end loop;
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
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

              if c_prevent_next_class is not null and private.battle_v6_matches_class(o.id,c_prevent_next_class,o_burn) then v_effective:=0;
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
              c_last_received_attack:=v_effective;
              v_direct:=case when not v_effect_immune then coalesce((v_plan->>'directDamageCounters')::numeric,0) else 0 end;
              if v_direct>0 then c_damage:=least(c_hp,c_damage+v_direct); end if;
              o_damage_dealt:=o_damage_dealt+v_effective+v_direct;
              if coalesce((v_plan->>'extraTurnOnKnockout')::boolean,false) and c_damage>=c_hp then v_extra_turn:=true; end if;
              if v_effective>0 and (c_reactive_next>0 or c_reactive_multiplier_next>0 or c_reactive_status_next is not null)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':stored_reactive')<=c_reactive_chance_next then
                v_reactive_counter:=greatest(0,c_reactive_next+c_reactive_multiplier_next*v_effective);
                if v_reactive_counter>0 then o_damage:=least(o_hp,o_damage+v_reactive_counter); end if;
                if c_reactive_status_next='poisoned' and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true;
                elsif c_reactive_status_next='burned' and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
              end if;
              o_last_attack:=v_attack_name; o_last_damage:=v_effective; o_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if not o_heal_block_next then
                if coalesce((v_plan->>'healAll')::boolean,false) then o_damage:=0;
                elsif v_heal>0 then o_damage:=greatest(0,o_damage-v_heal); end if;
              end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0); if v_recoil>0 then o_damage:=least(o_hp,o_damage+v_recoil); end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0); o_energy:=greatest(0,o_energy-v_discard);
              if coalesce((v_plan->>'selfEnergyGain')::integer,0)>0
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_energy_gain')<=coalesce((v_plan->>'selfEnergyGainChance')::numeric,1)
              then o_energy:=least(12,o_energy+(v_plan->>'selfEnergyGain')::integer); end if;
              o_cooldown_all:=greatest(o_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then o_blocked_attack:=v_attack_name; o_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then o_blocked_attack:=v_attack_name; o_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then o_reduce_next:=greatest(o_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then o_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then o_reactive_next:=greatest(o_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveMultiplierNext')::numeric,0)>0 then o_reactive_multiplier_next:=greatest(o_reactive_multiplier_next,(v_plan->>'selfReactiveMultiplierNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveChanceNext')::numeric,1)<1 then o_reactive_chance_next:=least(o_reactive_chance_next,(v_plan->>'selfReactiveChanceNext')::numeric); end if;
              if coalesce(v_plan->>'selfReactiveStatusNext','')<>'' then o_reactive_status_next:=v_plan->>'selfReactiveStatusNext'; end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then o_prevent_damage_cap_next:=greatest(o_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce((v_plan->>'inflictSelfPoison')::boolean,false) and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; end if;
              if coalesce((v_plan->>'inflictSelfBurn')::boolean,false) and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' and not private.battle_v6_status_immune(o.id,v_plan->>'inflictSelfMajor') then o_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'clearSelfSpecial')::boolean,false) then o_poison:=false; o_burn:=false; o_major:=null; end if;
              if coalesce((v_plan->>'clearSelfPoison')::boolean,false) then o_poison:=false; end if;
              if coalesce((v_plan->>'selfKnockout')::boolean,false) or coalesce((v_plan->>'bothKnockout')::boolean,false) then o_damage:=o_hp; end if;
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
                if coalesce((v_plan->>'defenderEnergyReturn')::integer,0)>0 then c_energy:=greatest(0,c_energy-(v_plan->>'defenderEnergyReturn')::integer); end if;
                if coalesce((v_plan->>'bothKnockout')::boolean,false) then c_damage:=c_hp;
                elsif coalesce((v_plan->>'knockoutCoinCount')::integer,0)>0 then
                  v_heads:=0; v_coin_count:=(v_plan->>'knockoutCoinCount')::integer;
                  for v_i in 1..v_coin_count loop
                    if private.battle_v6_hash_roll(v_seed||':'||v_half||':ko_coin:'||v_i)>=0.5 then v_heads:=v_heads+1; end if;
                  end loop;
                  if v_heads>=coalesce((v_plan->>'knockoutHeadsRequired')::integer,v_coin_count) then c_damage:=c_hp; end if;
                elsif coalesce((v_plan->>'instantKnockout')::boolean,false) then c_damage:=c_hp; end if;
                if coalesce((v_plan->>'extraTurnOnKnockout')::boolean,false) and c_damage>=c_hp then v_extra_turn:=true; end if;
                if coalesce((v_plan->>'delayedKnockoutNext')::boolean,false) then c_delayed_ko_next:=true; end if;
                if coalesce((v_plan->>'defenderHealBlockNext')::boolean,false) then c_heal_block_next:=true; end if;
                if coalesce((v_plan->>'defenderAttackGateChance')::numeric,0)>0 then c_attack_gate_next:=greatest(c_attack_gate_next,(v_plan->>'defenderAttackGateChance')::numeric); end if;
                if coalesce((v_plan->>'defenderCannotAttackNext')::boolean,false) then c_cooldown_all:=greatest(c_cooldown_all,1); end if;
                if coalesce((v_plan->>'defenderOutgoingReductionNext')::numeric,0)>0 then c_outgoing_reduction_next:=greatest(c_outgoing_reduction_next,(v_plan->>'defenderOutgoingReductionNext')::numeric); end if;
                if coalesce((v_plan->>'lockDefenderBest')::boolean,false) then c_disable_best_next:=greatest(c_disable_best_next,1); end if;

                v_status:=coalesce(v_plan->>'inflictMajor',v_plan->>'inflictStatus');
                v_status_chance:=coalesce((v_plan->>'statusChance')::numeric,1);
                v_status_coin_count:=coalesce((v_plan->>'statusCoinCount')::integer,0);
                v_status_heads_min:=coalesce((v_plan->>'statusHeadsMin')::integer,0);
                v_status_heads_max:=coalesce((v_plan->>'statusHeadsMax')::integer,v_status_coin_count);
                if v_status_coin_count>0 then
                  if coalesce((v_plan->>'coinBonusCount')::integer,0)=v_status_coin_count and v_bonus_heads>=0 then
                    v_status_heads:=v_bonus_heads;
                  elsif coalesce((v_plan->>'coinGateCount')::integer,0)=v_status_coin_count and v_gate_heads>=0 then
                    v_status_heads:=v_gate_heads;
                  else
                    v_status_heads:=0;
                    for v_i in 1..v_status_coin_count loop
                      if private.battle_v6_hash_roll(v_seed||':'||v_half||':statuscoin:'||v_i)>=0.5 then v_status_heads:=v_status_heads+1; end if;
                    end loop;
                  end if;
                  v_status_success:=v_status_heads between v_status_heads_min and v_status_heads_max;
                else
                  v_status_success:=private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance;
                end if;
                if v_status_success then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') and not private.battle_v6_status_immune(c.id,v_status) then c_major:=v_status; end if;
                end if;
                if coalesce((v_plan->>'clearDefenderSpecial')::boolean,false) then c_poison:=false; c_burn:=false; c_major:=null; end if;
              end if;

              if v_reactive>0 then o_damage:=least(o_hp,o_damage+v_reactive); end if;
              if v_reactive_status='poisoned' and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true;
              elsif v_reactive_status='burned' and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;

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

    if v_is_c then
      if c_delayed_ko_next then c_damage:=c_hp; c_delayed_ko_next:=false; end if;
    else
      if o_delayed_ko_next then o_damage:=o_hp; o_delayed_ko_next:=false; end if;
    end if;

    -- Expire effects whose wording is limited to the just-finished turn.
    if v_is_c then
      o_reduce_next:=0;
      o_prevent_next_class:=null;
      o_no_weakness_next:=false;
      o_reactive_next:=0;
      o_reactive_multiplier_next:=0;
      o_reactive_chance_next:=1;
      o_reactive_status_next:=null;
      o_prevent_damage_cap_next:=0;
      c_outgoing_reduction_next:=0;
      c_attack_gate_next:=0;
      c_heal_block_next:=false;
      c_disable_best_next:=0;
      if c_blocked_turns>0 and c_blocked_turns<99 then
        c_blocked_turns:=c_blocked_turns-1;
        if c_blocked_turns=0 then c_blocked_attack:=null; end if;
      end if;
    else
      c_reduce_next:=0;
      c_prevent_next_class:=null;
      c_no_weakness_next:=false;
      c_reactive_next:=0;
      c_reactive_multiplier_next:=0;
      c_reactive_chance_next:=1;
      c_reactive_status_next:=null;
      c_prevent_damage_cap_next:=0;
      o_outgoing_reduction_next:=0;
      o_attack_gate_next:=0;
      o_heal_block_next:=false;
      o_disable_best_next:=0;
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

    if not v_extra_turn then
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

      v_is_c:=not v_is_c;
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
revoke all on function private.battle_v6_matches_class(text,text,boolean) from public,anon,authenticated;
revoke all on function private.battle_v6_self_status_payoff(text,text) from public,anon,authenticated;
revoke all on function private.battle_v6_copy_source_attack(text,integer,boolean,boolean,boolean) from public,anon,authenticated;
revoke all on function private.battle_v6_has_go_first_override(text,integer) from public,anon,authenticated;
revoke all on function private.battle_v6_turn_ability_effects(text) from public,anon,authenticated;
revoke all on function private.battle_v6_status_immune(text,text) from public,anon,authenticated;
revoke all on function private.battle_v6_energy_attachment_punish(text) from public,anon,authenticated;
revoke all on function private.battle_v6_defense_adjustment(text,text,numeric,numeric,text) from public,anon,authenticated;
revoke all on function private.battle_v6_attack_plan(text,text,integer,integer,numeric,numeric,boolean,boolean,text,numeric,boolean,boolean,boolean,text,boolean,boolean,boolean,boolean,text[]) from public,anon,authenticated;
revoke all on function private.battle_simulate_duel_v6(uuid,integer,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;
