-- Trainer Collection 1.2: Adventure / PvE progression layer.
-- Reuses the existing Game Boy-style team3 engine instead of inventing a second battle engine.

create table if not exists public.adventure_nodes (
  id text primary key,
  region text not null default 'kanto',
  sort_order integer not null,
  title text not null,
  subtitle text not null,
  trainer_name text,
  node_kind text not null check (node_kind in ('route','rival','gym','elite','champion')),
  team_types text[] not null default '{}'::text[],
  target_power integer not null default 350,
  ai_style text not null default 'balanced' check (ai_style in ('balanced','aggressive','precise','tactical','defensive')),
  reward_coins integer not null default 0,
  reward_diamonds integer not null default 0,
  badge text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists adventure_nodes_region_sort_idx on public.adventure_nodes(region,sort_order);

insert into public.adventure_nodes(id,region,sort_order,title,subtitle,trainer_name,node_kind,team_types,target_power,ai_style,reward_coins,reward_diamonds,badge)
values
 ('kanto_route_1','kanto',1,'Rota 1','Sua primeira prova como treinador','Treinador da Rota','route',array['normal'],300,'balanced',400,0,null),
 ('kanto_pewter','kanto',2,'Ginásio de Pewter','Pedra e defesa','Brock','gym',array['rock','ground'],330,'defensive',900,1,'Pedra'),
 ('kanto_rival_1','kanto',3,'Rival em Cerulean','Ele aprendeu com a última luta','Rival','rival',array[]::text[],350,'tactical',650,0,null),
 ('kanto_cerulean','kanto',4,'Ginásio de Cerulean','Controle o ritmo contra Água','Misty','gym',array['water'],370,'precise',1000,1,'Cascata'),
 ('kanto_vermilion','kanto',5,'Ginásio de Vermilion','Velocidade elétrica','Lt. Surge','gym',array['electric'],395,'aggressive',1100,1,'Trovão'),
 ('kanto_celadon','kanto',6,'Ginásio de Celadon','Resista a Grass e Poison','Erika','gym',array['grass','poison'],420,'defensive',1200,1,'Arco-Íris'),
 ('kanto_rival_2','kanto',7,'Rival em Lavender','Agora ele troca Pokémon melhor','Rival','rival',array[]::text[],440,'tactical',850,0,null),
 ('kanto_fuchsia','kanto',8,'Ginásio de Fuchsia','Pressão por status e Poison','Koga','gym',array['poison'],460,'tactical',1350,1,'Alma'),
 ('kanto_saffron','kanto',9,'Ginásio de Saffron','Poder psíquico e precisão','Sabrina','gym',array['psychic'],485,'precise',1500,1,'Pântano'),
 ('kanto_cinnabar','kanto',10,'Ginásio de Cinnabar','Ataque de Fire sem descanso','Blaine','gym',array['fire'],510,'aggressive',1650,1,'Vulcão'),
 ('kanto_viridian','kanto',11,'Ginásio de Viridian','A última insígnia','Giovanni','gym',array['ground','dark'],535,'tactical',2000,2,'Terra'),
 ('kanto_lorelei','kanto',12,'Elite Four • Lorelei','Ice e Water abrem a Liga','Lorelei','elite',array['ice','water'],555,'defensive',2200,0,null),
 ('kanto_bruno','kanto',13,'Elite Four • Bruno','Força física e Rock','Bruno','elite',array['fighting','rock'],570,'aggressive',2300,0,null),
 ('kanto_agatha','kanto',14,'Elite Four • Agatha','Ghost e Poison','Agatha','elite',array['ghost','poison'],590,'tactical',2400,0,null),
 ('kanto_lance','kanto',15,'Elite Four • Lance','Dragões no limite','Lance','elite',array['dragon','flying'],610,'aggressive',2600,1,null),
 ('kanto_champion','kanto',16,'Campeão de Kanto','A batalha final da Jornada','Campeão','champion',array[]::text[],635,'tactical',6000,4,'Campeão de Kanto')
on conflict(id) do update set
 sort_order=excluded.sort_order,title=excluded.title,subtitle=excluded.subtitle,trainer_name=excluded.trainer_name,node_kind=excluded.node_kind,
 team_types=excluded.team_types,target_power=excluded.target_power,ai_style=excluded.ai_style,reward_coins=excluded.reward_coins,
 reward_diamonds=excluded.reward_diamonds,badge=excluded.badge,active=true;

create table if not exists public.trainer_adventure_progress (
  player_id uuid not null references public.players(id) on delete cascade,
  node_id text not null references public.adventure_nodes(id) on delete cascade,
  wins integer not null default 0,
  attempts integer not null default 0,
  stars integer not null default 0 check(stars between 0 and 3),
  best_turns integer,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(player_id,node_id)
);

create table if not exists public.battle_tower_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  floor integer not null default 1,
  best_floor integer not null default 0,
  wins integer not null default 0,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists battle_tower_one_active_idx on public.battle_tower_runs(player_id) where active;
create index if not exists battle_tower_best_idx on public.battle_tower_runs(best_floor desc);

create table if not exists public.weekly_elite_runs (
  player_id uuid not null references public.players(id) on delete cascade,
  week_start date not null,
  stage integer not null default 1 check(stage between 1 and 5),
  wins integer not null default 0,
  attempts integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(player_id,week_start)
);

create table if not exists public.guild_raid_bosses (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  week_start date not null,
  boss_name text not null,
  boss_type text not null,
  max_hp integer not null,
  current_hp integer not null,
  target_power integer not null default 620,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  defeated_at timestamptz,
  unique(guild_id,week_start)
);

create table if not exists public.guild_raid_contributions (
  boss_id uuid not null references public.guild_raid_bosses(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  damage bigint not null default 0,
  attempts integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(boss_id,player_id)
);

create table if not exists public.rogue_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  floor integer not null default 1,
  best_floor integer not null default 0,
  wins integer not null default 0,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists rogue_one_active_idx on public.rogue_runs(player_id) where active;

create table if not exists public.rogue_run_cards (
  run_id uuid not null references public.rogue_runs(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  position integer not null,
  added_at timestamptz not null default now(),
  primary key(run_id,card_id)
);

create table if not exists public.pokemon_mastery (
  player_id uuid not null references public.players(id) on delete cascade,
  pokemon_key text not null,
  pokemon_name text not null,
  xp integer not null default 0,
  level integer not null default 1 check(level between 1 and 100),
  battles integer not null default 0,
  wins integer not null default 0,
  kos integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(player_id,pokemon_key)
);
create index if not exists pokemon_mastery_level_idx on public.pokemon_mastery(player_id,level desc,xp desc);

create table if not exists public.trainer_battle_records (
  player_id uuid not null references public.players(id) on delete cascade,
  record_key text not null,
  record_value bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(player_id,record_key)
);

create table if not exists public.battle_challenges (
  id text primary key,
  title text not null,
  description text not null,
  required_type text,
  target_power integer not null default 500,
  ai_style text not null default 'balanced',
  reward_coins integer not null default 0,
  reward_diamonds integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0
);
insert into public.battle_challenges(id,title,description,required_type,target_power,ai_style,reward_coins,reward_diamonds,sort_order)
values
 ('type_fire','Desafio Fire','Monte uma equipe somente com Pokémon que tenham o tipo Fire.','fire',475,'aggressive',1800,1,1),
 ('type_water','Desafio Water','Somente Pokémon que tenham o tipo Water.','water',485,'precise',1800,1,2),
 ('type_steel','Muralha Steel','Somente Pokémon Steel contra uma IA defensiva.','steel',515,'defensive',2200,1,3),
 ('speed_trial','Speed Trial','Sem trava de tipo. Vença em poucos turnos para buscar 3 estrelas.',null,560,'aggressive',2500,1,4),
 ('master_trial','Prova do Mestre','Equipe livre contra uma IA de força alta e estilo tático.',null,625,'tactical',4000,2,5)
on conflict(id) do update set title=excluded.title,description=excluded.description,required_type=excluded.required_type,target_power=excluded.target_power,
 ai_style=excluded.ai_style,reward_coins=excluded.reward_coins,reward_diamonds=excluded.reward_diamonds,active=true,sort_order=excluded.sort_order;

create table if not exists public.player_challenge_results (
  player_id uuid not null references public.players(id) on delete cascade,
  challenge_id text not null references public.battle_challenges(id) on delete cascade,
  wins integer not null default 0,
  attempts integer not null default 0,
  stars integer not null default 0,
  best_turns integer,
  first_win_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(player_id,challenge_id)
);

create table if not exists public.champion_defense_snapshots (
  id uuid primary key default gen_random_uuid(),
  champion_id uuid not null references public.players(id) on delete cascade,
  champion_name text not null,
  rating integer not null,
  card_ids text[] not null,
  captured_at timestamptz not null default now(),
  active boolean not null default true
);
create unique index if not exists champion_defense_one_active_idx on public.champion_defense_snapshots((active)) where active;

create table if not exists public.adventure_world_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  event_type text not null default 'wild_boss',
  required_type text,
  target_power integer not null default 560,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.adventure_battle_context (
  battle_id uuid primary key references public.battles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check(kind in ('journey','tower','elite','raid','rogue','challenge','champion','world_event')),
  ref_id text,
  run_id uuid,
  difficulty integer not null default 1,
  target_power integer not null default 400,
  ai_style text not null default 'balanced',
  finalized boolean not null default false,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create index if not exists adventure_context_player_idx on public.adventure_battle_context(player_id,created_at desc);

alter table public.adventure_nodes enable row level security;
alter table public.trainer_adventure_progress enable row level security;
alter table public.battle_tower_runs enable row level security;
alter table public.weekly_elite_runs enable row level security;
alter table public.guild_raid_bosses enable row level security;
alter table public.guild_raid_contributions enable row level security;
alter table public.rogue_runs enable row level security;
alter table public.rogue_run_cards enable row level security;
alter table public.pokemon_mastery enable row level security;
alter table public.trainer_battle_records enable row level security;
alter table public.battle_challenges enable row level security;
alter table public.player_challenge_results enable row level security;
alter table public.champion_defense_snapshots enable row level security;
alter table public.adventure_world_events enable row level security;
alter table public.adventure_battle_context enable row level security;

create or replace function private.adventure_card_power(p_card_id text)
returns integer
language plpgsql stable security definer set search_path=''
as $$
declare gp jsonb;
begin
  gp:=private.battle_game_profile_for_card(p_card_id);
  if gp is null then return null; end if;
  return coalesce((gp->>'baseHp')::integer,0)+coalesce((gp->>'baseAttack')::integer,0)+coalesce((gp->>'baseDefense')::integer,0)
    +coalesce((gp->>'baseSpAttack')::integer,0)+coalesce((gp->>'baseSpDefense')::integer,0)+coalesce((gp->>'baseSpeed')::integer,0);
end;
$$;

create or replace function private.adventure_pick_team(p_types text[],p_target integer)
returns text[]
language plpgsql volatile security definer set search_path=''
as $$
declare v_cards text[];
begin
  select array_agg(q.id order by q.rn) into v_cards
  from (
    select c.id,row_number() over(order by abs(private.adventure_card_power(c.id)-p_target),random()) rn
    from public.cards c
    where private.battle_game_profile_for_card(c.id) is not null
      and (coalesce(cardinality(p_types),0)=0 or exists(
        select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t
        where lower(t)=any(array(select lower(x) from unnest(p_types) x))
      ))
    order by abs(private.adventure_card_power(c.id)-p_target),random()
    limit 3
  ) q;
  if coalesce(cardinality(v_cards),0)<3 then
    select array_agg(q.id order by q.rn) into v_cards
    from (
      select c.id,row_number() over(order by abs(private.adventure_card_power(c.id)-p_target),random()) rn
      from public.cards c
      where private.battle_game_profile_for_card(c.id) is not null
      order by abs(private.adventure_card_power(c.id)-p_target),random()
      limit 3
    ) q;
  end if;
  if coalesce(cardinality(v_cards),0)<3 then raise exception 'ADVENTURE_TEAM_UNAVAILABLE'; end if;
  return v_cards;
end;
$$;

create or replace function private.adventure_choose_bot(p_target integer)
returns uuid
language sql volatile security definer set search_path=''
as $$
  select p.id
  from public.players p
  where p.is_bot=true and p.account_status='active'
  order by abs(coalesce(p.bot_rating_base,p.battle_rating,1000)-(800+greatest(0,p_target-280)*3)),random()
  limit 1
$$;

create or replace function private.ensure_guild_raid(p_guild_id text)
returns public.guild_raid_bosses
language plpgsql security definer set search_path=''
as $$
declare v_week date:=(date_trunc('week',now()))::date;v_row public.guild_raid_bosses%rowtype;v_members integer;v_type text;v_name text;
begin
  select * into v_row from public.guild_raid_bosses where guild_id=p_guild_id and week_start=v_week;
  if v_row.id is not null then return v_row; end if;
  select count(*) into v_members from public.guild_members where guild_id=p_guild_id;
  v_type:=(array['dragon','psychic','dark','steel','fire','water'])[(extract(week from now())::integer%6)+1];
  v_name:=case v_type when 'dragon' then 'Dragão Ancestral' when 'psychic' then 'Titã Psíquico' when 'dark' then 'Sombra Colossal' when 'steel' then 'Guardião de Aço' when 'fire' then 'Fera Vulcânica' else 'Leviatã' end;
  insert into public.guild_raid_bosses(guild_id,week_start,boss_name,boss_type,max_hp,current_hp,target_power,ends_at)
  values(p_guild_id,v_week,v_name,v_type,greatest(5000,4000+v_members*1200),greatest(5000,4000+v_members*1200),610+(v_members*3),date_trunc('week',now())+interval '7 days')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function private.refresh_champion_snapshot()
returns public.champion_defense_snapshots
language plpgsql security definer set search_path=''
as $$
declare v_row public.champion_defense_snapshots%rowtype;v_champion uuid;v_name text;v_rating integer;v_cards text[];
begin
  select * into v_row from public.champion_defense_snapshots where active=true order by captured_at desc limit 1;
  if v_row.id is not null and v_row.captured_at>now()-interval '1 hour' then return v_row; end if;
  select id,username,battle_rating into v_champion,v_name,v_rating from public.players
  where is_bot=false and account_status='active' order by battle_rating desc,battle_wins desc limit 1;
  if v_champion is null then return v_row; end if;
  select array_agg(x.card_id order by x.power desc) into v_cards from (
    select pc.card_id,private.adventure_card_power(pc.card_id) power
    from public.player_cards pc
    where pc.player_id=v_champion and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null
    order by private.adventure_card_power(pc.card_id) desc nulls last
    limit 3
  ) x;
  if coalesce(cardinality(v_cards),0)<3 then return v_row; end if;
  update public.champion_defense_snapshots set active=false where active=true;
  insert into public.champion_defense_snapshots(champion_id,champion_name,rating,card_ids) values(v_champion,v_name,v_rating,v_cards) returning * into v_row;
  return v_row;
end;
$$;

create or replace function private.create_adventure_team3_battle(
  p_player uuid,p_kind text,p_ref_id text,p_run_id uuid,p_target integer,p_style text,p_team text[]
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_battle uuid;v_bot uuid;v_owned integer;
begin
  if exists(select 1 from public.battles where status in('invited','drafting','selecting','revealing') and p_player in(challenger_id,opponent_id)) then
    raise exception 'ACTIVE_BATTLE_EXISTS';
  end if;
  select count(*) into v_owned from public.player_cards pc where pc.player_id=p_player and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null;
  if v_owned<3 then raise exception 'TEAM_NEEDS_3_GAME_CARDS'; end if;
  if coalesce(cardinality(p_team),0)<>3 then raise exception 'ADVENTURE_TEAM_UNAVAILABLE'; end if;
  v_bot:=private.adventure_choose_bot(p_target);
  if v_bot is null then raise exception 'ADVENTURE_BOT_UNAVAILABLE'; end if;

  insert into public.player_cards(player_id,card_id,quantity,first_obtained_at)
  select v_bot,cid,1,now() from unnest(p_team) cid
  on conflict(player_id,card_id) do update set quantity=greatest(public.player_cards.quantity,1);

  insert into public.battles(challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,selection_deadline,draft_turn_id,draft_pick_count,is_ranked,is_bot_match,engine_version,reward_eligible)
  values(p_player,v_bot,'team3','none',0,'drafting',1,now()+interval '180 seconds',null,0,false,true,'game_v1',false)
  returning id into v_battle;

  insert into private.battle_team_state(battle_id,player_id) values(v_battle,p_player),(v_battle,v_bot) on conflict do nothing;
  insert into public.adventure_battle_context(battle_id,player_id,kind,ref_id,run_id,difficulty,target_power,ai_style)
  values(v_battle,p_player,p_kind,p_ref_id,p_run_id,greatest(1,(p_target-280)/35),p_target,coalesce(nullif(p_style,''),'balanced'));
  perform public.server_set_battle_team(v_bot,v_battle,p_team);
  insert into public.battle_events(battle_id,event_type,payload)
  values(v_battle,'adventure_started',jsonb_build_object('kind',p_kind,'refId',p_ref_id,'targetPower',p_target,'aiStyle',p_style,'teamSize',3));
  return jsonb_build_object('battleId',v_battle,'mode','team3','route','/team-battle/'||v_battle::text,'kind',p_kind,'refId',p_ref_id,'targetPower',p_target,'aiStyle',p_style);
end;
$$;

create or replace function public.server_start_adventure_battle(p_kind text,p_ref_id text default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_player uuid:=auth.uid();v_kind text:=lower(trim(coalesce(p_kind,'')));v_node public.adventure_nodes%rowtype;v_target integer;v_style text;v_types text[]:=array[]::text[];v_team text[];v_run uuid;v_floor integer;v_week date:=(date_trunc('week',now()))::date;v_stage integer;v_guild text;v_raid public.guild_raid_bosses%rowtype;v_ch public.battle_challenges%rowtype;v_champ public.champion_defense_snapshots%rowtype;v_event public.adventure_world_events%rowtype;
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 perform public.server_assert_app_active(v_player);
 if v_kind='journey' then
   select * into v_node from public.adventure_nodes where id=p_ref_id and active=true;
   if v_node.id is null then raise exception 'ADVENTURE_NODE_NOT_FOUND'; end if;
   if exists(
     select 1 from public.adventure_nodes prior
     where prior.region=v_node.region and prior.active and prior.sort_order<v_node.sort_order
       and not exists(select 1 from public.trainer_adventure_progress ap where ap.player_id=v_player and ap.node_id=prior.id and ap.completed_at is not null)
   ) then raise exception 'ADVENTURE_NODE_LOCKED'; end if;
   v_target:=v_node.target_power;v_style:=v_node.ai_style;v_types:=v_node.team_types;
 elsif v_kind='tower' then
   select id,floor into v_run,v_floor from public.battle_tower_runs where player_id=v_player and active=true order by started_at desc limit 1;
   if v_run is null then insert into public.battle_tower_runs(player_id) values(v_player) returning id,floor into v_run,v_floor; end if;
   v_target:=least(670,340+(greatest(v_floor,1)-1)*13);v_style:=case when v_floor%5=0 then 'tactical' when v_floor%3=0 then 'precise' else 'aggressive' end;
   p_ref_id:=v_floor::text;
 elsif v_kind='elite' then
   insert into public.weekly_elite_runs(player_id,week_start) values(v_player,v_week) on conflict do nothing;
   select stage into v_stage from public.weekly_elite_runs where player_id=v_player and week_start=v_week;
   v_target:=535+v_stage*22;v_style:=(array['defensive','aggressive','tactical','precise','tactical'])[v_stage];p_ref_id:=v_stage::text;
 elsif v_kind='raid' then
   select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;
   if v_guild is null then raise exception 'GUILD_REQUIRED'; end if;
   v_raid:=private.ensure_guild_raid(v_guild);
   if v_raid.current_hp<=0 or v_raid.ends_at<=now() then raise exception 'RAID_FINISHED'; end if;
   v_target:=least(675,v_raid.target_power);v_style:='defensive';v_types:=array[v_raid.boss_type];p_ref_id:=v_raid.id::text;
 elsif v_kind='rogue' then
   select id,floor into v_run,v_floor from public.rogue_runs where player_id=v_player and active=true order by started_at desc limit 1;
   if v_run is null then
     insert into public.rogue_runs(player_id) values(v_player) returning id,floor into v_run,v_floor;
     insert into public.rogue_run_cards(run_id,card_id,position)
     select v_run,x.card_id,row_number() over() from (
       select pc.card_id from public.player_cards pc where pc.player_id=v_player and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null order by random() limit 9
     ) x;
     if (select count(*) from public.rogue_run_cards where run_id=v_run)<3 then
       update public.rogue_runs set active=false,ended_at=now() where id=v_run;raise exception 'ROGUE_NEEDS_3_GAME_CARDS';
     end if;
   end if;
   v_target:=least(660,350+(v_floor-1)*18);v_style:=case when v_floor%4=0 then 'tactical' else 'balanced' end;p_ref_id:=v_floor::text;
 elsif v_kind='challenge' then
   select * into v_ch from public.battle_challenges where id=p_ref_id and active=true;
   if v_ch.id is null then raise exception 'CHALLENGE_NOT_FOUND'; end if;
   v_target:=v_ch.target_power;v_style:=v_ch.ai_style;if v_ch.required_type is not null then v_types:=array[v_ch.required_type]; end if;
 elsif v_kind='champion' then
   v_champ:=private.refresh_champion_snapshot();if v_champ.id is null then raise exception 'CHAMPION_UNAVAILABLE'; end if;
   v_target:=least(680,560+greatest(0,(v_champ.rating-1000)/8));v_style:='tactical';v_team:=v_champ.card_ids;p_ref_id:=v_champ.id::text;
 elsif v_kind='world_event' then
   select * into v_event from public.adventure_world_events where active=true and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
   if v_event.id is null then raise exception 'WORLD_EVENT_INACTIVE'; end if;
   v_target:=v_event.target_power;v_style:='aggressive';if v_event.required_type is not null then v_types:=array[v_event.required_type]; end if;p_ref_id:=v_event.id::text;
 else raise exception 'INVALID_ADVENTURE_KIND'; end if;
 if v_team is null then v_team:=private.adventure_pick_team(v_types,v_target); end if;
 return private.create_adventure_team3_battle(v_player,v_kind,p_ref_id,v_run,v_target,v_style,v_team);
end;
$$;

create or replace function public.get_kanto_adventure()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid();v_items jsonb;v_completed integer;v_stars integer;
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 select count(*),coalesce(sum(stars),0) into v_completed,v_stars from public.trainer_adventure_progress where player_id=v_player and completed_at is not null;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) into v_items from (
   select n.id,n.sort_order,n.title,n.subtitle,n.trainer_name as "trainerName",n.node_kind as "kind",n.team_types as "types",n.target_power as "targetPower",n.ai_style as "aiStyle",n.reward_coins as "rewardCoins",n.reward_diamonds as "rewardDiamonds",n.badge,
     coalesce(p.wins,0) wins,coalesce(p.attempts,0) attempts,coalesce(p.stars,0) stars,p.best_turns as "bestTurns",p.completed_at as "completedAt",
     not exists(select 1 from public.adventure_nodes prev where prev.region='kanto' and prev.active and prev.sort_order<n.sort_order and not exists(select 1 from public.trainer_adventure_progress pp where pp.player_id=v_player and pp.node_id=prev.id and pp.completed_at is not null)) as unlocked
   from public.adventure_nodes n left join public.trainer_adventure_progress p on p.player_id=v_player and p.node_id=n.id
   where n.region='kanto' and n.active order by n.sort_order
 ) x;
 return jsonb_build_object('region','Kanto','completed',v_completed,'total',(select count(*) from public.adventure_nodes where region='kanto' and active),'stars',v_stars,'maxStars',(select count(*)*3 from public.adventure_nodes where region='kanto' and active),'nodes',v_items);
end;
$$;

create or replace function private.bump_trainer_record(p_player uuid,p_key text,p_value bigint,p_sum boolean default false,p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=''
as $$
begin
 insert into public.trainer_battle_records(player_id,record_key,record_value,metadata) values(p_player,p_key,p_value,coalesce(p_meta,'{}'::jsonb))
 on conflict(player_id,record_key) do update set record_value=case when p_sum then public.trainer_battle_records.record_value+excluded.record_value else greatest(public.trainer_battle_records.record_value,excluded.record_value) end,metadata=excluded.metadata,updated_at=now();
end;
$$;

create or replace function private.update_mastery_for_battle(p_battle uuid,p_winner uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare r record;v_key text;v_gain integer;v_new_xp integer;
begin
 for r in
   select distinct x.player_id,x.card_id,c.pokemon_name,c.pokedex_numbers
   from (
     select player_id,card_id from private.battle_team_members where battle_id=p_battle
     union select player_id,card_id from public.battle_selections where battle_id=p_battle
   ) x join public.cards c on c.id=x.card_id
 loop
   v_key:=coalesce(r.pokedex_numbers[1]::text,lower(coalesce(r.pokemon_name,r.card_id)));
   v_gain:=20+case when r.player_id=p_winner then 30 else 0 end;
   insert into public.pokemon_mastery(player_id,pokemon_key,pokemon_name,xp,level,battles,wins)
   values(r.player_id,v_key,coalesce(r.pokemon_name,'Pokémon'),v_gain,1,1,case when r.player_id=p_winner then 1 else 0 end)
   on conflict(player_id,pokemon_key) do update set
     pokemon_name=excluded.pokemon_name,xp=public.pokemon_mastery.xp+excluded.xp,battles=public.pokemon_mastery.battles+1,wins=public.pokemon_mastery.wins+excluded.wins,
     level=least(100,1+floor(sqrt((public.pokemon_mastery.xp+excluded.xp)::numeric)/5)::integer),updated_at=now();
 end loop;
end;
$$;

create or replace function private.finalize_adventure_battle()
returns trigger language plpgsql security definer set search_path=''
as $$
declare ctx public.adventure_battle_context%rowtype;v_win boolean;v_turns integer;v_first boolean;v_node public.adventure_nodes%rowtype;v_run public.battle_tower_runs%rowtype;v_elite public.weekly_elite_runs%rowtype;v_raid public.guild_raid_bosses%rowtype;v_damage integer;v_before_hp integer;v_ch public.battle_challenges%rowtype;v_floor integer;v_bonus_diamonds integer:=0;v_new_card text;
begin
 if new.status<>'completed' or old.status='completed' then return new; end if;
 select * into ctx from public.adventure_battle_context where battle_id=new.id for update;
 if ctx.battle_id is null or ctx.finalized then return new; end if;
 update public.adventure_battle_context set finalized=true,finalized_at=now() where battle_id=new.id;
 v_win:=new.winner_id=ctx.player_id;
 select count(*) into v_turns from private.battle_game_turns where battle_id=new.id;
 v_turns:=greatest(1,v_turns);

 if ctx.kind='journey' then
   select * into v_node from public.adventure_nodes where id=ctx.ref_id;
   select not exists(select 1 from public.trainer_adventure_progress where player_id=ctx.player_id and node_id=ctx.ref_id and completed_at is not null) into v_first;
   insert into public.trainer_adventure_progress(player_id,node_id,wins,attempts,stars,best_turns,completed_at)
   values(ctx.player_id,ctx.ref_id,case when v_win then 1 else 0 end,1,case when v_win then case when v_turns<=6 then 3 when v_turns<=10 then 2 else 1 end else 0 end,case when v_win then v_turns else null end,case when v_win then now() else null end)
   on conflict(player_id,node_id) do update set wins=public.trainer_adventure_progress.wins+excluded.wins,attempts=public.trainer_adventure_progress.attempts+1,stars=greatest(public.trainer_adventure_progress.stars,excluded.stars),best_turns=case when excluded.best_turns is null then public.trainer_adventure_progress.best_turns when public.trainer_adventure_progress.best_turns is null then excluded.best_turns else least(public.trainer_adventure_progress.best_turns,excluded.best_turns) end,completed_at=coalesce(public.trainer_adventure_progress.completed_at,excluded.completed_at),updated_at=now();
   if v_win and v_first then update public.players set coins=coins+v_node.reward_coins,diamonds=diamonds+v_node.reward_diamonds where id=ctx.player_id; end if;
   if v_win then perform private.bump_trainer_record(ctx.player_id,'adventure_stars',case when v_turns<=6 then 3 when v_turns<=10 then 2 else 1 end,true,jsonb_build_object('node',ctx.ref_id)); end if;
 elsif ctx.kind='tower' then
   select * into v_run from public.battle_tower_runs where id=ctx.run_id for update;v_floor:=coalesce(v_run.floor,1);
   if v_win then
     v_bonus_diamonds:=case when v_floor%10=0 then 1 else 0 end;
     update public.battle_tower_runs set floor=floor+1,best_floor=greatest(best_floor,v_floor),wins=wins+1 where id=v_run.id;
     update public.players set coins=coins+150+v_floor*35,diamonds=diamonds+v_bonus_diamonds where id=ctx.player_id;
     perform private.bump_trainer_record(ctx.player_id,'tower_best_floor',v_floor,false,jsonb_build_object('runId',v_run.id));
   else update public.battle_tower_runs set active=false,ended_at=now(),best_floor=greatest(best_floor,v_floor-1) where id=v_run.id; end if;
 elsif ctx.kind='elite' then
   select * into v_elite from public.weekly_elite_runs where player_id=ctx.player_id and week_start=(date_trunc('week',ctx.created_at))::date for update;
   update public.weekly_elite_runs set attempts=attempts+1,updated_at=now() where player_id=v_elite.player_id and week_start=v_elite.week_start;
   if v_win then
     if v_elite.stage>=5 then
       update public.weekly_elite_runs set wins=wins+1,completed_at=coalesce(completed_at,now()),updated_at=now() where player_id=v_elite.player_id and week_start=v_elite.week_start;
       update public.players set coins=coins+6000,diamonds=diamonds+3 where id=ctx.player_id;
       perform private.bump_trainer_record(ctx.player_id,'elite_four_clears',1,true,jsonb_build_object('week',v_elite.week_start));
     else
       update public.weekly_elite_runs set wins=wins+1,stage=stage+1,updated_at=now() where player_id=v_elite.player_id and week_start=v_elite.week_start;
       update public.players set coins=coins+800+v_elite.stage*250 where id=ctx.player_id;
     end if;
   end if;
 elsif ctx.kind='raid' then
   select * into v_raid from public.guild_raid_bosses where id=ctx.ref_id::uuid for update;v_before_hp:=v_raid.current_hp;
   v_damage:=case when v_win then 650+greatest(0,14-v_turns)*35 else 120 end;
   update public.guild_raid_bosses set current_hp=greatest(0,current_hp-v_damage),defeated_at=case when current_hp-v_damage<=0 then coalesce(defeated_at,now()) else defeated_at end where id=v_raid.id;
   insert into public.guild_raid_contributions(boss_id,player_id,damage,attempts,wins) values(v_raid.id,ctx.player_id,v_damage,1,case when v_win then 1 else 0 end)
   on conflict(boss_id,player_id) do update set damage=public.guild_raid_contributions.damage+excluded.damage,attempts=public.guild_raid_contributions.attempts+1,wins=public.guild_raid_contributions.wins+excluded.wins,updated_at=now();
   update public.players set coins=coins+greatest(100,v_damage/2) where id=ctx.player_id;
   perform private.bump_trainer_record(ctx.player_id,'raid_damage',v_damage,true,jsonb_build_object('bossId',v_raid.id));
   if v_before_hp>0 and v_before_hp-v_damage<=0 then
     update public.players p set diamonds=p.diamonds+1 from public.guild_raid_contributions gc where gc.boss_id=v_raid.id and gc.player_id=p.id;
   end if;
 elsif ctx.kind='rogue' then
   select floor into v_floor from public.rogue_runs where id=ctx.run_id for update;
   if v_win then
     update public.rogue_runs set floor=floor+1,best_floor=greatest(best_floor,v_floor),wins=wins+1 where id=ctx.run_id;
     update public.players set coins=coins+200+v_floor*45,diamonds=diamonds+case when v_floor%5=0 then 1 else 0 end where id=ctx.player_id;
     select pc.card_id into v_new_card from public.player_cards pc where pc.player_id=ctx.player_id and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null and not exists(select 1 from public.rogue_run_cards r where r.run_id=ctx.run_id and r.card_id=pc.card_id) order by random() limit 1;
     if v_new_card is not null then insert into public.rogue_run_cards(run_id,card_id,position) values(ctx.run_id,v_new_card,(select coalesce(max(position),0)+1 from public.rogue_run_cards where run_id=ctx.run_id)) on conflict do nothing; end if;
     perform private.bump_trainer_record(ctx.player_id,'rogue_best_floor',v_floor,false,jsonb_build_object('runId',ctx.run_id));
   else update public.rogue_runs set active=false,ended_at=now(),best_floor=greatest(best_floor,v_floor-1) where id=ctx.run_id; end if;
 elsif ctx.kind='challenge' then
   select * into v_ch from public.battle_challenges where id=ctx.ref_id;
   select not exists(select 1 from public.player_challenge_results where player_id=ctx.player_id and challenge_id=ctx.ref_id and first_win_at is not null) into v_first;
   insert into public.player_challenge_results(player_id,challenge_id,wins,attempts,stars,best_turns,first_win_at)
   values(ctx.player_id,ctx.ref_id,case when v_win then 1 else 0 end,1,case when v_win then case when v_turns<=6 then 3 when v_turns<=10 then 2 else 1 end else 0 end,case when v_win then v_turns else null end,case when v_win then now() else null end)
   on conflict(player_id,challenge_id) do update set wins=public.player_challenge_results.wins+excluded.wins,attempts=public.player_challenge_results.attempts+1,stars=greatest(public.player_challenge_results.stars,excluded.stars),best_turns=case when excluded.best_turns is null then public.player_challenge_results.best_turns when public.player_challenge_results.best_turns is null then excluded.best_turns else least(public.player_challenge_results.best_turns,excluded.best_turns) end,first_win_at=coalesce(public.player_challenge_results.first_win_at,excluded.first_win_at),updated_at=now();
   if v_win and v_first then update public.players set coins=coins+v_ch.reward_coins,diamonds=diamonds+v_ch.reward_diamonds where id=ctx.player_id; end if;
 elsif ctx.kind='champion' then
   if v_win then update public.players set coins=coins+3000 where id=ctx.player_id;perform private.bump_trainer_record(ctx.player_id,'champion_echo_wins',1,true,jsonb_build_object('snapshotId',ctx.ref_id)); end if;
 elsif ctx.kind='world_event' then
   if v_win then update public.players set coins=coins+1800 where id=ctx.player_id;perform private.bump_trainer_record(ctx.player_id,'world_event_wins',1,true,jsonb_build_object('eventId',ctx.ref_id)); end if;
 end if;
 return new;
end;
$$;

drop trigger if exists trg_finalize_adventure_battle on public.battles;
create trigger trg_finalize_adventure_battle after update of status on public.battles for each row when(new.status='completed' and old.status is distinct from 'completed') execute function private.finalize_adventure_battle();

create or replace function private.mastery_battle_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then perform private.update_mastery_for_battle(new.id,new.winner_id); end if;return new;
end;
$$;
drop trigger if exists trg_mastery_battle on public.battles;
create trigger trg_mastery_battle after update of status on public.battles for each row when(new.status='completed' and old.status is distinct from 'completed') execute function private.mastery_battle_trigger();

create or replace function public.get_pokemon_mastery()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by x.level desc,x.xp desc),'[]'::jsonb),'total',count(*),'maxLevel',coalesce(max(x.level),0))
 from (select pokemon_key as "pokemonKey",pokemon_name as "pokemonName",xp,level,battles,wins,kos,updated_at as "updatedAt" from public.pokemon_mastery where player_id=auth.uid() order by level desc,xp desc limit 100) x
$$;

create or replace function public.get_trainer_battle_records()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('key',record_key,'value',record_value,'metadata',metadata,'updatedAt',updated_at) order by record_value desc),'[]'::jsonb)) from public.trainer_battle_records where player_id=auth.uid()
$$;

create or replace function public.get_rogue_run_state()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid();v_run public.rogue_runs%rowtype;v_cards jsonb;
begin
 select * into v_run from public.rogue_runs where player_id=v_player and active=true order by started_at desc limit 1;
 if v_run.id is null then return jsonb_build_object('active',false,'floor',1,'cards','[]'::jsonb); end if;
 select coalesce(jsonb_agg(jsonb_build_object('cardId',c.id,'name',c.pokemon_name,'image',coalesce(c.image_large,c.image_small),'types',coalesce(c.game_types,c.types),'position',r.position) order by r.position),'[]'::jsonb) into v_cards from public.rogue_run_cards r join public.cards c on c.id=r.card_id where r.run_id=v_run.id;
 return jsonb_build_object('active',true,'runId',v_run.id,'floor',v_run.floor,'bestFloor',v_run.best_floor,'wins',v_run.wins,'cards',v_cards);
end;
$$;

create or replace function public.get_guild_raid_state()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid();v_guild text;v_raid public.guild_raid_bosses%rowtype;v_me public.guild_raid_contributions%rowtype;v_rank integer;
begin
 select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;if v_guild is null then return jsonb_build_object('hasGuild',false); end if;
 v_raid:=private.ensure_guild_raid(v_guild);select * into v_me from public.guild_raid_contributions where boss_id=v_raid.id and player_id=v_player;
 select 1+count(*) into v_rank from public.guild_raid_contributions where boss_id=v_raid.id and damage>coalesce(v_me.damage,0);
 return jsonb_build_object('hasGuild',true,'guildId',v_guild,'bossId',v_raid.id,'name',v_raid.boss_name,'type',v_raid.boss_type,'maxHp',v_raid.max_hp,'currentHp',v_raid.current_hp,'endsAt',v_raid.ends_at,'defeated',v_raid.current_hp<=0,'myDamage',coalesce(v_me.damage,0),'myAttempts',coalesce(v_me.attempts,0),'myWins',coalesce(v_me.wins,0),'rank',v_rank);
end;
$$;

create or replace function private.maybe_spawn_world_event()
returns public.adventure_world_events language plpgsql security definer set search_path=''
as $$
declare v_event public.adventure_world_events%rowtype;v_type text;
begin
 update public.adventure_world_events set active=false where active and ends_at<=now();
 select * into v_event from public.adventure_world_events where active and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
 if v_event.id is not null then return v_event; end if;
 if extract(hour from now())::integer%6<>0 then return v_event; end if;
 if exists(select 1 from public.adventure_world_events where created_at>date_trunc('hour',now())) then return v_event; end if;
 v_type:=(array['fire','water','electric','psychic','dragon','steel'])[(extract(doy from now())::integer%6)+1];
 insert into public.adventure_world_events(title,description,required_type,target_power,starts_at,ends_at)
 values('Aparição rara global','Um chefe especial apareceu por tempo limitado.',''||v_type,570,now(),now()+interval '45 minutes') returning * into v_event;
 return v_event;
end;
$$;

create or replace function public.get_adventure_hub()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_player uuid:=auth.uid();v_kanto jsonb;v_tower integer;v_tower_floor integer;v_week date:=(date_trunc('week',now()))::date;v_elite public.weekly_elite_runs%rowtype;v_raid jsonb;v_rogue jsonb;v_mastery jsonb;v_records jsonb;v_challenges jsonb;v_champ public.champion_defense_snapshots%rowtype;v_event public.adventure_world_events%rowtype;
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 v_kanto:=public.get_kanto_adventure();
 select coalesce(max(best_floor),0) into v_tower from public.battle_tower_runs where player_id=v_player;select floor into v_tower_floor from public.battle_tower_runs where player_id=v_player and active=true order by started_at desc limit 1;
 select * into v_elite from public.weekly_elite_runs where player_id=v_player and week_start=v_week;
 v_raid:=public.get_guild_raid_state();v_rogue:=public.get_rogue_run_state();v_mastery:=public.get_pokemon_mastery();v_records:=public.get_trainer_battle_records();v_champ:=private.refresh_champion_snapshot();v_event:=private.maybe_spawn_world_event();
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'requiredType',c.required_type,'targetPower',c.target_power,'aiStyle',c.ai_style,'rewardCoins',c.reward_coins,'rewardDiamonds',c.reward_diamonds,'wins',coalesce(r.wins,0),'attempts',coalesce(r.attempts,0),'stars',coalesce(r.stars,0),'bestTurns',r.best_turns) order by c.sort_order),'[]'::jsonb) into v_challenges from public.battle_challenges c left join public.player_challenge_results r on r.player_id=v_player and r.challenge_id=c.id where c.active;
 return jsonb_build_object(
  'version','1.2.0','kanto',v_kanto,
  'tower',jsonb_build_object('floor',coalesce(v_tower_floor,1),'bestFloor',v_tower),
  'elite',jsonb_build_object('weekStart',v_week,'stage',coalesce(v_elite.stage,1),'wins',coalesce(v_elite.wins,0),'attempts',coalesce(v_elite.attempts,0),'completed',v_elite.completed_at is not null,'completedAt',v_elite.completed_at),
  'raid',v_raid,'rogue',v_rogue,'mastery',v_mastery,'records',v_records,'challenges',v_challenges,
  'champion',case when v_champ.id is null then null else jsonb_build_object('snapshotId',v_champ.id,'name',v_champ.champion_name,'rating',v_champ.rating,'capturedAt',v_champ.captured_at) end,
  'worldEvent',case when v_event.id is null then null else jsonb_build_object('id',v_event.id,'title',v_event.title,'description',v_event.description,'type',v_event.required_type,'targetPower',v_event.target_power,'startsAt',v_event.starts_at,'endsAt',v_event.ends_at) end
 );
