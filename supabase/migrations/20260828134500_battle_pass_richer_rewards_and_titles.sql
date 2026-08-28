-- Rebalance Battle Pass Season 1 rewards and add exclusive title rewards.
-- Free track: exactly 100,000 Gold + 8 Diamonds + 1 exclusive title.
-- VIP track: exactly 100,000 additional Gold + 15 Diamonds + 5 exclusive titles.
-- Every Gold reward is at least 1,510.

insert into public.achievement_definitions
  (id,name,title,description,icon,category,target,sort_order,active)
values
  ('bp_s1_free_50','Jornada Kanto concluída','Campeão da Jornada','Conclua os 50 níveis da trilha grátis da Temporada 1.','🏆','special',1,90,true),
  ('bp_s1_vip_10','VIP Ascendente I','Treinador VIP','Alcance o nível 10 do Passe VIP da Temporada 1.','💎','special',1,91,true),
  ('bp_s1_vip_20','VIP Ascendente II','Elite de Kanto','Alcance o nível 20 do Passe VIP da Temporada 1.','✨','special',1,92,true),
  ('bp_s1_vip_30','VIP Ascendente III','Ascendente Dourado','Alcance o nível 30 do Passe VIP da Temporada 1.','🌟','special',1,93,true),
  ('bp_s1_vip_40','VIP Ascendente IV','Lenda Premium','Alcance o nível 40 do Passe VIP da Temporada 1.','👑','special',1,94,true),
  ('bp_s1_vip_50','VIP Ascendente Final','Mestre Kanto Ascendente','Conclua os 50 níveis do Passe VIP da Temporada 1.','🔥','special',1,95,true)
on conflict(id) do update set
  name=excluded.name,
  title=excluded.title,
  description=excluded.description,
  icon=excluded.icon,
  category=excluded.category,
  target=excluded.target,
  sort_order=excluded.sort_order,
  active=true;

with free_rewards as (
  select
    lvl,
    1490 + (lvl * 20) as coins,
    case lvl
      when 10 then 1
      when 20 then 1
      when 30 then 1
      when 40 then 2
      when 50 then 3
      else null
    end as diamonds,
    case when lvl=50 then 'bp_s1_free_50' end as title_id,
    case when lvl=50 then 'Campeão da Jornada' end as title_name
  from generate_series(1,50) lvl
)
insert into public.battle_pass_reward_definitions(season_id,level,track,label,reward)
select
  'season_2026_01',
  lvl,
  'free',
  concat(
    '🪙 ', coins::text,
    case when diamonds is not null then concat(' + 💎 ',diamonds::text) else '' end,
    case when title_name is not null then concat(' + 🏆 ',title_name) else '' end
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'coins',coins,
    'diamonds',diamonds,
    'titleId',title_id,
    'titleName',title_name
  ))
from free_rewards
on conflict(season_id,level,track) do update
set label=excluded.label,reward=excluded.reward;

with vip_rewards as (
  select
    lvl,
    1490 + (lvl * 20) as coins,
    case lvl
      when 10 then 2
      when 20 then 2
      when 30 then 3
      when 40 then 3
      when 50 then 5
      else null
    end as diamonds,
    case lvl
      when 10 then 'bp_s1_vip_10'
      when 20 then 'bp_s1_vip_20'
      when 30 then 'bp_s1_vip_30'
      when 40 then 'bp_s1_vip_40'
      when 50 then 'bp_s1_vip_50'
      else null
    end as title_id,
    case lvl
      when 10 then 'Treinador VIP'
      when 20 then 'Elite de Kanto'
      when 30 then 'Ascendente Dourado'
      when 40 then 'Lenda Premium'
      when 50 then 'Mestre Kanto Ascendente'
      else null
    end as title_name
  from generate_series(1,50) lvl
)
insert into public.battle_pass_reward_definitions(season_id,level,track,label,reward)
select
  'season_2026_01',
  lvl,
  'vip',
  concat(
    '🪙 ', coins::text,
    case when diamonds is not null then concat(' + 💎 ',diamonds::text) else '' end,
    case when title_name is not null then concat(' + 👑 ',title_name) else '' end
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'coins',coins,
    'diamonds',diamonds,
    'titleId',title_id,
    'titleName',title_name
  ))
