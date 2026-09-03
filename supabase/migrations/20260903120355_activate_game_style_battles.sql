CREATE OR REPLACE FUNCTION private.battle_game_profile_for_card(p_card_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
declare
  c public.cards%rowtype;
  v_dex integer;
  v_name text;
  v_identifier text;
  v_hints text[];
  v_profile private.pokemon_game_profiles%rowtype;
begin
  select * into c from public.cards where id=p_card_id;
  if c.id is null then
    return null;
  end if;

  v_name:=lower(trim(coalesce(c.pokemon_name,'')));
  v_hints:=private.battle_game_card_type_hints(c.types);

  if coalesce(array_length(c.pokedex_numbers,1),0)=0 then
    v_identifier:=trim(both '-' from regexp_replace(
      regexp_replace(v_name, '[[:space:]]+(ex|gx|vmax|vstar|v-union|v)$', '', 'i'),
      '[^a-z0-9]+', '-', 'g'
    ));

    select p.* into v_profile
    from private.pokemon_game_profiles p
    where p.identifier=v_identifier
    order by p.is_default desc,p.pokemon_id
    limit 1;

    if v_profile.pokemon_id is null then return null; end if;
  else
    v_dex:=c.pokedex_numbers[1];

    select p.* into v_profile
    from private.pokemon_game_profiles p
    where p.species_id=v_dex
    order by (
      case
        when (v_name like 'alolan %') then case when p.identifier like '%-alola%' then 400 else -200 end
        when (v_name like 'galarian %') then case when p.identifier like '%-galar%' then 400 else -200 end
        when (v_name like 'hisuian %') then case when p.identifier like '%-hisui%' then 400 else -200 end
        when (v_name like 'paldean %') then case when p.identifier like '%-paldea%' then 400 else -200 end
        when (v_name like 'primal %') then case when p.identifier like '%-primal%' then 400 else -200 end
        when (v_name like '%attack forme%') then case when p.identifier like '%-attack%' then 400 else -200 end
        when (v_name like '%defense forme%') then case when p.identifier like '%-defense%' then 400 else -200 end
        when (v_name like '%speed forme%') then case when p.identifier like '%-speed%' then 400 else -200 end
        when (v_name like '%sky forme%') then case when p.identifier like '%-sky%' then 400 else -200 end
        when (v_name like '%therian forme%') then case when p.identifier like '%-therian%' then 400 else -200 end
        when (v_name like '%origin forme%' or v_name like '%origin form%') then case when p.identifier like '%-origin%' then 400 else -200 end
        when (v_name like 'black kyurem%') then case when p.identifier like '%kyurem-black%' then 400 else -200 end
        when (v_name like 'white kyurem%') then case when p.identifier like '%kyurem-white%' then 400 else -200 end
        when (v_name like '%dusk mane%') then case when p.identifier like '%dusk%' then 400 else -200 end
        when (v_name like '%dawn wings%') then case when p.identifier like '%dawn%' then 400 else -200 end
        when (v_name like '%ultra necrozma%') then case when p.identifier like '%ultra%' then 400 else -200 end
        when (v_name ~ '(^|[[:space:]])m[[:space:]-]' or v_name like '%mega%')
          then case when p.identifier like '%-mega%' then 350 else -200 end
        else case when p.is_default then 180 else 0 end
      end
      +
      case
        when v_dex=6 and (v_name ~ '(^|[[:space:]])m[[:space:]-]' or v_name like '%mega%')
          and 'dragon'=any(v_hints) and p.identifier like '%-mega-x' then 140
        when v_dex=6 and (v_name ~ '(^|[[:space:]])m[[:space:]-]' or v_name like '%mega%')
          and not ('dragon'=any(v_hints)) and p.identifier like '%-mega-y' then 100
        when v_dex=150 and (v_name ~ '(^|[[:space:]])m[[:space:]-]' or v_name like '%mega%')
          and 'fighting'=any(v_hints) and p.identifier like '%-mega-x' then 140
        when v_dex=150 and (v_name ~ '(^|[[:space:]])m[[:space:]-]' or v_name like '%mega%')
          and not ('fighting'=any(v_hints)) and p.identifier like '%-mega-y' then 100
        else 0
      end
      +
      (select count(*)*12 from unnest(p.types) pt where pt=any(v_hints))
    ) desc,
    p.is_default desc,
    p.pokemon_id
    limit 1;

    if v_profile.pokemon_id is null then return null; end if;
  end if;

  return jsonb_build_object(
    'pokemonId',v_profile.pokemon_id,
    'speciesId',v_profile.species_id,
    'identifier',v_profile.identifier,
    'isDefault',v_profile.is_default,
    'types',to_jsonb(v_profile.types),
    'baseHp',v_profile.base_hp,
    'baseAttack',v_profile.base_attack,
    'baseDefense',v_profile.base_defense,
    'baseSpAttack',v_profile.base_sp_attack,
    'baseSpDefense',v_profile.base_sp_defense,
    'baseSpeed',v_profile.base_speed,
    'ability',v_profile.ability,
    'moveIds',to_jsonb(v_profile.move_ids),
    'sourceVersionGroup',v_profile.source_version_group
  );
end;
$function$;

DO $do$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='server_lock_battle_card'
    and p.prokind='f'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'server_lock_battle_card function not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_old:=$old$    if v_profile is null then
      if private.battle_card_rules_ready(p_card_id)
         and not exists(
           select 1
           from public.battle_selections s
           where s.battle_id=b.id
             and not private.battle_card_rules_ready(s.card_id)
         )
      then
        update public.battles set engine_version='tcg_v6',updated_at=now() where id=b.id;
        b.engine_version:='tcg_v6';
      else
        raise exception 'GAME_PROFILE_UNAVAILABLE';
      end if;
    end if;$old$;
  v_new:=$new$    if v_profile is null then
      raise exception 'GAME_PROFILE_UNAVAILABLE';
    end if;$new$;

  if position(v_old in v_def)=0 then
    raise exception 'Expected game_v1 fallback block not found in server_lock_battle_card';
  end if;

  execute replace(v_def,v_old,v_new);
end;
$do$;

ALTER TABLE public.battles
  ALTER COLUMN engine_version SET DEFAULT 'game_v1';

COMMENT ON COLUMN public.battles.engine_version IS
  'Battle rules engine. New battles use game_v1; existing tcg_v6 battles remain compatible.';
