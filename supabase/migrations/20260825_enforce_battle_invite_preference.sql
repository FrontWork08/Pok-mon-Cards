create or replace function public.server_create_battle(p_actor_id uuid,p_opponent_id uuid,p_mode text,p_stake_type text,p_wager_coins bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_rounds integer;v_invites boolean;
begin
  if p_actor_id=p_opponent_id then raise exception 'INVALID_PLAYER';end if;
  if p_mode not in('quick','mystery') then raise exception 'INVALID_MODE';end if;
  if p_stake_type not in('none','coins') then raise exception 'STAKE_NOT_AVAILABLE';end if;
  if p_stake_type='none' then p_wager_coins:=0;end if;
  if p_stake_type='coins' and(p_wager_coins<100 or p_wager_coins>5000) then raise exception 'INVALID_WAGER';end if;
  if not exists(select 1 from friendships f where f.status::text='accepted' and ((f.requester_id=p_actor_id and f.addressee_id=p_opponent_id) or (f.requester_id=p_opponent_id and f.addressee_id=p_actor_id))) then raise exception 'NOT_FRIENDS';end if;
  select battle_invites into v_invites from player_settings where player_id=p_opponent_id;
  if v_invites is false then raise exception 'BATTLE_INVITES_DISABLED';end if;
  if p_stake_type='coins' and ((select coins from players where id=p_actor_id)<p_wager_coins or (select coins from players where id=p_opponent_id)<p_wager_coins) then raise exception 'NOT_ENOUGH_COINS';end if;
  v_rounds:=case when p_mode='mystery' then 2 else 1 end;
  insert into battles(challenger_id,opponent_id,mode,stake_type,wager_coins,rounds_to_win) values(p_actor_id,p_opponent_id,p_mode,p_stake_type,p_wager_coins,v_rounds) returning id into v_id;
  insert into battle_events(battle_id,event_type,payload) values(v_id,'invited',jsonb_build_object('challengerId',p_actor_id,'opponentId',p_opponent_id,'mode',p_mode,'stakeType',p_stake_type,'wagerCoins',p_wager_coins));
  return v_id;
end$$;
revoke all on function public.server_create_battle(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.server_create_battle(uuid,uuid,text,text,bigint) to service_role;
