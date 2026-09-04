create or replace function private.battle_game_sprite_url(p_pokemon_id integer)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_pokemon_id is null or p_pokemon_id <= 0 then null
    else 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' || p_pokemon_id::text || '.png'
  end;
$$;

revoke all on function private.battle_game_sprite_url(integer) from public,anon,authenticated;

create or replace function private.battle_game_fighter_json(p_battle_id uuid, p_round_no integer, p_player_id uuid)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'playerId',f.player_id,
    'cardId',f.card_id,
    'pokemonId',f.pokemon_id,
    'profile',f.profile_identifier,
    'name',c.pokemon_name,
    'image',private.battle_game_sprite_url(f.pokemon_id),
    'cardImage',c.image_small,
    'types',to_jsonb(f.types),
    'ability',f.ability,
    'level',f.level,
    'hp',f.max_hp,
    'remainingHp',f.current_hp,
    'knockedOut',f.current_hp<=0,
    'attack',f.attack_stat,
    'defense',f.defense_stat,
    'spAttack',f.sp_attack_stat,
    'spDefense',f.sp_defense_stat,
    'speed',f.speed_stat,
    'attackStage',f.attack_stage,
    'defenseStage',f.defense_stage,
    'spAttackStage',f.sp_attack_stage,
    'spDefenseStage',f.sp_defense_stage,
    'speedStage',f.speed_stage,
    'accuracyStage',f.accuracy_stage,
    'evasionStage',f.evasion_stage,
    'status',f.major_status,
    'statusTurns',f.status_turns,
    'pp',f.pp_remaining,
    'rulesVersion',7,
    'engineVersion','game_v1'
  )
  from private.battle_game_fighters f
  join public.cards c on c.id=f.card_id
  where f.battle_id=p_battle_id
    and f.round_no=p_round_no
    and f.player_id=p_player_id;
$$;

revoke all on function private.battle_game_fighter_json(uuid,integer,uuid) from public,anon,authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.server_get_battle_attack_state_base(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.server_get_battle_attack_state(uuid,uuid)
      RENAME TO server_get_battle_attack_state_base;
  END IF;
END
$$;

revoke all on function public.server_get_battle_attack_state_base(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_get_battle_attack_state_base(uuid,uuid) to service_role;

create or replace function public.server_get_battle_attack_state(p_actor_id uuid,p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v jsonb;
  v_my_sprite text;
  v_opponent_sprite text;
begin
  v:=public.server_get_battle_attack_state_base(p_actor_id,p_battle_id);
  if coalesce(v->>'engineVersion','')='game_v1' then
    v_my_sprite:=private.battle_game_sprite_url(nullif(v->>'myPokemonId','')::integer);
    v_opponent_sprite:=private.battle_game_sprite_url(nullif(v->>'opponentPokemonId','')::integer);
    v:=jsonb_set(v,'{myCardImage}',coalesce(to_jsonb(v_my_sprite),'null'::jsonb),true);
    v:=jsonb_set(v,'{opponentCardImage}',coalesce(to_jsonb(v_opponent_sprite),'null'::jsonb),true);
  end if;
  return v;
end;
$$;

revoke all on function public.server_get_battle_attack_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_get_battle_attack_state(uuid,uuid) to service_role;