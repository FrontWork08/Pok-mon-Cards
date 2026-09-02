-- Draft 3 manual attack selection.
-- Players first lock a Pokémon, then privately choose one printed attack.
-- The TCG v6 simulator keeps virtual Energy/effects but is forced to the chosen attack.

create table if not exists private.battle_attack_choices(
  battle_id uuid not null references public.battles(id) on delete cascade,
  round_no integer not null check(round_no between 1 and 3),
  player_id uuid not null references public.players(id) on delete cascade,
  attack_name text not null,
  locked_at timestamptz not null default now(),
  primary key(battle_id,round_no,player_id)
);

alter table private.battle_attack_choices enable row level security;

drop policy if exists battle_attack_choices_no_direct_access
on private.battle_attack_choices;
create policy battle_attack_choices_no_direct_access
on private.battle_attack_choices
for all to public
using(false) with check(false);

create index if not exists battle_attack_choices_battle_round_idx
on private.battle_attack_choices(battle_id,round_no);

create index if not exists battle_attack_choices_player_idx
on private.battle_attack_choices(player_id);

CREATE OR REPLACE FUNCTION private.battle_v6_manual_attack_name(p_battle_id uuid, p_round_no integer, p_side text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.attack_name
  from private.battle_attack_choices a
  join public.battles b on b.id=a.battle_id
  where a.battle_id=p_battle_id
    and a.round_no=p_round_no
    and a.player_id=case
      when p_side='challenger' then b.challenger_id
      when p_side='opponent' then b.opponent_id
      else null
    end
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.battle_pick_manual_attack(p_battle_id uuid, p_round_no integer, p_player_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_card text;
  v_target_card text;
  v_name text;
begin
  select * into b from public.battles where id=p_battle_id;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_player_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;

  select s.card_id into v_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=p_round_no and s.player_id=p_player_id;

  select s.card_id into v_target_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=p_round_no
    and s.player_id=case when p_player_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  if v_card is null then raise exception 'SELECTION_MISSING'; end if;
  if v_target_card is null then raise exception 'OPPONENT_SELECTION_MISSING'; end if;

  with attacks as materialized (
    select
      a.attack->>'name' attack_name,
      a.ord,
      array(
        select other.attack->>'name'
        from jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb))
             with ordinality other(attack,ord2)
        where other.ord2<>a.ord
      )::text[] blocked
    from public.cards c
    cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb))
         with ordinality a(attack,ord)
    where c.id=v_card
  ),
  scored as materialized (
    select
      attacks.attack_name,
      attacks.ord,
      private.battle_v6_attack_plan(
        v_card,v_target_card,
        12,12,0,0,false,false,null,0,false,false,false,null,
        false,false,false,false,false,null,0,attacks.blocked
      ) plan
    from attacks
  )
  select s.attack_name
  into v_name
  from scored s
  order by
    coalesce((s.plan->>'selectionScore')::numeric,0)
      * (0.92 + random()*0.16) desc,
    s.ord
  limit 1;

  if v_name is null then
    if exists(
      select 1 from public.cards c
      where c.id=v_card
        and jsonb_array_length(coalesce(c.tcg_data->'attacks','[]'::jsonb))=0
    ) then
      return '__NO_ATTACK__';
    end if;

    select a->>'name' into v_name
    from public.cards c
    cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) a
    where c.id=v_card
    order by random()
    limit 1;
  end if;

  return coalesce(v_name,'__NO_ATTACK__');
end;
$function$
;

