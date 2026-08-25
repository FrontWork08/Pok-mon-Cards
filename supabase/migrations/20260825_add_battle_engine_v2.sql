-- Battle engine v2: secure card/coin escrow, ELO, anti-farm and distinct-species missions.
create or replace function public.server_return_card_stakes(p_battle_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  insert into player_cards(player_id,card_id,quantity)
  select player_id,card_id,sum(quantity)::integer from battle_card_stakes where battle_id=p_battle_id and status='held' group by player_id,card_id
  on conflict(player_id,card_id) do update set quantity=player_cards.quantity+excluded.quantity;
  update battle_card_stakes set status='refunded',updated_at=now() where battle_id=p_battle_id and status='held';
  get diagnostics v_count=row_count;return v_count;
end $$;

create or replace function public.battle_rarity_bonus(p_rarity text)
returns numeric language plpgsql immutable as $$
declare s text:=lower(coalesce(p_rarity,''));
begin
  if s like '%hyper%' or s like '%secret%' then return 18;end if;
  if s like '%special illustration%' then return 16;end if;
  if s like '%ultra%' then return 14;end if;
  if s like '%illustration%' then return 12;end if;
  if s like '%double rare%' then return 10;end if;
  if s like '%rare%' or s like '%holo%' then return 7;end if;
  if s like '%uncommon%' then return 3;end if;
  return 0;
end $$;

create or replace function public.battle_card_power(p_card_id text)
returns numeric language plpgsql security definer stable set search_path=public as $$
declare c cards%rowtype;v_hp numeric;v_attack numeric:=0;v_dmg numeric;v_abilities numeric:=0;a jsonb;m text[];
begin
  select * into c from cards where id=p_card_id;if c.id is null then raise exception 'CARD_NOT_FOUND';end if;
  v_hp:=greatest(30,least(400,coalesce(nullif(regexp_replace(coalesce(c.tcg_data->>'hp',''),'[^0-9]','','g'),'')::numeric,50)));
  if jsonb_typeof(c.tcg_data->'attacks')='array' then
    for a in select value from jsonb_array_elements(c.tcg_data->'attacks') loop
      m:=regexp_match(coalesce(a->>'damage',''),'([0-9]+)');v_dmg:=case when m is null then 0 else m[1]::numeric end;v_attack:=greatest(v_attack,v_dmg);
    end loop;
  end if;
  if jsonb_typeof(c.tcg_data->'abilities')='array' then v_abilities:=jsonb_array_length(c.tcg_data->'abilities');end if;
  return v_hp*.62+v_attack*.30+v_abilities*6+battle_rarity_bonus(c.rarity);
end $$;

create or replace function public.battle_matchup_multiplier(p_a text,p_b text)
returns numeric language plpgsql security definer stable set search_path=public as $$
declare atype text;btype text;
begin
  select types[1] into atype from cards where id=p_a;select types[1] into btype from cards where id=p_b;
  if atype is null or btype is null then return 1;end if;
  if (atype='Fire' and btype in('Grass','Metal')) or (atype='Water' and btype='Fire') or (atype='Lightning' and btype='Water') or (atype='Grass' and btype='Water') or (atype='Fighting' and btype in('Lightning','Darkness','Colorless')) or (atype='Psychic' and btype='Fighting') or (atype='Darkness' and btype='Psychic') or (atype='Metal' and btype='Fairy') or (atype='Fairy' and btype='Dragon') or (atype='Dragon' and btype='Dragon') then return 1.08;end if;
  if (btype='Fire' and atype in('Grass','Metal')) or (btype='Water' and atype='Fire') or (btype='Lightning' and atype='Water') or (btype='Grass' and atype='Water') or (btype='Fighting' and atype in('Lightning','Darkness','Colorless')) or (btype='Psychic' and atype='Fighting') or (btype='Darkness' and atype='Psychic') or (btype='Metal' and atype='Fairy') or (btype='Fairy' and atype='Dragon') or (btype='Dragon' and atype='Dragon') then return .97;end if;
  return 1;
end $$;

create or replace function public.server_create_battle_v2(p_actor_id uuid,p_opponent_id uuid,p_mode text,p_stake_type text,p_wager_coins bigint default 0,p_stake_card_id text default null,p_rematch_of uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_rounds integer;v_invites boolean;v_qty integer;
begin
  if p_actor_id=p_opponent_id then raise exception 'INVALID_PLAYER';end if;
  if p_mode not in('quick','mystery') then raise exception 'INVALID_MODE';end if;
  if p_stake_type not in('none','coins','card') then raise exception 'STAKE_NOT_AVAILABLE';end if;
  if p_stake_type='none' then p_wager_coins:=0;p_stake_card_id:=null;end if;
  if p_stake_type='coins' and not(p_wager_coins=any(array[100,250,500,1000,2500]::bigint[])) then raise exception 'INVALID_WAGER';end if;
  if p_stake_type='card' then p_wager_coins:=0;if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED';end if;end if;
  if not exists(select 1 from friendships f where f.status::text='accepted' and ((f.requester_id=p_actor_id and f.addressee_id=p_opponent_id) or(f.requester_id=p_opponent_id and f.addressee_id=p_actor_id))) then raise exception 'NOT_FRIENDS';end if;
  select battle_invites into v_invites from player_settings where player_id=p_opponent_id;if v_invites is false then raise exception 'BATTLE_INVITES_DISABLED';end if;
  if exists(select 1 from battles where challenger_id=p_actor_id and opponent_id=p_opponent_id and status='invited' and created_at>now()-interval '2 minutes') then raise exception 'INVITE_ALREADY_PENDING';end if;
  if p_stake_type='coins' and ((select coins from players where id=p_actor_id)<p_wager_coins or(select coins from players where id=p_opponent_id)<p_wager_coins) then raise exception 'NOT_ENOUGH_COINS';end if;
  v_rounds:=case when p_mode='mystery' then 2 else 1 end;
  insert into battles(challenger_id,opponent_id,mode,stake_type,wager_coins,rounds_to_win,rematch_of) values(p_actor_id,p_opponent_id,p_mode,p_stake_type,p_wager_coins,v_rounds,p_rematch_of) returning id into v_id;
  if p_stake_type='card' then
    update player_cards set quantity=quantity-1 where player_id=p_actor_id and card_id=p_stake_card_id and quantity>0 returning quantity into v_qty;
    if not found then raise exception 'STAKE_CARD_NOT_OWNED';end if;
    insert into battle_card_stakes(battle_id,player_id,card_id,quantity,status) values(v_id,p_actor_id,p_stake_card_id,1,'held');
  end if;
  insert into battle_events(battle_id,event_type,payload) values(v_id,'invited',jsonb_build_object('challengerId',p_actor_id,'opponentId',p_opponent_id,'mode',p_mode,'stakeType',p_stake_type,'wagerCoins',p_wager_coins,'stakeCardId',p_stake_card_id,'rematchOf',p_rematch_of));
  return v_id;
end $$;

create or replace function public.server_respond_battle_v2(p_actor_id uuid,p_battle_id uuid,p_accept boolean,p_stake_card_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b battles%rowtype;c_coins bigint;o_coins bigint;v_qty integer;
begin
  select * into b from battles where id=p_battle_id for update;if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;
  if b.opponent_id<>p_actor_id then raise exception 'FORBIDDEN';end if;if b.status<>'invited' then raise exception 'INVALID_STATUS';end if;
  if not p_accept then
    if b.stake_type='card' then perform server_return_card_stakes(b.id);end if;
    update battles set status='declined',updated_at=now() where id=b.id;insert into battle_events(battle_id,event_type,payload) values(b.id,'declined','{}');
    perform server_queue_notification(b.challenger_id,'battle_declined','Desafio recusado','Seu desafio de batalha foi recusado.',jsonb_build_object('battleId',b.id));return jsonb_build_object('status','declined');
  end if;
  if b.stake_type='coins' then
    perform 1 from players where id in(b.challenger_id,b.opponent_id) order by id for update;select coins into c_coins from players where id=b.challenger_id;select coins into o_coins from players where id=b.opponent_id;
    if c_coins<b.wager_coins or o_coins<b.wager_coins then raise exception 'NOT_ENOUGH_COINS';end if;
    update players set coins=coins-b.wager_coins where id in(b.challenger_id,b.opponent_id);
    insert into battle_coin_escrows(battle_id,player_id,amount,status) values(b.id,b.challenger_id,b.wager_coins,'held'),(b.id,b.opponent_id,b.wager_coins,'held') on conflict(battle_id,player_id) do nothing;
  elsif b.stake_type='card' then
    if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED';end if;
    update player_cards set quantity=quantity-1 where player_id=p_actor_id and card_id=p_stake_card_id and quantity>0 returning quantity into v_qty;if not found then raise exception 'STAKE_CARD_NOT_OWNED';end if;
    insert into battle_card_stakes(battle_id,player_id,card_id,quantity,status) values(b.id,p_actor_id,p_stake_card_id,1,'held') on conflict(battle_id,player_id) do nothing;
  end if;
  update battles set status='selecting',selection_deadline=now()+make_interval(secs=>selection_seconds),updated_at=now() where id=b.id;
  insert into battle_events(battle_id,event_type,payload) values(b.id,'started',jsonb_build_object('round',1,'selectionSeconds',b.selection_seconds));
  perform server_queue_notification(b.challenger_id,'battle_started','Desafio aceito','Sua batalha começou. Escolha sua carta!',jsonb_build_object('battleId',b.id));
  return jsonb_build_object('status','selecting','round',1,'selectionSeconds',b.selection_seconds);
end $$;

create or replace function public.server_cancel_battle(p_actor_id uuid,p_battle_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare b battles%rowtype;
begin
  select * into b from battles where id=p_battle_id for update;if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;
  if p_actor_id not in(b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN';end if;if b.status not in('invited','selecting') then raise exception 'INVALID_STATUS';end if;
  if b.status='selecting' and exists(select 1 from battle_selections where battle_id=b.id) then raise exception 'BATTLE_ALREADY_STARTED';end if;
  if b.stake_type='coins' then
    update players p set coins=p.coins+e.amount from battle_coin_escrows e where e.battle_id=b.id and e.player_id=p.id and e.status='held';update battle_coin_escrows set status='refunded',updated_at=now() where battle_id=b.id and status='held';
  elsif b.stake_type='card' then perform server_return_card_stakes(b.id);end if;
  update battles set status='cancelled',updated_at=now() where id=b.id;insert into battle_events(battle_id,event_type,payload) values(b.id,'cancelled',jsonb_build_object('by',p_actor_id));return 'cancelled';
end $$;

create or replace function public.server_finish_battle_round(p_battle_id uuid,p_round_no integer,p_challenger_power numeric,p_opponent_power numeric,p_challenger_roll numeric,p_opponent_roll numeric,p_winner_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b battles%rowtype;c_card text;o_card text;c_score integer;o_score integer;v_complete boolean;v_winner uuid;v_loser uuid;v_pot bigint;v_pair_count integer;v_reward boolean;v_cr integer;v_or integer;v_c_expected numeric;v_o_expected numeric;v_cr_after integer;v_or_after integer;v_c_species text;v_o_species text;v_species_count integer;
begin
  select * into b from battles where id=p_battle_id for update;if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;
  if b.status<>'selecting' or b.active_round<>p_round_no then raise exception 'INVALID_STATUS';end if;if p_winner_id not in(b.challenger_id,b.opponent_id) then raise exception 'INVALID_WINNER';end if;
  select card_id into c_card from battle_selections where battle_id=b.id and round_no=p_round_no and player_id=b.challenger_id;select card_id into o_card from battle_selections where battle_id=b.id and round_no=p_round_no and player_id=b.opponent_id;
  if c_card is null or o_card is null then raise exception 'SELECTIONS_MISSING';end if;if exists(select 1 from battle_rounds where battle_id=b.id and round_no=p_round_no) then raise exception 'ROUND_ALREADY_RESOLVED';end if;
  insert into battle_rounds(battle_id,round_no,challenger_card_id,opponent_card_id,challenger_power,opponent_power,challenger_roll,opponent_roll,winner_id) values(b.id,p_round_no,c_card,o_card,p_challenger_power,p_opponent_power,p_challenger_roll,p_opponent_roll,p_winner_id);
  select coalesce(pokedex_numbers[1]::text,lower(pokemon_name)) into v_c_species from cards where id=c_card;select coalesce(pokedex_numbers[1]::text,lower(pokemon_name)) into v_o_species from cards where id=o_card;
  insert into player_daily_battle_species(player_id,mission_date,species_key,card_id) values(b.challenger_id,current_date,v_c_species,c_card) on conflict do nothing;insert into player_daily_battle_species(player_id,mission_date,species_key,card_id) values(b.opponent_id,current_date,v_o_species,o_card) on conflict do nothing;
  select count(*) into v_species_count from player_daily_battle_species where player_id=b.challenger_id and mission_date=current_date;insert into player_daily_missions(player_id,mission_date,mission_id,progress) values(b.challenger_id,current_date,'use_3_species',v_species_count) on conflict(player_id,mission_date,mission_id) do update set progress=greatest(player_daily_missions.progress,excluded.progress),updated_at=now();
  select count(*) into v_species_count from player_daily_battle_species where player_id=b.opponent_id and mission_date=current_date;insert into player_daily_missions(player_id,mission_date,mission_id,progress) values(b.opponent_id,current_date,'use_3_species',v_species_count) on conflict(player_id,mission_date,mission_id) do update set progress=greatest(player_daily_missions.progress,excluded.progress),updated_at=now();
  c_score:=b.challenger_score+case when p_winner_id=b.challenger_id then 1 else 0 end;o_score:=b.opponent_score+case when p_winner_id=b.opponent_id then 1 else 0 end;v_complete:=c_score>=b.rounds_to_win or o_score>=b.rounds_to_win;
  if v_complete then
    v_winner:=case when c_score>o_score then b.challenger_id else b.opponent_id end;v_loser:=case when v_winner=b.challenger_id then b.opponent_id else b.challenger_id end;
    select count(*) into v_pair_count from battles x where x.status='completed' and x.reward_eligible and x.completed_at>=now()-interval '24 hours' and ((x.challenger_id=b.challenger_id and x.opponent_id=b.opponent_id) or(x.challenger_id=b.opponent_id and x.opponent_id=b.challenger_id));v_reward:=v_pair_count<5;
    perform 1 from players where id in(b.challenger_id,b.opponent_id) order by id for update;select battle_rating into v_cr from players where id=b.challenger_id;select battle_rating into v_or from players where id=b.opponent_id;v_cr_after:=v_cr;v_or_after:=v_or;
    if v_reward then
      v_c_expected:=1/(1+power(10::numeric,(v_or-v_cr)/400.0));v_o_expected:=1-v_c_expected;v_cr_after:=round(v_cr+24*((case when v_winner=b.challenger_id then 1 else 0 end)-v_c_expected));v_or_after:=round(v_or+24*((case when v_winner=b.opponent_id then 1 else 0 end)-v_o_expected));
      update players set battle_rating=case when id=b.challenger_id then v_cr_after else v_or_after end where id in(b.challenger_id,b.opponent_id);
    end if;
    update players set battle_wins=battle_wins+1,battle_streak=battle_streak+1,best_battle_streak=greatest(best_battle_streak,battle_streak+1) where id=v_winner;update players set battle_losses=battle_losses+1,battle_streak=0 where id=v_loser;
    update battles set challenger_score=c_score,opponent_score=o_score,status='completed',winner_id=v_winner,completed_at=now(),updated_at=now(),reward_eligible=v_reward,challenger_rating_before=v_cr,challenger_rating_after=v_cr_after,opponent_rating_before=v_or,opponent_rating_after=v_or_after where id=b.id;
    if b.stake_type='coins' then
      select coalesce(sum(amount),0) into v_pot from battle_coin_escrows where battle_id=b.id and status='held';if v_pot>0 then update players set coins=coins+v_pot where id=v_winner;update battle_coin_escrows set status='paid',updated_at=now() where battle_id=b.id and status='held';end if;
    elsif b.stake_type='card' then
      insert into player_cards(player_id,card_id,quantity) select v_winner,card_id,sum(quantity)::integer from battle_card_stakes where battle_id=b.id and status='held' group by card_id on conflict(player_id,card_id) do update set quantity=player_cards.quantity+excluded.quantity;update battle_card_stakes set status='paid',updated_at=now() where battle_id=b.id and status='held';
    end if;
    if v_reward then
      update players set xp=xp+case when id=v_winner then 50 else 20 end,level=greatest(level,1+floor((xp+case when id=v_winner then 50 else 20 end)/250.0)::integer) where id in(b.challenger_id,b.opponent_id);
      insert into player_daily_missions(player_id,mission_date,mission_id,progress) values(b.challenger_id,current_date,'play_2_battles',1),(b.opponent_id,current_date,'play_2_battles',1),(v_winner,current_date,'win_1_battle',1) on conflict(player_id,mission_date,mission_id) do update set progress=player_daily_missions.progress+excluded.progress,updated_at=now();
    end if;
    insert into battle_events(battle_id,event_type,payload) values(b.id,'completed',jsonb_build_object('winnerId',v_winner,'challengerScore',c_score,'opponentScore',o_score,'rewardEligible',v_reward,'challengerRating',v_cr_after,'opponentRating',v_or_after));
    perform server_queue_notification(v_winner,'battle_result','Vitória!','Você venceu a batalha'||case when b.stake_type='coins' then ' e recebeu o pote de moedas.' when b.stake_type='card' then ' e recebeu as cartas apostadas.' else '!' end,jsonb_build_object('battleId',b.id,'result','win','rating',case when v_winner=b.challenger_id then v_cr_after else v_or_after end));
    perform server_queue_notification(v_loser,'battle_result','Batalha encerrada','A batalha terminou. Abra o histórico para ver o resultado.',jsonb_build_object('battleId',b.id,'result','loss','rating',case when v_loser=b.challenger_id then v_cr_after else v_or_after end));
    return jsonb_build_object('completed',true,'winnerId',v_winner,'challengerScore',c_score,'opponentScore',o_score,'rewardEligible',v_reward,'challengerRating',v_cr_after,'opponentRating',v_or_after);
  else
    update battles set challenger_score=c_score,opponent_score=o_score,active_round=active_round+1,selection_deadline=now()+make_interval(secs=>selection_seconds),updated_at=now() where id=b.id;insert into battle_events(battle_id,event_type,payload) values(b.id,'round_resolved',jsonb_build_object('round',p_round_no,'winnerId',p_winner_id,'challengerScore',c_score,'opponentScore',o_score));return jsonb_build_object('completed',false,'nextRound',p_round_no+1,'challengerScore',c_score,'opponentScore',o_score);
  end if;
end $$;

create or replace function public.server_resolve_battle_round(p_battle_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b battles%rowtype;c_card text;o_card text;c_power numeric;o_power numeric;c_roll numeric;o_roll numeric;c_final numeric;o_final numeric;v_winner uuid;v_result jsonb;
begin
  select * into b from battles where id=p_battle_id for update;if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true);end if;
  select card_id into c_card from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;select card_id into o_card from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;
  if c_card is null or o_card is null then return jsonb_build_object('waiting',true,'round',b.active_round);end if;
  c_power:=battle_card_power(c_card)*battle_matchup_multiplier(c_card,o_card);o_power:=battle_card_power(o_card)*battle_matchup_multiplier(o_card,c_card);c_roll:=.94+random()*.12;o_roll:=.94+random()*.12;c_final:=c_power*c_roll;o_final:=o_power*o_roll;v_winner:=case when c_final>=o_final then b.challenger_id else b.opponent_id end;
  v_result:=server_finish_battle_round(b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner);return v_result||jsonb_build_object('round',b.active_round,'challengerFinal',c_final,'opponentFinal',o_final,'challengerCardId',c_card,'opponentCardId',o_card);
end $$;

create or replace function public.server_timeout_battle(p_actor_id uuid,p_battle_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b battles%rowtype;v_card text;v_count integer;
begin
  select * into b from battles where id=p_battle_id for update;if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;if p_actor_id not in(b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN';end if;if b.status<>'selecting' then raise exception 'INVALID_STATUS';end if;if b.selection_deadline is null or now()<b.selection_deadline then raise exception 'NOT_EXPIRED';end if;
  if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id) then select card_id into v_card from player_cards where player_id=b.challenger_id and quantity>0 order by random() limit 1;if v_card is null then raise exception 'CHALLENGER_NO_CARDS';end if;insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.challenger_id,v_card);insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.challenger_id,'round',b.active_round));end if;
  if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id) then select card_id into v_card from player_cards where player_id=b.opponent_id and quantity>0 order by random() limit 1;if v_card is null then raise exception 'OPPONENT_NO_CARDS';end if;insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.opponent_id,v_card);insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.opponent_id,'round',b.active_round));end if;
  select count(*) into v_count from battle_selections where battle_id=b.id and round_no=b.active_round;return jsonb_build_object('bothLocked',v_count=2,'round',b.active_round,'timedOut',true);
