
create or replace function public.get_card_game_profile(p_card_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_profile jsonb;
  v_stats jsonb;
  v_moves jsonb;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not exists (select 1 from public.cards where id=p_card_id) then
    raise exception 'CARD_NOT_FOUND';
  end if;

  v_profile:=private.battle_game_profile_for_card(p_card_id);
  if v_profile is null then
    return null;
  end if;

  v_stats:=private.battle_game_level50_stats(v_profile);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',m.move_id,
        'identifier',m.identifier,
        'type',m.move_type,
        'category',m.category,
        'power',m.power,
        'pp',m.pp,
        'accuracy',m.accuracy,
        'priority',m.priority,
        'ailment',m.ailment,
        'ailmentChance',m.ailment_chance,
        'flinchChance',m.flinch_chance,
        'healing',m.healing,
        'drain',m.drain,
        'critRate',m.crit_rate,
        'statChanges',m.stat_changes
      )
      order by ids.ord
    ),
    '[]'::jsonb
  )
  into v_moves
  from jsonb_array_elements_text(coalesce(v_profile->'moveIds','[]'::jsonb))
       with ordinality as ids(move_id,ord)
  join private.pokemon_game_moves m
    on m.move_id=(ids.move_id)::integer;

  return jsonb_build_object(
    'identifier',v_profile->>'identifier',
    'pokemonId',(v_profile->>'pokemonId')::integer,
    'speciesId',(v_profile->>'speciesId')::integer,
    'types',coalesce(v_profile->'types','[]'::jsonb),
    'ability',v_profile->>'ability',
    'stats',v_stats,
    'moves',v_moves,
    'sourceVersionGroup',(v_profile->>'sourceVersionGroup')::integer
  );
end;
$function$;

revoke all on function public.get_card_game_profile(text) from public;
grant execute on function public.get_card_game_profile(text) to authenticated;

comment on function public.get_card_game_profile(text) is
  'Returns the canonical game_v1 level-50 profile and move set used by battle UI for an authenticated card detail view.';
