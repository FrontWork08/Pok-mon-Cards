import fs from 'node:fs';
import path from 'node:path';

const dir='supabase/migrations';
const mv=(from,to)=>{
  const a=path.join(dir,from),b=path.join(dir,to);
  if(fs.existsSync(b)){ if(fs.existsSync(a)) fs.rmSync(a); return; }
  if(!fs.existsSync(a)) throw new Error(`Missing migration to rename: ${from}`);
  fs.renameSync(a,b);
};
const write=(name,content)=>fs.writeFileSync(path.join(dir,name),content.trimStart()+'\n');

mv('20260906051500_adventure_modes_v12.sql','20260906051640_trainer_adventure_v12_core.sql');
mv('20260906140000_enforce_adventure_team_rules_server_side.sql','20260906140601_enforce_adventure_team_rules_server_side.sql');
mv('20260906141000_track_pokemon_mastery_knockouts.sql','20260906141032_track_pokemon_mastery_knockouts.sql');
mv('20260906141500_dedupe_mastery_by_species_and_track_kos.sql','20260906141119_dedupe_mastery_by_species_and_track_kos.sql');

const markers={
 '20260906052020_trainer_adventure_v12_runtime.sql':'Runtime wiring is included in the self-contained v1.2 core snapshot kept at 20260906051640.',
 '20260906052055_trainer_adventure_v12_progression.sql':'Progression and reward finalization are included in the self-contained v1.2 core snapshot kept at 20260906051640.',
 '20260906052119_trainer_adventure_v12_state_api.sql':'Adventure state APIs are included in the self-contained v1.2 core snapshot kept at 20260906051640.',
 '20260906052223_trainer_adventure_v12_card_filter.sql':'Adventure eligible-card filtering is included in the self-contained v1.2 core snapshot kept at 20260906051640.',
 '20260906052241_trainer_adventure_v12_bot_ai.sql':'Adventure bot AI is included in the self-contained v1.2 core snapshot kept at 20260906051640.',
 '20260906052736_trainer_adventure_v12_opponent_identity.sql':'Opponent Pokémon identity is exposed by the shared team3 Game Boy battle state; this marker preserves the production migration version.'
};
for(const [name,note] of Object.entries(markers)) write(name,`-- Trainer Collection 1.2 migration-history marker.\n-- ${note}\n-- Intentionally no-op on a fresh database because the core snapshot is self-contained.`);

