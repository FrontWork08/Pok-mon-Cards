-- Retention/gameplay expansion snapshot generated from the active Pokémon Cards backend.
-- Adds seasons, persistent ranked matchmaking, daily streaks, card chase,
-- collection rewards, profile showcase, guild progression, live events and pity.

create table if not exists public.seasons (
  id text primary key,
  name text not null,
  subtitle text not null default '',
  theme_color text not null default '#FFD447',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  reward_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.seasons enable row level security;
grant select on public.seasons to authenticated;
drop policy if exists "seasons readable by authenticated" on public.seasons;
create policy "seasons readable by authenticated" on public.seasons
for select to authenticated using (true);

insert into public.seasons(id,name,subtitle,theme_color,starts_at,ends_at,active,reward_config)
values(
  's1-genesis','Temporada 1: Genesis',
  'Construa sua coleção, suba no ranque e deixe sua marca.','#FFD447',
  date_trunc('day',now()),date_trunc('day',now())+interval '45 days',true,
  jsonb_build_object(
    'bronze',jsonb_build_object('points',0,'coins',5000,'diamonds',0),
    'silver',jsonb_build_object('points',300,'coins',12000,'diamonds',1),
    'gold',jsonb_build_object('points',700,'coins',25000,'diamonds',2),
    'platinum',jsonb_build_object('points',1200,'coins',50000,'diamonds',4),
    'master',jsonb_build_object('points',1800,'coins',90000,'diamonds',7),
    'grand',jsonb_build_object('points',2600,'coins',150000,'diamonds',12)
  )
)
on conflict(id) do nothing;

create table if not exists public.player_seasons (
  season_id text not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  points integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  matches integer not null default 0,
  best_streak integer not null default 0,
  reward_claimed boolean not null default false,
  last_match_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(season_id,player_id)
);
alter table public.player_seasons enable row level security;
grant select on public.player_seasons to authenticated;
drop policy if exists "season standings readable" on public.player_seasons;
create policy "season standings readable" on public.player_seasons
for select to authenticated using (true);
create index if not exists player_seasons_points_idx
on public.player_seasons(season_id,points desc,wins desc,matches asc);

alter table public.battles add column if not exists is_ranked boolean not null default false;
alter table public.battles add column if not exists season_id text references public.seasons(id) on delete set null;
create index if not exists battles_ranked_season_idx
on public.battles(season_id,is_ranked,status,completed_at desc);

create table if not exists public.matchmaking_queue (
  player_id uuid primary key references public.players(id) on delete cascade,
  mode_choice text not null check(mode_choice in ('quick','mystery','draft3')),
  status text not null default 'waiting' check(status in ('waiting','matched','cancelled')),
  rating_snapshot integer not null default 1000,
  can_draft boolean not null default false,
  season_id text references public.seasons(id) on delete set null,
  matched_battle_id uuid references public.battles(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.matchmaking_queue enable row level security;
grant select on public.matchmaking_queue to authenticated;
drop policy if exists "own matchmaking state readable" on public.matchmaking_queue;
create policy "own matchmaking state readable" on public.matchmaking_queue
for select to authenticated using ((select auth.uid())=player_id);
create index if not exists matchmaking_waiting_idx
on public.matchmaking_queue(status,joined_at,rating_snapshot);

create table if not exists public.player_login_streaks (
  player_id uuid primary key references public.players(id) on delete cascade,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  total_claims integer not null default 0,
  last_claim_date date,
  updated_at timestamptz not null default now()
);
alter table public.player_login_streaks enable row level security;
grant select on public.player_login_streaks to authenticated;
drop policy if exists "own login streak readable" on public.player_login_streaks;
create policy "own login streak readable" on public.player_login_streaks
for select to authenticated using ((select auth.uid())=player_id);

create table if not exists public.card_wishlist (
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  priority smallint not null default 1 check(priority between 1 and 3),
  notify_market boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(player_id,card_id)
);
alter table public.card_wishlist enable row level security;
grant select,insert,update,delete on public.card_wishlist to authenticated;
drop policy if exists "own wishlist readable" on public.card_wishlist;
drop policy if exists "own wishlist insert" on public.card_wishlist;
drop policy if exists "own wishlist update" on public.card_wishlist;
drop policy if exists "own wishlist delete" on public.card_wishlist;
create policy "own wishlist readable" on public.card_wishlist for select to authenticated using ((select auth.uid())=player_id);
create policy "own wishlist insert" on public.card_wishlist for insert to authenticated with check ((select auth.uid())=player_id);
create policy "own wishlist update" on public.card_wishlist for update to authenticated using ((select auth.uid())=player_id) with check ((select auth.uid())=player_id);
create policy "own wishlist delete" on public.card_wishlist for delete to authenticated using ((select auth.uid())=player_id);
create index if not exists card_wishlist_card_idx on public.card_wishlist(card_id);

create table if not exists public.collection_milestone_claims (
  player_id uuid not null references public.players(id) on delete cascade,
  milestone_kind text not null check(milestone_kind in ('pokedex_total','pokedex_gen','set_complete')),
  milestone_key text not null,
  reward_coins bigint not null default 0,
  reward_diamonds integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key(player_id,milestone_kind,milestone_key)
);
alter table public.collection_milestone_claims enable row level security;
grant select on public.collection_milestone_claims to authenticated;
drop policy if exists "own milestone claims readable" on public.collection_milestone_claims;
create policy "own milestone claims readable" on public.collection_milestone_claims
for select to authenticated using ((select auth.uid())=player_id);

create table if not exists public.profile_showcase (
  player_id uuid not null references public.players(id) on delete cascade,
  slot smallint not null check(slot between 1 and 6),
  card_id text not null references public.cards(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key(player_id,slot),
  unique(player_id,card_id)
);
alter table public.profile_showcase enable row level security;
grant select,insert,update,delete on public.profile_showcase to authenticated;
drop policy if exists "showcase readable" on public.profile_showcase;
drop policy if exists "own showcase insert" on public.profile_showcase;
drop policy if exists "own showcase update" on public.profile_showcase;
drop policy if exists "own showcase delete" on public.profile_showcase;
create policy "showcase readable" on public.profile_showcase for select to authenticated using (true);
create policy "own showcase insert" on public.profile_showcase for insert to authenticated
with check ((select auth.uid())=player_id and exists(
  select 1 from public.player_cards pc where pc.player_id=(select auth.uid()) and pc.card_id=profile_showcase.card_id and pc.quantity>0
));
create policy "own showcase update" on public.profile_showcase for update to authenticated
using ((select auth.uid())=player_id)
with check ((select auth.uid())=player_id and exists(
  select 1 from public.player_cards pc where pc.player_id=(select auth.uid()) and pc.card_id=profile_showcase.card_id and pc.quantity>0
));
create policy "own showcase delete" on public.profile_showcase for delete to authenticated using ((select auth.uid())=player_id);

create table if not exists private.player_pack_pity (
  player_id uuid not null references public.players(id) on delete cascade,
  set_id text not null,
  misses integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(player_id,set_id)
);
alter table private.player_pack_pity enable row level security;

alter table public.guilds add column if not exists xp bigint not null default 0;
alter table public.guilds add column if not exists level integer not null default 1;

alter table public.admin_game_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.admin_game_events drop constraint if exists admin_game_events_type_check;
alter table public.admin_game_events add constraint admin_game_events_type_check
check(event_type in ('free_boosters','double_xp','rare_boost','featured_set'));

alter table public.mission_definitions_v2 drop constraint if exists mission_definitions_v2_event_type_check;
alter table public.mission_definitions_v2 add constraint mission_definitions_v2_event_type_check
check(event_type in (
  'pack_opened','battle_completed','battle_won','trade_completed',
  'market_listing','market_sale','card_discovered','ranked_match','ranked_win'
));

insert into public.achievement_definitions(id,name,description,category,target,title,icon,sort_order,active)
values
('collector_500','Coleção de elite','Tenha 500 cartas diferentes na coleção.','collection',500,'Colecionador de Elite','🗂️',22,true),
('collector_1000','Arquivo lendário','Tenha 1.000 cartas diferentes na coleção.','collection',1000,'Arquivo Lendário','📚',23,true),
('packs_100','Centena de boosters','Abra 100 boosters.','collection',100,'Pack Maniac','🎁',24,true),
('packs_500','Lenda dos boosters','Abra 500 boosters.','collection',500,'Lenda dos Boosters','✨',25,true),
('wins_100','Centurião da arena','Vença 100 batalhas.','battle',100,'Centurião','🏆',17,true),
('streak_10','Sequência de 10','Consiga 10 vitórias seguidas.','battle',10,'Inabalável','🔥',18,true),
('pokedex_151','Pokédex de Kanto','Descubra pelo menos 151 espécies.','collection',151,'Mestre de Kanto','🔴',26,true),
('set_complete_1','Primeiro set completo','Complete 100% de um set.','collection',1,'Set Master','💿',27,true),
('ranked_25','Competidor ranqueado','Complete 25 partidas ranqueadas.','battle',25,'Competidor','⚔️',19,true)
on conflict(id) do update set
name=excluded.name,description=excluded.description,category=excluded.category,target=excluded.target,
title=excluded.title,icon=excluded.icon,sort_order=excluded.sort_order,active=true;

insert into public.mission_definitions_v2(id,title,description,cadence,event_type,target,reward_coins,reward_xp,reward_diamonds,action_route,sort_order,active)
values
('d_ranked_1','Entre no ranque','Complete 1 partida ranqueada hoje.','daily','ranked_match',1,2200,70,0,'/(tabs)/battles',35,true),
('w_ranked_5','Escalada competitiva','Complete 5 partidas ranqueadas nesta semana.','weekly','ranked_match',5,18000,500,2,'/(tabs)/battles',125,true),
('w_ranked_win_3','Subindo de divisão','Vença 3 partidas ranqueadas nesta semana.','weekly','ranked_win',3,24000,650,3,'/(tabs)/battles',126,true)
on conflict(id) do update set
title=excluded.title,description=excluded.description,cadence=excluded.cadence,event_type=excluded.event_type,
target=excluded.target,reward_coins=excluded.reward_coins,reward_xp=excluded.reward_xp,
reward_diamonds=excluded.reward_diamonds,action_route=excluded.action_route,sort_order=excluded.sort_order,active=true;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='matchmaking_queue') then
    alter publication supabase_realtime add table public.matchmaking_queue;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_seasons') then
    alter publication supabase_realtime add table public.player_seasons;
  end if;
end $$;

CREATE OR REPLACE FUNCTION private.apply_pack_guild_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.guilds g
  set xp=g.xp+1, level=greatest(g.level,1+floor((g.xp+1)/500.0)::integer)
  where g.id=(select gm.guild_id from public.guild_members gm where gm.player_id=new.player_id limit 1);
  return new;
end;
$function$


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
begin
  if new.status<>'completed' or old.status='completed' or not new.is_ranked or new.season_id is null then
    return new;
  end if;

  v_winner:=new.winner_id;
  v_loser:=case when v_winner=new.challenger_id then new.opponent_id else new.challenger_id end;
  v_winner_delta:=case when v_winner=new.challenger_id
    then greatest(0,coalesce(new.challenger_rating_after,new.challenger_rating_before)-coalesce(new.challenger_rating_before,0))
    else greatest(0,coalesce(new.opponent_rating_after,new.opponent_rating_before)-coalesce(new.opponent_rating_before,0)) end;

  select battle_streak into v_streak from public.players where id=v_winner;

  insert into public.player_seasons(season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at)
  values(new.season_id,v_winner,30+least(v_winner_delta,30),1,0,1,coalesce(v_streak,0),now(),now())
  on conflict(season_id,player_id) do update
  set points=public.player_seasons.points+excluded.points,
      wins=public.player_seasons.wins+1,
      matches=public.player_seasons.matches+1,
      best_streak=greatest(public.player_seasons.best_streak,excluded.best_streak),
      last_match_at=now(),updated_at=now();

  insert into public.player_seasons(season_id,player_id,points,wins,losses,matches,best_streak,last_match_at,updated_at)
  values(new.season_id,v_loser,10,0,1,1,0,now(),now())
  on conflict(season_id,player_id) do update
  set points=public.player_seasons.points+10,
      losses=public.player_seasons.losses+1,
      matches=public.player_seasons.matches+1,
      last_match_at=now(),updated_at=now();

  update public.guilds g
  set xp=g.xp+5, level=greatest(g.level,1+floor((g.xp+5)/500.0)::integer)
  where g.id=(select gm.guild_id from public.guild_members gm where gm.player_id=v_winner limit 1);

  update public.guilds g
  set xp=g.xp+2, level=greatest(g.level,1+floor((g.xp+2)/500.0)::integer)
  where g.id=(select gm.guild_id from public.guild_members gm where gm.player_id=v_loser limit 1);

  update public.matchmaking_queue
  set status='cancelled',matched_battle_id=null,updated_at=now()
  where matched_battle_id=new.id;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.calculate_mission_progress(p_player_id uuid, p_event_type text, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_progress bigint:=0;
begin
  case p_event_type
    when 'pack_opened' then
      select count(*) into v_progress from public.pack_openings
      where player_id=p_player_id and opened_at>=p_period_start and opened_at<p_period_end;
    when 'battle_completed' then
      select count(*) into v_progress from public.battles
      where status='completed' and completed_at>=p_period_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'battle_won' then
      select count(*) into v_progress from public.battles
      where status='completed' and winner_id=p_player_id and completed_at>=p_period_start and completed_at<p_period_end;
    when 'ranked_match' then
      select count(*) into v_progress from public.battles
      where status='completed' and is_ranked and completed_at>=p_period_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'ranked_win' then
      select count(*) into v_progress from public.battles
      where status='completed' and is_ranked and winner_id=p_player_id
        and completed_at>=p_period_start and completed_at<p_period_end;
    when 'trade_completed' then
      select count(*) into v_progress from public.trades
      where status='completed' and updated_at>=p_period_start and updated_at<p_period_end
        and (sender_id=p_player_id or receiver_id=p_player_id);
    when 'market_listing' then
      select count(*) into v_progress from public.market_listings
      where seller_id=p_player_id and created_at>=p_period_start and created_at<p_period_end;
    when 'market_sale' then
      select count(*) into v_progress from public.market_listings
      where seller_id=p_player_id and status='sold' and sold_at>=p_period_start and sold_at<p_period_end;
    when 'card_discovered' then
      select count(*) into v_progress from public.player_cards
      where player_id=p_player_id and first_obtained_at>=p_period_start and first_obtained_at<p_period_end;
    else v_progress:=0;
  end case;
  return least(v_progress,2147483647)::integer;
end;
$function$


CREATE OR REPLACE FUNCTION private.claim_collection_milestone(p_kind text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_progress integer := 0;
  v_target integer := 0;
  v_coins bigint := 0;
  v_diamonds integer := 0;
  v_gen integer;
  v_min integer;
  v_max integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_kind not in ('pokedex_total','pokedex_gen','set_complete') then raise exception 'INVALID_MILESTONE'; end if;
  if exists(select 1 from public.collection_milestone_claims where player_id=v_player and milestone_kind=p_kind and milestone_key=p_key)
    then raise exception 'ALREADY_CLAIMED'; end if;

  if p_kind='pokedex_total' then
    v_target := p_key::integer;
    if v_target not in (50,151,251,386,493,649,721,809,905,1025) then raise exception 'INVALID_MILESTONE'; end if;
    select count(distinct n) into v_progress
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=v_player and pc.quantity>0;
    v_coins := 2500 + v_target * 40;
    v_diamonds := case when v_target>=905 then 5 when v_target>=649 then 3 when v_target>=251 then 2 else 1 end;
  elsif p_kind='pokedex_gen' then
    v_gen := p_key::integer;
    if v_gen < 1 or v_gen > 9 then raise exception 'INVALID_MILESTONE'; end if;
    v_min := case v_gen when 1 then 1 when 2 then 152 when 3 then 252 when 4 then 387 when 5 then 494 when 6 then 650 when 7 then 722 when 8 then 810 else 906 end;
    v_max := case v_gen when 1 then 151 when 2 then 251 when 3 then 386 when 4 then 493 when 5 then 649 when 6 then 721 when 7 then 809 when 8 then 905 else 1025 end;
    v_target := v_max-v_min+1;
    select count(distinct n) into v_progress
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=v_player and pc.quantity>0 and n between v_min and v_max;
    v_coins := 12000 + v_gen * 2500;
    v_diamonds := 2 + floor(v_gen/3.0)::integer;
  else
    select count(*) into v_target from public.cards where set_id=p_key;
    if v_target < 1 then raise exception 'SET_NOT_FOUND'; end if;
    select count(*) into v_progress
    from public.player_cards pc join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player and pc.quantity>0 and c.set_id=p_key;
    v_coins := greatest(10000,v_target*150);
    v_diamonds := case when v_target>=200 then 5 when v_target>=100 then 3 else 2 end;
  end if;

  if v_progress < v_target then raise exception 'MILESTONE_NOT_COMPLETE'; end if;

  insert into public.collection_milestone_claims(player_id,milestone_kind,milestone_key,reward_coins,reward_diamonds)
  values(v_player,p_kind,p_key,v_coins,v_diamonds);

  update public.players set coins=coins+v_coins,diamonds=diamonds+v_diamonds where id=v_player;

  return jsonb_build_object('kind',p_kind,'key',p_key,'progress',v_progress,'target',v_target,'coins',v_coins,'diamonds',v_diamonds);
end;
$function$


CREATE OR REPLACE FUNCTION private.claim_daily_login()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_row public.player_login_streaks%rowtype;
  v_streak integer;
  v_day integer;
  v_coins bigint;
  v_diamonds integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  insert into public.player_login_streaks(player_id)
  values(v_player)
  on conflict(player_id) do nothing;

  select * into v_row
  from public.player_login_streaks
  where player_id=v_player
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
  where player_id=v_player;

  update public.players
  set coins=coins+v_coins, diamonds=diamonds+v_diamonds
  where id=v_player;

  perform public.server_queue_notification(
    v_player,'daily_streak','Sequência diária 🔥',
    'Dia '||v_day||' do ciclo: +'||v_coins||' Coins'||case when v_diamonds>0 then ' e +1 Diamante.' else '.' end,
    jsonb_build_object('streak',v_streak,'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds)
  );

  return jsonb_build_object(
    'claimed',true,'streak',v_streak,'bestStreak',greatest(v_row.best_streak,v_streak),
    'cycleDay',v_day,'coins',v_coins,'diamonds',v_diamonds,'nextClaimDate',current_date+1
  );
end;
$function$


CREATE OR REPLACE FUNCTION private.claim_season_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_season public.seasons%rowtype;
  v_ps public.player_seasons%rowtype;
  v_tier text := 'bronze';
  v_coins bigint := 0;
  v_diamonds integer := 0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_season from public.seasons
  where ends_at <= now()
  order by ends_at desc limit 1;
  if not found then raise exception 'NO_FINISHED_SEASON'; end if;

  select * into v_ps from public.player_seasons
  where season_id=v_season.id and player_id=v_player
  for update;
  if not found then raise exception 'NO_SEASON_PROGRESS'; end if;
  if v_ps.reward_claimed then raise exception 'ALREADY_CLAIMED'; end if;

  v_tier := case
    when v_ps.points>=2600 then 'grand'
    when v_ps.points>=1800 then 'master'
    when v_ps.points>=1200 then 'platinum'
    when v_ps.points>=700 then 'gold'
    when v_ps.points>=300 then 'silver'
    else 'bronze' end;

  v_coins := coalesce((v_season.reward_config->v_tier->>'coins')::bigint,0);
  v_diamonds := coalesce((v_season.reward_config->v_tier->>'diamonds')::integer,0);

  update public.player_seasons set reward_claimed=true,updated_at=now()
  where season_id=v_season.id and player_id=v_player;
  update public.players set coins=coins+v_coins,diamonds=diamonds+v_diamonds where id=v_player;

  return jsonb_build_object('seasonId',v_season.id,'tier',v_tier,'coins',v_coins,'diamonds',v_diamonds);
end;
$function$


CREATE OR REPLACE FUNCTION private.current_season_id()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select id from public.seasons
  where active and starts_at <= now() and ends_at > now()
  order by starts_at desc
  limit 1
$function$


CREATE OR REPLACE FUNCTION private.ensure_active_season()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id text;
  v_rewards jsonb;
  v_next_no integer;
begin
  update public.seasons
  set active=false
  where active and ends_at<=now();

  select id into v_id
  from public.seasons
  where active and starts_at<=now() and ends_at>now()
  order by starts_at desc limit 1;

  if v_id is not null then return v_id; end if;

  select reward_config into v_rewards
  from public.seasons
  order by ends_at desc limit 1;

  if v_rewards is null then
    v_rewards:=jsonb_build_object(
      'bronze',jsonb_build_object('points',0,'coins',5000,'diamonds',0),
      'silver',jsonb_build_object('points',300,'coins',12000,'diamonds',1),
      'gold',jsonb_build_object('points',700,'coins',25000,'diamonds',2),
      'platinum',jsonb_build_object('points',1200,'coins',50000,'diamonds',4),
      'master',jsonb_build_object('points',1800,'coins',90000,'diamonds',7),
      'grand',jsonb_build_object('points',2600,'coins',150000,'diamonds',12)
    );
  end if;

  select count(*)+1 into v_next_no from public.seasons;
  v_id:='season-'||to_char(now(),'YYYYMMDD-HH24MI');

  insert into public.seasons(id,name,subtitle,theme_color,starts_at,ends_at,active,reward_config)
  values(
    v_id,
    'Temporada '||v_next_no,
    'Nova corrida competitiva: suba de divisão e conquiste recompensas.',
    '#FFD447',
    now(),
    now()+interval '45 days',
    true,
    v_rewards
  );

  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION private.get_guild_hub()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_week timestamptz:=date_trunc('week',now());
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  with guild_totals as (
    select g.id,g.name,g.color,g.motto,g.leader_id,g.xp,g.level,
      leader.username as leader_username,
      count(distinct gm.player_id)::integer as member_count,
      coalesce(sum(coalesce(c.market_price_usd,0)),0)::numeric(14,2) as collection_value_usd
    from public.guilds g
    left join public.players leader on leader.id=g.leader_id
    left join public.guild_members gm on gm.guild_id=g.id
    left join public.player_cards pc on pc.player_id=gm.player_id and pc.quantity>0
    left join public.cards c on c.id=pc.card_id
    group by g.id,g.name,g.color,g.motto,g.leader_id,g.xp,g.level,leader.username
  ), ranked as (
    select *,dense_rank() over(order by collection_value_usd desc,member_count desc,name) as guild_rank
    from guild_totals
  )
  select jsonb_build_object(
    'guilds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'color',r.color,'motto',r.motto,
      'leaderId',r.leader_id,'leaderUsername',r.leader_username,
      'memberCount',r.member_count,'collectionValueUsd',r.collection_value_usd,'rank',r.guild_rank,
      'xp',r.xp,'level',r.level,
      'members',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'username',p.username,'level',p.level,'role',gm.role,'joinedAt',gm.joined_at
        ) order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end,p.username)
        from public.guild_members gm join public.players p on p.id=gm.player_id
        where gm.guild_id=r.id
      ),'[]'::jsonb),
      'missions',jsonb_build_array(
        jsonb_build_object(
          'id','guild_xp','icon','flash','title','Ascensão da Guilda',
          'description','Ganhe XP abrindo boosters e disputando partidas ranqueadas.',
          'progress',r.xp%500,'target',500,'completed',false
        ),
        jsonb_build_object(
          'id','collection_value','icon','diamond','title','Tesouro da Guilda',
          'description','Somar US$ 10.000 em cartas únicas entre todos os membros.',
          'progress',least(r.collection_value_usd,10000),'target',10000,
          'completed',r.collection_value_usd>=10000
        ),
        jsonb_build_object(
          'id','weekly_boosters','icon','cube','title','Caçadores de Boosters',
          'description','Abrir 25 boosters em conjunto nesta semana.',
          'progress',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_week),
          'target',25,
          'completed',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_week)>=25
        ),
        jsonb_build_object(
          'id','weekly_wins','icon','trophy','title','Domínio da Arena',
          'description','Conquistar 10 vitórias válidas em batalha nesta semana.',
          'progress',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_week),
          'target',10,
          'completed',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_week)>=10
        )
      )
    ) order by r.guild_rank,r.name) from ranked r),'[]'::jsonb),
    'myMembership',(
      select jsonb_build_object('guildId',gm.guild_id,'role',gm.role,'joinedAt',gm.joined_at)
      from public.guild_members gm where gm.player_id=v_actor
    ),
    'myInvites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',gi.id,'guildId',gi.guild_id,'guildName',g.name,'guildColor',g.color,
        'invitedBy',gi.invited_by,'invitedByUsername',p.username,'createdAt',gi.created_at
      ) order by gi.created_at desc)
      from public.guild_invites gi
      join public.guilds g on g.id=gi.guild_id
      join public.players p on p.id=gi.invited_by
      where gi.invited_player_id=v_actor and gi.status='pending'
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION private.get_public_player_profile(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  select jsonb_build_object(
    'player',jsonb_build_object(
      'id',p.id,'username',p.username,'profileIcon',p.profile_icon,'level',p.level,
      'battleWins',p.battle_wins,'battleLosses',p.battle_losses,'battleStreak',p.battle_streak,
      'battleRating',case when p.id=v_actor or p.show_battle_rating then p.battle_rating else null end,
      'showBattleRating',p.show_battle_rating,
      'equippedTitle',case when ad.id is null then null else jsonb_build_object('id',ad.id,'title',ad.title,'icon',ad.icon) end,
      'guild',case when g.id is null then null else jsonb_build_object(
        'id',g.id,'name',g.name,'color',g.color,'role',gm.role,'level',g.level,'xp',g.xp
      ) end
    ),
    'collection',jsonb_build_object(
      'uniqueCards',(select count(*) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalCopies',(select coalesce(sum(pc.quantity),0) from public.player_cards pc where pc.player_id=p.id and pc.quantity>0),
      'totalValueUsd',(select coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0)::numeric(14,2)
        from public.player_cards pc join public.cards c on c.id=pc.card_id
        where pc.player_id=p.id and pc.quantity>0),
      'rarestCards',coalesce((select jsonb_agg(to_jsonb(r) order by r.rarity_tier desc,r."marketPriceUsd" desc nulls last,r.name)
        from (select c.id,c.pokemon_name name,c.set_name "setName",c.rarity,c.image_small "imageSmall",
          c.image_large "imageLarge",c.market_price_usd "marketPriceUsd",pc.quantity,
          public.rarity_tier(c.rarity) rarity_tier
          from public.player_cards pc join public.cards c on c.id=pc.card_id
          where pc.player_id=p.id and pc.quantity>0
          order by public.rarity_tier(c.rarity) desc,c.market_price_usd desc nulls last,
            pc.quantity desc,c.pokemon_name limit 12) r),'[]'::jsonb),
      'showcase',coalesce((
        select jsonb_agg(jsonb_build_object(
          'slot',s.slot,'id',c.id,'name',c.pokemon_name,'setName',c.set_name,
          'rarity',c.rarity,'imageSmall',c.image_small,'imageLarge',c.image_large,
          'marketPriceUsd',c.market_price_usd
        ) order by s.slot)
        from public.profile_showcase s
        join public.cards c on c.id=s.card_id
        where s.player_id=p.id
      ),'[]'::jsonb)
    )
  ) into v_result
  from public.players p
  left join public.achievement_definitions ad on ad.id=p.equipped_title_id
  left join public.guild_members gm on gm.player_id=p.id
  left join public.guilds g on g.id=gm.guild_id
  where p.id=p_player_id and p.account_status <> 'banned';
  if v_result is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION private.get_retention_hub()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_season text;
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  v_season := private.current_season_id();

  select jsonb_build_object(
    'season', (
      select jsonb_build_object(
        'id',s.id,'name',s.name,'subtitle',s.subtitle,'themeColor',s.theme_color,
        'startsAt',s.starts_at,'endsAt',s.ends_at,'rewardConfig',s.reward_config,
        'my',coalesce((
          select jsonb_build_object(
            'points',ps.points,'wins',ps.wins,'losses',ps.losses,'matches',ps.matches,
            'bestStreak',ps.best_streak,'rewardClaimed',ps.reward_claimed
          ) from public.player_seasons ps where ps.season_id=s.id and ps.player_id=v_player
        ),jsonb_build_object('points',0,'wins',0,'losses',0,'matches',0,'bestStreak',0,'rewardClaimed',false)),
        'top',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rank',x.rn,'playerId',x.player_id,'username',x.username,'points',x.points,'wins',x.wins,'matches',x.matches
          ) order by x.rn)
          from (
            select row_number() over(order by ps.points desc,ps.wins desc,ps.matches asc,p.username) rn,
                   ps.player_id,p.username,ps.points,ps.wins,ps.matches
            from public.player_seasons ps
            join public.players p on p.id=ps.player_id
            where ps.season_id=s.id and p.account_status <> 'banned'
            order by ps.points desc,ps.wins desc,ps.matches asc,p.username
            limit 20
          ) x
        ),'[]'::jsonb)
      )
      from public.seasons s where s.id=v_season
    ),
    'login', coalesce((
      select jsonb_build_object(
        'currentStreak',current_streak,'bestStreak',best_streak,'totalClaims',total_claims,
        'lastClaimDate',last_claim_date,'claimedToday',last_claim_date=current_date
      ) from public.player_login_streaks where player_id=v_player
    ),jsonb_build_object('currentStreak',0,'bestStreak',0,'totalClaims',0,'lastClaimDate',null,'claimedToday',false)),
    'wishlistCount',(select count(*) from public.card_wishlist where player_id=v_player),
    'milestoneClaims',coalesce((
      select jsonb_agg(jsonb_build_object('kind',milestone_kind,'key',milestone_key,'claimedAt',claimed_at))
      from public.collection_milestone_claims where player_id=v_player
    ),'[]'::jsonb),
    'guild',(
      select jsonb_build_object('id',g.id,'name',g.name,'level',g.level,'xp',g.xp,'color',g.color)
      from public.guild_members gm join public.guilds g on g.id=gm.guild_id
      where gm.player_id=v_player limit 1
    ),
    'activeEvents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'type',e.event_type,'startsAt',e.starts_at,'endsAt',e.ends_at,'payload',e.payload
      ) order by e.ends_at)
      from public.admin_game_events e
      where e.active and e.starts_at<=now() and e.ends_at>now()
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION private.notify_wishlist_market_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_name text;
begin
  if new.status<>'active' then return new; end if;
  select pokemon_name into v_name from public.cards where id=new.card_id;
  for r in
    select w.player_id
    from public.card_wishlist w
    where w.card_id=new.card_id and w.notify_market and w.player_id<>new.seller_id
  loop
    perform public.server_queue_notification(
      r.player_id,'wishlist_market','Carta da sua wishlist no mercado',
      coalesce(v_name,'Uma carta desejada')||' apareceu no Mercado de Treinadores.',
      jsonb_build_object('listingId',new.id,'cardId',new.card_id,'sellerId',new.seller_id,'priceCoins',new.unit_price_coins)
    );
  end loop;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_collection_milestone(p_kind text, p_key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.claim_collection_milestone(p_kind,p_key); $function$


CREATE OR REPLACE FUNCTION public.claim_daily_login()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.claim_daily_login(); $function$


CREATE OR REPLACE FUNCTION public.claim_season_reward()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.claim_season_reward(); $function$


CREATE OR REPLACE FUNCTION public.get_retention_hub()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.get_retention_hub(); $function$


CREATE OR REPLACE FUNCTION public.server_admin_start_game_event(p_actor_id uuid, p_event_type text, p_title text, p_duration_minutes integer, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_end timestamptz;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  if p_event_type not in ('double_xp','rare_boost','featured_set') then raise exception 'INVALID_EVENT_TYPE'; end if;
  if p_duration_minutes<1 or p_duration_minutes>10080 then raise exception 'INVALID_DURATION'; end if;
  if length(btrim(coalesce(p_title,'')))<3 then raise exception 'INVALID_TITLE'; end if;
  if p_event_type='featured_set' and coalesce(p_payload->>'setId','')='' then raise exception 'SET_ID_REQUIRED'; end if;
  if p_event_type='featured_set' and not exists(select 1 from public.packs where set_id=p_payload->>'setId') then raise exception 'SET_NOT_FOUND'; end if;

  update public.admin_game_events
  set active=false,ends_at=least(ends_at,now())
  where event_type=p_event_type and active and ends_at>now();

  v_end:=now()+make_interval(mins=>p_duration_minutes);
  insert into public.admin_game_events(event_type,title,active,starts_at,ends_at,created_by,payload)
  values(p_event_type,left(btrim(p_title),100),true,now(),v_end,p_actor_id,coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('id',v_id,'event_type',p_event_type,'title',left(btrim(p_title),100),'active',true,'starts_at',now(),'ends_at',v_end,'payload',coalesce(p_payload,'{}'::jsonb));
end;
$function$


CREATE OR REPLACE FUNCTION public.server_admin_stop_game_event(p_actor_id uuid, p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.admin_game_events%rowtype;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;
  update public.admin_game_events
  set active=false,ends_at=least(ends_at,now())
  where id=p_event_id
  returning * into v_row;
  if v_row.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$function$


CREATE OR REPLACE FUNCTION public.server_background_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_market_pending integer;
  v_restored_suspensions integer;
  v_season text;
begin
  update public.players
  set account_status='active',suspended_until=null,moderation_reason=null
  where account_status='suspended'
    and suspended_until is not null and suspended_until<=now();
  get diagnostics v_restored_suspensions=row_count;

  v_season:=private.ensure_active_season();

  v_battles:=public.server_process_expired_battles();
  v_push:=public.server_dispatch_push_notifications();

  if exists(select 1 from public.catalog_refresh_state where job_name='full_tcg_refresh' and status='running') then
    begin
      v_catalog:=public.server_refresh_catalog_batch(2);
    exception when others then
      v_catalog:=jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog:=jsonb_build_object('status','idle');
  end if;

  select count(*)::integer into v_market_pending
  from private.market_price_sync_sets
  where status in ('pending','running','retry');

  return jsonb_build_object(
    'battles',v_battles,'pushes',v_push,'catalog',v_catalog,
    'season',v_season,
    'moderation',jsonb_build_object('restoredSuspensions',v_restored_suspensions),
    'marketPrices',jsonb_build_object(
      'status',case when v_market_pending>0 then 'syncing' else 'ready' end,
      'pendingSets',v_market_pending,'source','pokemontcg:tcgplayer_market_v3'
    ),
    'at',now()
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.server_matchmaking_cancel(p_player_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.matchmaking_queue
  set status='cancelled',updated_at=now()
  where player_id=p_player_id and status='waiting';
  return 'cancelled';
end;
$function$


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
begin
  if p_mode not in ('quick','mystery','draft3') then raise exception 'INVALID_MODE'; end if;
  perform pg_advisory_xact_lock(hashtext('pokemon-cards-global-matchmaking'));

  select battle_rating,account_status,suspended_until
  into v_rating,v_status,v_until
  from public.players where id=p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_status='banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status='suspended' and v_until is not null and v_until>now() then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if exists(
    select 1 from public.battles
    where status in ('invited','drafting','selecting')
      and p_player_id in (challenger_id,opponent_id)
  ) then raise exception 'ACTIVE_BATTLE_EXISTS'; end if;

  select count(*)>=3 into v_can_draft
  from public.player_cards where player_id=p_player_id and quantity>0;
  if p_mode='draft3' and not v_can_draft then raise exception 'DRAFT_NEEDS_3_CARDS'; end if;

  v_season := private.current_season_id();

  insert into public.matchmaking_queue(player_id,mode_choice,status,rating_snapshot,can_draft,season_id,matched_battle_id,joined_at,updated_at)
  values(p_player_id,p_mode,'waiting',v_rating,v_can_draft,v_season,null,now(),now())
  on conflict(player_id) do update
  set mode_choice=excluded.mode_choice,status='waiting',rating_snapshot=excluded.rating_snapshot,
      can_draft=excluded.can_draft,season_id=excluded.season_id,matched_battle_id=null,
      joined_at=case when public.matchmaking_queue.status='waiting' then public.matchmaking_queue.joined_at else now() end,
      updated_at=now();

  select q.* into v_opponent
  from public.matchmaking_queue q
  join public.players p on p.id=q.player_id
  where q.status='waiting'
    and q.player_id<>p_player_id
    and p.account_status='active'
    and abs(q.rating_snapshot-v_rating) <=
      250 + least(1000, floor(extract(epoch from (now()-q.joined_at))/30)::integer*75)
  order by abs(q.rating_snapshot-v_rating),q.joined_at
  for update of q skip locked
  limit 1;

  if v_opponent.player_id is null then
    return jsonb_build_object('status','waiting','modeChoice',p_mode,'seasonId',v_season);
  end if;

  if v_opponent.mode_choice=p_mode then
    v_mode:=p_mode;
  elsif (v_opponent.mode_choice='draft3' or p_mode='draft3') and not (v_opponent.can_draft and v_can_draft) then
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
  values(v_battle,'matchmade',jsonb_build_object(
    'mode',v_mode,'challengerChoice',v_opponent.mode_choice,'opponentChoice',p_mode,'seasonId',v_season
  ));
  if v_mode='draft3' then
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'draft_started',jsonb_build_object('turnPlayerId',v_opponent.player_id,'draftSeconds',90));
  else
    insert into public.battle_events(battle_id,event_type,payload)
    values(v_battle,'started',jsonb_build_object('round',1,'selectionSeconds',30));
  end if;

  perform public.server_queue_notification(
    v_opponent.player_id,'match_found','Partida encontrada!','Um adversário foi encontrado no matchmaking.',
    jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
  );
  perform public.server_queue_notification(
    p_player_id,'match_found','Partida encontrada!','Um adversário foi encontrado no matchmaking.',
    jsonb_build_object('battleId',v_battle,'mode',v_mode,'seasonId',v_season)
  );

  return jsonb_build_object('status','matched','battleId',v_battle,'mode',v_mode,'seasonId',v_season);
end;
$function$


CREATE OR REPLACE FUNCTION public.server_open_pack(p_player_id uuid, p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pack public.packs%rowtype;
  v_coins bigint;
  v_status text;
  v_until timestamptz;
  v_cards jsonb;
  v_opening_id uuid;
  v_count integer;
  v_new_coins bigint;
  v_new_xp bigint;
  v_new_level integer;
  v_effective_price bigint;
  v_free_until timestamptz;
  v_pity_misses integer := 0;
  v_highest_tier integer := 1;
  v_new_cards integer := 0;
  v_wishlist_hits integer := 0;
  v_rare_multiplier numeric := 1;
  v_xp_gain integer := 20;
begin
  select * into v_pack from public.packs
  where id = p_pack_id and active = true for share;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;

  select max(ends_at)
  into v_free_until
  from public.admin_game_events
  where event_type = 'free_boosters'
    and active = true and starts_at <= now() and ends_at > now();

  v_effective_price := case when v_free_until is null then v_pack.price else 0 end;

  select greatest(1,coalesce(max(
    case
      when event_type='rare_boost'
        then greatest(1,least(3,coalesce(nullif(payload->>'multiplier','')::numeric,1.5)))
      when event_type='featured_set' and payload->>'setId'=v_pack.set_id
        then greatest(1,least(3,coalesce(nullif(payload->>'multiplier','')::numeric,1.5)))
      else 1
    end
  ),1))
  into v_rare_multiplier
  from public.admin_game_events
  where active and starts_at<=now() and ends_at>now()
    and event_type in ('rare_boost','featured_set');

  select case when exists(
    select 1 from public.admin_game_events
    where event_type='double_xp' and active and starts_at<=now() and ends_at>now()
  ) then 40 else 20 end
  into v_xp_gain;

  select coins, account_status, suspended_until
  into v_coins, v_status, v_until
  from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_status = 'banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status = 'suspended' and v_until is not null and v_until > now()
    then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if v_status = 'suspended' and (v_until is null or v_until <= now()) then
    update public.players set account_status='active',suspended_until=null,moderation_reason=null
    where id=p_player_id;
  end if;
  if v_coins < v_effective_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  select count(*) into v_count from public.cards where set_id = v_pack.set_id;
  if v_count < 1 then raise exception 'EMPTY_PACK_POOL'; end if;

  insert into private.player_pack_pity(player_id,set_id,misses)
  values(p_player_id,v_pack.set_id,0)
  on conflict(player_id,set_id) do nothing;
  select misses into v_pity_misses
  from private.player_pack_pity
  where player_id=p_player_id and set_id=v_pack.set_id
  for update;

  with common_pick as (
    select id,pokemon_name,rarity,image_small,image_large
    from public.cards
    where set_id=v_pack.set_id and public.rarity_tier(rarity)=1
    order by random()
    limit greatest(v_pack.cards_per_pack-3,0)
  ), uncommon_pick as (
    select id,pokemon_name,rarity,image_small,image_large
    from public.cards
    where set_id=v_pack.set_id and public.rarity_tier(rarity)=2
      and id not in(select id from common_pick)
    order by random()
    limit least(2,greatest(v_pack.cards_per_pack-1,0))
  ), rare_pick as (
    select id,pokemon_name,rarity,image_small,image_large
    from public.cards
    where set_id=v_pack.set_id
      and public.rarity_tier(rarity)>=3
      and id not in(select id from common_pick)
      and id not in(select id from uncommon_pick)
      and (
        v_pity_misses<15
        or not exists(select 1 from public.cards c2 where c2.set_id=v_pack.set_id and public.rarity_tier(c2.rarity)>=4)
        or public.rarity_tier(rarity)>=4
      )
    order by (
      -ln(greatest(random(),0.0000001))
      /
      greatest(
        0.000001,
        public.rarity_pull_weight(rarity)
        * case when public.rarity_tier(rarity)>=4
            then (1 + least(v_pity_misses,15)*0.12) * v_rare_multiplier
            else 1 end
      )
    )
    limit case when v_pack.cards_per_pack>0 then 1 else 0 end
  ), preset as (
    select * from common_pick union all
    select * from uncommon_pick union all
    select * from rare_pick
  ), filler as (
    select id,pokemon_name,rarity,image_small,image_large
    from public.cards
    where set_id=v_pack.set_id and id not in(select id from preset)
    order by (
      -ln(greatest(random(),0.0000001))
      /
      greatest(
        0.000001,
        public.rarity_pull_weight(rarity)
        * case when public.rarity_tier(rarity)>=4
            then (1 + least(v_pity_misses,15)*0.06) * v_rare_multiplier
            else 1 end
      )
    )
    limit greatest(v_pack.cards_per_pack-(select count(*) from preset),0)
  ), picked as (
    select * from preset union all select * from filler
  ), annotated as (
    select p.*,
      coalesce(pc.quantity,0)>0 as already_owned,
      exists(select 1 from public.card_wishlist w where w.player_id=p_player_id and w.card_id=p.id) as wishlist_hit
    from picked p
    left join public.player_cards pc on pc.player_id=p_player_id and pc.card_id=p.id
  ), upserted as (
    insert into public.player_cards(player_id,card_id,quantity)
    select p_player_id,id,1 from annotated
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+1
    returning card_id
  )
  select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.pokemon_name,'rarity',a.rarity,
      'image',coalesce(nullif(a.image_large,''),nullif(a.image_small,'')),
      'imageLarge',nullif(a.image_large,''),'imageSmall',nullif(a.image_small,''),
      'isNew',not a.already_owned,'wishlistHit',a.wishlist_hit
    )),
    coalesce(max(public.rarity_tier(a.rarity)),1),
    count(*) filter(where not a.already_owned),
    count(*) filter(where a.wishlist_hit)
  into v_cards,v_highest_tier,v_new_cards,v_wishlist_hits
  from annotated a;

  delete from public.card_wishlist w
  where w.player_id=p_player_id and w.card_id in(
    select elem->>'id' from jsonb_array_elements(coalesce(v_cards,'[]'::jsonb)) elem
    where coalesce((elem->>'wishlistHit')::boolean,false)
  );

  update private.player_pack_pity
  set misses=case when v_highest_tier>=4 then 0 else least(misses+1,30) end,updated_at=now()
  where player_id=p_player_id and set_id=v_pack.set_id;

  update public.players
  set coins=coins-v_effective_price,
      xp=xp+v_xp_gain,
      level=greatest(level,1+floor((xp+v_xp_gain)/250.0)::integer)
  where id=p_player_id
  returning coins,xp,level into v_new_coins,v_new_xp,v_new_level;

  insert into public.pack_openings(player_id,pack_id,cards_received)
  values(p_player_id,p_pack_id,coalesce(v_cards,'[]'::jsonb))
  returning id into v_opening_id;

  insert into public.player_daily_missions(player_id,mission_date,mission_id,progress)
  values(p_player_id,current_date,'open_2_packs',1)
  on conflict(player_id,mission_date,mission_id)
  do update set progress=public.player_daily_missions.progress+1,updated_at=now();

  perform public.server_refresh_player_achievements(p_player_id);

  return jsonb_build_object(
    'openingId',v_opening_id,'cards',coalesce(v_cards,'[]'::jsonb),
    'coins',v_new_coins,'xp',v_new_xp,'level',v_new_level,'xpGained',v_xp_gain,
    'pricePaid',v_effective_price,'freeBoostersUntil',v_free_until,
    'newCards',v_new_cards,'wishlistHits',v_wishlist_hits,
    'rareMultiplier',v_rare_multiplier
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.server_refresh_player_achievements(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.players%rowtype;
  v_count integer;
  v_creator boolean;
begin
  select * into p from public.players where id=p_player_id;
  if p.id is null then return; end if;

  select exists(select 1 from public.admin_members a where a.player_id=p_player_id) into v_creator;
  perform public.server_set_achievement_progress(p_player_id,'creator_owner',case when v_creator then 1 else 0 end);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.winner_id=p_player_id
    and exists(
      select 1 from public.admin_members a
      where a.player_id=case when b.challenger_id=p_player_id then b.opponent_id else b.challenger_id end
    );
  perform public.server_set_achievement_progress(p_player_id,'beat_creator',v_count);

  perform public.server_set_achievement_progress(p_player_id,'first_win',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_10',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_50',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_100',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'streak_3',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_5',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_10',p.best_battle_streak);

  select count(*) into v_count from public.battles b
  where b.status='completed' and b.mode='draft3' and b.winner_id=p_player_id;
  perform public.server_set_achievement_progress(p_player_id,'draft_win',v_count);

  select count(*) into v_count from public.battles b
  where b.status='completed' and b.mode='draft3' and b.winner_id=p_player_id
    and (
      (b.challenger_id=p_player_id and b.challenger_score=3 and b.opponent_score=0)
      or (b.opponent_id=p_player_id and b.opponent_score=3 and b.challenger_score=0)
    );
  perform public.server_set_achievement_progress(p_player_id,'draft_perfect',v_count);

  select count(*) into v_count from public.player_cards pc
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'collector_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_500',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_1000',v_count);

  select count(*) into v_count from public.pack_openings po where po.player_id=p_player_id;
  perform public.server_set_achievement_progress(p_player_id,'packs_25',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_500',v_count);

  select count(*) into v_count from public.trades t
  where t.status::text='completed' and p_player_id in (t.sender_id,t.receiver_id);
  perform public.server_set_achievement_progress(p_player_id,'trades_10',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_151',v_count);

  select count(*) into v_count
  from (
    select c.set_id
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=p_player_id and pc.quantity>0
    group by c.set_id
    having count(*) >= (select count(*) from public.cards c2 where c2.set_id=c.set_id)
  ) completed_sets;
  perform public.server_set_achievement_progress(p_player_id,'set_complete_1',v_count);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.is_ranked
    and p_player_id in (b.challenger_id,b.opponent_id);
  perform public.server_set_achievement_progress(p_player_id,'ranked_25',v_count);

  perform public.server_set_achievement_progress(p_player_id,'rank_starter',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_ace',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_veteran',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_elite',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_master',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_grand',p.battle_rating);

  if v_creator and p.equipped_title_id is null then
    update public.players set equipped_title_id='creator_owner' where id=p_player_id;
  end if;
end;
$function$



revoke all on function private.claim_daily_login() from public,anon;
grant execute on function private.claim_daily_login() to authenticated,service_role;
revoke all on function public.claim_daily_login() from public,anon;
grant execute on function public.claim_daily_login() to authenticated;

revoke all on function private.claim_collection_milestone(text,text) from public,anon;
grant execute on function private.claim_collection_milestone(text,text) to authenticated,service_role;
revoke all on function public.claim_collection_milestone(text,text) from public,anon;
grant execute on function public.claim_collection_milestone(text,text) to authenticated;

revoke all on function private.get_retention_hub() from public,anon;
grant execute on function private.get_retention_hub() to authenticated,service_role;
revoke all on function public.get_retention_hub() from public,anon;
grant execute on function public.get_retention_hub() to authenticated;

revoke all on function private.claim_season_reward() from public,anon;
grant execute on function private.claim_season_reward() to authenticated,service_role;
revoke all on function public.claim_season_reward() from public,anon;
grant execute on function public.claim_season_reward() to authenticated;

revoke all on function public.server_matchmaking_join(uuid,text) from public,anon,authenticated;
grant execute on function public.server_matchmaking_join(uuid,text) to service_role;
revoke all on function public.server_matchmaking_cancel(uuid) from public,anon,authenticated;
grant execute on function public.server_matchmaking_cancel(uuid) to service_role;

revoke all on function public.server_open_pack(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_open_pack(uuid,uuid) to service_role;
revoke all on function public.server_admin_start_game_event(uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.server_admin_start_game_event(uuid,text,text,integer,jsonb) to service_role;
revoke all on function public.server_admin_stop_game_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_admin_stop_game_event(uuid,uuid) to service_role;
revoke all on function private.ensure_active_season() from public,anon,authenticated;
grant execute on function private.ensure_active_season() to service_role;
revoke all on function public.server_background_tick() from public,anon,authenticated;
grant execute on function public.server_background_tick() to service_role;

drop trigger if exists trg_ranked_battle_progress on public.battles;
create trigger trg_ranked_battle_progress after update of status on public.battles
for each row execute function private.apply_ranked_battle_progress();

drop trigger if exists trg_pack_guild_xp on public.pack_openings;
create trigger trg_pack_guild_xp after insert on public.pack_openings
for each row execute function private.apply_pack_guild_xp();

drop trigger if exists trg_wishlist_market_listing on public.market_listings;
create trigger trg_wishlist_market_listing after insert on public.market_listings
for each row execute function private.notify_wishlist_market_listing();
