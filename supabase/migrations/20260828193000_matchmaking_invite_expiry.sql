-- Matchmaking reliability fix.
-- 1) Expire unanswered battle invites after 15 minutes so they do not block ranked queue forever.
-- 2) Clean a player's stale invites before joining matchmaking.
-- Existing stake refund/cancellation logic is reused through server_cancel_battle.

create or replace function public.server_matchmaking_join(p_player_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rating integer;
  v_status text;
  v_until timestamptz;
  v_can_draft boolean;
  v_season text;
  v_opponent public.matchmaking_queue%rowtype;
  v_mode text;
  v_battle uuid;
  v_rounds integer;
  v_stale record;
begin
  if p_mode not in ('quick','mystery','draft3') then raise exception 'INVALID_MODE'; end if;
  perform pg_advisory_xact_lock(hashtext('pokemon-cards-global-matchmaking'));

  select battle_rating,account_status,suspended_until
  into v_rating,v_status,v_until
  from public.players
  where id=p_player_id
  for update;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_status='banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status='suspended' and v_until is not null and v_until>now() then raise exception 'ACCOUNT_SUSPENDED'; end if;

  for v_stale in
    select id
    from public.battles
    where status='invited'
      and created_at<=now()-interval '15 minutes'
      and p_player_id in (challenger_id,opponent_id)
    order by created_at
  loop
    begin
      perform public.server_cancel_battle(p_player_id,v_stale.id);
    exception when others then
      null;
    end;
  end loop;

  if exists(
    select 1
    from public.battles
    where status in ('invited','drafting','selecting')
      and p_player_id in (challenger_id,opponent_id)
  ) then
    raise exception 'ACTIVE_BATTLE_EXISTS';
  end if;

  select count(*)>=3 into v_can_draft
  from public.player_cards
  where player_id=p_player_id and quantity>0;

  if p_mode='draft3' and not v_can_draft then raise exception 'DRAFT_NEEDS_3_CARDS'; end if;

  v_season:=private.current_season_id();

  insert into public.matchmaking_queue(
    player_id,mode_choice,status,rating_snapshot,can_draft,season_id,
    matched_battle_id,joined_at,updated_at
  )
  values(
    p_player_id,p_mode,'waiting',v_rating,v_can_draft,v_season,
    null,now(),now()
  )
  on conflict(player_id) do update
  set mode_choice=excluded.mode_choice,
      status='waiting',
      rating_snapshot=excluded.rating_snapshot,
      can_draft=excluded.can_draft,
      season_id=excluded.season_id,
      matched_battle_id=null,
      joined_at=case
        when public.matchmaking_queue.status='waiting'
          then public.matchmaking_queue.joined_at
        else now()
      end,
      updated_at=now();

  select q.* into v_opponent
  from public.matchmaking_queue q
  join public.players p on p.id=q.player_id
  where q.status='waiting'
    and q.player_id<>p_player_id
    and p.account_status='active'
    and abs(q.rating_snapshot-v_rating)
      <=250+least(1000,floor(extract(epoch from (now()-q.joined_at))/30)::integer*75)
  order by abs(q.rating_snapshot-v_rating),q.joined_at
  for update of q skip locked
  limit 1;

  if v_opponent.player_id is null then
    return jsonb_build_object(
      'status','waiting',
      'modeChoice',p_mode,
      'seasonId',v_season
    );
  end if;

  if v_opponent.mode_choice=p_mode then
    v_mode:=p_mode;
  elsif (v_opponent.mode_choice='draft3' or p_mode='draft3')
    and not (v_opponent.can_draft and v_can_draft)
  then
    v_mode:=case when p_mode='draft3' then v_opponent.mode_choice else p_mode end;
  else
    v_mode:=case when random()<0.5 then v_opponent.mode_choice else p_mode end;
  end if;

  v_rounds:=case when v_mode in ('mystery','draft3') then 2 else 1 end;

  insert into public.battles(
    challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,
    selection_deadline,draft_turn_id,draft_pick_count,is_ranked,season_id
  )
  values(
    v_opponent.player_id,p_player_id,v_mode,'none',0,
    case when v_mode='draft3' then 'drafting' else 'selecting' end,
    v_rounds,
    now()+case when v_mode='draft3' then interval '90 seconds' else interval '30 seconds' end,
    case when v_mode='draft3' then v_opponent.player_id else null end,
    0,true,v_season
  )
  returning id into v_battle;

  update public.matchmaking_queue
  set status='matched',matched_battle_id=v_battle,updated_at=now()
  where player_id in (p_player_id,v_opponent.player_id);

  if v_season is not null then
    insert into public.player_seasons(season_id,player_id)
    values(v_season,p_player_id),(v_season,v_opponent.player_id)
    on conflict do nothing;
  end if;

  insert into public.battle_events(battle_id,event_type,payload)
  values(
    v_battle,
    'matchmade',
    jsonb_build_object(
      'mode',v_mode,
      'challengerChoice',v_opponent.mode_choice,
      'opponentChoice',p_mode,
      'seasonId',v_season
    )
  );

  if v_mode='draft3' then
    insert into public.battle_events(battle_id,event_type,payload)
    values(
      v_battle,
      'draft_started',
      jsonb_build_object('turnPlayerId',v_opponent.player_id,'draftSeconds',90)
    );
  else
    insert into public.battle_events(battle_id,event_type,payload)
    values(
      v_battle,
      'started',
      jsonb_build_object('round',1,'selectionSeconds',30)
    );
  end if;

  perform public.server_queue_notification(
    v_opponent.player_id,
    'match_found',
    'Partida encontrada!',
    'Um adversário foi encontrado no matchmaking.',
    jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
  );

  perform public.server_queue_notification(
    p_player_id,
    'match_found',
    'Partida encontrada!',
    'Um adversário foi encontrado no matchmaking.',
    jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
  );

  return jsonb_build_object(
    'status','matched',
    'battleId',v_battle,
    'mode',v_mode,
    'seasonId',v_season
  );
end;
$$;

create or replace function public.server_process_expired_battles()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  b public.battles%rowtype;
  v_result jsonb;
  v_processed integer:=0;
begin
  for r in
    select id,challenger_id
    from public.battles
    where status='invited'
      and created_at<=now()-interval '15 minutes'
    order by created_at asc
    limit 50
  loop
    begin
      perform public.server_cancel_battle(r.challenger_id,r.id);
      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(
          r.id,
          'worker_error',
          jsonb_build_object('message',sqlerrm,'stage','expire_invite')
        );
      exception when others then null;
      end;
    end;
  end loop;

  for r in
    select id
    from public.battles
    where status in ('drafting','selecting')
      and selection_deadline is not null
      and selection_deadline<=now()
    order by selection_deadline asc
    limit 50
  loop
    begin
      select * into b from public.battles where id=r.id;
      v_result:=public.server_timeout_battle(b.challenger_id,b.id);
      select * into b from public.battles where id=r.id;

      if b.status='selecting' and exists(
        select 1
        from public.battle_selections s
        where s.battle_id=b.id
          and s.round_no=b.active_round
        group by s.battle_id,s.round_no
        having count(*)=2
      ) then
        perform public.server_resolve_battle_round(b.id);
      end if;

      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm));
      exception when others then null;
      end;
    end;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.server_matchmaking_join(uuid,text) from public,anon,authenticated;
grant execute on function public.server_matchmaking_join(uuid,text) to service_role;

revoke all on function public.server_process_expired_battles() from public,anon,authenticated;
grant execute on function public.server_process_expired_battles() to service_role;
