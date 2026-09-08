create or replace function private.create_adventure_team3_battle(
  p_player uuid,
  p_kind text,
  p_ref_id text,
  p_run_id uuid,
  p_target integer,
  p_style text,
  p_team text[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_battle uuid;
  v_bot uuid;
  v_owned integer;
  v_modifier text;
  v_attempts integer;
  v_active_battle uuid;
  v_active_kind text;
  v_active_ref_id text;
  v_active_target integer;
  v_active_style text;
  v_active_modifier text;
begin
  select b.id
  into v_active_battle
  from public.battles b
  where b.status in ('invited','drafting','selecting','revealing')
    and p_player in (b.challenger_id,b.opponent_id)
  order by b.created_at desc
  limit 1;

  if v_active_battle is not null then
    select abc.kind, abc.ref_id, abc.target_power, abc.ai_style, abc.modifier
    into v_active_kind, v_active_ref_id, v_active_target, v_active_style, v_active_modifier
    from public.adventure_battle_context abc
    where abc.battle_id = v_active_battle
      and abc.player_id = p_player
    limit 1;

    if v_active_kind is not null then
      return jsonb_build_object(
        'battleId', v_active_battle,
        'mode', 'team3',
        'route', '/team-battle/' || v_active_battle::text,
        'kind', v_active_kind,
        'refId', v_active_ref_id,
        'targetPower', v_active_target,
        'aiStyle', v_active_style,
        'modifier', v_active_modifier,
        'resumed', true
      );
    end if;

    raise exception 'ACTIVE_BATTLE_EXISTS';
  end if;

  if p_kind='raid' then
    select count(*) into v_attempts from public.adventure_battle_context
    where player_id=p_player and kind='raid' and ref_id=p_ref_id and created_at>=date_trunc('day',now());
    if v_attempts>=5 then raise exception 'RAID_DAILY_LIMIT_REACHED'; end if;
  elsif p_kind='world_event' then
    select count(*) into v_attempts from public.adventure_battle_context
    where player_id=p_player and kind='world_event' and ref_id=p_ref_id;
    if v_attempts>=3 then raise exception 'WORLD_EVENT_ATTEMPT_LIMIT_REACHED'; end if;
  elsif p_kind='champion' then
    select count(*) into v_attempts from public.adventure_battle_context
    where player_id=p_player and kind='champion' and created_at>=date_trunc('day',now());
    if v_attempts>=3 then raise exception 'CHAMPION_DAILY_LIMIT_REACHED'; end if;
  end if;

  select count(*) into v_owned from public.player_cards pc
  where pc.player_id=p_player and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null;
  if v_owned<3 then raise exception 'TEAM_NEEDS_3_GAME_CARDS'; end if;
  if coalesce(cardinality(p_team),0)<>3 then raise exception 'ADVENTURE_TEAM_UNAVAILABLE'; end if;

  v_bot:=private.adventure_choose_bot(p_target);
  if v_bot is null then raise exception 'ADVENTURE_BOT_UNAVAILABLE'; end if;

  if p_kind='tower' then
    v_modifier:=case
      when coalesce(nullif(p_ref_id,''),'1')::integer%10=0 then 'boss_hp'
      when coalesce(nullif(p_ref_id,''),'1')::integer%7=0 then 'speed_field'
      when coalesce(nullif(p_ref_id,''),'1')::integer%5=0 then 'power_field'
      when coalesce(nullif(p_ref_id,''),'1')::integer%3=0 then 'guard_field'
      else null
    end;
  end if;

  insert into public.player_cards(player_id,card_id,quantity,first_obtained_at)
  select v_bot,cid,1,now() from unnest(p_team) cid
  on conflict(player_id,card_id) do update set quantity=greatest(public.player_cards.quantity,1);

  insert into public.battles(
    challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,
    selection_deadline,draft_turn_id,draft_pick_count,is_ranked,is_bot_match,
    engine_version,reward_eligible
  )
  values(
    p_player,v_bot,'team3','none',0,'drafting',1,now()+interval '180 seconds',
    null,0,false,true,'game_v1',false
  )
  returning id into v_battle;

  insert into private.battle_team_state(battle_id,player_id)
  values(v_battle,p_player),(v_battle,v_bot) on conflict do nothing;

  insert into public.adventure_battle_context(
    battle_id,player_id,kind,ref_id,run_id,difficulty,target_power,ai_style,modifier
  )
  values(
    v_battle,p_player,p_kind,p_ref_id,p_run_id,greatest(1,(p_target-280)/35),
    p_target,coalesce(nullif(p_style,''),'balanced'),v_modifier
  );

  perform public.server_set_battle_team(v_bot,v_battle,p_team);
  insert into public.battle_events(battle_id,event_type,payload)
  values(
    v_battle,
    'adventure_started',
    jsonb_build_object(
      'kind',p_kind,
      'refId',p_ref_id,
      'targetPower',p_target,
      'aiStyle',p_style,
      'modifier',v_modifier,
      'teamSize',3
    )
  );

  return jsonb_build_object(
    'battleId',v_battle,
    'mode','team3',
    'route','/team-battle/'||v_battle::text,
    'kind',p_kind,
    'refId',p_ref_id,
    'targetPower',p_target,
    'aiStyle',p_style,
    'modifier',v_modifier,
    'resumed',false
  );
end;
$function$;
