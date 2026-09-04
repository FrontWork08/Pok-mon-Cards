-- Prevent authenticated admins from spoofing another admin/owner UUID in RPCs that accept p_actor_id.
-- Service-role calls remain possible for trusted server-side flows.

create or replace function private.admin_has_permission(p_actor_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when auth.role()='anon' then false
    when auth.role()='authenticated' and auth.uid() is distinct from p_actor_id then false
    else exists (
      select 1
      from public.admin_members am
      left join private.admin_member_permissions amp on amp.player_id=am.player_id
      where am.player_id=p_actor_id
        and (
          am.role='owner'
          or p_permission=any(coalesce(amp.permissions,'{}'::text[]))
        )
    )
  end;
$$;