end;
$$;

create or replace function public.get_adventure_battle_context(p_battle_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select case when c.battle_id is null then null else jsonb_build_object('kind',c.kind,'refId',c.ref_id,'runId',c.run_id,'targetPower',c.target_power,'aiStyle',c.ai_style,'finalized',c.finalized) end
 from public.adventure_battle_context c where c.battle_id=p_battle_id and c.player_id=auth.uid()
$$;

create or replace function public.server_list_adventure_team_battle_cards(p_actor_id uuid,p_battle_id uuid,p_search text default null,p_limit integer default 120,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare ctx public.adventure_battle_context%rowtype;v_required text;v_limit integer:=least(greatest(coalesce(p_limit,120),1),250);v_offset integer:=greatest(coalesce(p_offset,0),0);v_items jsonb;v_total integer;
begin
 select * into ctx from public.adventure_battle_context where battle_id=p_battle_id and player_id=p_actor_id;
 if ctx.battle_id is null then return null; end if;
 if ctx.kind='challenge' then select required_type into v_required from public.battle_challenges where id=ctx.ref_id; end if;
 select count(*) into v_total from public.player_cards pc join public.cards c on c.id=pc.card_id
 where pc.player_id=p_actor_id and pc.quantity>0 and private.battle_game_profile_for_card(c.id) is not null
 and (ctx.kind<>'rogue' or exists(select 1 from public.rogue_run_cards rr where rr.run_id=ctx.run_id and rr.card_id=c.id))
 and (v_required is null or exists(select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t where lower(t)=lower(v_required)))
 and (nullif(trim(coalesce(p_search,'')),'') is null or c.pokemon_name ilike '%'||trim(p_search)||'%' or c.id ilike '%'||trim(p_search)||'%');
 select coalesce(jsonb_agg(x.item order by x.power desc,x.name),'[]'::jsonb) into v_items from (
   select jsonb_build_object('cardId',c.id,'name',coalesce(c.pokemon_name,gp->>'identifier','Pokémon'),'cardName',c.pokemon_name,'image',coalesce(c.image_large,c.image_small),'setName',c.set_name,'rarity',c.rarity,'types',coalesce(gp->'types',to_jsonb(c.types),'[]'::jsonb),'hp',nullif(gp->>'baseHp','')::integer,'attack',nullif(gp->>'baseAttack','')::integer,'defense',nullif(gp->>'baseDefense','')::integer,'spAttack',nullif(gp->>'baseSpAttack','')::integer,'spDefense',nullif(gp->>'baseSpDefense','')::integer,'speed',nullif(gp->>'baseSpeed','')::integer,'gameValue',coalesce(c.game_value,0),'quantity',pc.quantity,'pokemonId',nullif(gp->>'pokemonId','')::integer,'profile',gp->>'identifier') item,
   private.adventure_card_power(c.id) power,coalesce(c.pokemon_name,gp->>'identifier','') name
   from public.player_cards pc join public.cards c on c.id=pc.card_id cross join lateral private.battle_game_profile_for_card(c.id) gp
   where pc.player_id=p_actor_id and pc.quantity>0 and gp is not null
   and (ctx.kind<>'rogue' or exists(select 1 from public.rogue_run_cards rr where rr.run_id=ctx.run_id and rr.card_id=c.id))
   and (v_required is null or exists(select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t where lower(t)=lower(v_required)))
   and (nullif(trim(coalesce(p_search,'')),'') is null or c.pokemon_name ilike '%'||trim(p_search)||'%' or c.id ilike '%'||trim(p_search)||'%')
   order by private.adventure_card_power(c.id) desc,c.pokemon_name limit v_limit offset v_offset
 ) x;
 return jsonb_build_object('items',v_items,'total',v_total,'limit',v_limit,'offset',v_offset,'adventure',true,'kind',ctx.kind);
end;
$$;

create or replace function public.server_adventure_team3_bot_take_turn(p_battle_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare ctx public.adventure_battle_context%rowtype;b public.battles%rowtype;v_bot uuid;v_forced boolean:=false;v_any_forced boolean:=false;v_slot integer;v_state jsonb;v_attack text;v_action jsonb;v_resolved jsonb;v_hp integer;v_max integer;
begin
 select * into ctx from public.adventure_battle_context where battle_id=p_battle_id;if ctx.battle_id is null then return jsonb_build_object('handled',false); end if;
 select * into b from public.battles where id=p_battle_id for update;if b.id is null or b.mode<>'team3' then return jsonb_build_object('handled',true,'acted',false); end if;
 select id into v_bot from public.players where id in(b.challenger_id,b.opponent_id) and is_bot=true limit 1;if v_bot is null then return jsonb_build_object('handled',true,'acted',false,'reason','bot_missing'); end if;
 if b.status='drafting' then return jsonb_build_object('handled',true,'acted',false,'reason','bot_team_prelocked'); end if;
 if b.status<>'revealing' then return jsonb_build_object('handled',true,'acted',false,'status',b.status); end if;
 if exists(select 1 from private.battle_team_actions where battle_id=b.id and turn_no=private.battle_team_turn_no(b.id) and player_id=v_bot) then return jsonb_build_object('handled',true,'acted',false,'reason','already_locked'); end if;
 select coalesce(forced_switch,false),active_slot into v_forced,v_slot from private.battle_team_state where battle_id=b.id and player_id=v_bot;
 select exists(select 1 from private.battle_team_state where battle_id=b.id and forced_switch) into v_any_forced;
 if v_forced then
   select m.slot into v_slot from private.battle_team_members m join private.battle_team_state s on s.battle_id=m.battle_id and s.player_id=m.player_id where m.battle_id=b.id and m.player_id=v_bot and m.slot<>s.active_slot and m.current_hp>0 order by (m.current_hp::numeric/greatest(m.max_hp,1)) desc,m.speed_stat desc limit 1;
   if v_slot is null then return jsonb_build_object('handled',true,'acted',false,'reason','no_switch'); end if;
   v_action:=public.server_choose_battle_team_switch(v_bot,b.id,v_slot);return jsonb_build_object('handled',true,'acted',true,'kind','forced_switch','slot',v_slot,'result',v_action);
 elsif v_any_forced then return jsonb_build_object('handled',true,'acted',false,'reason','waiting_human_switch'); end if;
 if ctx.ai_style in('tactical','defensive') then
   select m.current_hp,m.max_hp into v_hp,v_max from private.battle_team_members m join private.battle_team_state s on s.battle_id=m.battle_id and s.player_id=m.player_id where m.battle_id=b.id and m.player_id=v_bot and m.slot=s.active_slot;
   if v_max>0 and v_hp::numeric/v_max<case when ctx.ai_style='defensive' then .42 else .28 end then
     select m.slot into v_slot from private.battle_team_members m join private.battle_team_state s on s.battle_id=m.battle_id and s.player_id=m.player_id where m.battle_id=b.id and m.player_id=v_bot and m.slot<>s.active_slot and m.current_hp>0 order by (m.current_hp::numeric/greatest(m.max_hp,1)) desc,m.speed_stat desc limit 1;
     if v_slot is not null then v_action:=public.server_choose_battle_team_switch(v_bot,b.id,v_slot);return jsonb_build_object('handled',true,'acted',true,'kind','tactical_switch','slot',v_slot,'result',v_action); end if;
   end if;
 end if;
 v_state:=public.server_get_battle_team_state(v_bot,b.id);
 select coalesce(x.item->>'identifier',x.item->>'name') into v_attack from jsonb_array_elements(coalesce(v_state->'attacks','[]'::jsonb)) x(item)
 where coalesce((x.item->>'pp')::integer,0)>0
 order by
   case when ctx.ai_style='precise' then coalesce((x.item->>'accuracy')::integer,100) else coalesce((x.item->>'power')::integer,0) end desc,
   case when ctx.ai_style='defensive' then (case when coalesce((x.item->>'power')::integer,0)=0 then 1 else 0 end) else 0 end desc,
   coalesce((x.item->>'power')::integer,0) desc,coalesce((x.item->>'accuracy')::integer,100) desc,random() limit 1;
 if v_attack is null then return jsonb_build_object('handled',true,'acted',false,'reason','no_attack_pp'); end if;
 v_action:=public.server_choose_battle_team_attack(v_bot,b.id,v_attack);if coalesce((v_action->>'bothActionsLocked')::boolean,false) then v_resolved:=public.server_resolve_team_turn(b.id); end if;
 return jsonb_build_object('handled',true,'acted',true,'kind','attack','style',ctx.ai_style,'attack',v_attack,'result',v_action,'resolved',v_resolved);
end;
$$;

grant execute on function public.server_start_adventure_battle(text,text) to authenticated;
grant execute on function public.get_kanto_adventure() to authenticated;
grant execute on function public.get_adventure_hub() to authenticated;
grant execute on function public.get_pokemon_mastery() to authenticated;
grant execute on function public.get_trainer_battle_records() to authenticated;
grant execute on function public.get_rogue_run_state() to authenticated;
grant execute on function public.get_guild_raid_state() to authenticated;
grant execute on function public.get_adventure_battle_context(uuid) to authenticated;
