-- Resolve battles from printed Pokemon TCG combat data only.
-- Market price, game value and rarity are deliberately excluded.

create or replace function public.battle_card_power(p_card_id text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c cards%rowtype;
  v_hp numeric;
  v_attack numeric := 0;
  v_damage numeric;
  v_abilities numeric := 0;
  a jsonb;
  m text[];
begin
  select * into c from cards where id = p_card_id;
  if c.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  v_hp := greatest(
    30,
    least(
      400,
      coalesce(
        nullif(regexp_replace(coalesce(c.tcg_data->>'hp', ''), '[^0-9]', '', 'g'), '')::numeric,
        50
      )
    )
  );

  if jsonb_typeof(c.tcg_data->'attacks') = 'array' then
    for a in select value from jsonb_array_elements(c.tcg_data->'attacks')
    loop
      m := regexp_match(coalesce(a->>'damage', ''), '([0-9]+)');
      v_damage := case when m is null then 0 else m[1]::numeric end;
      v_attack := greatest(v_attack, v_damage);
    end loop;
  end if;

  if jsonb_typeof(c.tcg_data->'abilities') = 'array' then
    v_abilities := jsonb_array_length(c.tcg_data->'abilities');
  end if;

  return v_hp * .62 + v_attack * .30 + v_abilities * 6;
end
$$;

create or replace function public.battle_card_duel_stats(
  p_attacker_card_id text,
  p_defender_card_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_attacker cards%rowtype;
  v_defender cards%rowtype;
  v_attacker_type text;
  v_defender_hp numeric;
  v_rule jsonb;
  v_attack jsonb;
  v_match text[];
  v_value text;
  v_damage numeric;
  v_energy integer;
  v_effective_damage numeric;
  v_turns integer;
  v_weakness_multiplier numeric := 1;
  v_weakness_bonus numeric := 0;
  v_resistance numeric := 0;
  v_best_turns integer := 2147483647;
  v_best_damage numeric := 0;
  v_best_energy integer := 1;
  v_best_attack text := 'Sem ataque de dano';
begin
  select * into v_attacker from cards where id = p_attacker_card_id;
  select * into v_defender from cards where id = p_defender_card_id;

  if v_attacker.id is null or v_defender.id is null then
    raise exception 'CARD_NOT_FOUND';
  end if;

  v_attacker_type := v_attacker.types[1];
  v_defender_hp := greatest(
    10,
    least(
      1000,
      coalesce(
        nullif(regexp_replace(coalesce(v_defender.tcg_data->>'hp', ''), '[^0-9]', '', 'g'), '')::numeric,
        50
      )
    )
  );

  if jsonb_typeof(v_defender.tcg_data->'weaknesses') = 'array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'weaknesses')
    loop
      if lower(coalesce(v_rule->>'type', '')) = lower(coalesce(v_attacker_type, '')) then
        v_value := coalesce(v_rule->>'value', '');
        v_match := regexp_match(v_value, '[×x]([0-9]+)');
        if v_match is not null then
          v_weakness_multiplier := greatest(1, v_match[1]::numeric);
        end if;
        v_match := regexp_match(v_value, '[+]([0-9]+)');
        if v_match is not null then
          v_weakness_bonus := greatest(0, v_match[1]::numeric);
        end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_defender.tcg_data->'resistances') = 'array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'resistances')
    loop
      if lower(coalesce(v_rule->>'type', '')) = lower(coalesce(v_attacker_type, '')) then
        v_match := regexp_match(coalesce(v_rule->>'value', ''), '-([0-9]+)');
        if v_match is not null then
          v_resistance := greatest(0, v_match[1]::numeric);
        end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_attacker.tcg_data->'attacks') = 'array' then
    for v_attack in select value from jsonb_array_elements(v_attacker.tcg_data->'attacks')
    loop
      v_match := regexp_match(coalesce(v_attack->>'damage', ''), '([0-9]+)');
      v_damage := case when v_match is null then 0 else v_match[1]::numeric end;

      v_energy := coalesce(
        nullif(
          regexp_replace(coalesce(v_attack->>'convertedEnergyCost', ''), '[^0-9]', '', 'g'),
          ''
        )::integer,
        case
          when jsonb_typeof(v_attack->'cost') = 'array' then jsonb_array_length(v_attack->'cost')
          else 1
        end,
        1
      );
      v_energy := greatest(1, least(10, v_energy));

      v_effective_damage := greatest(
        0,
        v_damage * v_weakness_multiplier + v_weakness_bonus - v_resistance
      );

      if v_effective_damage > 0 then
        v_turns := v_energy + ceil(v_defender_hp / v_effective_damage)::integer - 1;
        if v_turns < v_best_turns
          or (v_turns = v_best_turns and v_effective_damage > v_best_damage)
          or (v_turns = v_best_turns and v_effective_damage = v_best_damage and v_energy < v_best_energy)
        then
          v_best_turns := v_turns;
          v_best_damage := v_effective_damage;
          v_best_energy := v_energy;
          v_best_attack := coalesce(nullif(v_attack->>'name', ''), 'Ataque');
        end if;
      end if;
    end loop;
  end if;

  -- Cards without printed damage remain playable. This fallback represents
  -- a minimal struggle and makes HP decide otherwise impossible duels.
  if v_best_turns = 2147483647 then
    v_best_damage := 10;
    v_best_energy := 1;
    v_best_turns := ceil(v_defender_hp / v_best_damage)::integer;
  end if;

  return jsonb_build_object(
    'attackerCardId', v_attacker.id,
    'attackerType', v_attacker_type,
    'attackerHp', greatest(
      10,
      least(
        1000,
        coalesce(
          nullif(regexp_replace(coalesce(v_attacker.tcg_data->>'hp', ''), '[^0-9]', '', 'g'), '')::numeric,
          50
        )
      )
    ),
    'defenderHp', v_defender_hp,
    'attackName', v_best_attack,
    'effectiveDamage', v_best_damage,
    'energyCost', v_best_energy,
    'turnsToKnockout', v_best_turns,
    'weaknessMultiplier', v_weakness_multiplier,
    'weaknessBonus', v_weakness_bonus,
    'resistance', v_resistance
  );
