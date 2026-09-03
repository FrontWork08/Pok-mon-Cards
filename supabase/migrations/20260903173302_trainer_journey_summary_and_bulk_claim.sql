
create or replace function public.get_trainer_journey_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_steps text[]:=array[
    'first_pack','collector_25','first_deck','first_battle','first_win','first_trade',
    'first_friend','join_guild','pokedex_50','wins_10','complete_set','achievements_10',
    'kanto_complete','seasons_3','pokedex_250','wins_50'
  ];
  v_step text;
  v_state jsonb;
  v_current jsonb:=null;
  v_total integer:=cardinality(v_steps);
  v_completed integer:=0;
  v_claimed integer:=0;
  v_claimable integer:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  foreach v_step in array v_steps loop
    v_state:=private.trainer_journey_step_state(v_player,v_step);
    if coalesce((v_state->>'completed')::boolean,false) then
      v_completed:=v_completed+1;
    end if;

    if exists(
      select 1 from public.trainer_journey_claims c
      where c.player_id=v_player and c.step_id=v_step
    ) then
      v_claimed:=v_claimed+1;
      continue;
    end if;

    if coalesce((v_state->>'completed')::boolean,false) then
      v_claimable:=v_claimable+1;
    end if;

    if v_current is null then
      v_current:=v_state;
    end if;
  end loop;

  return jsonb_build_object(
    'total',v_total,
    'completed',v_completed,
    'claimed',v_claimed,
    'claimable',v_claimable,
    'currentStep',v_current,
    'allClaimed',v_claimed=v_total
  );
end;
$function$;

create or replace function public.claim_all_trainer_journey_rewards()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_steps text[]:=array[
    'first_pack','collector_25','first_deck','first_battle','first_win','first_trade',
    'first_friend','join_guild','pokedex_50','wins_10','complete_set','achievements_10',
    'kanto_complete','seasons_3','pokedex_250','wins_50'
  ];
  v_step text;
  v_state jsonb;
  v_coins bigint:=0;
  v_diamonds integer:=0;
  v_count integer:=0;
  v_inserted integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  foreach v_step in array v_steps loop
    if exists(
      select 1 from public.trainer_journey_claims c
      where c.player_id=v_player and c.step_id=v_step
    ) then
      continue;
    end if;

    v_state:=private.trainer_journey_step_state(v_player,v_step);
    if not coalesce((v_state->>'completed')::boolean,false) then
      continue;
    end if;

    insert into public.trainer_journey_claims(player_id,step_id,reward_coins,reward_diamonds)
    values(
      v_player,
      v_step,
      coalesce((v_state->>'rewardCoins')::bigint,0),
      coalesce((v_state->>'rewardDiamonds')::integer,0)
    )
    on conflict(player_id,step_id) do nothing;

    get diagnostics v_inserted=row_count;
    if v_inserted=1 then
      v_count:=v_count+1;
      v_coins:=v_coins+coalesce((v_state->>'rewardCoins')::bigint,0);
      v_diamonds:=v_diamonds+coalesce((v_state->>'rewardDiamonds')::integer,0);
    end if;
  end loop;

  if v_count=0 then
    return jsonb_build_object('claimedCount',0,'coins',0,'diamonds',0);
  end if;

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds
  where id=v_player;

  perform public.server_queue_notification(
    v_player,
    'trainer_journey',
    'Recompensas da Jornada coletadas',
    v_count||' etapa(s) • +'||v_coins||' Coins'||
      case when v_diamonds>0 then ' + '||v_diamonds||' Diamante(s)' else '' end,
    jsonb_build_object('claimedCount',v_count,'coins',v_coins,'diamonds',v_diamonds,'route','/career')
  );

  return jsonb_build_object('claimedCount',v_count,'coins',v_coins,'diamonds',v_diamonds);
end;
$function$;

revoke all on function public.get_trainer_journey_summary() from public;
grant execute on function public.get_trainer_journey_summary() to authenticated;
revoke all on function public.claim_all_trainer_journey_rewards() from public;
grant execute on function public.claim_all_trainer_journey_rewards() to authenticated;
