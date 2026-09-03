
-- 14-15) Anti-inflation control + economy snapshots. Advisory only: never changes prices/rewards automatically.
create table if not exists private.economy_health_snapshots(
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  captured_by uuid not null references public.players(id) on delete restrict,
  health jsonb not null,
  distribution jsonb not null default '{}'::jsonb,
  market jsonb not null default '{}'::jsonb
);
create index if not exists economy_health_snapshots_captured_idx on private.economy_health_snapshots(captured_at desc);

create or replace function public.server_capture_economy_snapshot(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_health jsonb;
  v_distribution jsonb;
  v_market jsonb;
  v_id bigint;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  v_health:=public.server_get_economy_health(p_actor_id);

  select jsonb_build_object(
    'players',count(*),
    'coinP50',coalesce(percentile_cont(.50) within group(order by coins),0),
    'coinP90',coalesce(percentile_cont(.90) within group(order by coins),0),
    'coinP99',coalesce(percentile_cont(.99) within group(order by coins),0),
    'diamondP50',coalesce(percentile_cont(.50) within group(order by diamonds),0),
    'diamondP90',coalesce(percentile_cont(.90) within group(order by diamonds),0),
    'maxCoins',coalesce(max(coins),0),
    'maxDiamonds',coalesce(max(diamonds),0),
    'top10CoinShare',case when sum(coins)>0 then round((
      select coalesce(sum(x.coins),0)::numeric
      from (
        select p2.coins from public.players p2 where p2.account_status='active'
        order by p2.coins desc
        limit greatest(1,ceil(count(*)*.10)::integer)
      ) x
    )/sum(coins),4) else 0 end
  )
  into v_distribution
  from public.players
  where account_status='active';

  select jsonb_build_object(
    'activeListings',(select count(*) from public.market_listings where status='active'),
    'sales7d',(select count(*) from public.market_listings where status='sold' and sold_at>=now()-interval '7 days'),
    'medianActiveCoins',(select coalesce(percentile_cont(.5) within group(order by unit_price_coins),0) from public.market_listings where status='active'),
    'medianSoldCoins7d',(select coalesce(percentile_cont(.5) within group(order by unit_price_coins),0) from public.market_listings where status='sold' and sold_at>=now()-interval '7 days'),
    'feesBurned7d',(select coalesce(sum(fee_coins),0) from private.market_fee_log where created_at>=now()-interval '7 days')
  ) into v_market;

  insert into private.economy_health_snapshots(captured_by,health,distribution,market)
  values(p_actor_id,v_health,v_distribution,v_market)
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,'capturedAt',now(),'health',v_health,'distribution',v_distribution,'market',v_market,
    'guardrails',jsonb_build_object(
      'automaticChanges',false,
      'burnMintWatchBelow',0.75,
      'burnMintCriticalBelow',0.55,
      'coinsPerPlayerWatch',3000000,
      'coinsPerPlayerCritical',5000000,
      'top10ShareWatch',0.70
    )
  );
end;
$$;
revoke all on function public.server_capture_economy_snapshot(uuid) from public,anon;
grant execute on function public.server_capture_economy_snapshot(uuid) to authenticated,service_role;

create or replace function public.server_get_economy_trend(p_actor_id uuid,p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'snapshots',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'capturedAt',s.captured_at,'health',s.health,'distribution',s.distribution,'market',s.market
      ) order by s.captured_at)
      from (
        select * from private.economy_health_snapshots
        order by captured_at desc
        limit greatest(1,least(coalesce(p_limit,30),180))
      ) s
    ),'[]'::jsonb),
    'openAlerts',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'key',alert_key,'severity',severity,'message',message,'metrics',metrics,'createdAt',created_at) order by created_at desc)
      from public.economy_alerts where resolved_at is null
    ),'[]'::jsonb),
    'recommendations',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'type',recommendation_type,'currentValue',current_value,'suggestedValue',suggested_value,'rationale',rationale,'generatedAt',generated_at) order by generated_at desc)
      from public.economy_price_recommendations where active
    ),'[]'::jsonb),
    'automaticChanges',false
  );
end;
$$;
revoke all on function public.server_get_economy_trend(uuid,integer) from public,anon;
grant execute on function public.server_get_economy_trend(uuid,integer) to authenticated,service_role;

