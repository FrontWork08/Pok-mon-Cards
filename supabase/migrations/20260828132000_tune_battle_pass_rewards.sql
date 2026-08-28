-- Keep Battle Pass rewards meaningful without inflating the existing economy.
insert into public.battle_pass_reward_definitions(season_id,level,track,label,reward)
select 'season_2026_01',lvl,'free',
  case when lvl in (25,50)
    then format('🪙 %s + 💎 %s',(300+lvl*20)::text,(case when lvl=25 then 1 else 2 end)::text)
    else format('🪙 %s',(300+lvl*20)::text)
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'coins',300+lvl*20,
    'diamonds',case when lvl=25 then 1 when lvl=50 then 2 else null end
  ))
from generate_series(1,50) lvl
on conflict(season_id,level,track) do update set label=excluded.label,reward=excluded.reward;

insert into public.battle_pass_reward_definitions(season_id,level,track,label,reward)
select 'season_2026_01',lvl,'vip',
  case when lvl in (10,20,30,40,50)
    then format('🪙 %s + 💎 %s',(500+lvl*30)::text,(case when lvl=50 then 3 else 1 end)::text)
    else format('🪙 %s',(500+lvl*30)::text)
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'coins',500+lvl*30,
    'diamonds',case when lvl in (10,20,30,40) then 1 when lvl=50 then 3 else null end
  ))
from generate_series(1,50) lvl
on conflict(season_id,level,track) do update set label=excluded.label,reward=excluded.reward;
