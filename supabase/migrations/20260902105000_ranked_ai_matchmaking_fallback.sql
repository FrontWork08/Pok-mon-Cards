-- Ranked AI matchmaking fallback.
-- Real players keep priority; a bot may fill the queue after 18 seconds.
-- Bots have no inventory/economy and are excluded from rank snapshots/social actions.

alter table public.players
  add column if not exists is_bot boolean not null default false,
  add column if not exists bot_rating_base integer;

alter table public.battles
  add column if not exists is_bot_match boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.players'::regclass
      and conname='players_bot_rating_base_check'
  ) then
    alter table public.players
      add constraint players_bot_rating_base_check
      check (bot_rating_base is null or bot_rating_base between 500 and 3000);
  end if;
end $$;

create index if not exists players_ranked_humans_idx
  on public.players(battle_rating desc,battle_wins desc,username)
  where is_bot=false and account_status<>'banned';

create index if not exists battles_bot_matches_daily_idx
  on public.battles(completed_at,challenger_id,opponent_id)
  where is_bot_match=true and status='completed';

create table if not exists private.ranked_bot_card_pool(
  card_id text primary key references public.cards(id) on delete cascade,
  battle_power numeric not null,
  updated_at timestamptz not null default now()
);

alter table private.ranked_bot_card_pool enable row level security;

create index if not exists ranked_bot_card_pool_power_idx
  on private.ranked_bot_card_pool(battle_power);

insert into private.ranked_bot_card_pool(card_id,battle_power,updated_at)
select c.id,public.battle_card_power(c.id),now()
from public.cards c
where coalesce(array_length(c.pokedex_numbers,1),0)>0
  and jsonb_typeof(c.tcg_data->'attacks')='array'
  and jsonb_array_length(c.tcg_data->'attacks')>0
on conflict(card_id) do update
set battle_power=excluded.battle_power,updated_at=excluded.updated_at;

CREATE OR REPLACE FUNCTION private.sync_ranked_bot_card_power()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op='DELETE' then
    delete from private.ranked_bot_card_pool where card_id=old.id;
    return old;
  end if;

  if coalesce(array_length(new.pokedex_numbers,1),0)>0
     and jsonb_typeof(new.tcg_data->'attacks')='array'
     and jsonb_array_length(new.tcg_data->'attacks')>0
  then
    insert into private.ranked_bot_card_pool(card_id,battle_power,updated_at)
    values(new.id,public.battle_card_power(new.id),now())
    on conflict(card_id) do update
    set battle_power=excluded.battle_power,updated_at=excluded.updated_at;
  else
    delete from private.ranked_bot_card_pool where card_id=new.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.protect_player_bot_flags()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (old.is_bot is distinct from new.is_bot
      or old.bot_rating_base is distinct from new.bot_rating_base)
     and coalesce(auth.jwt()->>'role','') not in ('service_role')
  then
    raise exception 'SYSTEM_PLAYER_FLAGS_FORBIDDEN';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  desired_username text;
  generated_base text;
  v_is_bot boolean := lower(coalesce(new.raw_app_meta_data->>'system_bot','false'))='true';
  v_bot_rating integer;
