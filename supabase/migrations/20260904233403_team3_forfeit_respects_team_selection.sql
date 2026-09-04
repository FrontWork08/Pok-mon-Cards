do $$
declare
  v_def text;
  v_old text := $old$  v_neutral := not exists (
    select 1 from public.battle_selections
    where battle_id=b.id and player_id=p_actor_id
  ) and not exists (
    select 1 from public.battle_draft_cards
    where battle_id=b.id and player_id=p_actor_id
  );$old$;
  v_new text := $new$  v_neutral := not exists (
    select 1 from public.battle_selections
    where battle_id=b.id and player_id=p_actor_id
  ) and not exists (
    select 1 from public.battle_draft_cards
    where battle_id=b.id and player_id=p_actor_id
  ) and not exists (
    select 1 from private.battle_team_members
    where battle_id=b.id and player_id=p_actor_id
  );$new$;
begin
  select pg_get_functiondef('public.server_forfeit_battle(uuid,uuid)'::regprocedure) into v_def;
  if position('private.battle_team_members' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'server_forfeit_battle selection-neutrality anchor not found';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

comment on function public.server_forfeit_battle(uuid,uuid) is
  'Forfeit settles the battle; rating/stat neutrality applies only before the player has selected any battle card, draft card, or Team 3x3 member.';