from vip_rewards
on conflict(season_id,level,track) do update
set label=excluded.label,reward=excluded.reward;

create or replace function public.claim_battle_pass_reward(p_level integer,p_track text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player_id uuid:=auth.uid();
  v_season public.battle_pass_seasons%rowtype;
  v_progress public.battle_pass_player_progress%rowtype;
  v_reward jsonb;
  v_coins bigint:=0;
  v_diamonds bigint:=0;
  v_title_id text;
  v_title_name text;
  v_new_coins bigint;
  v_new_diamonds bigint;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_track not in ('free','vip') then raise exception 'INVALID_TRACK'; end if;
  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then
    raise exception 'APP_MAINTENANCE';
  end if;

  select * into v_season
  from public.battle_pass_seasons
  where active=true and starts_at<=now() and ends_at>now()
  order by starts_at desc
  limit 1;

  if v_season.id is null then raise exception 'NO_ACTIVE_BATTLE_PASS'; end if;
  if p_level<1 or p_level>v_season.max_level then raise exception 'INVALID_LEVEL'; end if;

  insert into public.battle_pass_player_progress(player_id,season_id)
  values(v_player_id,v_season.id)
  on conflict(player_id,season_id) do nothing;

  select * into v_progress
  from public.battle_pass_player_progress
  where player_id=v_player_id and season_id=v_season.id
  for update;

  if p_level>v_progress.level then raise exception 'LEVEL_LOCKED'; end if;
  if p_track='vip' and not v_progress.vip_unlocked then raise exception 'VIP_REQUIRED'; end if;

  select reward into v_reward
  from public.battle_pass_reward_definitions
  where season_id=v_season.id and level=p_level and track=p_track;

  if v_reward is null then raise exception 'REWARD_NOT_FOUND'; end if;

  insert into public.battle_pass_reward_claims(player_id,season_id,level,track,reward)
  values(v_player_id,v_season.id,p_level,p_track,v_reward)
  on conflict(player_id,season_id,level,track) do nothing;

  if not found then raise exception 'REWARD_ALREADY_CLAIMED'; end if;

  v_coins:=coalesce((v_reward->>'coins')::bigint,0);
  v_diamonds:=coalesce((v_reward->>'diamonds')::bigint,0);
  v_title_id:=nullif(v_reward->>'titleId','');
  v_title_name:=nullif(v_reward->>'titleName','');

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds
  where id=v_player_id
  returning coins,diamonds into v_new_coins,v_new_diamonds;

  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_title_id is not null then
    insert into public.player_achievements(
      player_id,achievement_id,progress,unlocked_at,updated_at
    )
    select v_player_id,d.id,1,now(),now()
    from public.achievement_definitions d
    where d.id=v_title_id
      and d.active=true
      and d.target<=1
    on conflict(player_id,achievement_id) do update
    set progress=greatest(public.player_achievements.progress,1),
        unlocked_at=coalesce(public.player_achievements.unlocked_at,now()),
        updated_at=now();

    if not found then raise exception 'TITLE_REWARD_NOT_FOUND'; end if;
  end if;

  return jsonb_build_object(
    'level',p_level,
    'track',p_track,
    'reward',v_reward,
    'coins',v_new_coins,
    'diamonds',v_new_diamonds,
    'titleId',v_title_id,
    'titleName',v_title_name
  );
end;
$$;

revoke all on function public.claim_battle_pass_reward(integer,text) from public,anon,authenticated;
grant execute on function public.claim_battle_pass_reward(integer,text) to authenticated;
