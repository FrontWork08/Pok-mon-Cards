-- Make every game_v1 battle use the same manual Pokemon-style attack phase.
-- TCG compatibility battles keep their previous draft3-only manual attack behavior.

create or replace function private.battle_start_attack_selection(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  b public.battles%rowtype;
  v_count integer;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;

  if b.mode<>'draft3' and b.engine_version<>'game_v1' then
    return jsonb_build_object('required',false,'status',b.status);
  end if;

  if b.status='revealing' then
    return jsonb_build_object('required',true,'status','revealing','round',b.active_round);
  end if;

  if b.status<>'selecting' then
    return jsonb_build_object('required',false,'status',b.status);
  end if;

  select count(*) into v_count
  from public.battle_selections s
  where s.battle_id=b.id and s.round_no=b.active_round;

  if v_count<2 then
    return jsonb_build_object('required',false,'waitingForCards',true,'count',v_count);
  end if;

  update public.battles
  set status='revealing',
      selection_deadline=now()+make_interval(secs=>selection_seconds),
      updated_at=now()
  where id=b.id;

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    b.id,'attack_selection_started',
    jsonb_build_object(
      'round',b.active_round,
      'selectionSeconds',b.selection_seconds,
      'engineVersion',b.engine_version,
      'mode',b.mode
    )
  );

  return jsonb_build_object(
    'required',true,
    'status','revealing',
    'round',b.active_round,
    'selectionSeconds',b.selection_seconds,
    'engineVersion',b.engine_version
  );
end;
$$;

create or replace function private.battle_game_bot_attack_if_needed(p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  b public.battles%rowtype;
  v_bot uuid;
  v_move integer;
  v_attack text;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.engine_version<>'game_v1' or b.status<>'revealing' or not coalesce(b.is_bot_match,false) then
    return jsonb_build_object('acted',false,'status',b.status);
  end if;

  select p.id into v_bot
  from public.players p
  where p.id in (b.challenger_id,b.opponent_id) and p.is_bot=true
  limit 1;

  if v_bot is null then
    return jsonb_build_object('acted',false,'reason','bot_missing');
  end if;

  if exists(
    select 1 from private.battle_attack_choices a
    where a.battle_id=b.id and a.round_no=b.active_round and a.player_id=v_bot
  ) then
    return jsonb_build_object('acted',false,'reason','already_locked');
  end if;

  perform private.battle_game_init_fighters(b.id,b.active_round);
  v_move:=private.battle_game_pick_best_move(b.id,b.active_round,v_bot);
  select identifier into v_attack from private.pokemon_game_moves where move_id=v_move;
  v_attack:=coalesce(v_attack,'struggle');

  insert into private.battle_attack_choices(battle_id,round_no,player_id,attack_name)
  values(b.id,b.active_round,v_bot,v_attack)
  on conflict do nothing;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'attack_locked',jsonb_build_object(
    'playerId',v_bot,'round',b.active_round,'bot',true,
    'engineVersion','game_v1'
  ));

  return jsonb_build_object('acted',true,'kind','attack','round',b.active_round,'attack',v_attack);
end;
$$;

revoke all on function private.battle_game_bot_attack_if_needed(uuid) from public, anon, authenticated;
grant execute on function private.battle_game_bot_attack_if_needed(uuid) to service_role;