-- 16) Freeze Simulator. Read-only: does not freeze, reset, snapshot, cancel, or change balances.
create or replace function public.server_release_freeze_simulator(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_preview jsonb;
  v_ready jsonb;
  v_snap jsonb;
  v_blockers jsonb:='[]'::jsonb;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id and role='owner') then raise exception 'OWNER_ONLY'; end if;

  v_preview:=public.server_release_reset_preview(p_actor_id);
  v_ready:=public.server_release_readiness(p_actor_id);
  v_snap:=public.server_release_snapshot_state(p_actor_id);

  if coalesce((v_preview->>'activeOperations')::integer,0)>0 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ACTIVE_OPERATIONS','count',(v_preview->>'activeOperations')::integer,'message','Existem operações ativas que precisam terminar/cancelar antes do reset.'));
  end if;
  if not coalesce((v_preview->'preflight'->>'ready')::boolean,false) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PREFLIGHT','issues',v_preview->'preflight'->'issues','message','O preflight ainda encontrou inconsistências.'));
  end if;
  if not coalesce((v_preview->'campaign'->>'maintenanceEnabled')::boolean,false) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','MAINTENANCE_OFF','message','A manutenção precisa estar ativa no momento real do reset.'));
  end if;
  if not coalesce((v_preview->'campaign'->>'economyFrozen')::boolean,false) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ECONOMY_NOT_FROZEN','message','A economia ainda não está congelada.'));
  end if;
  if not coalesce((v_ready->>'snapshotPrepared')::boolean,false) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SNAPSHOT_MISSING','message','Nenhum snapshot preparado e único está pronto.'));
  end if;
  if not coalesce((v_ready->>'downloadUrlReady')::boolean,false) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','DOWNLOAD_URL','message','O link da versão 1.0 ainda não está pronto.'));
  end if;

  return jsonb_build_object(
    'simulationOnly',true,
    'wouldBeReady',jsonb_array_length(v_blockers)=0,
    'generatedAt',now(),
    'blockers',v_blockers,
    'preview',v_preview,
    'readiness',v_ready,
    'snapshotState',v_snap,
    'safety',jsonb_build_object(
      'changedRows',0,'coinsChanged',0,'diamondsChanged',0,'cardsChanged',0,'battlesChanged',0,
      'note','Este simulador executa apenas consultas. Nenhuma etapa de freeze/reset é acionada.'
    )
  );
end;
$$;
revoke all on function public.server_release_freeze_simulator(uuid) from public,anon;
grant execute on function public.server_release_freeze_simulator(uuid) to authenticated,service_role;

-- 17-18) Pure Battle Lab model. It never creates public.battles and never touches rating/rewards.
create or replace function private.battle_lab_card_summary(p_card_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_profile jsonb;
  v_stats jsonb;
  v_moves jsonb;
begin
  v_profile:=private.battle_game_profile_for_card(p_card_id);
  if v_profile is null then return null; end if;
  v_stats:=private.battle_game_level50_stats(v_profile);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.move_id,'identifier',m.identifier,'name',private.battle_game_display_move(m.identifier),
    'type',m.move_type,'category',m.category,'power',m.power,'accuracy',m.accuracy,'priority',m.priority,'pp',m.pp
  ) order by ord),'[]'::jsonb)
  into v_moves
  from jsonb_array_elements_text(coalesce(v_profile->'moveIds','[]'::jsonb)) with ordinality x(move_id,ord)
  join private.pokemon_game_moves m on m.move_id=x.move_id::integer;

  return jsonb_build_object(
    'cardId',p_card_id,
    'identifier',v_profile->>'identifier',
    'pokemonId',(v_profile->>'pokemonId')::integer,
    'speciesId',coalesce((v_profile->>'speciesId')::integer,(v_profile->>'pokemonId')::integer),
    'types',coalesce(v_profile->'types','[]'::jsonb),
    'ability',v_profile->>'ability',
    'stats',v_stats,
    'moves',v_moves
  );
end;
$$;