CREATE OR REPLACE FUNCTION private.battle_start_attack_selection(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_count integer;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;

  if b.mode<>'draft3' then
    return jsonb_build_object('required',false,'status',b.status);
  end if;

  if b.status='revealing' then
    return jsonb_build_object('required',true,'status','revealing','round',b.active_round);
  end if;

  if b.status<>'selecting' then
    return jsonb_build_object('required',false,'status',b.status);
  end if;

  select count(*) into v_count
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round;

  if v_count<2 then
    return jsonb_build_object('required',false,'waitingForCards',true,'count',v_count);
  end if;

  update public.battles
  set status='revealing',
      selection_deadline=now()+make_interval(secs=>selection_seconds),
      updated_at=now()
  where id=b.id;

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    b.id,'attack_selection_started',
    jsonb_build_object(
      'round',b.active_round,
      'selectionSeconds',b.selection_seconds
    )
  );

  return jsonb_build_object(
    'required',true,
    'status','revealing',
    'round',b.active_round,
    'selectionSeconds',b.selection_seconds
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.battle_simulate_duel_v6(p_battle_id uuid, p_round_no integer, p_challenger_card_id text, p_opponent_card_id text, p_seed text DEFAULT NULL::text, p_first_challenger boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  c_poison_checkup_damage numeric:=10;
  o_poison_checkup_damage numeric:=10;
  c_burn boolean:=false;
  o_burn boolean:=false;
  c_cooldown_all integer:=0;
  o_cooldown_all integer:=0;
  c_entry_setup integer:=private.battle_v6_entry_setup_turns(p_challenger_card_id);
  o_entry_setup integer:=private.battle_v6_entry_setup_turns(p_opponent_card_id);
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
  c_healed_this_turn boolean:=false;
  o_healed_this_turn boolean:=false;
  c_next_attack_bonus_name text:=null;
  o_next_attack_bonus_name text:=null;
  c_next_attack_bonus numeric:=0;
  o_next_attack_bonus numeric:=0;
  c_first boolean;
  v_seed text;
  v_is_c boolean;
  v_half integer;
  v_plan jsonb;
  v_probe jsonb;
  v_attack_name text;
  v_manual_attack text;
  v_raw numeric;
  v_effective numeric;
  v_energy_before integer;
  v_discard integer;
  v_status text;
  v_status_chance numeric;
  v_recoil numeric;
  v_recoil_coin_count integer;
  v_recoil_heads_min integer;
  v_recoil_heads_max integer;
  v_recoil_heads integer;
  v_recoil_success boolean;
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
  v_reactive_energy_discard integer;
  v_reactive_knockout_chance numeric;
  v_reactive_chance numeric;
  v_reactive_counter numeric;
  v_attack_failed boolean;
  v_extra_turn boolean:=false;
  v_direct numeric;
  v_temp_damage numeric;
  v_target_remaining numeric;
  v_turn_ability jsonb;
  v_attach_count integer;
  v_attach_punish numeric;
  v_check_ability jsonb;
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
  c_hp:=(c_profile->>'hp')::numeric+private.battle_v6_ability_hp_bonus(c.id,1);
  o_hp:=(o_profile->>'hp')::numeric+private.battle_v6_ability_hp_bonus(o.id,1);
  v_seed:=coalesce(p_seed,p_battle_id::text||':'||p_round_no);
  c_first:=coalesce(p_first_challenger,private.battle_v6_hash_roll(v_seed||':first')>=0.5);
  v_is_c:=c_first;

  for v_half in 1..80 loop
    v_extra_turn:=false;

    if v_is_c then
      o_last_received_attack:=0;
      c_healed_this_turn:=false;
      c_turns:=c_turns+1;
      v_turn_ability:=private.battle_v6_turn_ability_effects(c.id);
      v_attach_count:=1+coalesce((v_turn_ability->>'extraEnergy')::integer,0);
      c_energy:=least(12,c_energy+v_attach_count);
      if not c_heal_block_next and c_damage>0 and coalesce((v_turn_ability->>'heal')::numeric,0)>0
         and private.battle_v6_hash_roll(v_seed||':'||v_half||':turn_heal')<=coalesce((v_turn_ability->>'healChance')::numeric,1)
      then c_damage:=greatest(0,c_damage-(v_turn_ability->>'heal')::numeric); c_healed_this_turn:=true; end if;
      if coalesce((v_turn_ability->>'cureSpecial')::boolean,false) then c_major:=null; c_poison:=false; c_poison_checkup_damage:=10; c_burn:=false; end if;
      if coalesce((v_turn_ability->>'damageOpponent')::numeric,0)>0 then o_damage:=least(o_hp,o_damage+(v_turn_ability->>'damageOpponent')::numeric); end if;
      if coalesce((v_turn_ability->>'burnOpponent')::boolean,false) and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
      if coalesce((v_turn_ability->>'selfKoDamageOpponent')::numeric,0)>0
         and greatest(0,o_hp-o_damage)<=coalesce((v_turn_ability->>'selfKoDamageOpponent')::numeric,0) then
        o_damage:=least(o_hp,o_damage+(v_turn_ability->>'selfKoDamageOpponent')::numeric);
        c_damage:=c_hp;
      end if;
      v_attach_punish:=private.battle_v6_energy_attachment_punish(o.id);
      if v_attach_punish>0 then c_damage:=least(c_hp,c_damage+v_attach_punish*v_attach_count); end if;
      v_energy_before:=c_energy;
      v_attack_failed:=false;

      if c_entry_setup>0 then
        c_entry_setup:=c_entry_setup-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','entry_setup_skip','energy',c_energy,'reason','restricted_entry_ability'));
      elsif v_half=1 and not private.battle_v6_has_go_first_override(c.id,c_energy) then
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
        v_manual_attack:=private.battle_v6_manual_attack_name(p_battle_id,p_round_no,case when v_is_c then 'challenger' else 'opponent' end);
        if v_manual_attack is not null then
          if v_manual_attack='__NO_ATTACK__' then
            v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce((case when v_is_c then c.tcg_data else o.tcg_data end)->'attacks','[]'::jsonb)) x),array[]::text[]);
          else
            v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce((case when v_is_c then c.tcg_data else o.tcg_data end)->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'name',''))<>lower(v_manual_attack)),array[]::text[]);
          end if;
        end if;
        if v_half=1 then
          v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'text','')) not like '%if you go first, you can use this attack on your first turn%'),array[]::text[]);
        end if;
        if c_blocked_turns>0 and c_blocked_attack is not null then v_blocked:=array_append(v_blocked,c_blocked_attack); end if;
        if c_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,c_last_received_attack,c_poison,c_burn,c_major,o_damage,(o_major is not null or o_poison or o_burn),o_poison,o_burn,o_major,o_no_weakness_next,c_gx_used,c_vstar_used,(c_turns=1 and not c_first),c_healed_this_turn,c_next_attack_bonus_name,c_next_attack_bonus,v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          c_disable_best_next:=c_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(c.id,o.id,c_energy,o_energy,c_damage,c_last_received_attack,c_poison,c_burn,c_major,o_damage,(o_major is not null or o_poison or o_burn),o_poison,o_burn,o_major,o_no_weakness_next,c_gx_used,c_vstar_used,(c_turns=1 and not c_first),c_healed_this_turn,c_next_attack_bonus_name,c_next_attack_bonus,v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          if c_next_attack_bonus_name is not null and lower(v_attack_name)=lower(c_next_attack_bonus_name) then c_next_attack_bonus_name:=null; c_next_attack_bonus:=0; end if;
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
              v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':gate',v_coin_count,true);
              v_gate_heads:=v_heads;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_extra_turn:=false;
                v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0);
                v_recoil_coin_count:=coalesce((v_plan->>'recoilCoinCount')::integer,0);
                if v_recoil>0 and v_recoil_coin_count=v_coin_count
                   and v_heads between coalesce((v_plan->>'recoilHeadsMin')::integer,0)
                                   and coalesce((v_plan->>'recoilHeadsMax')::integer,v_coin_count) then
                  c_damage:=least(c_hp,c_damage+v_recoil);
                end if;
                v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','challenger','event','attack_coin_failed','attack',v_attack_name,'heads',v_heads,'coins',v_coin_count));
              end if;
            end if;

            if not v_attack_failed then
              v_raw:=coalesce((v_plan->>'rawDamage')::numeric,0);

              if coalesce((v_plan->>'coinUntilTails')::boolean,false) then
                v_heads:=private.battle_v6_until_tails_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':until');
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':bonus',v_coin_count,true);
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
                v_def:=private.battle_v6_defense_adjustment(c.id,o.id,c_energy,o_energy,o_major,o_damage,v_effective,v_seed||':'||v_half||':def');
              end if;
              v_effective:=coalesce((v_def->>'damage')::numeric,v_effective);
              v_effect_immune:=coalesce((v_def->>'effectImmune')::boolean,false);
              v_reactive:=coalesce((v_def->>'reactiveDamage')::numeric,0);
              v_reactive_status:=v_def->>'reactiveStatus';
              v_reactive_energy_discard:=coalesce((v_def->>'reactiveEnergyDiscard')::integer,0);
              v_reactive_knockout_chance:=coalesce((v_def->>'reactiveKnockoutChance')::numeric,0);
              v_reactive_chance:=coalesce((v_def->>'reactiveChance')::numeric,1);

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
                if o_reactive_status_next='poisoned' and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; c_poison_checkup_damage:=10;
                elsif o_reactive_status_next='burned' and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true;
                elsif o_reactive_status_next is not null and not private.battle_v6_status_immune(c.id,o_reactive_status_next) then c_major:=o_reactive_status_next; end if;
              end if;
              c_last_attack:=v_attack_name; c_last_damage:=v_effective; c_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if not c_heal_block_next then
                if coalesce((v_plan->>'healAll')::boolean,false) then c_damage:=0;
                elsif v_heal>0 then c_damage:=greatest(0,c_damage-v_heal); end if;
              end if;
              if coalesce((v_plan->>'healDefenderDamage')::numeric,0)>0 and not o_heal_block_next then
                o_damage:=greatest(0,o_damage-(v_plan->>'healDefenderDamage')::numeric);
              end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0);
              if v_recoil>0 then
                v_recoil_coin_count:=coalesce((v_plan->>'recoilCoinCount')::integer,0);
                if v_recoil_coin_count>0 then
                  v_recoil_heads_min:=coalesce((v_plan->>'recoilHeadsMin')::integer,0);
                  v_recoil_heads_max:=coalesce((v_plan->>'recoilHeadsMax')::integer,v_recoil_coin_count);
                  if coalesce((v_plan->>'coinBonusCount')::integer,0)=v_recoil_coin_count and v_bonus_heads>=0 then
                    v_recoil_heads:=v_bonus_heads;
                  elsif coalesce((v_plan->>'coinGateCount')::integer,0)=v_recoil_coin_count and v_gate_heads>=0 then
                    v_recoil_heads:=v_gate_heads;
                  else
                    v_recoil_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':recoil_coin',v_recoil_coin_count,(v_recoil_heads_min=0 and v_recoil_heads_max=0));
                  end if;
                  v_recoil_success:=v_recoil_heads between v_recoil_heads_min and v_recoil_heads_max;
                else
                  v_recoil_success:=true;
                end if;
                if v_recoil_success then c_damage:=least(c_hp,c_damage+v_recoil); end if;
              end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0);
              if v_discard>0 and coalesce((v_plan->>'discardCoinCount')::integer,0)>0 then
                v_coin_count:=(v_plan->>'discardCoinCount')::integer;
                if v_gate_heads>=0 and coalesce((v_plan->>'coinGateCount')::integer,0)=v_coin_count then v_heads:=v_gate_heads;
                elsif v_bonus_heads>=0 and coalesce((v_plan->>'coinBonusCount')::integer,0)=v_coin_count then v_heads:=v_bonus_heads;
                else
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':discard_coin',v_coin_count,not (coalesce((v_plan->>'discardHeadsMin')::integer,0)=0 and coalesce((v_plan->>'discardHeadsMax')::integer,v_coin_count)=0));
                end if;
                if v_heads between coalesce((v_plan->>'discardHeadsMin')::integer,0) and coalesce((v_plan->>'discardHeadsMax')::integer,v_coin_count)
                then c_energy:=greatest(0,c_energy-v_discard); end if;
              else c_energy:=greatest(0,c_energy-v_discard); end if;
              if coalesce((v_plan->>'selfEnergyGain')::integer,0)>0
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_energy_gain')<=coalesce((v_plan->>'selfEnergyGainChance')::numeric,1)
              then c_energy:=least(12,c_energy+(v_plan->>'selfEnergyGain')::integer); end if;
              c_cooldown_all:=greatest(c_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then c_blocked_attack:=v_attack_name; c_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then c_blocked_attack:=v_attack_name; c_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then c_reduce_next:=greatest(c_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNextAttackBonus')::numeric,0)>0 and coalesce(v_plan->>'selfNextAttackBonusName','')<>'' then
                c_next_attack_bonus_name:=v_plan->>'selfNextAttackBonusName';
                c_next_attack_bonus:=(v_plan->>'selfNextAttackBonus')::numeric;
              end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then c_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then c_reactive_next:=greatest(c_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveMultiplierNext')::numeric,0)>0 then c_reactive_multiplier_next:=greatest(c_reactive_multiplier_next,(v_plan->>'selfReactiveMultiplierNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveChanceNext')::numeric,1)<1 then c_reactive_chance_next:=least(c_reactive_chance_next,(v_plan->>'selfReactiveChanceNext')::numeric); end if;
              if coalesce(v_plan->>'selfReactiveStatusNext','')<>'' then c_reactive_status_next:=v_plan->>'selfReactiveStatusNext'; end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then c_prevent_damage_cap_next:=greatest(c_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce((v_plan->>'inflictSelfPoison')::boolean,false) and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; c_poison_checkup_damage:=10; c_poison_checkup_damage:=greatest(10,coalesce((v_plan->>'selfPoisonCheckupDamage')::numeric,10)); end if;
              if coalesce((v_plan->>'inflictSelfBurn')::boolean,false) and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' and not private.battle_v6_status_immune(c.id,v_plan->>'inflictSelfMajor') then c_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'clearSelfSpecial')::boolean,false) then c_poison:=false; c_poison_checkup_damage:=10; c_burn:=false; c_major:=null; end if;
              if coalesce((v_plan->>'clearSelfPoison')::boolean,false) then c_poison:=false; c_poison_checkup_damage:=10; end if;
              if coalesce((v_plan->>'selfKnockout')::boolean,false) or coalesce((v_plan->>'bothKnockout')::boolean,false) then c_damage:=c_hp; end if;
              if coalesce((v_plan->>'selfPreventNext')::boolean,false)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_prevent')<=coalesce((v_plan->>'selfPreventChance')::numeric,1)
              then c_prevent_next_class:=coalesce(v_plan->>'selfPreventClass','all'); end if;

              if not v_effect_immune then
                if coalesce((v_plan->>'defenderEnergyDiscardAllCoinCount')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'defenderEnergyDiscardAllCoinCount')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':energy_discard_all_coin',v_coin_count,true);
                  if v_heads>=coalesce((v_plan->>'defenderEnergyDiscardAllHeads')::integer,v_coin_count) then o_energy:=0; end if;
                elsif coalesce((v_plan->>'defenderEnergyDiscardCoins')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'defenderEnergyDiscardCoins')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':energy_discard_coin',v_coin_count,true);
                  o_energy:=greatest(0,o_energy-v_heads);
                elsif coalesce((v_plan->>'defenderEnergyDiscard')::integer,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard')<=coalesce((v_plan->>'defenderEnergyDiscardChance')::numeric,1)
                then o_energy:=greatest(0,o_energy-(v_plan->>'defenderEnergyDiscard')::integer); end if;
                if coalesce((v_plan->>'defenderEnergyReturn')::integer,0)>0 then o_energy:=greatest(0,o_energy-(v_plan->>'defenderEnergyReturn')::integer); end if;
                if coalesce((v_plan->>'transferSelfDamage')::boolean,false)
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':transfer_damage')<=coalesce((v_plan->>'transferSelfDamageChance')::numeric,1) then
                  v_temp_damage:=c_damage;
                  c_damage:=0;
                  o_damage:=least(o_hp,o_damage+v_temp_damage);
                end if;
                if coalesce((v_plan->>'swapDamageCounters')::boolean,false)
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':swap_damage')<=coalesce((v_plan->>'swapDamageChance')::numeric,1) then
                  v_temp_damage:=c_damage;
                  c_damage:=least(c_hp,o_damage);
                  o_damage:=least(o_hp,v_temp_damage);
                end if;
                if coalesce((v_plan->>'setDefenderRemainingHp')::numeric,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':set_remaining_hp')<=coalesce((v_plan->>'setDefenderHpChance')::numeric,1) then
                  v_target_remaining:=(v_plan->>'setDefenderRemainingHp')::numeric;
                  if greatest(0,o_hp-o_damage)>v_target_remaining then o_damage:=least(o_hp,o_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'setBothRemainingHp')::numeric,0)>0 then
                  v_target_remaining:=(v_plan->>'setBothRemainingHp')::numeric;
                  if greatest(0,o_hp-o_damage)>v_target_remaining then o_damage:=least(o_hp,o_hp-v_target_remaining); end if;
                  if greatest(0,c_hp-c_damage)>v_target_remaining then c_damage:=least(c_hp,c_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'equalizeDefenderToAttackerHp')::boolean,false) then
                  v_target_remaining:=greatest(0,c_hp-c_damage);
                  if greatest(0,o_hp-o_damage)>v_target_remaining then o_damage:=least(o_hp,o_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'bothKnockout')::boolean,false) then o_damage:=o_hp;
                elsif coalesce((v_plan->>'knockoutCoinCount')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'knockoutCoinCount')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':ko_coin',v_coin_count,true);
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
                    v_status_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':statuscoin',v_status_coin_count,not (v_status_heads_min=0 and v_status_heads_max=0));
                  end if;
                  v_status_success:=v_status_heads between v_status_heads_min and v_status_heads_max;
                else
                  v_status_success:=private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance;
                end if;
                if v_status_success then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; o_poison_checkup_damage:=10; o_poison_checkup_damage:=greatest(10,coalesce((v_plan->>'poisonCheckupDamage')::numeric,10)); end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') and not private.battle_v6_status_immune(o.id,v_status) then o_major:=v_status; end if;
                end if;
                if coalesce((v_plan->>'clearDefenderSpecial')::boolean,false) then o_poison:=false; o_poison_checkup_damage:=10; o_burn:=false; o_major:=null; end if;
              end if;

              if v_reactive>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':ability_reactive')<=v_reactive_chance then c_damage:=least(c_hp,c_damage+v_reactive); end if;
              if v_reactive_energy_discard>0 and v_effective>0 then c_energy:=greatest(0,c_energy-v_reactive_energy_discard); end if;
              if v_reactive_knockout_chance>0 and o_damage>=o_hp
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':ability_reactive_ko')<=v_reactive_knockout_chance then c_damage:=c_hp; end if;
              if v_reactive_status='poisoned' and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; c_poison_checkup_damage:=10;
              elsif v_reactive_status='burned' and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true;
              elsif v_reactive_status is not null and not private.battle_v6_status_immune(c.id,v_reactive_status) then c_major:=v_reactive_status; end if;

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
      o_healed_this_turn:=false;
      o_turns:=o_turns+1;
      v_turn_ability:=private.battle_v6_turn_ability_effects(o.id);
      v_attach_count:=1+coalesce((v_turn_ability->>'extraEnergy')::integer,0);
      o_energy:=least(12,o_energy+v_attach_count);
      if not o_heal_block_next and o_damage>0 and coalesce((v_turn_ability->>'heal')::numeric,0)>0
         and private.battle_v6_hash_roll(v_seed||':'||v_half||':turn_heal')<=coalesce((v_turn_ability->>'healChance')::numeric,1)
      then o_damage:=greatest(0,o_damage-(v_turn_ability->>'heal')::numeric); o_healed_this_turn:=true; end if;
      if coalesce((v_turn_ability->>'cureSpecial')::boolean,false) then o_major:=null; o_poison:=false; o_poison_checkup_damage:=10; o_burn:=false; end if;
      if coalesce((v_turn_ability->>'damageOpponent')::numeric,0)>0 then c_damage:=least(c_hp,c_damage+(v_turn_ability->>'damageOpponent')::numeric); end if;
      if coalesce((v_turn_ability->>'burnOpponent')::boolean,false) and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
      if coalesce((v_turn_ability->>'selfKoDamageOpponent')::numeric,0)>0
         and greatest(0,c_hp-c_damage)<=coalesce((v_turn_ability->>'selfKoDamageOpponent')::numeric,0) then
        c_damage:=least(c_hp,c_damage+(v_turn_ability->>'selfKoDamageOpponent')::numeric);
        o_damage:=o_hp;
      end if;
      v_attach_punish:=private.battle_v6_energy_attachment_punish(c.id);
      if v_attach_punish>0 then o_damage:=least(o_hp,o_damage+v_attach_punish*v_attach_count); end if;
      v_energy_before:=o_energy;
      v_attack_failed:=false;

      if o_entry_setup>0 then
        o_entry_setup:=o_entry_setup-1;
        v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','entry_setup_skip','energy',o_energy,'reason','restricted_entry_ability'));
      elsif v_half=1 and not private.battle_v6_has_go_first_override(o.id,o_energy) then
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
        v_manual_attack:=private.battle_v6_manual_attack_name(p_battle_id,p_round_no,case when v_is_c then 'challenger' else 'opponent' end);
        if v_manual_attack is not null then
          if v_manual_attack='__NO_ATTACK__' then
            v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce((case when v_is_c then c.tcg_data else o.tcg_data end)->'attacks','[]'::jsonb)) x),array[]::text[]);
          else
            v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce((case when v_is_c then c.tcg_data else o.tcg_data end)->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'name',''))<>lower(v_manual_attack)),array[]::text[]);
          end if;
        end if;
        if v_half=1 then
          v_blocked:=v_blocked||coalesce((select array_agg(x->>'name') from jsonb_array_elements(coalesce(o.tcg_data->'attacks','[]'::jsonb)) x where lower(coalesce(x->>'text','')) not like '%if you go first, you can use this attack on your first turn%'),array[]::text[]);
        end if;
        if o_blocked_turns>0 and o_blocked_attack is not null then v_blocked:=array_append(v_blocked,o_blocked_attack); end if;
        if o_disable_best_next>0 then
          v_probe:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,o_last_received_attack,o_poison,o_burn,o_major,c_damage,(c_major is not null or c_poison or c_burn),c_poison,c_burn,c_major,c_no_weakness_next,o_gx_used,o_vstar_used,(o_turns=1 and c_first),o_healed_this_turn,o_next_attack_bonus_name,o_next_attack_bonus,v_blocked);
          if v_probe is not null then v_blocked:=array_append(v_blocked,v_probe->>'attackName'); end if;
          o_disable_best_next:=o_disable_best_next-1;
        end if;
        v_plan:=private.battle_v6_attack_plan(o.id,c.id,o_energy,c_energy,o_damage,o_last_received_attack,o_poison,o_burn,o_major,c_damage,(c_major is not null or c_poison or c_burn),c_poison,c_burn,c_major,c_no_weakness_next,o_gx_used,o_vstar_used,(o_turns=1 and c_first),o_healed_this_turn,o_next_attack_bonus_name,o_next_attack_bonus,v_blocked);

        if v_plan is not null then
          v_attack_name:=v_plan->>'attackName';
          if o_next_attack_bonus_name is not null and lower(v_attack_name)=lower(o_next_attack_bonus_name) then o_next_attack_bonus_name:=null; o_next_attack_bonus:=0; end if;
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
              v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':gate',v_coin_count,true);
              v_gate_heads:=v_heads;
              if v_heads<v_required_heads then
                v_attack_failed:=true;
                v_extra_turn:=false;
                v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0);
                v_recoil_coin_count:=coalesce((v_plan->>'recoilCoinCount')::integer,0);
                if v_recoil>0 and v_recoil_coin_count=v_coin_count
                   and v_heads between coalesce((v_plan->>'recoilHeadsMin')::integer,0)
                                   and coalesce((v_plan->>'recoilHeadsMax')::integer,v_coin_count) then
                  o_damage:=least(o_hp,o_damage+v_recoil);
                end if;
                v_trace:=v_trace||jsonb_build_array(jsonb_build_object('halfTurn',v_half,'side','opponent','event','attack_coin_failed','attack',v_attack_name,'heads',v_heads,'coins',v_coin_count));
              end if;
            end if;

            if not v_attack_failed then
              v_raw:=coalesce((v_plan->>'rawDamage')::numeric,0);

              if coalesce((v_plan->>'coinUntilTails')::boolean,false) then
                v_heads:=private.battle_v6_until_tails_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':until');
                v_bonus_heads:=v_heads;
                if v_plan->>'dynamicKind'='both_heads_bonus' then
                  if v_heads=v_coin_count then v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0); end if;
                elsif coalesce((v_plan->>'coinMultiplier')::boolean,false) then
                  v_raw:=coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                else
                  v_raw:=v_raw+coalesce((v_plan->>'coinBonusPerHead')::numeric,0)*v_heads;
                end if;
              elsif coalesce((v_plan->>'coinBonusCount')::integer,0)>0 then
                v_coin_count:=(v_plan->>'coinBonusCount')::integer;
                v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':bonus',v_coin_count,true);
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
                v_def:=private.battle_v6_defense_adjustment(o.id,c.id,o_energy,c_energy,c_major,c_damage,v_effective,v_seed||':'||v_half||':def');
              end if;
              v_effective:=coalesce((v_def->>'damage')::numeric,v_effective);
              v_effect_immune:=coalesce((v_def->>'effectImmune')::boolean,false);
              v_reactive:=coalesce((v_def->>'reactiveDamage')::numeric,0);
              v_reactive_status:=v_def->>'reactiveStatus';
              v_reactive_energy_discard:=coalesce((v_def->>'reactiveEnergyDiscard')::integer,0);
              v_reactive_knockout_chance:=coalesce((v_def->>'reactiveKnockoutChance')::numeric,0);
              v_reactive_chance:=coalesce((v_def->>'reactiveChance')::numeric,1);

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
                if c_reactive_status_next='poisoned' and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; o_poison_checkup_damage:=10;
                elsif c_reactive_status_next='burned' and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true;
                elsif c_reactive_status_next is not null and not private.battle_v6_status_immune(o.id,c_reactive_status_next) then o_major:=c_reactive_status_next; end if;
              end if;
              o_last_attack:=v_attack_name; o_last_damage:=v_effective; o_last_advantage:=coalesce(v_plan->>'advantage','neutral');

              v_heal:=coalesce((v_plan->>'healDamage')::numeric,0);
              if coalesce((v_plan->>'healEqualDamage')::boolean,false) then v_heal:=greatest(v_heal,v_effective); end if;
              if not o_heal_block_next then
                if coalesce((v_plan->>'healAll')::boolean,false) then o_damage:=0;
                elsif v_heal>0 then o_damage:=greatest(0,o_damage-v_heal); end if;
              end if;
              if coalesce((v_plan->>'healDefenderDamage')::numeric,0)>0 and not c_heal_block_next then
                c_damage:=greatest(0,c_damage-(v_plan->>'healDefenderDamage')::numeric);
              end if;
              v_recoil:=coalesce((v_plan->>'recoilDamage')::numeric,0);
              if v_recoil>0 then
                v_recoil_coin_count:=coalesce((v_plan->>'recoilCoinCount')::integer,0);
                if v_recoil_coin_count>0 then
                  v_recoil_heads_min:=coalesce((v_plan->>'recoilHeadsMin')::integer,0);
                  v_recoil_heads_max:=coalesce((v_plan->>'recoilHeadsMax')::integer,v_recoil_coin_count);
                  if coalesce((v_plan->>'coinBonusCount')::integer,0)=v_recoil_coin_count and v_bonus_heads>=0 then
                    v_recoil_heads:=v_bonus_heads;
                  elsif coalesce((v_plan->>'coinGateCount')::integer,0)=v_recoil_coin_count and v_gate_heads>=0 then
                    v_recoil_heads:=v_gate_heads;
                  else
                    v_recoil_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':recoil_coin',v_recoil_coin_count,(v_recoil_heads_min=0 and v_recoil_heads_max=0));
                  end if;
                  v_recoil_success:=v_recoil_heads between v_recoil_heads_min and v_recoil_heads_max;
                else
                  v_recoil_success:=true;
                end if;
                if v_recoil_success then o_damage:=least(o_hp,o_damage+v_recoil); end if;
              end if;

              v_discard:=coalesce((v_plan->>'discardEnergy')::integer,0);
              if v_discard>0 and coalesce((v_plan->>'discardCoinCount')::integer,0)>0 then
                v_coin_count:=(v_plan->>'discardCoinCount')::integer;
                if v_gate_heads>=0 and coalesce((v_plan->>'coinGateCount')::integer,0)=v_coin_count then v_heads:=v_gate_heads;
                elsif v_bonus_heads>=0 and coalesce((v_plan->>'coinBonusCount')::integer,0)=v_coin_count then v_heads:=v_bonus_heads;
                else
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':discard_coin',v_coin_count,not (coalesce((v_plan->>'discardHeadsMin')::integer,0)=0 and coalesce((v_plan->>'discardHeadsMax')::integer,v_coin_count)=0));
                end if;
                if v_heads between coalesce((v_plan->>'discardHeadsMin')::integer,0) and coalesce((v_plan->>'discardHeadsMax')::integer,v_coin_count)
                then o_energy:=greatest(0,o_energy-v_discard); end if;
              else o_energy:=greatest(0,o_energy-v_discard); end if;
              if coalesce((v_plan->>'selfEnergyGain')::integer,0)>0
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_energy_gain')<=coalesce((v_plan->>'selfEnergyGainChance')::numeric,1)
              then o_energy:=least(12,o_energy+(v_plan->>'selfEnergyGain')::integer); end if;
              o_cooldown_all:=greatest(o_cooldown_all,coalesce((v_plan->>'cooldownAll')::integer,0));
              if coalesce((v_plan->>'cooldownAttackPermanent')::boolean,false) then o_blocked_attack:=v_attack_name; o_blocked_turns:=99;
              elsif coalesce((v_plan->>'cooldownAttack')::integer,0)>0 then o_blocked_attack:=v_attack_name; o_blocked_turns:=1; end if;

              if coalesce((v_plan->>'selfReductionNext')::numeric,0)>0 then o_reduce_next:=greatest(o_reduce_next,(v_plan->>'selfReductionNext')::numeric); end if;
              if coalesce((v_plan->>'selfNextAttackBonus')::numeric,0)>0 and coalesce(v_plan->>'selfNextAttackBonusName','')<>'' then
                o_next_attack_bonus_name:=v_plan->>'selfNextAttackBonusName';
                o_next_attack_bonus:=(v_plan->>'selfNextAttackBonus')::numeric;
              end if;
              if coalesce((v_plan->>'selfNoWeaknessNext')::boolean,false) then o_no_weakness_next:=true; end if;
              if coalesce((v_plan->>'selfReactiveDamageNext')::numeric,0)>0 then o_reactive_next:=greatest(o_reactive_next,(v_plan->>'selfReactiveDamageNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveMultiplierNext')::numeric,0)>0 then o_reactive_multiplier_next:=greatest(o_reactive_multiplier_next,(v_plan->>'selfReactiveMultiplierNext')::numeric); end if;
              if coalesce((v_plan->>'selfReactiveChanceNext')::numeric,1)<1 then o_reactive_chance_next:=least(o_reactive_chance_next,(v_plan->>'selfReactiveChanceNext')::numeric); end if;
              if coalesce(v_plan->>'selfReactiveStatusNext','')<>'' then o_reactive_status_next:=v_plan->>'selfReactiveStatusNext'; end if;
              if coalesce((v_plan->>'selfPreventDamageCapNext')::numeric,0)>0 then o_prevent_damage_cap_next:=greatest(o_prevent_damage_cap_next,(v_plan->>'selfPreventDamageCapNext')::numeric); end if;
              if coalesce((v_plan->>'inflictSelfPoison')::boolean,false) and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; o_poison_checkup_damage:=10; o_poison_checkup_damage:=greatest(10,coalesce((v_plan->>'selfPoisonCheckupDamage')::numeric,10)); end if;
              if coalesce((v_plan->>'inflictSelfBurn')::boolean,false) and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true; end if;
              if coalesce(v_plan->>'inflictSelfMajor','')<>'' and not private.battle_v6_status_immune(o.id,v_plan->>'inflictSelfMajor') then o_major:=v_plan->>'inflictSelfMajor'; end if;
              if coalesce((v_plan->>'clearSelfSpecial')::boolean,false) then o_poison:=false; o_poison_checkup_damage:=10; o_burn:=false; o_major:=null; end if;
              if coalesce((v_plan->>'clearSelfPoison')::boolean,false) then o_poison:=false; o_poison_checkup_damage:=10; end if;
              if coalesce((v_plan->>'selfKnockout')::boolean,false) or coalesce((v_plan->>'bothKnockout')::boolean,false) then o_damage:=o_hp; end if;
              if coalesce((v_plan->>'selfPreventNext')::boolean,false)
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':self_prevent')<=coalesce((v_plan->>'selfPreventChance')::numeric,1)
              then o_prevent_next_class:=coalesce(v_plan->>'selfPreventClass','all'); end if;

              if not v_effect_immune then
                if coalesce((v_plan->>'defenderEnergyDiscardAllCoinCount')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'defenderEnergyDiscardAllCoinCount')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':energy_discard_all_coin',v_coin_count,true);
                  if v_heads>=coalesce((v_plan->>'defenderEnergyDiscardAllHeads')::integer,v_coin_count) then c_energy:=0; end if;
                elsif coalesce((v_plan->>'defenderEnergyDiscardCoins')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'defenderEnergyDiscardCoins')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':energy_discard_coin',v_coin_count,true);
                  c_energy:=greatest(0,c_energy-v_heads);
                elsif coalesce((v_plan->>'defenderEnergyDiscard')::integer,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':energy_discard')<=coalesce((v_plan->>'defenderEnergyDiscardChance')::numeric,1)
                then c_energy:=greatest(0,c_energy-(v_plan->>'defenderEnergyDiscard')::integer); end if;
                if coalesce((v_plan->>'defenderEnergyReturn')::integer,0)>0 then c_energy:=greatest(0,c_energy-(v_plan->>'defenderEnergyReturn')::integer); end if;
                if coalesce((v_plan->>'transferSelfDamage')::boolean,false)
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':transfer_damage')<=coalesce((v_plan->>'transferSelfDamageChance')::numeric,1) then
                  v_temp_damage:=o_damage;
                  o_damage:=0;
                  c_damage:=least(c_hp,c_damage+v_temp_damage);
                end if;
                if coalesce((v_plan->>'swapDamageCounters')::boolean,false)
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':swap_damage')<=coalesce((v_plan->>'swapDamageChance')::numeric,1) then
                  v_temp_damage:=o_damage;
                  o_damage:=least(o_hp,c_damage);
                  c_damage:=least(c_hp,v_temp_damage);
                end if;
                if coalesce((v_plan->>'setDefenderRemainingHp')::numeric,0)>0
                   and private.battle_v6_hash_roll(v_seed||':'||v_half||':set_remaining_hp')<=coalesce((v_plan->>'setDefenderHpChance')::numeric,1) then
                  v_target_remaining:=(v_plan->>'setDefenderRemainingHp')::numeric;
                  if greatest(0,c_hp-c_damage)>v_target_remaining then c_damage:=least(c_hp,c_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'setBothRemainingHp')::numeric,0)>0 then
                  v_target_remaining:=(v_plan->>'setBothRemainingHp')::numeric;
                  if greatest(0,c_hp-c_damage)>v_target_remaining then c_damage:=least(c_hp,c_hp-v_target_remaining); end if;
                  if greatest(0,o_hp-o_damage)>v_target_remaining then o_damage:=least(o_hp,o_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'equalizeDefenderToAttackerHp')::boolean,false) then
                  v_target_remaining:=greatest(0,o_hp-o_damage);
                  if greatest(0,c_hp-c_damage)>v_target_remaining then c_damage:=least(c_hp,c_hp-v_target_remaining); end if;
                end if;
                if coalesce((v_plan->>'bothKnockout')::boolean,false) then c_damage:=c_hp;
                elsif coalesce((v_plan->>'knockoutCoinCount')::integer,0)>0 then
                  v_coin_count:=(v_plan->>'knockoutCoinCount')::integer;
                  v_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':ko_coin',v_coin_count,true);
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
                    v_status_heads:=private.battle_v6_attack_coin_heads(case when v_is_c then c.id else o.id end,v_seed||':'||v_half||':statuscoin',v_status_coin_count,not (v_status_heads_min=0 and v_status_heads_max=0));
                  end if;
                  v_status_success:=v_status_heads between v_status_heads_min and v_status_heads_max;
                else
                  v_status_success:=private.battle_v6_hash_roll(v_seed||':'||v_half||':status')<=v_status_chance;
                end if;
                if v_status_success then
                  if coalesce((v_plan->>'inflictPoison')::boolean,false) and not private.battle_v6_status_immune(c.id,'poisoned') then c_poison:=true; c_poison_checkup_damage:=10; c_poison_checkup_damage:=greatest(10,coalesce((v_plan->>'poisonCheckupDamage')::numeric,10)); end if;
                  if coalesce((v_plan->>'inflictBurn')::boolean,false) and not private.battle_v6_status_immune(c.id,'burned') then c_burn:=true; end if;
                  if v_status is not null and v_status not in ('poisoned','burned') and not private.battle_v6_status_immune(c.id,v_status) then c_major:=v_status; end if;
                end if;
                if coalesce((v_plan->>'clearDefenderSpecial')::boolean,false) then c_poison:=false; c_poison_checkup_damage:=10; c_burn:=false; c_major:=null; end if;
              end if;

              if v_reactive>0 and private.battle_v6_hash_roll(v_seed||':'||v_half||':ability_reactive')<=v_reactive_chance then o_damage:=least(o_hp,o_damage+v_reactive); end if;
              if v_reactive_energy_discard>0 and v_effective>0 then o_energy:=greatest(0,o_energy-v_reactive_energy_discard); end if;
              if v_reactive_knockout_chance>0 and c_damage>=c_hp
                 and private.battle_v6_hash_roll(v_seed||':'||v_half||':ability_reactive_ko')<=v_reactive_knockout_chance then o_damage:=o_hp; end if;
              if v_reactive_status='poisoned' and not private.battle_v6_status_immune(o.id,'poisoned') then o_poison:=true; o_poison_checkup_damage:=10;
              elsif v_reactive_status='burned' and not private.battle_v6_status_immune(o.id,'burned') then o_burn:=true;
              elsif v_reactive_status is not null and not private.battle_v6_status_immune(o.id,v_reactive_status) then o_major:=v_reactive_status; end if;

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
    v_check_ability:=private.battle_v6_checkup_ability_effects(c.id,o.id,o_poison);
    if coalesce((v_check_ability->>'damage')::numeric,0)>0 then o_damage:=least(o_hp,o_damage+(v_check_ability->>'damage')::numeric); end if;
    v_reactive:=case when o_poison then coalesce((v_check_ability->>'poisonBonus')::numeric,0) else 0 end;
    v_check_ability:=private.battle_v6_checkup_ability_effects(o.id,c.id,c_poison);
    if coalesce((v_check_ability->>'damage')::numeric,0)>0 then c_damage:=least(c_hp,c_damage+(v_check_ability->>'damage')::numeric); end if;
    v_direct:=case when c_poison then coalesce((v_check_ability->>'poisonBonus')::numeric,0) else 0 end;

    if c_poison then c_damage:=least(c_hp,c_damage+c_poison_checkup_damage+v_direct); end if;
    if o_poison then o_damage:=least(o_hp,o_damage+o_poison_checkup_damage+v_reactive); end if;
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
$function$
;

