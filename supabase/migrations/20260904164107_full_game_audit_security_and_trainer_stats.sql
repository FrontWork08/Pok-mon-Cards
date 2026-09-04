-- Full-game audit fixes: actor binding + trainer battle stats.

create or replace function public.server_abandon_trade(p_actor_id uuid, p_trade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_trade public.trades%rowtype;
  v_card_count integer;
begin
  if auth.role()='anon' then raise exception 'UNAUTHORIZED'; end if;
  if auth.role()='authenticated' and auth.uid() is distinct from p_actor_id then raise exception 'FORBIDDEN'; end if;

  select * into v_trade
  from public.trades
  where id=p_trade_id
  for update;

  if not found then
    return jsonb_build_object('cancelled',false,'reason','not_found');
  end if;

  if p_actor_id<>v_trade.sender_id and p_actor_id<>v_trade.receiver_id then
    raise exception 'NOT_TRADE_PARTICIPANT';
  end if;

  if v_trade.status<>'pending' then
    return jsonb_build_object('cancelled',false,'reason','not_pending','status',v_trade.status);
  end if;

  select count(*) into v_card_count
  from public.trade_cards
  where trade_id=p_trade_id;

  if v_card_count>0 or v_trade.sender_confirmed or v_trade.receiver_confirmed then
    return jsonb_build_object(
      'cancelled',false,
      'reason','has_negotiation',
      'cardRows',v_card_count,
      'senderConfirmed',v_trade.sender_confirmed,
      'receiverConfirmed',v_trade.receiver_confirmed
    );
  end if;

  update public.trades
  set status='cancelled',updated_at=now()
  where id=p_trade_id;

  return jsonb_build_object('cancelled',true,'reason','empty_abandoned');
end;
$$;

create or replace function public.server_cleanup_abandoned_trades(p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
begin
  if auth.role()='anon' then raise exception 'UNAUTHORIZED'; end if;
  if auth.role()='authenticated' and auth.uid() is distinct from p_actor_id then raise exception 'FORBIDDEN'; end if;

  with cancelled as (
    update public.trades t
    set status='cancelled',updated_at=now()
    where t.status='pending'
      and t.sender_id=p_actor_id
      and not t.sender_confirmed
      and not t.receiver_confirmed
      and not exists (
        select 1
        from public.trade_cards tc
        where tc.trade_id=t.id
      )
    returning t.id
  )
  select count(*) into v_count from cancelled;

  return coalesce(v_count,0);
end;
$$;

alter function public.server_release_freeze_simulator(uuid) rename to server_release_freeze_simulator_unchecked;
revoke all on function public.server_release_freeze_simulator_unchecked(uuid) from public,anon,authenticated,service_role;

create function public.server_release_freeze_simulator(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.role()='anon' then raise exception 'UNAUTHORIZED'; end if;
  if auth.role()='authenticated' and auth.uid() is distinct from p_actor_id then raise exception 'FORBIDDEN'; end if;
  return public.server_release_freeze_simulator_unchecked(p_actor_id);
end;
$$;
revoke all on function public.server_release_freeze_simulator(uuid) from public,anon;
grant execute on function public.server_release_freeze_simulator(uuid) to authenticated,service_role;

revoke execute on function public.owner_list_booster_auto_gamepasses() from public,anon;
revoke execute on function public.owner_set_booster_auto_gamepass(uuid[],boolean,text) from public,anon;
grant execute on function public.owner_list_booster_auto_gamepasses() to authenticated,service_role;
grant execute on function public.owner_set_booster_auto_gamepass(uuid[],boolean,text) to authenticated,service_role;

create or replace function public.get_my_trainer_battle_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 return jsonb_build_object(
  'summary',(select jsonb_build_object('wins',battle_wins,'losses',battle_losses,'rating',battle_rating,'bestStreak',best_battle_streak) from public.players where id=v_player),
  'favoritePokemon',(
    select jsonb_build_object('cardId',f.card_id,'name',max(c.pokemon_name),'rounds',count(*),'wins',count(*) filter(where br.winner_id=v_player))
    from private.battle_game_fighters f
    join public.cards c on c.id=f.card_id
    left join public.battle_rounds br on br.battle_id=f.battle_id and br.round_no=f.round_no
    where f.player_id=v_player
    group by f.card_id order by count(*) desc,count(*) filter(where br.winner_id=v_player) desc limit 1
  ),
  'moveStats',coalesce((
    with moves as (
      select coalesce(t.result->'firstMove',t.result->'secondMove') m from private.battle_game_turns t where false
      union all
      select t.result->'firstMove' from private.battle_game_turns t where t.result->'firstMove'->>'playerId'=v_player::text
      union all
      select t.result->'secondMove' from private.battle_game_turns t where t.result->'secondMove'->>'playerId'=v_player::text
    )
    select jsonb_build_object(
      'totalMoves',count(*),
      'criticalHits',count(*) filter(where coalesce((m->>'critical')::boolean,false)),
      'misses',count(*) filter(where coalesce((m->>'hit')::boolean,true)=false),
      'superEffective',count(*) filter(where coalesce((m->>'effectiveness')::numeric,1)>1),
      'immunitiesHit',count(*) filter(where coalesce((m->>'effectiveness')::numeric,1)=0),
      'knockouts',count(*) filter(where coalesce((m->>'targetHpAfter')::integer,1)=0),
      'topMove',(select x.m->>'move' from moves x where x.m is not null group by x.m->>'move' order by count(*) desc limit 1)
    ) from moves
  ),'{}'::jsonb),
  'typePerformance',coalesce((
    select jsonb_agg(jsonb_build_object('type',x.type,'rounds',x.rounds,'wins',x.wins,'winRate',round(x.wins::numeric/greatest(x.rounds,1)*100,1)) order by x.rounds desc)
    from (
      select typ type,count(*) rounds,count(*) filter(where br.winner_id=v_player) wins
      from private.battle_game_fighters f
      cross join lateral unnest(f.types) typ
      left join public.battle_rounds br on br.battle_id=f.battle_id and br.round_no=f.round_no
      where f.player_id=v_player
      group by typ order by count(*) desc limit 18
    ) x
  ),'[]'::jsonb)
 );
end;
$$;
revoke all on function public.get_my_trainer_battle_stats() from public,anon;
grant execute on function public.get_my_trainer_battle_stats() to authenticated,service_role;