create or replace function private.battle_lab_best_move(p_attacker jsonb,p_defender jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_move jsonb;
  v_best jsonb;
  v_best_score numeric:=-1;
  v_score numeric;
  v_power numeric;
  v_atk numeric;
  v_def numeric;
  v_stab numeric;
  v_eff numeric;
  v_attacker_types text[];
  v_defender_types text[];
begin
  v_attacker_types:=array(select jsonb_array_elements_text(coalesce(p_attacker->'types','[]'::jsonb)));
  v_defender_types:=array(select jsonb_array_elements_text(coalesce(p_defender->'types','[]'::jsonb)));

  for v_move in select value from jsonb_array_elements(coalesce(p_attacker->'moves','[]'::jsonb))
  loop
    v_power:=coalesce((v_move->>'power')::numeric,0);
    if v_power<=0 then continue; end if;
    if v_move->>'category'='special' then
      v_atk:=coalesce((p_attacker->'stats'->>'spAttack')::numeric,1);
      v_def:=greatest(1,coalesce((p_defender->'stats'->>'spDefense')::numeric,1));
    else
      v_atk:=coalesce((p_attacker->'stats'->>'attack')::numeric,1);
      v_def:=greatest(1,coalesce((p_defender->'stats'->>'defense')::numeric,1));
    end if;
    v_stab:=case when (v_move->>'type')=any(v_attacker_types) then 1.5 else 1 end;
    v_eff:=private.battle_game_type_multiplier(v_move->>'type',v_defender_types,p_defender->>'ability');
    v_score:=(((22*v_power*v_atk/v_def)/50)+2)*v_stab*v_eff*0.925*(coalesce((v_move->>'accuracy')::numeric,100)/100);
    if v_score>v_best_score then
      v_best_score:=v_score;
      v_best:=v_move||jsonb_build_object('projectedDamage',greatest(0,round(v_score)),'effectiveness',v_eff,'stab',v_stab);
    end if;
  end loop;

  if v_best is null then
    v_best:=jsonb_build_object('id',-1,'identifier','struggle','name','Struggle','type','normal','category','physical','power',50,'accuracy',100,'priority',0,'pp',1,'projectedDamage',1,'effectiveness',1,'stab',1);
  end if;
  return v_best;
end;
$$;

create or replace function private.battle_lab_single(p_card_a text,p_card_b text,p_seed integer default 1)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  a jsonb:=private.battle_lab_card_summary(p_card_a);
  b jsonb:=private.battle_lab_card_summary(p_card_b);
  ma jsonb; mb jsonb;
  hp_a integer; hp_b integer;
  max_a integer; max_b integer;
  speed_a integer; speed_b integer;
  turn_no integer:=0;
  first_a boolean;
  hit_a boolean; hit_b boolean;
  crit_a boolean; crit_b boolean;
  rand_a numeric; rand_b numeric;
  dmg_a integer; dmg_b integer;
  base_a numeric; base_b numeric;
  acc_a integer; acc_b integer;
begin
  if a is null or b is null then return jsonb_build_object('ok',false,'error','GAME_PROFILE_UNAVAILABLE'); end if;
  ma:=private.battle_lab_best_move(a,b);
  mb:=private.battle_lab_best_move(b,a);
  max_a:=(a->'stats'->>'hp')::integer; max_b:=(b->'stats'->>'hp')::integer;
  hp_a:=max_a;hp_b:=max_b;
  speed_a:=(a->'stats'->>'speed')::integer; speed_b:=(b->'stats'->>'speed')::integer;
  acc_a:=coalesce((ma->>'accuracy')::integer,100); acc_b:=coalesce((mb->>'accuracy')::integer,100);
  base_a:=greatest(1,(ma->>'projectedDamage')::numeric/0.925);
  base_b:=greatest(1,(mb->>'projectedDamage')::numeric/0.925);

  while hp_a>0 and hp_b>0 and turn_no<100 loop
    turn_no:=turn_no+1;
    first_a:=case
      when coalesce((ma->>'priority')::integer,0)>coalesce((mb->>'priority')::integer,0) then true
      when coalesce((ma->>'priority')::integer,0)<coalesce((mb->>'priority')::integer,0) then false
      when speed_a>speed_b then true
      when speed_a<speed_b then false
      else mod(abs(hashtext(p_seed::text||':speed:'||turn_no)),2)=0
    end;

    rand_a:=0.85+(mod(abs(hashtext(p_seed::text||':a:rand:'||turn_no)),16)::numeric/100);
    rand_b:=0.85+(mod(abs(hashtext(p_seed::text||':b:rand:'||turn_no)),16)::numeric/100);
    crit_a:=mod(abs(hashtext(p_seed::text||':a:crit:'||turn_no)),24)=0;
    crit_b:=mod(abs(hashtext(p_seed::text||':b:crit:'||turn_no)),24)=0;
    hit_a:=mod(abs(hashtext(p_seed::text||':a:hit:'||turn_no)),100)<acc_a;
    hit_b:=mod(abs(hashtext(p_seed::text||':b:hit:'||turn_no)),100)<acc_b;
    dmg_a:=case when hit_a then greatest(1,floor(base_a*rand_a*(case when crit_a then 1.5 else 1 end))::integer) else 0 end;
    dmg_b:=case when hit_b then greatest(1,floor(base_b*rand_b*(case when crit_b then 1.5 else 1 end))::integer) else 0 end;

    if first_a then
      hp_b:=greatest(0,hp_b-dmg_a);
      if hp_b>0 then hp_a:=greatest(0,hp_a-dmg_b); end if;
    else
      hp_a:=greatest(0,hp_a-dmg_b);
      if hp_a>0 then hp_b:=greatest(0,hp_b-dmg_a); end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'model','projection_v1','seed',p_seed,'turns',turn_no,
    'winnerCardId',case when hp_a>hp_b then p_card_a when hp_b>hp_a then p_card_b else null end,
    'a',a||jsonb_build_object('bestMove',ma,'remainingHp',hp_a,'maxHp',max_a),
    'b',b||jsonb_build_object('bestMove',mb,'remainingHp',hp_b,'maxHp',max_b),
    'disclaimer','Projection model uses game_v1 stats, moves, STAB, type/ability multiplier, accuracy, crit, speed and damage variance. It intentionally does not mutate or award anything and is not a substitute for the full live status-effect engine.'
  );