end
$$;

create or replace function public.server_resolve_battle_round(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b battles%rowtype;
  c_card text;
  o_card text;
  c_stats jsonb;
  o_stats jsonb;
  c_turns integer;
  o_turns integer;
  c_damage numeric;
  o_damage numeric;
  c_hp numeric;
  o_hp numeric;
  c_power numeric;
  o_power numeric;
  c_roll numeric := 1;
  o_roll numeric := 1;
  v_winner uuid;
  v_result jsonb;
  v_tiebreak text := 'knockout_turns';
begin
  select * into b from battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status <> 'selecting' then
    return jsonb_build_object('alreadyResolved', true);
  end if;

  select card_id into c_card
  from battle_selections
  where battle_id = b.id and round_no = b.active_round and player_id = b.challenger_id;

  select card_id into o_card
  from battle_selections
  where battle_id = b.id and round_no = b.active_round and player_id = b.opponent_id;

  if c_card is null or o_card is null then
    return jsonb_build_object('waiting', true, 'round', b.active_round);
  end if;

  c_stats := battle_card_duel_stats(c_card, o_card);
  o_stats := battle_card_duel_stats(o_card, c_card);

  c_turns := (c_stats->>'turnsToKnockout')::integer;
  o_turns := (o_stats->>'turnsToKnockout')::integer;
  c_damage := (c_stats->>'effectiveDamage')::numeric;
  o_damage := (o_stats->>'effectiveDamage')::numeric;
  c_hp := (c_stats->>'attackerHp')::numeric;
  o_hp := (o_stats->>'attackerHp')::numeric;

  c_power := round(10000.0 / greatest(1, c_turns) + c_damage + c_hp / 10.0, 2);
  o_power := round(10000.0 / greatest(1, o_turns) + o_damage + o_hp / 10.0, 2);

  if c_turns < o_turns then
    v_winner := b.challenger_id;
  elsif o_turns < c_turns then
    v_winner := b.opponent_id;
  elsif c_damage > o_damage then
    v_tiebreak := 'effective_damage';
    v_winner := b.challenger_id;
  elsif o_damage > c_damage then
    v_tiebreak := 'effective_damage';
    v_winner := b.opponent_id;
  elsif c_hp > o_hp then
    v_tiebreak := 'hp';
    v_winner := b.challenger_id;
  elsif o_hp > c_hp then
    v_tiebreak := 'hp';
    v_winner := b.opponent_id;
  else
    v_tiebreak := 'coin_flip';
    c_roll := random();
    o_roll := random();
    v_winner := case
      when c_roll >= o_roll then b.challenger_id
      else b.opponent_id
    end;
  end if;

  v_result := server_finish_battle_round(
    b.id,
    b.active_round,
    c_power,
    o_power,
    c_roll,
    o_roll,
    v_winner
  );

  return v_result || jsonb_build_object(
    'round', b.active_round,
    'challengerCardId', c_card,
    'opponentCardId', o_card,
    'challengerCombat', c_stats,
    'opponentCombat', o_stats,
    'tieBreak', v_tiebreak,
    'rulesVersion', 3
  );
end
$$;

revoke all on function public.battle_card_power(text) from public, anon, authenticated;
revoke all on function public.battle_card_duel_stats(text, text) from public, anon, authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public, anon, authenticated;

grant execute on function public.battle_card_power(text) to service_role;
grant execute on function public.battle_card_duel_stats(text, text) to service_role;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;