CREATE OR REPLACE FUNCTION private.ranked_bot_take_turn(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_bot uuid;
  v_human uuid;
  v_card text;
  v_attack text;
  v_exclude text[];
  v_player_pick integer;
  v_global_pick integer;
  v_next uuid;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null or not coalesce(b.is_bot_match,false) then
    return jsonb_build_object('acted',false);
  end if;
  if b.status not in ('drafting','selecting','revealing') then
    return jsonb_build_object('acted',false,'status',b.status);
  end if;

  select p.id into v_bot
  from public.players p
  where p.id in (b.challenger_id,b.opponent_id) and p.is_bot=true
  limit 1;

  if v_bot is null then
    return jsonb_build_object('acted',false,'reason','bot_missing');
  end if;
  v_human:=case when v_bot=b.challenger_id then b.opponent_id else b.challenger_id end;

  if b.status='drafting' and b.draft_turn_id=v_bot then
    select coalesce(array_agg(d.card_id),array[]::text[])
    into v_exclude
    from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=v_bot;

    v_card:=private.ranked_bot_pick_card(v_bot,b.id,v_exclude);

    select count(*)+1 into v_player_pick
    from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=v_bot;

    v_global_pick:=b.draft_pick_count+1;

    insert into public.battle_draft_cards(
      battle_id,player_id,card_id,pick_no,global_pick_no
    )
    values(b.id,v_bot,v_card,v_player_pick,v_global_pick);

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'draft_card_picked',jsonb_build_object(
      'playerId',v_bot,'cardId',v_card,'pickNo',v_player_pick,
      'globalPickNo',v_global_pick,'bot',true
    ));

    if v_global_pick>=6 then
      update public.battles
      set status='selecting',draft_pick_count=6,draft_turn_id=null,
          active_round=1,
          selection_deadline=now()+make_interval(secs=>selection_seconds),
          updated_at=now()
      where id=b.id;

      insert into public.battle_events(battle_id,event_type,payload)
      values(b.id,'draft_completed',jsonb_build_object(
        'round',1,'selectionSeconds',b.selection_seconds,'botFilled',true
      ));
    else
      v_next:=v_human;
      update public.battles
      set draft_pick_count=v_global_pick,draft_turn_id=v_next,
          selection_deadline=now()+make_interval(secs=>draft_seconds),
          updated_at=now()
      where id=b.id;

      return jsonb_build_object(
        'acted',true,'kind','draft','cardId',v_card,
        'nextPlayerId',v_next
      );
    end if;

    select * into b from public.battles where id=p_battle_id;
  end if;

  if b.status='selecting'
     and not exists(
       select 1 from public.battle_selections s
       where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=v_bot
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      join private.ranked_bot_card_pool cp on cp.card_id=d.card_id
      where d.battle_id=b.id and d.player_id=v_bot
        and not exists(
          select 1 from public.battle_selections used
          where used.battle_id=b.id and used.player_id=v_bot and used.card_id=d.card_id
        )
      order by cp.battle_power desc,random()
      limit 1;
    else
      select coalesce(array_agg(s.card_id),array[]::text[])
      into v_exclude
      from public.battle_selections s
      where s.battle_id=b.id and s.player_id=v_bot;

      v_card:=private.ranked_bot_pick_card(v_bot,b.id,v_exclude);
    end if;

    if v_card is null then
      v_card:=private.ranked_bot_pick_card(v_bot,b.id,array[]::text[]);
    end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,v_bot,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'card_locked',jsonb_build_object(
      'playerId',v_bot,'round',b.active_round,'bot',true
    ));

    return jsonb_build_object(
      'acted',true,'kind','lock','round',b.active_round
    );
  end if;

  if b.status='revealing'
     and b.mode='draft3'
     and not exists(
       select 1 from private.battle_attack_choices a
       where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=v_bot
     )
  then
    v_attack:=private.battle_pick_manual_attack(b.id,b.active_round,v_bot);

    insert into private.battle_attack_choices(
      battle_id,round_no,player_id,attack_name
    )
    values(b.id,b.active_round,v_bot,v_attack)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'attack_locked',jsonb_build_object(
      'playerId',v_bot,'round',b.active_round,'bot',true
    ));

    return jsonb_build_object(
      'acted',true,'kind','attack','round',b.active_round
    );
  end if;

  return jsonb_build_object('acted',false,'status',b.status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_choose_battle_attack(p_actor_id uuid, p_battle_id uuid, p_attack_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_card text;
  v_attack text;
  v_count integer;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.mode<>'draft3' or b.status<>'revealing' then raise exception 'INVALID_STATUS'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;

  select s.card_id into v_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=p_actor_id;

  if v_card is null then raise exception 'SELECTION_MISSING'; end if;

  if exists(
    select 1 from private.battle_attack_choices a
    where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=p_actor_id
  ) then raise exception 'ALREADY_ATTACK_LOCKED'; end if;

  if p_attack_name='__NO_ATTACK__' then
    if exists(
      select 1 from public.cards c
      where c.id=v_card
        and jsonb_array_length(coalesce(c.tcg_data->'attacks','[]'::jsonb))>0
    ) then raise exception 'INVALID_ATTACK'; end if;
    v_attack:='__NO_ATTACK__';
  else
    select a->>'name' into v_attack
    from public.cards c
    cross join lateral jsonb_array_elements(coalesce(c.tcg_data->'attacks','[]'::jsonb)) a
    where c.id=v_card and lower(a->>'name')=lower(trim(p_attack_name))
    limit 1;

    if v_attack is null then raise exception 'INVALID_ATTACK'; end if;
  end if;

  insert into private.battle_attack_choices(
    battle_id,round_no,player_id,attack_name
  )
  values(b.id,b.active_round,p_actor_id,v_attack);

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    b.id,'attack_locked',
    jsonb_build_object('playerId',p_actor_id,'round',b.active_round)
  );

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select count(*) into v_count
  from private.battle_attack_choices a
  where a.battle_id=b.id and a.round_no=b.active_round;

  return jsonb_build_object(
    'attackLocked',true,
    'bothAttacksLocked',v_count=2,
    'round',b.active_round
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_get_battle_attack_state(p_actor_id uuid, p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_card text;
  v_attack text;
  v_opponent uuid;
  v_opponent_locked boolean;
  v_card_row public.cards%rowtype;
begin
  select * into b from public.battles where id=p_battle_id;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;

  v_opponent:=case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  select s.card_id into v_card
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=p_actor_id;

  if v_card is not null then
    select * into v_card_row from public.cards where id=v_card;
  end if;

  select a.attack_name into v_attack
  from private.battle_attack_choices a
  where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=p_actor_id;

  select exists(
    select 1 from private.battle_attack_choices a
    where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=v_opponent
  ) into v_opponent_locked;

  return jsonb_build_object(
    'required',b.mode='draft3' and b.status='revealing',
    'status',b.status,
    'round',b.active_round,
    'deadline',b.selection_deadline,
    'myCardId',v_card,
    'myCardName',v_card_row.pokemon_name,
    'myCardImage',v_card_row.image_small,
    'attacks',coalesce(v_card_row.tcg_data->'attacks','[]'::jsonb),
    'myAttackName',v_attack,
    'myLocked',v_attack is not null,
    'opponentLocked',v_opponent_locked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_lock_battle_card(p_actor_id uuid, p_battle_id uuid, p_card_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_count integer;
  v_attack_phase jsonb;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status<>'selecting' then raise exception 'INVALID_STATUS'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists(
    select 1 from public.player_cards
    where player_id=p_actor_id and card_id=p_card_id and quantity>0
  ) then raise exception 'NOT_OWNED'; end if;

  if not private.battle_card_rules_ready(p_card_id) then
    raise exception 'BATTLE_RULE_REVIEW_REQUIRED';
  end if;

  if exists(
    select 1 from public.battle_selections
    where battle_id=b.id and round_no=b.active_round and player_id=p_actor_id
  ) then raise exception 'ALREADY_LOCKED'; end if;

  if b.mode='draft3' then
    if not exists(
      select 1 from public.battle_draft_cards d
      where d.battle_id=b.id and d.player_id=p_actor_id and d.card_id=p_card_id
    ) then raise exception 'CARD_NOT_IN_DRAFT'; end if;

    if exists(
      select 1 from public.battle_selections s
      where s.battle_id=b.id and s.player_id=p_actor_id and s.card_id=p_card_id
    ) then raise exception 'CARD_ALREADY_USED'; end if;
  end if;

  insert into public.battle_selections(battle_id,round_no,player_id,card_id)
  values(b.id,b.active_round,p_actor_id,p_card_id);

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    b.id,'card_locked',
    jsonb_build_object('playerId',p_actor_id,'round',b.active_round)
  );

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select count(*) into v_count
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round;

  if b.mode='draft3' and v_count=2 then
    v_attack_phase:=private.battle_start_attack_selection(b.id);

    if b.is_bot_match then
      perform private.ranked_bot_take_turn(b.id);
    end if;

    return jsonb_build_object(
      'locked',true,
      'bothLocked',true,
      'attackSelectionRequired',true,
      'round',b.active_round,
      'attackSelection',v_attack_phase
    );
  end if;

  return jsonb_build_object(
    'locked',true,
    'bothLocked',v_count=2,
    'attackSelectionRequired',false,
    'round',b.active_round
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_resolve_battle_round(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  c_card text;
  o_card text;
  c_attack text;
  o_attack text;
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
  v_completed boolean;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;

  if b.mode='draft3' then
    if b.status<>'revealing' then
      return jsonb_build_object('alreadyResolved',b.status not in ('selecting','revealing'),'attackSelectionRequired',b.status='selecting');
    end if;
  elsif b.status<>'selecting' then
    return jsonb_build_object('alreadyResolved',true);
  end if;

  select card_id into c_card
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

  select card_id into o_card
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

  if c_card is null or o_card is null then
    return jsonb_build_object('waiting',true,'round',b.active_round);
  end if;

  if b.mode='draft3' then
    select attack_name into c_attack
    from private.battle_attack_choices
    where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

    select attack_name into o_attack
    from private.battle_attack_choices
    where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

    if c_attack is null or o_attack is null then
      return jsonb_build_object(
        'waitingForAttacks',true,
        'round',b.active_round,
        'challengerAttackLocked',c_attack is not null,
        'opponentAttackLocked',o_attack is not null
      );
    end if;
  end if;

  v_seed:=gen_random_uuid()::text;
  v_first:=random()>=.5;

  v_sim:=private.battle_simulate_duel_v6(
    b.id,b.active_round,c_card,o_card,v_seed,v_first
  );

  c_stats:=v_sim->'challenger';
  o_stats:=v_sim->'opponent';

  if b.mode='draft3' then
    c_stats:=c_stats||jsonb_build_object(
      'manualAttackChoice',case when c_attack='__NO_ATTACK__' then 'Sem ataque' else c_attack end
    );
    o_stats:=o_stats||jsonb_build_object(
      'manualAttackChoice',case when o_attack='__NO_ATTACK__' then 'Sem ataque' else o_attack end
    );
  end if;

  v_winner:=case
    when v_sim->>'winnerSide'='challenger' then b.challenger_id
    else b.opponent_id
  end;

  c_power:=coalesce((c_stats->>'totalDamageDealt')::numeric,0)
    +coalesce((c_stats->>'remainingHp')::numeric,0);
  o_power:=coalesce((o_stats->>'totalDamageDealt')::numeric,0)
    +coalesce((o_stats->>'remainingHp')::numeric,0);

  c_roll:=private.battle_v6_hash_roll(v_seed||':score:c');
  o_roll:=private.battle_v6_hash_roll(v_seed||':score:o');

  if b.mode='draft3' then
    update public.battles
    set status='selecting',updated_at=now()
    where id=b.id;
  end if;

  v_result:=public.server_finish_battle_round(
    b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner
  );

  update public.battle_rounds
  set challenger_combat=c_stats||jsonb_build_object(
        'firstPlayer',(v_sim->>'firstPlayer')='challenger',
        'resolution',v_sim->>'resolution','rulesVersion',6
      ),
      opponent_combat=o_stats||jsonb_build_object(
        'firstPlayer',(v_sim->>'firstPlayer')='opponent',
        'resolution',v_sim->>'resolution','rulesVersion',6
      ),
      rules_version=6
  where battle_id=b.id and round_no=b.active_round;

  if b.mode='draft3' then
    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'manual_attacks_revealed',
      jsonb_build_object(
        'round',b.active_round,
        'challengerAttack',case when c_attack='__NO_ATTACK__' then 'Sem ataque' else c_attack end,
        'opponentAttack',case when o_attack='__NO_ATTACK__' then 'Sem ataque' else o_attack end
      )
    );
  end if;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'tcg_v6_resolved',jsonb_build_object(
    'round',b.active_round,'winnerId',v_winner,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'seedDigest',v_sim->>'seedDigest','trace',v_sim->'trace',
    'botMatch',b.is_bot_match,
    'manualAttackSelection',b.mode='draft3'
  ));

  v_completed:=coalesce((v_result->>'completed')::boolean,false);
  if b.is_bot_match and not v_completed then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  return v_result||jsonb_build_object(
    'round',b.active_round,
    'challengerCardId',c_card,
    'opponentCardId',o_card,
    'challengerCombat',c_stats,
    'opponentCombat',o_stats,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'rulesVersion',6,
    'botMatch',b.is_bot_match,
    'manualAttackSelection',b.mode='draft3',
    'challengerAttack',case when c_attack='__NO_ATTACK__' then 'Sem ataque' else c_attack end,
    'opponentAttack',case when o_attack='__NO_ATTACK__' then 'Sem ataque' else o_attack end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_timeout_battle(p_actor_id uuid, p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_card text;
  v_attack text;
  v_count integer;
  v_result jsonb;
  v_challenger_bot boolean:=false;
  v_opponent_bot boolean:=false;
  v_turn_bot boolean:=false;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('drafting','selecting','revealing') then
    return jsonb_build_object('alreadyResolved',true,'status',b.status,'round',b.active_round);
  end if;
  if b.selection_deadline is null or now()<b.selection_deadline then
    raise exception 'NOT_EXPIRED';
  end if;

  select coalesce(p.is_bot,false) into v_challenger_bot
  from public.players p where p.id=b.challenger_id;
  select coalesce(p.is_bot,false) into v_opponent_bot
  from public.players p where p.id=b.opponent_id;

  if b.status='drafting' then
    select coalesce(p.is_bot,false) into v_turn_bot
    from public.players p where p.id=b.draft_turn_id;

    if v_turn_bot then
      v_result:=private.ranked_bot_take_turn(b.id);
      return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
        'timedOut',true,'autoBotPick',true,'resolveReady',false
      );
    end if;

    select pc.card_id into v_card
    from public.player_cards pc
    where pc.player_id=b.draft_turn_id
      and pc.quantity>0
      and private.battle_card_rules_ready(pc.card_id)
      and not exists(
        select 1 from public.battle_draft_cards d
        where d.battle_id=b.id
          and d.player_id=b.draft_turn_id
          and d.card_id=pc.card_id
      )
    order by random()
    limit 1;

    if v_card is null then
      update public.players p
      set coins=p.coins+e.amount
      from public.battle_coin_escrows e
      where e.battle_id=b.id and e.player_id=p.id and e.status='held';

      update public.battle_coin_escrows
      set status='refunded',updated_at=now()
      where battle_id=b.id and status='held';

      perform public.server_return_card_stakes(b.id);
      update public.battles set status='cancelled',updated_at=now() where id=b.id;
      return jsonb_build_object('cancelled',true,'reason','draft_player_no_eligible_cards');
    end if;

    update public.battles
    set selection_deadline=now()+interval '1 second'
    where id=b.id;

    v_result:=public.server_pick_battle_draft_card(b.draft_turn_id,b.id,v_card);

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'draft_auto_picked',
      jsonb_build_object('playerId',b.draft_turn_id,'cardId',v_card,'timedOut',true)
    );

    return v_result||jsonb_build_object(
      'timedOut',true,'autoPicked',true,'resolveReady',false
    );
  end if;

  if b.status='revealing' then
    if b.is_bot_match then
      perform private.ranked_bot_take_turn(b.id);
    end if;

    if not exists(
      select 1 from private.battle_attack_choices a
      where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=b.challenger_id
    ) then
      v_attack:=private.battle_pick_manual_attack(b.id,b.active_round,b.challenger_id);
      insert into private.battle_attack_choices(battle_id,round_no,player_id,attack_name)
      values(b.id,b.active_round,b.challenger_id,v_attack)
      on conflict do nothing;

      insert into public.battle_events(battle_id,event_type,payload)
      values(
        b.id,'attack_auto_locked',
        jsonb_build_object('playerId',b.challenger_id,'round',b.active_round,'timedOut',true)
      );
    end if;

    if not exists(
      select 1 from private.battle_attack_choices a
      where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=b.opponent_id
    ) then
      v_attack:=private.battle_pick_manual_attack(b.id,b.active_round,b.opponent_id);
      insert into private.battle_attack_choices(battle_id,round_no,player_id,attack_name)
      values(b.id,b.active_round,b.opponent_id,v_attack)
      on conflict do nothing;

      insert into public.battle_events(battle_id,event_type,payload)
      values(
        b.id,'attack_auto_locked',
        jsonb_build_object('playerId',b.opponent_id,'round',b.active_round,'timedOut',true)
      );
    end if;

    select count(*) into v_count
    from private.battle_attack_choices a
    where a.battle_id=b.id and a.round_no=b.active_round;

    return jsonb_build_object(
      'timedOut',true,
      'attackSelection',true,
      'bothAttacksLocked',v_count=2,
      'resolveReady',v_count=2,
      'round',b.active_round
    );
  end if;

  -- Selecting phase: complete any missing card locks.
  if v_challenger_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id
     )
  then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  if v_opponent_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id
     )
  then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  if not v_challenger_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      where d.battle_id=b.id
        and d.player_id=b.challenger_id
        and private.battle_card_rules_ready(d.card_id)
        and not exists(
          select 1 from public.battle_selections s
          where s.battle_id=b.id
            and s.player_id=b.challenger_id
            and s.card_id=d.card_id
        )
      order by random()
      limit 1;
    else
      select pc.card_id into v_card
      from public.player_cards pc
      where pc.player_id=b.challenger_id
        and pc.quantity>0
        and private.battle_card_rules_ready(pc.card_id)
      order by random()
      limit 1;
    end if;

    if v_card is null then raise exception 'CHALLENGER_NO_ELIGIBLE_CARDS'; end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,b.challenger_id,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'auto_locked',
      jsonb_build_object('playerId',b.challenger_id,'round',b.active_round,'timedOut',true)
    );
  end if;

  if not v_opponent_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      where d.battle_id=b.id
        and d.player_id=b.opponent_id
        and private.battle_card_rules_ready(d.card_id)
        and not exists(
          select 1 from public.battle_selections s
          where s.battle_id=b.id
            and s.player_id=b.opponent_id
            and s.card_id=d.card_id
        )
      order by random()
      limit 1;
    else
      select pc.card_id into v_card
      from public.player_cards pc
      where pc.player_id=b.opponent_id
        and pc.quantity>0
        and private.battle_card_rules_ready(pc.card_id)
      order by random()
      limit 1;
    end if;

    if v_card is null then raise exception 'OPPONENT_NO_ELIGIBLE_CARDS'; end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,b.opponent_id,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'auto_locked',
      jsonb_build_object('playerId',b.opponent_id,'round',b.active_round,'timedOut',true)
    );
  end if;

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select count(*) into v_count
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round;

  if b.mode='draft3' and v_count=2 then
    v_result:=private.battle_start_attack_selection(b.id);

    if b.is_bot_match then
      perform private.ranked_bot_take_turn(b.id);
    end if;

    return jsonb_build_object(
      'bothLocked',true,
      'round',b.active_round,
      'timedOut',true,
      'autoResolvedSelection',true,
      'attackSelectionRequired',true,
      'attackSelection',v_result,
      'resolveReady',false
    );
  end if;

  return jsonb_build_object(
    'bothLocked',v_count=2,
    'round',b.active_round,
    'timedOut',true,
    'autoResolvedSelection',true,
    'attackSelectionRequired',false,
    'resolveReady',v_count=2
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_process_expired_battles()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  b public.battles%rowtype;
  v_result jsonb;
  v_processed integer := 0;
begin
  for r in
    select id,challenger_id
    from public.battles
    where status='invited'
      and created_at <= now() - interval '15 minutes'
    order by created_at asc
    limit 50
  loop
    begin
      perform public.server_cancel_battle(r.challenger_id,r.id);
      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm,'stage','expire_invite'));
      exception when others then null;
      end;
    end;
  end loop;

  for r in
    select id
    from public.battles
    where status in ('drafting','selecting','revealing')
      and selection_deadline is not null
      and selection_deadline<=now()
    order by selection_deadline asc
    limit 50
  loop
    begin
      select * into b from public.battles where id=r.id;
      v_result:=public.server_timeout_battle(b.challenger_id,b.id);
      select * into b from public.battles where id=r.id;

      if coalesce((v_result->>'resolveReady')::boolean,false) then
        perform public.server_resolve_battle_round(b.id);
      end if;

      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm));
      exception when others then null;
      end;
    end;
  end loop;

  return v_processed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_matchmaking_join(p_player_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rating integer;
  v_status text;
  v_until timestamptz;
  v_can_draft boolean;
  v_season text;
  v_opponent public.matchmaking_queue%rowtype;
  v_mode text;
  v_battle uuid;
  v_rounds integer;
  v_stale record;
  v_joined_at timestamptz;
  v_bot uuid;
  v_bot_rating integer;
  v_bot_turn uuid;
begin
  if p_mode not in ('quick','mystery','draft3') then raise exception 'INVALID_MODE'; end if;
  perform pg_advisory_xact_lock(hashtext('pokemon-cards-global-matchmaking'));

  select battle_rating,account_status,suspended_until
  into v_rating,v_status,v_until
  from public.players
  where id=p_player_id and is_bot=false
  for update;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_status='banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status='suspended' and v_until is not null and v_until>now() then raise exception 'ACCOUNT_SUSPENDED'; end if;

  for v_stale in
    select id
    from public.battles
    where status='invited'
      and created_at<=now()-interval '15 minutes'
      and p_player_id in (challenger_id,opponent_id)
    order by created_at
  loop
    begin
      perform public.server_cancel_battle(p_player_id,v_stale.id);
    exception when others then
      null;
    end;
  end loop;

  if exists(
    select 1 from public.battles
    where status in ('invited','drafting','selecting','revealing')
      and p_player_id in (challenger_id,opponent_id)
  ) then
    raise exception 'ACTIVE_BATTLE_EXISTS';
  end if;

  select count(*)>=3 into v_can_draft
  from public.player_cards
  where player_id=p_player_id and quantity>0;

  if p_mode='draft3' and not v_can_draft then raise exception 'DRAFT_NEEDS_3_CARDS'; end if;

  v_season:=private.current_season_id();

  insert into public.matchmaking_queue(
    player_id,mode_choice,status,rating_snapshot,can_draft,season_id,
    matched_battle_id,joined_at,updated_at
  )
  values(p_player_id,p_mode,'waiting',v_rating,v_can_draft,v_season,null,now(),now())
  on conflict(player_id) do update
  set mode_choice=excluded.mode_choice,
      status='waiting',
      rating_snapshot=excluded.rating_snapshot,
      can_draft=excluded.can_draft,
      season_id=excluded.season_id,
      matched_battle_id=null,
      joined_at=case
        when public.matchmaking_queue.status='waiting'
          then public.matchmaking_queue.joined_at
        else now()
      end,
      updated_at=now();

  select joined_at into v_joined_at
  from public.matchmaking_queue
  where player_id=p_player_id;

  select q.* into v_opponent
  from public.matchmaking_queue q
  join public.players p on p.id=q.player_id
  where q.status='waiting'
    and q.player_id<>p_player_id
    and p.account_status='active'
    and p.is_bot=false
    and abs(q.rating_snapshot-v_rating)<=
      250+least(1000,floor(extract(epoch from(now()-q.joined_at))/30)::integer*75)
  order by abs(q.rating_snapshot-v_rating),q.joined_at
  for update of q skip locked
  limit 1;

  if v_opponent.player_id is not null then
    if v_opponent.mode_choice=p_mode then
      v_mode:=p_mode;
    elsif (v_opponent.mode_choice='draft3' or p_mode='draft3')
      and not (v_opponent.can_draft and v_can_draft)
    then
      v_mode:=case when p_mode='draft3' then v_opponent.mode_choice else p_mode end;
    else
      v_mode:=case when random()<0.5 then v_opponent.mode_choice else p_mode end;
    end if;

    v_rounds:=case when v_mode in ('mystery','draft3') then 2 else 1 end;

    insert into public.battles(
      challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,
      selection_deadline,draft_turn_id,draft_pick_count,is_ranked,season_id,is_bot_match
    )
    values(
      v_opponent.player_id,p_player_id,v_mode,'none',0,
      case when v_mode='draft3' then 'drafting' else 'selecting' end,
      v_rounds,
      now()+case when v_mode='draft3' then interval '90 seconds' else interval '30 seconds' end,
      case when v_mode='draft3' then v_opponent.player_id else null end,
      0,true,v_season,false
    )
    returning id into v_battle;

    update public.matchmaking_queue
    set status='matched',matched_battle_id=v_battle,updated_at=now()
    where player_id in (p_player_id,v_opponent.player_id);

    if v_season is not null then
      insert into public.player_seasons(season_id,player_id)
      values(v_season,p_player_id),(v_season,v_opponent.player_id)
      on conflict do nothing;
    end if;

    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'matchmade',jsonb_build_object(
      'mode',v_mode,
      'challengerChoice',v_opponent.mode_choice,
      'opponentChoice',p_mode,
      'seasonId',v_season,
      'botMatch',false
    ));

    if v_mode='draft3' then
      insert into public.battle_events(battle_id,event_type,payload)
      values(v_battle,'draft_started',jsonb_build_object(
        'turnPlayerId',v_opponent.player_id,'draftSeconds',90
      ));
    else
      insert into public.battle_events(battle_id,event_type,payload)
      values(v_battle,'started',jsonb_build_object('round',1,'selectionSeconds',30));
    end if;

    perform public.server_queue_notification(
      v_opponent.player_id,'match_found','Partida encontrada!',
      'Um adversário foi encontrado no matchmaking.',
      jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
    );
    perform public.server_queue_notification(
      p_player_id,'match_found','Partida encontrada!',
      'Um adversário foi encontrado no matchmaking.',
      jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
    );

    return jsonb_build_object(
      'status','matched','battleId',v_battle,'mode',v_mode,
      'seasonId',v_season,'botMatch',false
    );
  end if;

  if now()-coalesce(v_joined_at,now())<interval '18 seconds' then
    return jsonb_build_object(
      'status','waiting','modeChoice',p_mode,'seasonId',v_season,
      'botFallbackAfterSeconds',18
    );
  end if;

  select p.id,coalesce(p.bot_rating_base,p.battle_rating)
  into v_bot,v_bot_rating
  from public.players p
  where p.is_bot=true
    and p.account_status='active'
    and p.bot_rating_base is not null
  order by abs(coalesce(p.bot_rating_base,p.battle_rating)-(v_rating+60)),random()
  limit 1;

  if v_bot is null then
    return jsonb_build_object(
      'status','waiting','modeChoice',p_mode,'seasonId',v_season,
      'botFallbackAfterSeconds',18,'botUnavailable',true
    );
  end if;

  v_mode:=p_mode;
  v_rounds:=case when v_mode in ('mystery','draft3') then 2 else 1 end;
  v_bot_turn:=case
    when v_mode='draft3' and random()<.5 then v_bot
    when v_mode='draft3' then p_player_id
    else null
  end;

  insert into public.battles(
    challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,
    selection_deadline,draft_turn_id,draft_pick_count,is_ranked,season_id,is_bot_match
  )
  values(
    p_player_id,v_bot,v_mode,'none',0,
    case when v_mode='draft3' then 'drafting' else 'selecting' end,
    v_rounds,
    now()+case when v_mode='draft3' then interval '90 seconds' else interval '30 seconds' end,
    v_bot_turn,0,true,v_season,true
  )
  returning id into v_battle;

  update public.matchmaking_queue
  set status='matched',matched_battle_id=v_battle,updated_at=now()
  where player_id=p_player_id;

  if v_season is not null then
    insert into public.player_seasons(season_id,player_id)
    values(v_season,p_player_id)
    on conflict do nothing;
  end if;

  insert into public.battle_events(battle_id,event_type,payload)
  values(v_battle,'matchmade',jsonb_build_object(
    'mode',v_mode,'challengerChoice',p_mode,'opponentChoice','ai',
    'seasonId',v_season,'botMatch',true,'botRating',v_bot_rating
  ));

  if v_mode='draft3' then
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'draft_started',jsonb_build_object(
      'turnPlayerId',v_bot_turn,'draftSeconds',90,'botMatch',true
    ));
  else
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'started',jsonb_build_object(
      'round',1,'selectionSeconds',30,'botMatch',true
    ));
  end if;

  perform private.ranked_bot_take_turn(v_battle);

  perform public.server_queue_notification(
    p_player_id,'match_found','Treinador IA encontrado!',
    'A fila foi preenchida por um Treinador IA com ELO próximo ao seu.',
    jsonb_build_object(
      'battleId',v_battle,'mode',v_mode,'seasonId',v_season,
      'botMatch',true,'botRating',v_bot_rating
    )
  );

  return jsonb_build_object(
    'status','matched','battleId',v_battle,'mode',v_mode,
    'seasonId',v_season,'botMatch',true,'botRating',v_bot_rating
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.server_forfeit_battle(p_actor_id uuid, p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_winner uuid;
  v_loser uuid;
  v_neutral boolean;
  v_cr integer;
  v_or integer;
  v_cr_after integer;
  v_or_after integer;
  v_c_expected numeric;
  v_o_expected numeric;
  v_pot bigint;
  v_pair_count integer;
  v_reward boolean := false;
begin
  select * into b
  from public.battles
  where id=p_battle_id
  for update;

  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('drafting','selecting','revealing') then raise exception 'INVALID_STATUS'; end if;

  v_loser := p_actor_id;
  v_winner := case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  -- Rating is neutral only while the surrendering player has not chosen
  -- any card at all in this battle (draft or battle selection).
  v_neutral := not exists (
    select 1 from public.battle_selections
    where battle_id=b.id and player_id=p_actor_id
  ) and not exists (
    select 1 from public.battle_draft_cards
    where battle_id=b.id and player_id=p_actor_id
  );

  perform 1 from public.players
  where id in (b.challenger_id,b.opponent_id)
  order by id
  for update;

  select battle_rating into v_cr from public.players where id=b.challenger_id;
  select battle_rating into v_or from public.players where id=b.opponent_id;
  v_cr_after := v_cr;
  v_or_after := v_or;

  if not v_neutral then
    select count(*) into v_pair_count
    from public.battles x
    where x.status='completed'
      and x.reward_eligible
      and x.completed_at>=greatest(now()-interval '24 hours',private.release_progress_epoch())
      and (
        (x.challenger_id=b.challenger_id and x.opponent_id=b.opponent_id)
        or (x.challenger_id=b.opponent_id and x.opponent_id=b.challenger_id)
      );

    v_reward := v_pair_count < 5;
    if b.is_ranked and v_reward then
      v_c_expected := 1/(1+power(10::numeric,(v_or-v_cr)/400.0));
      v_o_expected := 1-v_c_expected;
      v_cr_after := round(v_cr + 24*((case when v_winner=b.challenger_id then 1 else 0 end)-v_c_expected));
      v_or_after := round(v_or + 24*((case when v_winner=b.opponent_id then 1 else 0 end)-v_o_expected));

      update public.players
      set battle_rating=case when id=b.challenger_id then v_cr_after else v_or_after end
      where id in (b.challenger_id,b.opponent_id);
    end if;

    update public.players
    set battle_wins=battle_wins+1,
        battle_streak=battle_streak+1,
        best_battle_streak=greatest(best_battle_streak,battle_streak+1)
    where id=v_winner;

    update public.players
    set battle_losses=battle_losses+1,
        battle_streak=0
    where id=v_loser;

    if v_reward then
      update public.players
      set xp=xp+case when id=v_winner then 50 else 20 end,
          level=greatest(level,1+floor((xp+case when id=v_winner then 50 else 20 end)/250.0)::integer)
      where id in (b.challenger_id,b.opponent_id);
    end if;
  end if;

  v_neutral := v_neutral or not b.is_ranked or not v_reward;

  if b.stake_type='coins' then
    select coalesce(sum(amount),0) into v_pot
    from public.battle_coin_escrows
    where battle_id=b.id and status='held';
    if v_pot>0 then
      update public.players set coins=coins+v_pot where id=v_winner;
      update public.battle_coin_escrows
      set status='paid',updated_at=now()
      where battle_id=b.id and status='held';
    end if;
  elsif b.stake_type='card' then
    insert into public.player_cards(player_id,card_id,quantity)
    select v_winner,card_id,sum(quantity)::integer
    from public.battle_card_stakes
    where battle_id=b.id and status='held'
    group by card_id
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+excluded.quantity;

    update public.battle_card_stakes
    set status='paid',updated_at=now()
    where battle_id=b.id and status='held';
  end if;

  update public.battles
  set status='completed',
      winner_id=v_winner,
      completed_at=now(),
      updated_at=now(),
      reward_eligible=v_reward,
      challenger_rating_before=v_cr,
      challenger_rating_after=v_cr_after,
      opponent_rating_before=v_or,
      opponent_rating_after=v_or_after,
      forfeited_by=v_loser,
      forfeit_rating_neutral=v_neutral,
      forfeited_at=now(),
      challenger_score=case when v_winner=b.challenger_id then greatest(challenger_score,rounds_to_win) else challenger_score end,
      opponent_score=case when v_winner=b.opponent_id then greatest(opponent_score,rounds_to_win) else opponent_score end
  where id=b.id;

  insert into public.battle_events(battle_id,event_type,payload)
  values (
    b.id,
    'forfeited',
    jsonb_build_object(
      'by',v_loser,
      'winnerId',v_winner,
      'ratingNeutral',v_neutral,
      'challengerRating',v_cr_after,
      'opponentRating',v_or_after
    )
  );

  perform public.server_queue_notification(
    v_winner,
    'battle_result',
    'Vitória por desistência!',
    case when v_neutral then
      'A vitória por desistência não alterou o ELO.'
    else
      'O adversário desistiu e a batalha foi encerrada a seu favor.'
    end,
    jsonb_build_object('battleId',b.id,'result','win','forfeit',true,'ratingNeutral',v_neutral)
  );

  return jsonb_build_object(
    'completed',true,
    'winnerId',v_winner,
    'forfeitedBy',v_loser,
    'ratingNeutral',v_neutral,
    'challengerRating',v_cr_after,
    'opponentRating',v_or_after
  );
end;
$function$
;

revoke all on function public.server_choose_battle_attack(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.server_get_battle_attack_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_choose_battle_attack(uuid,uuid,text) to service_role;
grant execute on function public.server_get_battle_attack_state(uuid,uuid) to service_role;