end;
$$;

create or replace function public.get_battle_lab_matchup(p_card_a text,p_card_b text,p_iterations integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_n integer:=greatest(1,least(coalesce(p_iterations,50),200));
  i integer;
  r jsonb;
  a_wins integer:=0;b_wins integer:=0;draws integer:=0;turn_sum integer:=0;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.cards where id=p_card_a) or not exists(select 1 from public.cards where id=p_card_b) then raise exception 'CARD_NOT_FOUND'; end if;

  for i in 1..v_n loop
    r:=private.battle_lab_single(p_card_a,p_card_b,i);
    if not coalesce((r->>'ok')::boolean,false) then return r; end if;
    turn_sum:=turn_sum+coalesce((r->>'turns')::integer,0);
    if r->>'winnerCardId'=p_card_a then a_wins:=a_wins+1;
    elsif r->>'winnerCardId'=p_card_b then b_wins:=b_wins+1;
    else draws:=draws+1; end if;
  end loop;

  return jsonb_build_object(
    'model','projection_v1','iterations',v_n,
    'cardA',private.battle_lab_card_summary(p_card_a),
    'cardB',private.battle_lab_card_summary(p_card_b),
    'aWins',a_wins,'bWins',b_wins,'draws',draws,
    'aWinRate',round(a_wins::numeric/v_n*100,1),
    'bWinRate',round(b_wins::numeric/v_n*100,1),
    'averageTurns',round(turn_sum::numeric/v_n,1),
    'sample',private.battle_lab_single(p_card_a,p_card_b,1),
    'writesPerformed',0
  );
end;
$$;
revoke all on function public.get_battle_lab_matchup(text,text,integer) from public,anon;
grant execute on function public.get_battle_lab_matchup(text,text,integer) to authenticated,service_role;

create or replace function public.get_admin_battle_lab_matrix(p_card_ids text[],p_iterations integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_ids text[];
  i integer;j integer;
  rows jsonb:='[]'::jsonb;
  r jsonb;
begin
  if v_actor is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  v_ids:=array(select distinct x from unnest(p_card_ids) x limit 12);
  if coalesce(cardinality(v_ids),0)<2 then raise exception 'NEED_AT_LEAST_TWO_CARDS'; end if;
  for i in 1..cardinality(v_ids)-1 loop
    for j in i+1..cardinality(v_ids) loop
      r:=public.get_battle_lab_matchup(v_ids[i],v_ids[j],greatest(1,least(coalesce(p_iterations,30),100)));
      rows:=rows||jsonb_build_array(jsonb_build_object(
        'cardA',v_ids[i],'cardB',v_ids[j],
        'aWinRate',r->'aWinRate','bWinRate',r->'bWinRate','draws',r->'draws','averageTurns',r->'averageTurns'
      ));
    end loop;
  end loop;
  return jsonb_build_object('model','projection_v1','pairs',rows,'cardCount',cardinality(v_ids),'writesPerformed',0);
end;
$$;
revoke all on function public.get_admin_battle_lab_matrix(text[],integer) from public,anon;
grant execute on function public.get_admin_battle_lab_matrix(text[],integer) to authenticated,service_role;

-- 19) Opt-in spectator mode. Wager battles are never spectatable by outsiders.
alter table public.battles add column if not exists spectator_enabled boolean not null default false;

