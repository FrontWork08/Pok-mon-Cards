create or replace function private.claim_daily_login_for_player(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.player_login_streaks%rowtype;
  v_streak integer;
  v_day integer;
  v_coins bigint;
  v_diamonds integer;
begin
  if p_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.players p where p.id=p_player and p.account_status='active') then
    raise exception 'PLAYER_NOT_AVAILABLE';
  end if;

  insert into public.player_login_streaks(player_id)
  values(p_player)
  on conflict(player_id) do nothing;

  select * into v_row
  from public.player_login_streaks
  where player_id=p_player
  for update;

  if v_row.last_claim_date = current_date then
    return jsonb_build_object(
      'claimed',false,'streak',v_row.current_streak,'bestStreak',v_row.best_streak,
      'coins',0,'diamonds',0,'nextClaimDate',current_date+1
    );
  end if;

  v_streak := case
    when v_row.last_claim_date = current_date - 1 then v_row.current_streak + 1
    else 1
  end;
  v_day := ((v_streak - 1) % 7) + 1;
  v_coins := case v_day
    when 1 then 1000 when 2 then 1500 when 3 then 2000 when 4 then 2500
    when 5 then 3000 when 6 then 4000 else 5000 end;
  v_diamonds := case when v_day=7 then 1 else 0 end;

  update public.player_login_streaks
  set current_streak=v_streak,
      best_streak=greatest(best_streak,v_streak),
      total_claims=total_claims+1,
      last_claim_date=current_date,
      updated_at=now()
  where player_id=p_player;

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds,
      last_daily_claim_at=now()
  where id=p_player;

  perform public.server_queue_notification(
    p_player,'daily_streak','Sequência diária 🔥',
    'Dia '||v_day||' do ciclo: +'||v_coins||' Coins'||case when v_diamonds>0 then ' e +1 Diamante.' else '.' end,
    jsonb_build_object('streak',v_streak,'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds)
  );

  return jsonb_build_object(
    'claimed',true,'streak',v_streak,'bestStreak',greatest(v_row.best_streak,v_streak),
    'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds,'nextClaimDate',current_date+1
  );
end;
$function$;

create or replace function private.claim_daily_login()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid := auth.uid();
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return private.claim_daily_login_for_player(v_player);
end;
$function$;

create or replace function public.server_claim_daily_reward(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_coins bigint;
  v_xp bigint;
  v_level integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;

  v_result := private.claim_daily_login_for_player(p_player_id);
  if not coalesce((v_result->>'claimed')::boolean,false) then
    raise exception 'DAILY_NOT_READY';
  end if;

  select p.coins,p.xp,p.level into v_coins,v_xp,v_level
  from public.players p where p.id=p_player_id;

  return jsonb_build_object(
    'coins',v_coins,
    'xp',v_xp,
    'level',v_level,
    'rewardCoins',coalesce((v_result->>'coins')::bigint,0),
    'rewardXp',0,
    'rewardDiamonds',coalesce((v_result->>'diamonds')::integer,0),
    'streak',coalesce((v_result->>'streak')::integer,0),
    'cycleDay',coalesce((v_result->>'cycleDay')::integer,0),
    'claimedAt',now()
  );
end;
$function$;

revoke all on function private.claim_daily_login_for_player(uuid) from public,anon,authenticated;
revoke all on function private.claim_daily_login() from public,anon;
grant execute on function private.claim_daily_login() to authenticated;
revoke all on function public.server_claim_daily_reward(uuid) from public,anon,authenticated;
grant execute on function public.server_claim_daily_reward(uuid) to service_role;