do $$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_lock_battle_card' limit 1;
  if v_oid is null then raise exception 'server_lock_battle_card missing'; end if;
  v_def:=pg_get_functiondef(v_oid);
  v_old:='if b.mode=''draft3'' and v_count=2 then';
  v_new:='if (b.mode=''draft3'' or b.engine_version=''game_v1'') and v_count=2 then';
  if position(v_old in v_def)=0 then raise exception 'server_lock_battle_card patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_choose_battle_attack' limit 1;
  if v_oid is null then raise exception 'server_choose_battle_attack missing'; end if;
  v_def:=pg_get_functiondef(v_oid);
  v_old:='if b.mode<>''draft3'' or b.status<>''revealing'' then raise exception ''INVALID_STATUS''; end if;';
  v_new:='if b.status<>''revealing'' or (b.engine_version<>''game_v1'' and b.mode<>''draft3'') then raise exception ''INVALID_STATUS''; end if;';
  if position(v_old in v_def)=0 then raise exception 'server_choose_battle_attack status patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  v_old:='if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;';
  v_new:='if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
    if b.engine_version=''game_v1'' then
      perform private.battle_game_bot_attack_if_needed(b.id);
    end if;
  end if;';
  if position(v_old in v_def)=0 then raise exception 'server_choose_battle_attack bot patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_get_battle_attack_state_base' limit 1;
  if v_oid is null then raise exception 'server_get_battle_attack_state_base missing'; end if;
  v_def:=pg_get_functiondef(v_oid);
  v_old:='''required'',b.mode=''draft3'' and b.status=''revealing''';
  v_new:='''required'',b.status=''revealing'' and (b.engine_version=''game_v1'' or b.mode=''draft3'')';
  if position(v_old in v_def)=0 then raise exception 'attack state required patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_resolve_battle_round' limit 1;
  if v_oid is null then raise exception 'server_resolve_battle_round missing'; end if;
  v_def:=pg_get_functiondef(v_oid);

  v_old:='if b.mode=''draft3'' then
      if b.status<>''revealing'' then
        return jsonb_build_object(
          ''alreadyResolved'',b.status not in (''selecting'',''revealing''),
          ''attackSelectionRequired'',b.status=''selecting'',
          ''engineVersion'',''game_v1''
        );
      end if;
    elsif b.status<>''selecting'' then
      return jsonb_build_object(''alreadyResolved'',true,''engineVersion'',''game_v1'');
    end if;';
  v_new:='if b.status not in (''selecting'',''revealing'') then
      return jsonb_build_object(''alreadyResolved'',true,''engineVersion'',''game_v1'');
    end if;';
  if position(v_old in v_def)=0 then raise exception 'resolve status patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:='perform private.battle_game_init_fighters(b.id,b.active_round);

    if b.mode=''draft3'' then
      select attack_name into c_attack
      from private.battle_attack_choices
      where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

      select attack_name into o_attack
      from private.battle_attack_choices
      where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

      if c_attack is null or o_attack is null then
        return jsonb_build_object(
          ''waitingForAttacks'',true,
          ''round'',b.active_round,
          ''challengerAttackLocked'',c_attack is not null,
          ''opponentAttackLocked'',o_attack is not null,
          ''engineVersion'',''game_v1''
        );
      end if;

      v_sim:=private.battle_game_resolve_turn_core(b.id);
    else
      v_sim:=private.battle_game_auto_duel(b.id);
    end if;';
  v_new:='perform private.battle_game_init_fighters(b.id,b.active_round);

    if b.status=''selecting'' then
      perform private.battle_start_attack_selection(b.id);
      if b.is_bot_match then
        perform private.battle_game_bot_attack_if_needed(b.id);
      end if;
      return jsonb_build_object(
        ''attackSelectionRequired'',true,
        ''round'',b.active_round,
        ''status'',''revealing'',
        ''engineVersion'',''game_v1''
      );
    end if;

    select attack_name into c_attack
    from private.battle_attack_choices
    where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

    select attack_name into o_attack
    from private.battle_attack_choices
    where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

    if c_attack is null or o_attack is null then
      return jsonb_build_object(
        ''waitingForAttacks'',true,
        ''round'',b.active_round,
        ''challengerAttackLocked'',c_attack is not null,
        ''opponentAttackLocked'',o_attack is not null,
        ''engineVersion'',''game_v1''
      );
    end if;

    v_sim:=private.battle_game_resolve_turn_core(b.id);';
  if position(v_old in v_def)=0 then raise exception 'resolve manual attack patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:='if b.is_bot_match then
        perform private.ranked_bot_take_turn(b.id);
      end if;';
  v_new:='if b.is_bot_match then
        perform private.ranked_bot_take_turn(b.id);
        perform private.battle_game_bot_attack_if_needed(b.id);
      end if;';
  if position(v_old in v_def)=0 then raise exception 'resolve continuation bot patch point missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_def:=replace(v_def,'''manualAttackSelection'',b.mode=''draft3''','''manualAttackSelection'',true');
  execute v_def;
end;
$$;