begin
  desired_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if desired_username is null then
    generated_base := coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'trainer'
    );

    generated_base := regexp_replace(generated_base, '[^a-zA-Z0-9_]+', '_', 'g');
    generated_base := trim(both '_' from generated_base);
    if length(generated_base) < 3 then generated_base := 'trainer'; end if;
    desired_username := left(generated_base, 20) || '_' || substr(new.id::text, 1, 6);
  end if;

  if v_is_bot then
    begin
      v_bot_rating := nullif(new.raw_app_meta_data->>'bot_rating','')::integer;
    exception when others then
      v_bot_rating := 1000;
    end;
  end if;

  insert into public.players(id,username,is_bot,bot_rating_base,battle_rating,coins,diamonds)
  values(
    new.id,
    left(desired_username,24),
    v_is_bot,
    case when v_is_bot then coalesce(v_bot_rating,1000) else null end,
    case when v_is_bot then coalesce(v_bot_rating,1000) else 1000 end,
    case when v_is_bot then 0 else 1000 end,
    0
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ranked_bot_target_power(p_rating integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when coalesce(p_rating,1000)<=900 then 50
    when p_rating<=1050 then 68
    when p_rating<=1200 then 82
    when p_rating<=1400 then 105
    when p_rating<=1600 then 135
    when p_rating<=1800 then 170
    else 215
  end::numeric;
$function$;

CREATE OR REPLACE FUNCTION private.ranked_bot_pick_card(p_bot_id uuid, p_battle_id uuid, p_exclude text[] DEFAULT ARRAY[]::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rating integer;
  v_target numeric;
  v_card text;
begin
  select coalesce(bot_rating_base,battle_rating,1000)
  into v_rating
  from public.players
  where id=p_bot_id and is_bot=true;

  if v_rating is null then raise exception 'RANKED_BOT_NOT_FOUND'; end if;
  v_target:=private.ranked_bot_target_power(v_rating);

  select cp.card_id into v_card
  from private.ranked_bot_card_pool cp
  where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    and cp.battle_power between v_target*.84 and v_target*1.16
  order by random()
  limit 1;

  if v_card is null then
    select cp.card_id into v_card
    from private.ranked_bot_card_pool cp
    where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    order by abs(cp.battle_power-v_target),random()
    limit 1;
  end if;

  if v_card is null then raise exception 'RANKED_BOT_NO_CARD'; end if;
  return v_card;
end;
$function$;

CREATE OR REPLACE FUNCTION private.ranked_bot_take_turn(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  v_bot uuid;
  v_human uuid;
  v_card text;
  v_exclude text[];
  v_player_pick integer;
  v_global_pick integer;
  v_next uuid;
  v_target numeric;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null or not coalesce(b.is_bot_match,false) then
    return jsonb_build_object('acted',false);
  end if;
  if b.status not in ('drafting','selecting') then
    return jsonb_build_object('acted',false,'status',b.status);
  end if;

  select p.id into v_bot
  from public.players p
  where p.id in (b.challenger_id,b.opponent_id) and p.is_bot=true
  limit 1;

  if v_bot is null then
    return jsonb_build_object('acted',false,'reason','bot_missing');
  end if;
  v_human:=case when v_bot=b.challenger_id then b.opponent_id else b.challenger_id end;

  if b.status='drafting' and b.draft_turn_id=v_bot then
    select coalesce(array_agg(d.card_id),array[]::text[])
    into v_exclude
    from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=v_bot;

    v_card:=private.ranked_bot_pick_card(v_bot,b.id,v_exclude);

    select count(*)+1 into v_player_pick
    from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=v_bot;

    v_global_pick:=b.draft_pick_count+1;

    insert into public.battle_draft_cards(
      battle_id,player_id,card_id,pick_no,global_pick_no
    )
    values(b.id,v_bot,v_card,v_player_pick,v_global_pick);

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'draft_card_picked',jsonb_build_object(
      'playerId',v_bot,'cardId',v_card,'pickNo',v_player_pick,
      'globalPickNo',v_global_pick,'bot',true
    ));

    if v_global_pick>=6 then
      update public.battles
      set status='selecting',draft_pick_count=6,draft_turn_id=null,
          active_round=1,
          selection_deadline=now()+make_interval(secs=>selection_seconds),
          updated_at=now()
      where id=b.id;

      insert into public.battle_events(battle_id,event_type,payload)
      values(b.id,'draft_completed',jsonb_build_object(
        'round',1,'selectionSeconds',b.selection_seconds,'botFilled',true
      ));
    else
      v_next:=v_human;
      update public.battles
      set draft_pick_count=v_global_pick,draft_turn_id=v_next,
          selection_deadline=now()+make_interval(secs=>draft_seconds),
          updated_at=now()
      where id=b.id;

      return jsonb_build_object(
        'acted',true,'kind','draft','cardId',v_card,
        'nextPlayerId',v_next
      );
    end if;

    select * into b from public.battles where id=p_battle_id;
  end if;

  if b.status='selecting'
     and not exists(
       select 1 from public.battle_selections s
       where s.battle_id=b.id and s.round_no=b.active_round and s.player_id=v_bot
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      join private.ranked_bot_card_pool cp on cp.card_id=d.card_id
      where d.battle_id=b.id and d.player_id=v_bot
        and not exists(
          select 1 from public.battle_selections used
          where used.battle_id=b.id and used.player_id=v_bot and used.card_id=d.card_id
        )
      order by cp.battle_power desc,random()
      limit 1;
    else
      select coalesce(array_agg(s.card_id),array[]::text[])
      into v_exclude
      from public.battle_selections s
      where s.battle_id=b.id and s.player_id=v_bot;

      v_card:=private.ranked_bot_pick_card(v_bot,b.id,v_exclude);
    end if;

    if v_card is null then
      v_card:=private.ranked_bot_pick_card(v_bot,b.id,array[]::text[]);
    end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,v_bot,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'card_locked',jsonb_build_object(
      'playerId',v_bot,'round',b.active_round,'bot',true
    ));

    return jsonb_build_object(
      'acted',true,'kind','lock','round',b.active_round
    );
  end if;

  return jsonb_build_object('acted',false,'status',b.status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_ranked_bot_take_turn(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  return private.ranked_bot_take_turn(p_battle_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.prepare_ranked_bot_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bot uuid;
  v_human uuid;
  v_prior integer:=0;
  v_scale numeric:=1;
  v_before integer;
  v_raw_after integer;
  v_after integer;
begin
  if new.status<>'completed' or old.status='completed' or not coalesce(new.is_bot_match,false) then
    return new;
  end if;

  select p.id into v_bot
  from public.players p
  where p.id in (new.challenger_id,new.opponent_id) and p.is_bot=true
  limit 1;

  if v_bot is null then return new; end if;
  v_human:=case when v_bot=new.challenger_id then new.opponent_id else new.challenger_id end;

  select count(*) into v_prior
  from public.battles b
  where b.id<>new.id
    and b.is_bot_match=true
    and b.status='completed'
    and b.completed_at>=date_trunc('day',now())
    and v_human in (b.challenger_id,b.opponent_id);

  v_scale:=case when v_prior<6 then 1 when v_prior<12 then .35 else .10 end;

  if v_human=new.challenger_id then
    v_before:=coalesce(new.challenger_rating_before,(select battle_rating from public.players where id=v_human),1000);
    v_raw_after:=coalesce(new.challenger_rating_after,v_before);
    v_after:=v_before+round((v_raw_after-v_before)*v_scale)::integer;
    new.challenger_rating_after:=v_after;
  else
    v_before:=coalesce(new.opponent_rating_before,(select battle_rating from public.players where id=v_human),1000);
    v_raw_after:=coalesce(new.opponent_rating_after,v_before);
    v_after:=v_before+round((v_raw_after-v_before)*v_scale)::integer;
    new.opponent_rating_after:=v_after;
  end if;

  update public.players
  set battle_rating=v_after
  where id=v_human;

  update public.players
  set battle_rating=coalesce(bot_rating_base,battle_rating),
      battle_wins=0,battle_losses=0,battle_streak=0,best_battle_streak=0,
      xp=0,level=1,coins=0,diamonds=0
  where id=v_bot and is_bot=true;

  if v_prior>=12 then
    new.reward_eligible:=false;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_matchmaking_join(p_player_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_joined_at timestamptz;
  v_bot uuid;
  v_bot_rating integer;
  v_bot_turn uuid;
begin
  if p_mode not in ('quick','mystery','draft3') then raise exception 'INVALID_MODE'; end if;
  perform pg_advisory_xact_lock(hashtext('pokemon-cards-global-matchmaking'));

  select battle_rating,account_status,suspended_until
  into v_rating,v_status,v_until
  from public.players
  where id=p_player_id and is_bot=false
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
    select 1 from public.battles
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
  values(p_player_id,p_mode,'waiting',v_rating,v_can_draft,v_season,null,now(),now())
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

  select joined_at into v_joined_at
  from public.matchmaking_queue
  where player_id=p_player_id;

  select q.* into v_opponent
  from public.matchmaking_queue q
  join public.players p on p.id=q.player_id
  where q.status='waiting'
    and q.player_id<>p_player_id
    and p.account_status='active'
    and p.is_bot=false
    and abs(q.rating_snapshot-v_rating)<=
      250+least(1000,floor(extract(epoch from(now()-q.joined_at))/30)::integer*75)
  order by abs(q.rating_snapshot-v_rating),q.joined_at
  for update of q skip locked
  limit 1;

  if v_opponent.player_id is not null then
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
      selection_deadline,draft_turn_id,draft_pick_count,is_ranked,season_id,is_bot_match
    )
    values(
      v_opponent.player_id,p_player_id,v_mode,'none',0,
      case when v_mode='draft3' then 'drafting' else 'selecting' end,
      v_rounds,
      now()+case when v_mode='draft3' then interval '90 seconds' else interval '30 seconds' end,
      case when v_mode='draft3' then v_opponent.player_id else null end,
      0,true,v_season,false
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
    values(v_battle,'matchmade',jsonb_build_object(
      'mode',v_mode,
      'challengerChoice',v_opponent.mode_choice,
      'opponentChoice',p_mode,
      'seasonId',v_season,
      'botMatch',false
    ));

    if v_mode='draft3' then
      insert into public.battle_events(battle_id,event_type,payload)
      values(v_battle,'draft_started',jsonb_build_object(
        'turnPlayerId',v_opponent.player_id,'draftSeconds',90
      ));
    else
      insert into public.battle_events(battle_id,event_type,payload)
      values(v_battle,'started',jsonb_build_object('round',1,'selectionSeconds',30));
    end if;

    perform public.server_queue_notification(
      v_opponent.player_id,'match_found','Partida encontrada!',
      'Um adversário foi encontrado no matchmaking.',
      jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
    );
    perform public.server_queue_notification(
      p_player_id,'match_found','Partida encontrada!',
      'Um adversário foi encontrado no matchmaking.',
      jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
    );

    return jsonb_build_object(
      'status','matched','battleId',v_battle,'mode',v_mode,
      'seasonId',v_season,'botMatch',false
    );
  end if;

  if now()-coalesce(v_joined_at,now())<interval '18 seconds' then
    return jsonb_build_object(
      'status','waiting','modeChoice',p_mode,'seasonId',v_season,
      'botFallbackAfterSeconds',18
    );
  end if;

  select p.id,coalesce(p.bot_rating_base,p.battle_rating)
  into v_bot,v_bot_rating
  from public.players p
  where p.is_bot=true
    and p.account_status='active'
    and p.bot_rating_base is not null
  order by abs(coalesce(p.bot_rating_base,p.battle_rating)-v_rating),random()
  limit 1;

  if v_bot is null then
    return jsonb_build_object(
      'status','waiting','modeChoice',p_mode,'seasonId',v_season,
      'botFallbackAfterSeconds',18,'botUnavailable',true
    );
  end if;

  v_mode:=p_mode;
  v_rounds:=case when v_mode in ('mystery','draft3') then 2 else 1 end;
  v_bot_turn:=case
    when v_mode='draft3' and random()<.5 then v_bot
    when v_mode='draft3' then p_player_id
    else null
  end;

  insert into public.battles(
    challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,
    selection_deadline,draft_turn_id,draft_pick_count,is_ranked,season_id,is_bot_match
  )
  values(
    p_player_id,v_bot,v_mode,'none',0,
    case when v_mode='draft3' then 'drafting' else 'selecting' end,
    v_rounds,
    now()+case when v_mode='draft3' then interval '90 seconds' else interval '30 seconds' end,
    v_bot_turn,0,true,v_season,true
  )
  returning id into v_battle;

  update public.matchmaking_queue
  set status='matched',matched_battle_id=v_battle,updated_at=now()
  where player_id=p_player_id;

  if v_season is not null then
    insert into public.player_seasons(season_id,player_id)
    values(v_season,p_player_id)
    on conflict do nothing;
  end if;

  insert into public.battle_events(battle_id,event_type,payload)
  values(v_battle,'matchmade',jsonb_build_object(
    'mode',v_mode,'challengerChoice',p_mode,'opponentChoice','ai',
    'seasonId',v_season,'botMatch',true,'botRating',v_bot_rating
  ));

  if v_mode='draft3' then
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'draft_started',jsonb_build_object(
      'turnPlayerId',v_bot_turn,'draftSeconds',90,'botMatch',true
    ));
  else
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'started',jsonb_build_object(
      'round',1,'selectionSeconds',30,'botMatch',true
    ));
  end if;

  perform private.ranked_bot_take_turn(v_battle);

  perform public.server_queue_notification(
    p_player_id,'match_found','Treinador IA encontrado!',
    'A fila foi preenchida por um Treinador IA com ELO próximo ao seu.',
    jsonb_build_object(
      'battleId',v_battle,'mode',v_mode,'seasonId',v_season,
      'botMatch',true,'botRating',v_bot_rating
    )
  );

  return jsonb_build_object(
    'status','matched','battleId',v_battle,'mode',v_mode,
    'seasonId',v_season,'botMatch',true,'botRating',v_bot_rating
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_lock_battle_card(p_actor_id uuid, p_battle_id uuid, p_card_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_count integer;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status<>'selecting' then raise exception 'INVALID_STATUS'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists(
    select 1 from public.player_cards
    where player_id=p_actor_id and card_id=p_card_id and quantity>0
  ) then raise exception 'NOT_OWNED'; end if;
  if exists(
    select 1 from public.battle_selections
    where battle_id=b.id and round_no=b.active_round and player_id=p_actor_id
  ) then raise exception 'ALREADY_LOCKED'; end if;

  if b.mode='draft3' then
    if not exists(
      select 1 from public.battle_draft_cards d
      where d.battle_id=b.id and d.player_id=p_actor_id and d.card_id=p_card_id
    ) then raise exception 'CARD_NOT_IN_DRAFT'; end if;
    if exists(
      select 1 from public.battle_selections s
      where s.battle_id=b.id and s.player_id=p_actor_id and s.card_id=p_card_id
    ) then raise exception 'CARD_ALREADY_USED'; end if;
  end if;

  insert into public.battle_selections(battle_id,round_no,player_id,card_id)
  values(b.id,b.active_round,p_actor_id,p_card_id);

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'card_locked',jsonb_build_object(
    'playerId',p_actor_id,'round',b.active_round
  ));

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select count(*) into v_count
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round;

  return jsonb_build_object(
    'locked',true,'bothLocked',v_count=2,'round',b.active_round
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_pick_battle_draft_card(p_actor_id uuid, p_battle_id uuid, p_card_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.battles%rowtype;
  v_player_pick integer;
  v_global_pick integer;
  v_next uuid;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.mode<>'draft3' or b.status<>'drafting' then raise exception 'INVALID_STATUS'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.draft_turn_id<>p_actor_id then raise exception 'NOT_YOUR_TURN'; end if;
  if b.selection_deadline is not null and now()>b.selection_deadline then raise exception 'SELECTION_EXPIRED'; end if;
  if not exists(
    select 1 from public.player_cards pc
    where pc.player_id=p_actor_id and pc.card_id=p_card_id and pc.quantity>0
  ) then raise exception 'NOT_OWNED'; end if;
  if exists(
    select 1 from public.battle_draft_cards d
    where d.battle_id=b.id and d.player_id=p_actor_id and d.card_id=p_card_id
  ) then raise exception 'CARD_ALREADY_DRAFTED'; end if;

  select count(*)+1 into v_player_pick
  from public.battle_draft_cards d
  where d.battle_id=b.id and d.player_id=p_actor_id;

  if v_player_pick>3 then raise exception 'DRAFT_COMPLETE_FOR_PLAYER'; end if;
  v_global_pick:=b.draft_pick_count+1;

  insert into public.battle_draft_cards(battle_id,player_id,card_id,pick_no,global_pick_no)
  values(b.id,p_actor_id,p_card_id,v_player_pick,v_global_pick);

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'draft_card_picked',jsonb_build_object(
    'playerId',p_actor_id,'cardId',p_card_id,'pickNo',v_player_pick,'globalPickNo',v_global_pick
  ));

  if v_global_pick=6 then
    update public.battles
    set status='selecting',draft_pick_count=6,draft_turn_id=null,
        active_round=1,
        selection_deadline=now()+make_interval(secs=>selection_seconds),
        updated_at=now()
    where id=b.id;

    insert into public.battle_events(battle_id,event_type,payload)
    values(b.id,'draft_completed',jsonb_build_object(
      'round',1,'selectionSeconds',b.selection_seconds
    ));

    if b.is_bot_match then perform private.ranked_bot_take_turn(b.id); end if;

    return jsonb_build_object('completed',true,'status','selecting','round',1);
  end if;

  v_next:=case when p_actor_id=b.challenger_id then b.opponent_id else b.challenger_id end;

  update public.battles
  set draft_pick_count=v_global_pick,draft_turn_id=v_next,
      selection_deadline=now()+make_interval(secs=>draft_seconds),updated_at=now()
  where id=b.id;

  if b.is_bot_match then perform private.ranked_bot_take_turn(b.id); end if;

  return jsonb_build_object(
    'completed',false,'pick',v_global_pick,'nextPlayerId',v_next
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_resolve_battle_round(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.battles%rowtype;
  c_card text;
  o_card text;
  v_sim jsonb;
  c_stats jsonb;
  o_stats jsonb;
  c_power numeric;
  o_power numeric;
  c_roll numeric;
  o_roll numeric;
  v_winner uuid;
  v_result jsonb;
  v_seed text;
  v_first boolean;
  v_completed boolean;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true); end if;

  select card_id into c_card
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id;

  select card_id into o_card
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id;

  if c_card is null or o_card is null then
    return jsonb_build_object('waiting',true,'round',b.active_round);
  end if;

  v_seed:=gen_random_uuid()::text;
  v_first:=random()>=.5;
  v_sim:=private.battle_simulate_duel_v6(
    b.id,b.active_round,c_card,o_card,v_seed,v_first
  );

  c_stats:=v_sim->'challenger';
  o_stats:=v_sim->'opponent';
  v_winner:=case
    when v_sim->>'winnerSide'='challenger' then b.challenger_id
    else b.opponent_id
  end;

  c_power:=coalesce((c_stats->>'totalDamageDealt')::numeric,0)
    +coalesce((c_stats->>'remainingHp')::numeric,0);
  o_power:=coalesce((o_stats->>'totalDamageDealt')::numeric,0)
    +coalesce((o_stats->>'remainingHp')::numeric,0);

  c_roll:=private.battle_v6_hash_roll(v_seed||':score:c');
  o_roll:=private.battle_v6_hash_roll(v_seed||':score:o');

  v_result:=public.server_finish_battle_round(
    b.id,b.active_round,c_power,o_power,c_roll,o_roll,v_winner
  );

  update public.battle_rounds
  set challenger_combat=c_stats||jsonb_build_object(
        'firstPlayer',(v_sim->>'firstPlayer')='challenger',
        'resolution',v_sim->>'resolution','rulesVersion',6
      ),
      opponent_combat=o_stats||jsonb_build_object(
        'firstPlayer',(v_sim->>'firstPlayer')='opponent',
        'resolution',v_sim->>'resolution','rulesVersion',6
      ),
      rules_version=6
  where battle_id=b.id and round_no=b.active_round;

  insert into public.battle_events(battle_id,event_type,payload)
  values(b.id,'tcg_v6_resolved',jsonb_build_object(
    'round',b.active_round,'winnerId',v_winner,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'seedDigest',v_sim->>'seedDigest','trace',v_sim->'trace',
    'botMatch',b.is_bot_match
  ));

  v_completed:=coalesce((v_result->>'completed')::boolean,false);
  if b.is_bot_match and not v_completed then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  return v_result||jsonb_build_object(
    'round',b.active_round,
    'challengerCardId',c_card,
    'opponentCardId',o_card,
    'challengerCombat',c_stats,
    'opponentCombat',o_stats,
    'firstPlayer',v_sim->>'firstPlayer',
    'resolution',v_sim->>'resolution',
    'rulesVersion',6,
    'botMatch',b.is_bot_match
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.apply_ranked_battle_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_winner uuid;
  v_loser uuid;
  v_winner_delta integer;
  v_streak integer;
  v_bot uuid;
  v_human uuid;
  v_prior integer:=0;
  v_points integer:=0;
  v_guild_xp integer:=0;
begin
  if new.status<>'completed' or old.status='completed' or not new.is_ranked or new.season_id is null then
    return new;
  end if;

  if coalesce(new.is_bot_match,false) then
    select p.id into v_bot
    from public.players p
    where p.id in (new.challenger_id,new.opponent_id) and p.is_bot=true
    limit 1;

    if v_bot is null then return new; end if;
    v_human:=case when v_bot=new.challenger_id then new.opponent_id else new.challenger_id end;

    update public.matchmaking_queue
    set status='cancelled',matched_battle_id=null,updated_at=now()
    where matched_battle_id=new.id;

    if coalesce(new.forfeit_rating_neutral,false) then
      return new;
    end if;

    select count(*) into v_prior
    from public.battles b
    where b.id<>new.id
      and b.is_bot_match=true
      and b.status='completed'
      and b.completed_at>=date_trunc('day',now())
      and v_human in (b.challenger_id,b.opponent_id);

    if v_prior>=12 then return new; end if;

    if new.winner_id=v_human then
      v_winner_delta:=case when v_human=new.challenger_id
        then greatest(0,coalesce(new.challenger_rating_after,new.challenger_rating_before)-coalesce(new.challenger_rating_before,0))
        else greatest(0,coalesce(new.opponent_rating_after,new.opponent_rating_before)-coalesce(new.opponent_rating_before,0))
      end;
      v_points:=case
        when v_prior<6 then 30+least(v_winner_delta,30)
        else 10+least(v_winner_delta,10)
      end;
      select battle_streak into v_streak from public.players where id=v_human;
      v_guild_xp:=case when v_prior<6 then 5 else 1 end;

      insert into public.player_seasons(
        season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at
      )
      values(new.season_id,v_human,v_points,1,0,1,coalesce(v_streak,0),now(),now())
      on conflict(season_id,player_id) do update
      set points=public.player_seasons.points+excluded.points,
          wins=public.player_seasons.wins+1,
          matches=public.player_seasons.matches+1,
          best_streak=greatest(public.player_seasons.best_streak,excluded.best_streak),
          last_match_at=now(),updated_at=now();
    else
      v_points:=case when v_prior<6 then 10 else 3 end;
      v_guild_xp:=case when v_prior<6 then 2 else 1 end;

      insert into public.player_seasons(
        season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at
      )
      values(new.season_id,v_human,v_points,0,1,1,0,now(),now())
      on conflict(season_id,player_id) do update
      set points=public.player_seasons.points+excluded.points,
          losses=public.player_seasons.losses+1,
          matches=public.player_seasons.matches+1,
          last_match_at=now(),updated_at=now();
    end if;

    update public.guilds g
    set xp=g.xp+v_guild_xp,
        level=greatest(g.level,1+floor((g.xp+v_guild_xp)/500.0)::integer)
    where g.id=(
      select gm.guild_id from public.guild_members gm
      where gm.player_id=v_human limit 1
    );

    return new;
  end if;

  v_winner:=new.winner_id;
  v_loser:=case when v_winner=new.challenger_id then new.opponent_id else new.challenger_id end;

  v_winner_delta:=case when v_winner=new.challenger_id
    then greatest(0,coalesce(new.challenger_rating_after,new.challenger_rating_before)-coalesce(new.challenger_rating_before,0))
    else greatest(0,coalesce(new.opponent_rating_after,new.opponent_rating_before)-coalesce(new.opponent_rating_before,0))
  end;

  select battle_streak into v_streak from public.players where id=v_winner;

  insert into public.player_seasons(
    season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at
  )
  values(new.season_id,v_winner,30+least(v_winner_delta,30),1,0,1,coalesce(v_streak,0),now(),now())
  on conflict(season_id,player_id) do update
  set points=public.player_seasons.points+excluded.points,
      wins=public.player_seasons.wins+1,
      matches=public.player_seasons.matches+1,
      best_streak=greatest(public.player_seasons.best_streak,excluded.best_streak),
      last_match_at=now(),updated_at=now();

  insert into public.player_seasons(
    season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at
  )
  values(new.season_id,v_loser,10,0,1,1,0,now(),now())
  on conflict(season_id,player_id) do update
  set points=public.player_seasons.points+10,
      losses=public.player_seasons.losses+1,
      matches=public.player_seasons.matches+1,
      last_match_at=now(),updated_at=now();

  update public.guilds g
  set xp=g.xp+5,level=greatest(g.level,1+floor((g.xp+5)/500.0)::integer)
  where g.id=(select gm.guild_id from public.guild_members gm where gm.player_id=v_winner limit 1);

  update public.guilds g
  set xp=g.xp+2,level=greatest(g.level,1+floor((g.xp+2)/500.0)::integer)
  where g.id=(select gm.guild_id from public.guild_members gm where gm.player_id=v_loser limit 1);

  update public.matchmaking_queue
  set status='cancelled',matched_battle_id=null,updated_at=now()
  where matched_battle_id=new.id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.trg_battle_pass_battle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bot uuid;
  v_human uuid;
  v_prior integer:=0;
begin
  if new.status='completed' and old.status is distinct from new.status then
    if coalesce(new.is_bot_match,false) then
      select p.id into v_bot
      from public.players p
      where p.id in (new.challenger_id,new.opponent_id) and p.is_bot=true
      limit 1;

      if v_bot is null then return new; end if;
      v_human:=case when v_bot=new.challenger_id then new.opponent_id else new.challenger_id end;

      if coalesce(new.forfeit_rating_neutral,false) then return new; end if;

      select count(*) into v_prior
      from public.battles b
      where b.id<>new.id
        and b.is_bot_match=true
        and b.status='completed'
        and b.completed_at>=date_trunc('day',now())
        and v_human in (b.challenger_id,b.opponent_id);

      if v_prior<12 then
        perform private.battle_pass_record_event(v_human,'play_battle',1);
        if new.winner_id=v_human then
          perform private.battle_pass_record_event(v_human,'win_battle',1);
          perform private.battle_pass_record_event(v_human,'ranked_win',1);
        end if;
      end if;
      return new;
    end if;

    perform private.battle_pass_record_event(new.challenger_id,'play_battle',1);
    perform private.battle_pass_record_event(new.opponent_id,'play_battle',1);
    if new.winner_id is not null then
      perform private.battle_pass_record_event(new.winner_id,'win_battle',1);
      if coalesce(new.is_ranked,false) then
        perform private.battle_pass_record_event(new.winner_id,'ranked_win',1);
      end if;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_collection_value_leaderboard(p_limit integer DEFAULT 100)
 RETURNS TABLE(global_rank bigint, player_id uuid, username text, collection_value_usd numeric, priced_card_copies bigint, total_card_copies bigint, price_coverage_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with totals as (
    select
      p.id as player_id,
      p.username,
      coalesce(sum(coalesce(c.market_price_usd,0)),0)::numeric(14,2) as collection_value_usd,
      count(pc.card_id) filter(where c.market_price_usd is not null)::bigint as priced_card_copies,
      count(pc.card_id)::bigint as total_card_copies
    from public.players p
    left join public.player_cards pc on pc.player_id=p.id and pc.quantity>0
    left join public.cards c on c.id=pc.card_id
    where p.is_bot=false
    group by p.id,p.username
  ),
  ranked as (
    select
      dense_rank() over(order by collection_value_usd desc,total_card_copies desc,username asc) as global_rank,
      *,
      case
        when total_card_copies=0 then 0::numeric
        else round((priced_card_copies::numeric/total_card_copies::numeric)*100,1)
      end as price_coverage_pct
    from totals
  )
  select
    global_rank,player_id,username,collection_value_usd,
    priced_card_copies,total_card_copies,price_coverage_pct
  from ranked
  where auth.uid() is not null
  order by global_rank,username
  limit greatest(1,least(coalesce(p_limit,100),200));
$function$;

CREATE OR REPLACE FUNCTION private.get_my_rank_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid:=auth.uid();
  v_battle_rank bigint;
  v_battle_total bigint;
  v_collection_rank bigint;
  v_collection_total bigint;
  v_collection_value numeric:=0;
  v_rating integer:=1000;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  with ranked as (
    select
      p.id,p.battle_rating,
      row_number() over(order by p.battle_rating desc,p.battle_wins desc,p.username) rn,
      count(*) over() total
    from public.players p
    where p.account_status<>'banned' and p.is_bot=false
  )
  select rn,total,battle_rating
  into v_battle_rank,v_battle_total,v_rating
  from ranked
  where id=v_player;

  with values_by_player as (
    select
      p.id,
      coalesce(sum(case when pc.quantity>0 then coalesce(c.market_price_usd,0) else 0 end),0)::numeric value_usd
    from public.players p
    left join public.player_cards pc on pc.player_id=p.id and pc.quantity>0
    left join public.cards c on c.id=pc.card_id
    where p.account_status<>'banned' and p.is_bot=false
    group by p.id
  ),
  ranked as (
    select
      id,value_usd,
      row_number() over(order by value_usd desc,id) rn,
      count(*) over() total
    from values_by_player
  )
  select rn,total,value_usd
  into v_collection_rank,v_collection_total,v_collection_value
  from ranked
  where id=v_player;

  return jsonb_build_object(
    'battle',jsonb_build_object(
      'rank',coalesce(v_battle_rank,0),
      'total',coalesce(v_battle_total,0),
      'rating',coalesce(v_rating,1000)
    ),
    'collection',jsonb_build_object(
      'rank',coalesce(v_collection_rank,0),
      'total',coalesce(v_collection_total,0),
      'valueUsd',coalesce(v_collection_value,0)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_friend_action(p_actor_id uuid, p_target_id uuid, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_actor_id=p_target_id then raise exception 'CANNOT_FRIEND_SELF'; end if;

  if exists(
    select 1 from public.players
    where id in (p_actor_id,p_target_id) and is_bot=true
  ) then
    raise exception 'BOT_SOCIAL_DISABLED';
  end if;

  if not exists(select 1 from public.players where id=p_target_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_action='send' then
    if exists(
      select 1 from public.friendships
      where status='accepted'
        and (
          (requester_id=p_actor_id and addressee_id=p_target_id)
          or (requester_id=p_target_id and addressee_id=p_actor_id)
        )
    ) then return 'accepted'; end if;

    update public.friendships
    set status='accepted'
    where requester_id=p_target_id and addressee_id=p_actor_id and status='pending';

    if found then return 'accepted'; end if;

    insert into public.friendships(requester_id,addressee_id,status)
    values(p_actor_id,p_target_id,'pending')
    on conflict(requester_id,addressee_id)
    do update set status=case
      when public.friendships.status='blocked' then public.friendships.status
      else 'pending'::public.friend_status
    end;

    return 'pending';

  elsif p_action='accept' then
    update public.friendships
    set status='accepted'
    where requester_id=p_target_id and addressee_id=p_actor_id and status='pending';
    if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;
    return 'accepted';

  elsif p_action='decline' then
    delete from public.friendships
    where requester_id=p_target_id and addressee_id=p_actor_id and status='pending';
    if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;
    return 'declined';

  elsif p_action='remove' then
    delete from public.friendships
    where status='accepted'
      and (
        (requester_id=p_actor_id and addressee_id=p_target_id)
        or (requester_id=p_target_id and addressee_id=p_actor_id)
      );
    if not found then raise exception 'FRIENDSHIP_NOT_FOUND'; end if;
    return 'removed';
  else
    raise exception 'INVALID_FRIEND_ACTION';
  end if;
end;
$function$;

drop trigger if exists trg_sync_ranked_bot_card_power on public.cards;
create trigger trg_sync_ranked_bot_card_power
after insert or update of tcg_data,pokedex_numbers or delete
on public.cards
for each row execute function private.sync_ranked_bot_card_power();

drop trigger if exists trg_protect_player_bot_flags on public.players;
create trigger trg_protect_player_bot_flags
before update of is_bot,bot_rating_base
on public.players
for each row execute function private.protect_player_bot_flags();

drop trigger if exists trg_00_ranked_bot_completion on public.battles;
create trigger trg_00_ranked_bot_completion
before update of status
on public.battles
for each row execute function private.prepare_ranked_bot_completion();

revoke all on function public.server_ranked_bot_take_turn(uuid) from public,anon,authenticated;
grant execute on function public.server_ranked_bot_take_turn(uuid) to service_role;