create or replace function public.set_battle_spectator_enabled(p_battle_id uuid,p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_b public.battles%rowtype;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_b from public.battles where id=p_battle_id for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_actor not in(v_b.challenger_id,v_b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if v_b.stake_type<>'none' and p_enabled then raise exception 'WAGER_BATTLE_CANNOT_BE_SPECTATED'; end if;
  if v_b.status='invited' and p_enabled then raise exception 'BATTLE_NOT_STARTED'; end if;
  update public.battles set spectator_enabled=p_enabled,updated_at=now() where id=p_battle_id;
  return jsonb_build_object('battleId',p_battle_id,'spectatorEnabled',p_enabled);
end;
$$;
revoke all on function public.set_battle_spectator_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_battle_spectator_enabled(uuid,boolean) to authenticated,service_role;

create or replace function public.get_battle_spectator_state(p_battle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_b public.battles%rowtype;v_participant boolean;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_b from public.battles where id=p_battle_id;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  v_participant:=v_actor in(v_b.challenger_id,v_b.opponent_id);
  if not v_participant and (not v_b.spectator_enabled or v_b.stake_type<>'none' or v_b.status='invited') then raise exception 'SPECTATOR_NOT_ALLOWED'; end if;

  return jsonb_build_object(
    'battle',jsonb_build_object(
      'id',v_b.id,'mode',v_b.mode,'formatId',v_b.format_id,'status',v_b.status,'engineVersion',v_b.engine_version,
      'activeRound',v_b.active_round,'challengerScore',v_b.challenger_score,'opponentScore',v_b.opponent_score,
      'winnerId',v_b.winner_id,'spectatorEnabled',v_b.spectator_enabled,'isParticipant',v_participant
    ),
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'profileIcon',p.profile_icon)) from public.players p where p.id in(v_b.challenger_id,v_b.opponent_id)),
    'fighters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'round',f.round_no,'playerId',f.player_id,'cardId',f.card_id,'name',c.pokemon_name,'image',c.image_small,
        'types',f.types,'maxHp',f.max_hp,'currentHp',f.current_hp,'status',f.major_status,'ability',f.ability
      ) order by f.round_no,f.player_id)
      from private.battle_game_fighters f left join public.cards c on c.id=f.card_id where f.battle_id=p_battle_id
    ),'[]'::jsonb),
    'resolvedTurns',coalesce((
      select jsonb_agg(jsonb_build_object('round',x.round_no,'turn',x.turn_no,'result',x.result,'resolvedAt',x.resolved_at) order by x.round_no,x.turn_no)
      from (
        select * from private.battle_game_turns where battle_id=p_battle_id order by round_no,turn_no limit 100
      ) x
    ),'[]'::jsonb),
    'hiddenInformationProtected',true
  );
end;
$$;
revoke all on function public.get_battle_spectator_state(uuid) from public,anon;
grant execute on function public.get_battle_spectator_state(uuid) to authenticated,service_role;

-- 20) Hall of Fame.
create or replace function public.get_hall_of_fame()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'seasons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'seasonId',s.id,'seasonName',s.name,'endsAt',s.ends_at,
        'podium',(
          select coalesce(jsonb_agg(jsonb_build_object(
            'rank',ranked.rn,'playerId',ranked.player_id,'username',p.username,
            'points',ranked.points,'wins',ranked.wins,'losses',ranked.losses,'bestStreak',ranked.best_streak
          ) order by ranked.rn),'[]'::jsonb)
          from (
            select ps.*,row_number() over(order by ps.points desc,ps.wins desc,ps.losses asc,ps.updated_at asc) rn
            from public.player_seasons ps where ps.season_id=s.id
          ) ranked
          join public.players p on p.id=ranked.player_id
          where ranked.rn<=3
        )
      ) order by s.ends_at desc)
      from public.seasons s where s.ends_at<=now()
    ),'[]'::jsonb),
    'tournaments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'name',t.name,'endedAt',t.ends_at,'winnerId',t.winner_id,'winnerUsername',p.username,
        'rewardCoins',t.reward_coins,'entryFeeCoins',t.entry_fee_coins
      ) order by t.ends_at desc nulls last)
      from public.tournaments t left join public.players p on p.id=t.winner_id
      where t.status='completed' and t.winner_id is not null
    ),'[]'::jsonb),
    'records',jsonb_build_object(
      'mostWins',(select jsonb_build_object('playerId',id,'username',username,'wins',battle_wins) from public.players where is_bot=false order by battle_wins desc,id limit 1),
      'bestStreak',(select jsonb_build_object('playerId',id,'username',username,'streak',best_battle_streak) from public.players where is_bot=false order by best_battle_streak desc,id limit 1),
      'highestRating',(select jsonb_build_object('playerId',id,'username',username,'rating',battle_rating) from public.players where is_bot=false order by battle_rating desc,id limit 1)
    )
  );
$$;
revoke all on function public.get_hall_of_fame() from public,anon;
grant execute on function public.get_hall_of_fame() to authenticated,service_role;
