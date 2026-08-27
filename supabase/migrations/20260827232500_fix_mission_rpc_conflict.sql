create or replace function public.get_my_missions_v2()
returns table (
  id text,
  title text,
  description text,
  cadence text,
  event_type text,
  target integer,
  reward_coins integer,
  reward_xp integer,
  reward_diamonds integer,
  action_route text,
  progress integer,
  claimed boolean,
  period_start date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := auth.uid();
  v_definition public.mission_definitions_v2%rowtype;
  v_period_start date;
  v_period_end date;
  v_progress integer;
begin
  if v_player_id is null then raise exception 'UNAUTHORIZED'; end if;

  for v_definition in
    select * from public.mission_definitions_v2 where active = true order by sort_order, id
  loop
    v_period_start := case when v_definition.cadence = 'weekly' then date_trunc('week', current_date)::date else current_date end;
    v_period_end := v_period_start + case when v_definition.cadence = 'weekly' then 7 else 1 end;
    v_progress := private.calculate_mission_progress(v_player_id, v_definition.event_type, v_period_start::timestamptz, v_period_end::timestamptz);

    insert into public.player_missions_v2 (player_id, mission_id, period_start, progress, updated_at)
    values (v_player_id, v_definition.id, v_period_start, v_progress, now())
    on conflict on constraint player_missions_v2_pkey do update
      set progress = excluded.progress, updated_at = now();
  end loop;

  return query
  select d.id, d.title, d.description, d.cadence, d.event_type, d.target,
         d.reward_coins, d.reward_xp, d.reward_diamonds, d.action_route,
         p.progress, p.claimed, p.period_start
  from public.mission_definitions_v2 d
  join public.player_missions_v2 p on p.mission_id = d.id and p.player_id = v_player_id
  where d.active = true
    and p.period_start = case when d.cadence = 'weekly' then date_trunc('week', current_date)::date else current_date end
  order by d.sort_order, d.id;
end;
$$;

revoke all on function public.get_my_missions_v2() from public, anon;
grant execute on function public.get_my_missions_v2() to authenticated;