end $$;

revoke all on function public.server_return_card_stakes(uuid) from public,anon,authenticated;
revoke all on function public.battle_card_power(text) from public,anon,authenticated;
revoke all on function public.battle_matchup_multiplier(text,text) from public,anon,authenticated;
revoke all on function public.server_create_battle_v2(uuid,uuid,text,text,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.server_respond_battle_v2(uuid,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.server_resolve_battle_round(uuid) from public,anon,authenticated;
revoke all on function public.server_timeout_battle(uuid,uuid) from public,anon,authenticated;
revoke all on function public.server_finish_battle_round(uuid,integer,numeric,numeric,numeric,numeric,uuid) from public,anon,authenticated;
revoke all on function public.server_cancel_battle(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_return_card_stakes(uuid) to service_role;
grant execute on function public.battle_card_power(text) to service_role;
grant execute on function public.battle_matchup_multiplier(text,text) to service_role;
grant execute on function public.server_create_battle_v2(uuid,uuid,text,text,bigint,text,uuid) to service_role;
grant execute on function public.server_respond_battle_v2(uuid,uuid,boolean,text) to service_role;
grant execute on function public.server_resolve_battle_round(uuid) to service_role;
grant execute on function public.server_timeout_battle(uuid,uuid) to service_role;
grant execute on function public.server_finish_battle_round(uuid,integer,numeric,numeric,numeric,numeric,uuid) to service_role;
grant execute on function public.server_cancel_battle(uuid,uuid) to service_role;
