-- Keep the 24-hour battle anti-farm window from leaking Beta matches into 1.0.
-- Preserve the latest battle implementation verbatim and only clamp its history window
-- to the Trainer Collection release progression epoch.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='server_finish_battle_round'
    and pg_get_function_identity_arguments(p.oid) =
      'p_battle_id uuid, p_round_no integer, p_challenger_power numeric, p_opponent_power numeric, p_challenger_roll numeric, p_opponent_roll numeric, p_winner_id uuid'
  limit 1;

  if v_oid is null then
    raise exception 'SERVER_FINISH_BATTLE_ROUND_NOT_FOUND';
  end if;

  select pg_get_functiondef(v_oid) into v_def;
  v_new := replace(
    v_def,
    'x.completed_at >= now() - interval ''24 hours''',
    'x.completed_at >= greatest(now() - interval ''24 hours'', private.release_progress_epoch())'
  );
  if v_new=v_def then
    v_new := replace(
      v_def,
      'x.completed_at>=now()-interval ''24 hours''',
      'x.completed_at>=greatest(now()-interval ''24 hours'',private.release_progress_epoch())'
    );
  end if;
  if v_new=v_def then
    raise exception 'SERVER_FINISH_BATTLE_ROUND_ANTIFARM_PATTERN_NOT_FOUND';
  end if;
  execute v_new;

  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='server_forfeit_battle'
    and pg_get_function_identity_arguments(p.oid) =
      'p_actor_id uuid, p_battle_id uuid'
  limit 1;

  if v_oid is null then
    raise exception 'SERVER_FORFEIT_BATTLE_NOT_FOUND';
  end if;

  select pg_get_functiondef(v_oid) into v_def;
  v_new := replace(
    v_def,
    'x.completed_at >= now() - interval ''24 hours''',
    'x.completed_at >= greatest(now() - interval ''24 hours'', private.release_progress_epoch())'
  );
  if v_new=v_def then
    v_new := replace(
      v_def,
      'x.completed_at>=now()-interval ''24 hours''',
      'x.completed_at>=greatest(now()-interval ''24 hours'',private.release_progress_epoch())'
    );
  end if;
  if v_new=v_def then
    raise exception 'SERVER_FORFEIT_BATTLE_ANTIFARM_PATTERN_NOT_FOUND';
  end if;
  execute v_new;
end
$migration$;
