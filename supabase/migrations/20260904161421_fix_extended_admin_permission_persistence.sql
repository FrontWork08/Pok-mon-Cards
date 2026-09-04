-- Ensure every permission exposed by the Admin UI is actually persisted by the owner-only setter.

create or replace function public.server_owner_set_admin_access(
  p_actor_id uuid,
  p_target_id uuid,
  p_enabled boolean,
  p_permissions text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allowed constant text[] := array[
    'audit_users','moderate_users','economy_grant','economy_remove',
    'battlepass_grant','codes_manage','announcements_manage','events_manage',
    'maintenance_manage','guilds_manage','gamepasses_manage','battle_lab_manage',
    'economy_control','feature_flags_manage','feedback_manage','system_health_view'
  ]::text[];
  v_permissions text[];
  v_username text;
  v_action text;
begin
  if not exists (
    select 1 from public.admin_members
    where player_id=p_actor_id and role='owner'
  ) then
    raise exception 'OWNER_ONLY';
  end if;

  if p_target_id is null or p_target_id=p_actor_id then
    raise exception 'INVALID_ADMIN_TARGET';
  end if;

  select username into v_username
  from public.players
  where id=p_target_id;
  if v_username is null then raise exception 'PLAYER_NOT_FOUND'; end if;

  if exists (
    select 1 from public.admin_members
    where player_id=p_target_id and role='owner'
  ) then
    raise exception 'OWNER_IMMUTABLE';
  end if;

  select coalesce(array_agg(distinct permission order by permission),'{}'::text[])
  into v_permissions
  from unnest(coalesce(p_permissions,'{}'::text[])) permission
  where permission=any(v_allowed);

  if p_enabled then
    v_action := case
      when exists(select 1 from public.admin_members where player_id=p_target_id)
        then 'update_permissions'
      else 'grant_admin'
    end;

    insert into public.admin_members(player_id,role)
    values(p_target_id,'admin')
    on conflict(player_id) do update set role='admin';

    insert into private.admin_member_permissions(player_id,permissions,updated_by,updated_at)
    values(p_target_id,v_permissions,p_actor_id,now())
    on conflict(player_id) do update
      set permissions=excluded.permissions,
          updated_by=excluded.updated_by,
          updated_at=excluded.updated_at;
  else
    v_action := 'revoke_admin';
    delete from public.admin_members
    where player_id=p_target_id and role='admin';
    v_permissions := '{}'::text[];
  end if;

  insert into private.admin_access_audit(actor_id,target_id,action,permissions)
  values(p_actor_id,p_target_id,v_action,v_permissions);

  return jsonb_build_object(
    'targetId',p_target_id,
    'username',v_username,
    'enabled',p_enabled,
    'permissions',to_jsonb(v_permissions),
    'action',v_action
  );
end;
$$;

revoke all on function public.server_owner_set_admin_access(uuid,uuid,boolean,text[]) from public,anon,authenticated;
grant execute on function public.server_owner_set_admin_access(uuid,uuid,boolean,text[]) to service_role;
