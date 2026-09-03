do $do$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='server_choose_battle_attack'
    and p.prokind='f'
  order by p.oid
  limit 1;

  if v_oid is null then
    raise exception 'server_choose_battle_attack not found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('private.pokemon_game_fighters' in v_def)>0 then
    execute replace(v_def,'private.pokemon_game_fighters','private.battle_game_fighters');
  elsif position('private.battle_game_fighters' in v_def)=0 then
    raise exception 'battle fighter relation reference missing';
  end if;
end;
$do$;