write('20260906052713_trainer_adventure_v12_depth.sql',String.raw`
-- Trainer Collection 1.2 depth refinements.
-- Mirrors the final production behavior layered after the self-contained core snapshot.

alter table public.adventure_battle_context add column if not exists modifier text;

create or replace function private.adventure_pick_seeded_team(p_types text[],p_target integer,p_seed text)
returns text[]
language plpgsql stable security definer set search_path=''
as $$
declare v_cards text[];
begin
  select array_agg(q.id order by q.rn) into v_cards
  from (
    select c.id,row_number() over(order by abs(private.adventure_card_power(c.id)-p_target),md5(c.id||coalesce(p_seed,''))) rn
    from public.cards c
    where private.battle_game_profile_for_card(c.id) is not null
      and (coalesce(cardinality(p_types),0)=0 or exists(
        select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t
        where lower(t)=any(array(select lower(x) from unnest(p_types)x))
      ))
    order by abs(private.adventure_card_power(c.id)-p_target),md5(c.id||coalesce(p_seed,''))
    limit 3
  ) q;
  if coalesce(cardinality(v_cards),0)<3 then return private.adventure_pick_team(p_types,p_target); end if;
  return v_cards;
end;
$$;

create or replace function private.adventure_rival_team(p_player uuid,p_target integer)
returns text[]
language plpgsql security definer set search_path=''
as $$
declare v_type text;v_counter text;
begin
  select lower(t.type_name) into v_type
  from (
    select unnest(coalesce(c.game_types,c.types,'{}'::text[])) type_name,private.adventure_card_power(c.id) power
    from public.player_cards pc join public.cards c on c.id=pc.card_id
    where pc.player_id=p_player and pc.quantity>0 and private.battle_game_profile_for_card(c.id) is not null
    order by private.adventure_card_power(c.id) desc nulls last limit 6
  ) t
  group by lower(t.type_name) order by count(*) desc,max(t.power) desc limit 1;
  v_counter:=case v_type
    when 'fire' then 'water' when 'water' then 'electric' when 'grass' then 'fire' when 'electric' then 'ground'
    when 'psychic' then 'dark' when 'ice' then 'fire' when 'dragon' then 'fairy' when 'dark' then 'fighting'
    when 'fairy' then 'steel' when 'fighting' then 'psychic' when 'flying' then 'electric' when 'poison' then 'ground'
    when 'ground' then 'water' when 'rock' then 'water' when 'bug' then 'fire' when 'ghost' then 'dark'
    when 'steel' then 'fire' when 'normal' then 'fighting' else null end;
  if v_counter is null then return private.adventure_pick_team(array[]::text[],p_target); end if;
  return private.adventure_pick_team(array[v_counter],p_target);
end;
$$;

create or replace function private.apply_adventure_member_modifier()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare ctx public.adventure_battle_context%rowtype;
begin
  select * into ctx from public.adventure_battle_context where battle_id=new.battle_id;
  if ctx.battle_id is null or ctx.kind<>'tower' or ctx.modifier is null then return new; end if;
  if ctx.modifier='boss_hp' and new.player_id<>ctx.player_id then
    new.max_hp:=greatest(1,round(new.max_hp*1.20));new.current_hp:=new.max_hp;
  elsif ctx.modifier='speed_field' then new.speed_stat:=greatest(1,round(new.speed_stat*1.15));
  elsif ctx.modifier='power_field' then
    new.attack_stat:=greatest(1,round(new.attack_stat*1.10));new.sp_attack_stat:=greatest(1,round(new.sp_attack_stat*1.10));
  elsif ctx.modifier='guard_field' then
    new.defense_stat:=greatest(1,round(new.defense_stat*1.10));new.sp_defense_stat:=greatest(1,round(new.sp_defense_stat*1.10));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_adventure_member_modifier on private.battle_team_members;
create trigger trg_adventure_member_modifier before insert on private.battle_team_members
for each row execute function private.apply_adventure_member_modifier();

create or replace function private.create_adventure_team3_battle(
  p_player uuid,p_kind text,p_ref_id text,p_run_id uuid,p_target integer,p_style text,p_team text[]
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_battle uuid;v_bot uuid;v_owned integer;v_modifier text;v_attempts integer;
begin
  if exists(select 1 from public.battles where status in('invited','drafting','selecting','revealing') and p_player in(challenger_id,opponent_id)) then raise exception 'ACTIVE_BATTLE_EXISTS'; end if;
  if p_kind='raid' then
    select count(*) into v_attempts from public.adventure_battle_context where player_id=p_player and kind='raid' and ref_id=p_ref_id and created_at>=date_trunc('day',now());
    if v_attempts>=5 then raise exception 'RAID_DAILY_LIMIT_REACHED'; end if;
  elsif p_kind='world_event' then
    select count(*) into v_attempts from public.adventure_battle_context where player_id=p_player and kind='world_event' and ref_id=p_ref_id;
    if v_attempts>=3 then raise exception 'WORLD_EVENT_ATTEMPT_LIMIT_REACHED'; end if;
  elsif p_kind='champion' then
    select count(*) into v_attempts from public.adventure_battle_context where player_id=p_player and kind='champion' and created_at>=date_trunc('day',now());
    if v_attempts>=3 then raise exception 'CHAMPION_DAILY_LIMIT_REACHED'; end if;
  end if;
  select count(*) into v_owned from public.player_cards pc where pc.player_id=p_player and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null;
  if v_owned<3 then raise exception 'TEAM_NEEDS_3_GAME_CARDS'; end if;
  if coalesce(cardinality(p_team),0)<>3 then raise exception 'ADVENTURE_TEAM_UNAVAILABLE'; end if;
  v_bot:=private.adventure_choose_bot(p_target);if v_bot is null then raise exception 'ADVENTURE_BOT_UNAVAILABLE'; end if;
  if p_kind='tower' then
    v_modifier:=case when coalesce(nullif(p_ref_id,''),'1')::integer%10=0 then 'boss_hp'
      when coalesce(nullif(p_ref_id,''),'1')::integer%7=0 then 'speed_field'
      when coalesce(nullif(p_ref_id,''),'1')::integer%5=0 then 'power_field'
      when coalesce(nullif(p_ref_id,''),'1')::integer%3=0 then 'guard_field' else null end;
  end if;
  insert into public.player_cards(player_id,card_id,quantity,first_obtained_at)
  select v_bot,cid,1,now() from unnest(p_team) cid
  on conflict(player_id,card_id) do update set quantity=greatest(public.player_cards.quantity,1);
  insert into public.battles(challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,selection_deadline,draft_turn_id,draft_pick_count,is_ranked,is_bot_match,engine_version,reward_eligible)
  values(p_player,v_bot,'team3','none',0,'drafting',1,now()+interval '180 seconds',null,0,false,true,'game_v1',false) returning id into v_battle;
  insert into private.battle_team_state(battle_id,player_id) values(v_battle,p_player),(v_battle,v_bot) on conflict do nothing;
  insert into public.adventure_battle_context(battle_id,player_id,kind,ref_id,run_id,difficulty,target_power,ai_style,modifier)
  values(v_battle,p_player,p_kind,p_ref_id,p_run_id,greatest(1,(p_target-280)/35),p_target,coalesce(nullif(p_style,''),'balanced'),v_modifier);
  perform public.server_set_battle_team(v_bot,v_battle,p_team);
  insert into public.battle_events(battle_id,event_type,payload)
  values(v_battle,'adventure_started',jsonb_build_object('kind',p_kind,'refId',p_ref_id,'targetPower',p_target,'aiStyle',p_style,'modifier',v_modifier,'teamSize',3));
  return jsonb_build_object('battleId',v_battle,'mode','team3','route','/team-battle/'||v_battle::text,'kind',p_kind,'refId',p_ref_id,'targetPower',p_target,'aiStyle',p_style,'modifier',v_modifier);
end;
$$;

create or replace function public.server_start_adventure_battle(p_kind text,p_ref_id text default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
 v_player uuid:=auth.uid();v_kind text:=lower(trim(coalesce(p_kind,'')));v_node public.adventure_nodes%rowtype;
 v_target integer;v_style text;v_types text[]:=array[]::text[];v_team text[];v_run uuid;v_floor integer;
 v_week date:=(date_trunc('week',now()))::date;v_stage integer;v_guild text;v_raid public.guild_raid_bosses%rowtype;
 v_ch public.battle_challenges%rowtype;v_champ public.champion_defense_snapshots%rowtype;v_event public.adventure_world_events%rowtype;
begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;perform public.server_assert_app_active(v_player);
 if v_kind='journey' then
   select * into v_node from public.adventure_nodes where id=p_ref_id and active=true;if v_node.id is null then raise exception 'ADVENTURE_NODE_NOT_FOUND'; end if;
   if exists(select 1 from public.adventure_nodes prior where prior.region=v_node.region and prior.active and prior.sort_order<v_node.sort_order and not exists(select 1 from public.trainer_adventure_progress ap where ap.player_id=v_player and ap.node_id=prior.id and ap.completed_at is not null)) then raise exception 'ADVENTURE_NODE_LOCKED'; end if;
   v_target:=v_node.target_power;v_style:=v_node.ai_style;v_types:=v_node.team_types;
   if v_node.node_kind='rival' then v_team:=private.adventure_rival_team(v_player,v_target);else v_team:=private.adventure_pick_seeded_team(v_types,v_target,v_node.id);end if;
 elsif v_kind='tower' then
   select id,floor into v_run,v_floor from public.battle_tower_runs where player_id=v_player and active=true order by started_at desc limit 1;
   if v_run is null then insert into public.battle_tower_runs(player_id) values(v_player) returning id,floor into v_run,v_floor;end if;
   v_target:=least(670,340+(greatest(v_floor,1)-1)*13);v_style:=case when v_floor%5=0 then 'tactical' when v_floor%3=0 then 'precise' else 'aggressive' end;p_ref_id:=v_floor::text;
   v_team:=private.adventure_pick_seeded_team(array[]::text[],v_target,v_run::text||':'||v_floor::text);
 elsif v_kind='elite' then
   insert into public.weekly_elite_runs(player_id,week_start) values(v_player,v_week) on conflict do nothing;
   select stage into v_stage from public.weekly_elite_runs where player_id=v_player and week_start=v_week;
   if exists(select 1 from public.weekly_elite_runs where player_id=v_player and week_start=v_week and completed_at is not null) then raise exception 'ELITE_ALREADY_COMPLETED_THIS_WEEK'; end if;
   v_target:=535+v_stage*22;v_style:=(array['defensive','aggressive','tactical','precise','tactical'])[v_stage];
   v_types:=case v_stage when 1 then array['ice','water'] when 2 then array['fighting','rock'] when 3 then array['ghost','poison'] when 4 then array['dragon','flying'] else array[]::text[] end;
   p_ref_id:=v_stage::text;v_team:=private.adventure_pick_seeded_team(v_types,v_target,v_week::text||':elite:'||v_stage::text);
 elsif v_kind='raid' then
   select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;if v_guild is null then raise exception 'GUILD_REQUIRED'; end if;
   v_raid:=private.ensure_guild_raid(v_guild);if v_raid.current_hp<=0 or v_raid.ends_at<=now() then raise exception 'RAID_FINISHED'; end if;
   v_target:=least(675,v_raid.target_power);v_style:='defensive';v_types:=array[v_raid.boss_type];p_ref_id:=v_raid.id::text;v_team:=private.adventure_pick_seeded_team(v_types,v_target,v_raid.id::text);
 elsif v_kind='rogue' then
   select id,floor into v_run,v_floor from public.rogue_runs where player_id=v_player and active=true order by started_at desc limit 1;
   if v_run is null then
     insert into public.rogue_runs(player_id) values(v_player) returning id,floor into v_run,v_floor;
     insert into public.rogue_run_cards(run_id,card_id,position) select v_run,x.card_id,row_number() over() from (select pc.card_id from public.player_cards pc where pc.player_id=v_player and pc.quantity>0 and private.battle_game_profile_for_card(pc.card_id) is not null order by random() limit 9)x;
     if (select count(*) from public.rogue_run_cards where run_id=v_run)<3 then update public.rogue_runs set active=false,ended_at=now() where id=v_run;raise exception 'ROGUE_NEEDS_3_GAME_CARDS';end if;
   end if;
   v_target:=least(660,350+(v_floor-1)*18);v_style:=case when v_floor%4=0 then 'tactical' else 'balanced' end;p_ref_id:=v_floor::text;v_team:=private.adventure_pick_seeded_team(array[]::text[],v_target,v_run::text||':rogue:'||v_floor::text);
 elsif v_kind='challenge' then
   select * into v_ch from public.battle_challenges where id=p_ref_id and active=true;if v_ch.id is null then raise exception 'CHALLENGE_NOT_FOUND';end if;
   v_target:=v_ch.target_power;v_style:=v_ch.ai_style;if v_ch.required_type is not null then v_types:=array[v_ch.required_type];end if;v_team:=private.adventure_pick_seeded_team(v_types,v_target,'challenge:'||v_ch.id);
 elsif v_kind='champion' then
   v_champ:=private.refresh_champion_snapshot();if v_champ.id is null then raise exception 'CHAMPION_UNAVAILABLE';end if;if v_champ.champion_id=v_player then raise exception 'CHAMPION_CANNOT_CHALLENGE_SELF';end if;
   v_target:=least(680,560+greatest(0,(v_champ.rating-1000)/8));v_style:='tactical';v_team:=v_champ.card_ids;p_ref_id:=v_champ.id::text;
 elsif v_kind='world_event' then
   select * into v_event from public.adventure_world_events where active=true and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;if v_event.id is null then raise exception 'WORLD_EVENT_INACTIVE';end if;
   v_target:=v_event.target_power;v_style:='aggressive';if v_event.required_type is not null then v_types:=array[v_event.required_type];end if;p_ref_id:=v_event.id::text;v_team:=private.adventure_pick_seeded_team(v_types,v_target,v_event.id::text);
 else raise exception 'INVALID_ADVENTURE_KIND';end if;
 if v_team is null then v_team:=private.adventure_pick_team(v_types,v_target);end if;
 return private.create_adventure_team3_battle(v_player,v_kind,p_ref_id,v_run,v_target,v_style,v_team);
end;
$$;

grant execute on function public.server_start_adventure_battle(text,text) to authenticated;
`));

console.log('Trainer Collection 1.2 migration history synchronized to production versions.');
