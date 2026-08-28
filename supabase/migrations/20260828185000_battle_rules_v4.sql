-- Battle Rules v4
-- Deterministic, matchup-aware combat based on printed Pokemon TCG data.
-- Market price, rarity and game economy values never affect combat.

alter table public.battle_rounds
  add column if not exists challenger_combat jsonb,
  add column if not exists opponent_combat jsonb,
  add column if not exists rules_version integer not null default 3;

create or replace function public.battle_card_profile(p_card_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  c public.cards%rowtype;
  a jsonb;
  v_hp numeric;
  v_damage numeric;
  v_energy integer;
  v_max_damage numeric := 0;
  v_min_energy integer := 10;
  v_best_energy integer := 1;
  v_best_dpe numeric := 0;
  v_attack_count integer := 0;
  v_effect_attacks integer := 0;
  v_ability_count integer := 0;
  v_retreat integer := 0;
  v_resistance_count integer := 0;
  v_efficiency_score numeric;
  v_speed_score numeric;
  v_technique_score numeric;
  v_hp_score numeric;
  v_attack_score numeric;
  v_rating integer;
  m text[];
begin
  select * into c from public.cards where id=p_card_id;
  if c.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  v_hp := greatest(10,least(1000,coalesce(
    nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50
  )));

  if jsonb_typeof(c.tcg_data->'attacks')='array' then
    v_attack_count := jsonb_array_length(c.tcg_data->'attacks');
    for a in select value from jsonb_array_elements(c.tcg_data->'attacks')
    loop
      m := regexp_match(coalesce(a->>'damage',''),'([0-9]+)');
      v_damage := case when m is null then 0 else m[1]::numeric end;
      v_energy := coalesce(
        nullif(regexp_replace(coalesce(a->>'convertedEnergyCost',''),'[^0-9]','','g'),'')::integer,
        case when jsonb_typeof(a->'cost')='array' then jsonb_array_length(a->'cost') else 1 end,
        1
      );
      v_energy := greatest(1,least(10,v_energy));
      v_min_energy := least(v_min_energy,v_energy);

      if length(trim(coalesce(a->>'text',''))) > 0 then
        v_effect_attacks := v_effect_attacks + 1;
      end if;

      if v_damage>v_max_damage
        or (v_damage=v_max_damage and v_damage>0 and v_energy<v_best_energy)
      then
        v_max_damage := v_damage;
        v_best_energy := v_energy;
      end if;

      if v_damage>0 then
        v_best_dpe := greatest(v_best_dpe,v_damage/v_energy);
      end if;
    end loop;
  end if;

  if v_max_damage<=0 then
    v_max_damage:=10;
    v_best_energy:=1;
    v_best_dpe:=10;
  end if;
  if v_min_energy=10 then v_min_energy:=1; end if;

  if jsonb_typeof(c.tcg_data->'abilities')='array' then
    v_ability_count:=jsonb_array_length(c.tcg_data->'abilities');
  end if;

  v_retreat := coalesce(
    nullif(regexp_replace(coalesce(c.tcg_data->>'convertedRetreatCost',''),'[^0-9]','','g'),'')::integer,
    case when jsonb_typeof(c.tcg_data->'retreatCost')='array' then jsonb_array_length(c.tcg_data->'retreatCost') else 0 end,
    0
  );
  v_retreat:=greatest(0,least(10,v_retreat));

  if jsonb_typeof(c.tcg_data->'resistances')='array' then
    v_resistance_count:=jsonb_array_length(c.tcg_data->'resistances');
  end if;

  v_efficiency_score:=round(least(100,greatest(0,(v_best_dpe/120.0)*100)),0);
  v_speed_score:=round(greatest(20,least(100,100-(v_min_energy-1)*14-v_retreat*7)),0);
  v_technique_score:=round(least(100,greatest(0,
    v_attack_count*4+v_effect_attacks*10+v_ability_count*18+v_resistance_count*8
  )),0);
  v_hp_score:=least(100,(v_hp/400.0)*100);
  v_attack_score:=least(100,(v_max_damage/300.0)*100);

  v_rating:=greatest(1,least(1000,round((
    v_hp_score*.28
    +v_attack_score*.30
    +v_efficiency_score*.22
    +v_speed_score*.12
    +v_technique_score*.08
  )*10)::integer));

  return jsonb_build_object(
    'hp',v_hp,
    'maxDamage',v_max_damage,
    'minEnergy',v_min_energy,
    'bestEnergy',v_best_energy,
    'retreatCost',v_retreat,
    'attackCount',v_attack_count,
    'abilityCount',v_ability_count,
    'effectAttackCount',v_effect_attacks,
    'damagePerEnergy',round(v_best_dpe,2),
    'efficiencyScore',v_efficiency_score,
    'speedScore',v_speed_score,
    'techniqueScore',v_technique_score,
    'battleRating',v_rating
  );
end;
$$;

create or replace function public.battle_card_duel_stats(
  p_attacker_card_id text,
  p_defender_card_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_attacker public.cards%rowtype;
  v_defender public.cards%rowtype;
  v_profile jsonb;
  v_attacker_type text;
  v_attacker_hp numeric;
  v_defender_hp numeric;
  v_rule jsonb;
  v_attack jsonb;
  v_match text[];
  v_value text;
  v_damage numeric;
  v_energy integer;
  v_recoil numeric;
  v_effective_damage numeric;
  v_hits integer;
  v_turns integer;
  v_weakness_multiplier numeric := 1;
  v_weakness_bonus numeric := 0;
  v_resistance numeric := 0;
  v_best_turns integer := 2147483647;
  v_best_damage numeric := 0;
  v_best_base_damage numeric := 0;
  v_best_energy integer := 1;
  v_best_recoil numeric := 0;
  v_best_attack text := 'Ataque técnico';
  v_best_quality numeric := -999999;
  v_quality numeric;
  v_matchup_score numeric;
  v_advantage text := 'neutral';
begin
  select * into v_attacker from public.cards where id=p_attacker_card_id;
  select * into v_defender from public.cards where id=p_defender_card_id;
  if v_attacker.id is null or v_defender.id is null then raise exception 'CARD_NOT_FOUND'; end if;

  v_profile:=public.battle_card_profile(v_attacker.id);
  v_attacker_hp:=(v_profile->>'hp')::numeric;
  v_attacker_type:=v_attacker.types[1];
  v_defender_hp:=greatest(10,least(1000,coalesce(
    nullif(regexp_replace(coalesce(v_defender.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50
  )));

  if jsonb_typeof(v_defender.tcg_data->'weaknesses')='array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'weaknesses')
    loop
      if lower(coalesce(v_rule->>'type',''))=lower(coalesce(v_attacker_type,'')) then
        v_value:=coalesce(v_rule->>'value','');
        v_match:=regexp_match(v_value,'[×x]([0-9]+)');
        if v_match is not null then v_weakness_multiplier:=greatest(1,v_match[1]::numeric); end if;
        v_match:=regexp_match(v_value,'[+]([0-9]+)');
        if v_match is not null then v_weakness_bonus:=greatest(0,v_match[1]::numeric); end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(v_defender.tcg_data->'resistances')='array' then
    for v_rule in select value from jsonb_array_elements(v_defender.tcg_data->'resistances')
    loop
      if lower(coalesce(v_rule->>'type',''))=lower(coalesce(v_attacker_type,'')) then
        v_match:=regexp_match(coalesce(v_rule->>'value',''),'-([0-9]+)');
        if v_match is not null then v_resistance:=greatest(0,v_match[1]::numeric); end if;
      end if;
    end loop;
  end if;

  if v_weakness_multiplier>1 or v_weakness_bonus>0 then
    v_advantage:='weakness';
  elsif v_resistance>0 then
    v_advantage:='resisted';
  end if;

  if jsonb_typeof(v_attacker.tcg_data->'attacks')='array' then
    for v_attack in select value from jsonb_array_elements(v_attacker.tcg_data->'attacks')
    loop
      v_match:=regexp_match(coalesce(v_attack->>'damage',''),'([0-9]+)');
      v_damage:=case when v_match is null then 0 else v_match[1]::numeric end;
      if v_damage<=0 then continue; end if;

      v_energy:=coalesce(
        nullif(regexp_replace(coalesce(v_attack->>'convertedEnergyCost',''),'[^0-9]','','g'),'')::integer,
        case when jsonb_typeof(v_attack->'cost')='array' then jsonb_array_length(v_attack->'cost') else 1 end,
        1
      );
      v_energy:=greatest(1,least(10,v_energy));

      v_match:=regexp_match(lower(coalesce(v_attack->>'text','')),'([0-9]+) damage to itself');
      v_recoil:=case when v_match is null then 0 else v_match[1]::numeric end;

      v_effective_damage:=greatest(
        0,v_damage*v_weakness_multiplier+v_weakness_bonus-v_resistance
      );
      if v_effective_damage<=0 then continue; end if;

      v_hits:=greatest(1,ceil(v_defender_hp/v_effective_damage)::integer);
      v_turns:=v_energy+v_hits-1;
      v_quality:=v_effective_damage-v_recoil*.75-v_energy*2;

      if v_turns<v_best_turns
        or (v_turns=v_best_turns and v_quality>v_best_quality)
        or (v_turns=v_best_turns and v_quality=v_best_quality and v_energy<v_best_energy)
      then
        v_best_turns:=v_turns;
        v_best_damage:=v_effective_damage;
        v_best_base_damage:=v_damage;
        v_best_energy:=v_energy;
        v_best_recoil:=v_recoil;
        v_best_attack:=coalesce(nullif(v_attack->>'name',''),'Ataque');
        v_best_quality:=v_quality;
      end if;
    end loop;
  end if;

  if v_best_turns=2147483647 then
    v_best_base_damage:=10;
    v_best_damage:=greatest(1,10*v_weakness_multiplier+v_weakness_bonus-v_resistance);
    v_best_energy:=1;
    v_best_recoil:=0;
    v_best_turns:=ceil(v_defender_hp/v_best_damage)::integer;
  end if;

  v_matchup_score:=round(
    10000.0/greatest(1,v_best_turns)
    +v_best_damage*1.5
    +v_attacker_hp*.5
    +(v_profile->>'efficiencyScore')::numeric*2
    +(v_profile->>'speedScore')::numeric
    +(v_profile->>'techniqueScore')::numeric*.5
    -v_best_recoil*1.5,
    2
  );

  return jsonb_build_object(
    'attackerCardId',v_attacker.id,
    'attackerType',v_attacker_type,
    'attackerHp',v_attacker_hp,
    'defenderHp',v_defender_hp,
    'attackName',v_best_attack,
    'baseDamage',v_best_base_damage,
    'effectiveDamage',v_best_damage,
    'energyCost',v_best_energy,
    'recoilDamage',v_best_recoil,
    'turnsToKnockout',v_best_turns,
    'weaknessMultiplier',v_weakness_multiplier,
    'weaknessBonus',v_weakness_bonus,
    'resistance',v_resistance,
    'advantage',v_advantage,
    'matchupScore',v_matchup_score,
    'battleRating',(v_profile->>'battleRating')::integer,
    'efficiencyScore',(v_profile->>'efficiencyScore')::integer,
    'speedScore',(v_profile->>'speedScore')::integer,
    'techniqueScore',(v_profile->>'techniqueScore')::integer,
    'profile',v_profile
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
  c_stats jsonb;
  o_stats jsonb;
  c_turns integer;
  o_turns integer;
  c_matchup numeric;
  o_matchup numeric;
  c_rating integer;
  o_rating integer;
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
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true); end if;

  select card_id into c_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

  select card_id into o_card from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

  if c_card is null or o_card is null then
    return jsonb_build_object('waiting',true,'round',b.active_round);
  end if;

  c_stats:=public.battle_card_duel_stats(c_card,o_card);
  o_stats:=public.battle_card_duel_stats(o_card,c_card);

  c_turns:=(c_stats->>'turnsToKnockout')::integer;
  o_turns:=(o_stats->>'turnsToKnockout')::integer;
  c_matchup:=(c_stats->>'matchupScore')::numeric;
  o_matchup:=(o_stats->>'matchupScore')::numeric;
  c_rating:=(c_stats->>'battleRating')::integer;
  o_rating:=(o_stats->>'battleRating')::integer;
  c_hp:=(c_stats->>'attackerHp')::numeric;
  o_hp:=(o_stats->>'attackerHp')::numeric;

  c_power:=c_matchup;
  o_power:=o_matchup;

  if c_turns<o_turns then
    v_winner:=b.challenger_id;
  elsif o_turns<c_turns then
    v_winner:=b.opponent_id;
  elsif c_matchup>o_matchup then
    v_tiebreak:='matchup_score'; v_winner:=b.challenger_id;
  elsif o_matchup>c_matchup then
    v_tiebreak:='matchup_score'; v_winner:=b.opponent_id;
  elsif c_rating>o_rating then
    v_tiebreak:='battle_rating'; v_winner:=b.challenger_id;
  elsif o_rating>c_rating then
    v_tiebreak:='battle_rating'; v_winner:=b.opponent_id;
  elsif c_hp>o_hp then
    v_tiebreak:='hp'; v_winner:=b.challenger_id;
  elsif o_hp>c_hp then
    v_tiebreak:='hp'; v_winner:=b.opponent_id;
  else
    v_tiebreak:='coin_flip';
    c_roll:=random();
    o_roll:=random();
    v_winner:=case when c_roll>=o_roll then b.challenger_id else b.opponent_id end;
  end if;

  v_result:=public.server_finish_battle_round(
    b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner
  );

  update public.battle_rounds
  set challenger_combat=c_stats,
      opponent_combat=o_stats,
      rules_version=4
  where battle_id=b.id and round_no=b.active_round;

  return v_result||jsonb_build_object(
    'round',b.active_round,
    'challengerCardId',c_card,
    'opponentCardId',o_card,
    'challengerCombat',c_stats,
    'opponentCombat',o_stats,
    'tieBreak',v_tiebreak,
    'rulesVersion',4
  );
end;
$$;

revoke all on function public.battle_card_profile(text) from public,anon,authenticated;
revoke all on function public.battle_card_duel_stats(text,text) from public,anon,authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated;
grant execute on function public.battle_card_profile(text) to service_role;
grant execute on function public.battle_card_duel_stats(text,text) to service_role;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;

-- Bag pages expose the neutral battle profile only for cards the signed-in player owns.
create or replace function private.get_my_bag_page(
  p_offset integer default 0,
  p_limit integer default 60,
  p_search text default null,
  p_set_query text default null,
  p_quick_filter text default 'all',
  p_type_filter text default null,
  p_rarity_filter text default null,
  p_generation integer default null,
  p_sort_mode text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_result jsonb;
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=greatest(1,least(coalesce(p_limit,60),100));
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_set text:=nullif(btrim(coalesce(p_set_query,'')),'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if coalesce(p_quick_filter,'all') not in ('all','favorites','duplicates') then raise exception 'INVALID_FILTER'; end if;
  if coalesce(p_sort_mode,'recent') not in ('recent','value','name','quantity') then raise exception 'INVALID_SORT'; end if;
  if p_generation is not null and (p_generation<1 or p_generation>9) then raise exception 'INVALID_GENERATION'; end if;

  with filtered as (
    select
      pc.quantity,pc.favorite,pc.first_obtained_at,
      c.id,c.pokemon_name,c.pokedex_numbers,c.set_id,c.set_name,
      c.card_number,c.rarity,c.types,c.image_small,c.image_large,
      c.game_value,c.market_price_usd,c.market_price_low_usd,
      c.market_price_high_usd,c.market_price_variant,
      c.market_price_source,c.market_price_updated_at
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_actor
      and pc.quantity>0
      and (coalesce(p_quick_filter,'all')<>'favorites' or pc.favorite)
      and (coalesce(p_quick_filter,'all')<>'duplicates' or pc.quantity>1)
      and (p_type_filter is null or p_type_filter=any(coalesce(c.types,array[]::text[])))
      and (p_rarity_filter is null or c.rarity=p_rarity_filter)
      and (v_set is null or c.set_name ilike '%'||v_set||'%' or c.set_id ilike '%'||v_set||'%')
      and (
        v_search is null
        or c.pokemon_name ilike '%'||v_search||'%'
        or c.set_name ilike '%'||v_search||'%'
        or coalesce(c.card_number,'') ilike '%'||v_search||'%'
      )
      and (
        p_generation is null
        or case p_generation
          when 1 then coalesce(c.pokedex_numbers[1],0) between 1 and 151
          when 2 then coalesce(c.pokedex_numbers[1],0) between 152 and 251
          when 3 then coalesce(c.pokedex_numbers[1],0) between 252 and 386
          when 4 then coalesce(c.pokedex_numbers[1],0) between 387 and 493
          when 5 then coalesce(c.pokedex_numbers[1],0) between 494 and 649
          when 6 then coalesce(c.pokedex_numbers[1],0) between 650 and 721
          when 7 then coalesce(c.pokedex_numbers[1],0) between 722 and 809
          when 8 then coalesce(c.pokedex_numbers[1],0) between 810 and 905
          when 9 then coalesce(c.pokedex_numbers[1],0) between 906 and 1025
          else false
        end
      )
  ),
  ordered as (
    select * from filtered
    order by
      case when p_sort_mode='value' then market_price_usd end desc nulls last,
      case when p_sort_mode='name' then pokemon_name end asc,
      case when p_sort_mode='quantity' then quantity end desc,
      case when p_sort_mode='recent' then first_obtained_at end desc,
      id asc
    offset v_offset limit v_limit
  ),
  profiled as (
    select ordered.*,public.battle_card_profile(id) as battle_profile
    from ordered
  )
  select jsonb_build_object(
    'totalFiltered',(select count(*) from filtered),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity',quantity,
        'favorite',favorite,
        'first_obtained_at',first_obtained_at,
        'cards',jsonb_build_object(
          'id',id,'pokemon_name',pokemon_name,'pokedex_numbers',pokedex_numbers,
          'set_id',set_id,'set_name',set_name,'card_number',card_number,
          'rarity',rarity,'types',types,'image_small',image_small,
          'image_large',image_large,'game_value',game_value,
          'battle_damage',(battle_profile->>'maxDamage')::numeric,
          'battle_profile',battle_profile,
          'market_price_usd',market_price_usd,
          'market_price_low_usd',market_price_low_usd,
          'market_price_high_usd',market_price_high_usd,
          'market_price_variant',market_price_variant,
          'market_price_source',market_price_source,
          'market_price_updated_at',market_price_updated_at
        )
      ) order by
        case when p_sort_mode='value' then market_price_usd end desc nulls last,
        case when p_sort_mode='name' then pokemon_name end asc,
        case when p_sort_mode='quantity' then quantity end desc,
        case when p_sort_mode='recent' then first_obtained_at end desc,
        id asc)
      from profiled
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
