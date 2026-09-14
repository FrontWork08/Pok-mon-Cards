-- Team 3x3 actions are proxied by the team-battle-action Edge Function.
-- The Edge Function validates the player's JWT first, then invokes privileged RPCs
-- with the service-role client while passing the verified user id as p_actor_id.
-- Adventure wrappers previously required auth.uid() = p_actor_id unconditionally,
-- so the service-role hop always failed with FORBIDDEN before the normal Team 3x3
-- fallback could run. The same mismatch also made adventure card filtering fall
-- back to the unrestricted normal Team 3x3 list.
--
-- Keep direct authenticated callers bound to their own auth.uid(), while allowing
-- the already-authenticated service-role Edge Function to pass the verified actor.

do $$
declare
  v_oid oid;
  v_definition text;
  v_updated text;
  v_guard text := E'if auth.uid() is null or auth.uid() is distinct from p_actor_id then\n    raise exception ''FORBIDDEN'';\n  end if;';
  v_service_guard text := E'if auth.role() is distinct from ''service_role'' and (auth.uid() is null or auth.uid() is distinct from p_actor_id) then\n    raise exception ''FORBIDDEN'';\n  end if;';
begin
  foreach v_oid in array array[
    'public.server_set_adventure_battle_team(uuid,uuid,text[])'::regprocedure::oid,
    'public.server_list_adventure_team_battle_cards(uuid,uuid,text,integer,integer)'::regprocedure::oid
  ] loop
    select pg_get_functiondef(v_oid) into v_definition;
    v_updated := replace(v_definition, v_guard, v_service_guard);
    if v_updated = v_definition then
      raise exception 'TEAM3_AUTH_GUARD_NOT_FOUND for function oid %', v_oid;
    end if;
    execute v_updated;
  end loop;
end
$$;
