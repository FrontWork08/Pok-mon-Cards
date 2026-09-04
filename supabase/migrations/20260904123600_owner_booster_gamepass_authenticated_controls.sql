create or replace function public.owner_set_booster_auto_gamepass(
  p_target_ids uuid[],
  p_enabled boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_count integer:=0;
  v_items jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.admin_members where player_id=v_actor and role='owner') then raise exception 'OWNER_ONLY'; end if;
  if coalesce(array_length(p_target_ids,1),0)<1 or array_length(p_target_ids,1)>100 then raise exception 'INVALID_TARGETS'; end if;
  if exists(select 1 from unnest(p_target_ids) t(id) left join public.players p on p.id=t.id where p.id is null) then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.player_gamepasses(player_id,gamepass_id,active,granted_by,granted_at,updated_at,note)
  select distinct id,'booster_auto_open',coalesce(p_enabled,false),v_actor,now(),now(),left(nullif(trim(coalesce(p_note,'')),''),300)
  from unnest(p_target_ids) t(id)
  on conflict(player_id,gamepass_id) do update set
    active=excluded.active,
    granted_by=excluded.granted_by,
    granted_at=case when excluded.active then now() else public.player_gamepasses.granted_at end,
    updated_at=now(),
    note=excluded.note;

  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'username',p.username,'active',coalesce(p_enabled,false)
  ) order by p.username),'[]'::jsonb)
  into v_count,v_items
  from public.players p
  where p.id=any(p_target_ids);

  return jsonb_build_object(
    'gamepassId','booster_auto_open',
    'enabled',coalesce(p_enabled,false),
    'recipientCount',v_count,
    'recipients',v_items
  );
end;
$function$;

grant execute on function public.owner_set_booster_auto_gamepass(uuid[],boolean,text) to authenticated;

create or replace function public.owner_list_booster_auto_gamepasses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.admin_members where player_id=v_actor and role='owner') then raise exception 'OWNER_ONLY'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'playerId',g.player_id,
      'username',p.username,
      'active',g.active,
      'grantedAt',g.granted_at,
      'updatedAt',g.updated_at,
      'note',g.note
    ) order by p.username)
    from public.player_gamepasses g
    join public.players p on p.id=g.player_id
    where g.gamepass_id='booster_auto_open'
  ),'[]'::jsonb);
end;
$function$;

grant execute on function public.owner_list_booster_auto_gamepasses() to authenticated;
