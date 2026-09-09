create table if not exists private.collection_weekly_rank_cache (
  week_start timestamptz not null,
  player_id uuid not null,
  weekly_rank bigint not null,
  username text not null,
  weekly_value_usd numeric(14,2) not null default 0,
  cards_gained bigint not null default 0,
  packs_opened bigint not null default 0,
  reward_coins bigint not null default 0,
  reward_diamonds integer not null default 0,
  score_start timestamptz not null,
  week_end timestamptz not null,
  refreshed_at timestamptz not null default now(),
  primary key (week_start,player_id)
);

create index if not exists collection_weekly_rank_cache_rank_idx
  on private.collection_weekly_rank_cache(week_start,weekly_rank,username);

revoke all on table private.collection_weekly_rank_cache from public,anon,authenticated;
grant select,insert,update,delete on table private.collection_weekly_rank_cache to service_role;

create or replace function private.refresh_collection_weekly_rank_cache()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week_start timestamptz:=private.collection_week_start(now());
  v_week_end timestamptz:=private.collection_week_start(now())+interval '7 days';
  v_score_start timestamptz;
  v_rows integer:=0;
begin
  select greatest(v_week_start,activated_at)
    into v_score_start
  from private.collection_weekly_config
  where id=1;

  if v_score_start is null then v_score_start:=v_week_start; end if;

  delete from private.collection_weekly_rank_cache c
  where c.week_start=v_week_start;

  with scores as materialized (
    select * from private.collection_weekly_scores(v_week_start,v_week_end)
  ), ranked as (
    select
      row_number() over(order by s.weekly_value_usd desc,s.cards_gained desc,s.packs_opened desc,s.username asc) as weekly_rank,
      s.*
    from scores s
  ), rewards as (
    select
      first_reward_coins,second_reward_coins,third_reward_coins,
      first_reward_diamonds,second_reward_diamonds,third_reward_diamonds
    from private.collection_weekly_config
    where id=1
  )
  insert into private.collection_weekly_rank_cache(
    week_start,player_id,weekly_rank,username,weekly_value_usd,cards_gained,packs_opened,
    reward_coins,reward_diamonds,score_start,week_end,refreshed_at
  )
  select
    v_week_start,r.player_id,r.weekly_rank,r.username,r.weekly_value_usd::numeric(14,2),r.cards_gained,r.packs_opened,
    case r.weekly_rank when 1 then rw.first_reward_coins when 2 then rw.second_reward_coins when 3 then rw.third_reward_coins else 0 end::bigint,
    case r.weekly_rank when 1 then rw.first_reward_diamonds when 2 then rw.second_reward_diamonds when 3 then rw.third_reward_diamonds else 0 end::integer,
    v_score_start,v_week_end,now()
  from ranked r
  cross join rewards rw;

  get diagnostics v_rows=row_count;

  delete from private.collection_weekly_rank_cache c
  where c.week_start<v_week_start-interval '14 days';

  insert into private.background_job_state(job_name,last_attempt_at,last_success_at,last_source_change_at,last_result)
  values(
    'weekly_collection_rank',now(),now(),null,
    jsonb_build_object('status','completed','weekStart',v_week_start,'rows',v_rows)
  )
  on conflict(job_name) do update
  set last_attempt_at=excluded.last_attempt_at,
      last_success_at=excluded.last_success_at,
      last_result=excluded.last_result;

  return v_rows;
end;
$function$;

create or replace function private.refresh_collection_weekly_rank_cache_if_due()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_week_start timestamptz:=private.collection_week_start(now());
  v_latest_source timestamptz;
  v_last_success timestamptz;
  v_last_source timestamptz;
  v_cached_week timestamptz;
  v_rows integer:=0;
  v_started timestamptz:=clock_timestamp();
begin
  if not pg_try_advisory_xact_lock(hashtextextended('trainer_collection:weekly_collection_rank_cache',0)) then
    return jsonb_build_object('status','skipped','reason','already_running');
  end if;

  select greatest(
    coalesce((select max(po.opened_at) from public.pack_openings po),'epoch'::timestamptz),
    coalesce((select max(d.created_at) from public.diamond_pack_openings d),'epoch'::timestamptz)
  ) into v_latest_source;

  select s.last_success_at,s.last_source_change_at,
         nullif(s.last_result->>'weekStart','')::timestamptz
    into v_last_success,v_last_source,v_cached_week
  from private.background_job_state s
  where s.job_name='weekly_collection_rank';

  if v_last_success is not null
     and v_cached_week=v_week_start
     and coalesce(v_last_source,'epoch'::timestamptz)>=v_latest_source then
    return jsonb_build_object('status','deferred','weekStart',v_week_start,'sourceChangedAt',v_latest_source);
  end if;

  insert into private.background_job_state(job_name,last_attempt_at,last_result)
  values('weekly_collection_rank',now(),jsonb_build_object('status','running','weekStart',v_week_start))
  on conflict(job_name) do update
  set last_attempt_at=excluded.last_attempt_at,last_result=excluded.last_result;

  v_rows:=private.refresh_collection_weekly_rank_cache();

  update private.background_job_state
  set last_success_at=now(),
      last_source_change_at=v_latest_source,
      last_result=jsonb_build_object('status','completed','weekStart',v_week_start,'rows',v_rows)
  where job_name='weekly_collection_rank';

  return jsonb_build_object(
    'status','completed','weekStart',v_week_start,'rows',v_rows,
    'durationMs',round((extract(epoch from(clock_timestamp()-v_started))*1000)::numeric,1)
  );
exception when others then
  update private.background_job_state
  set last_result=jsonb_build_object('status','error','weekStart',v_week_start,'message',sqlerrm)
  where job_name='weekly_collection_rank';
  return jsonb_build_object('status','error','message',sqlerrm);
end;
$function$;

select private.refresh_collection_weekly_rank_cache_if_due();

create or replace function public.get_collection_weekly_leaderboard(p_limit integer default 100)
returns table(
  weekly_rank bigint,
  player_id uuid,
  username text,
  weekly_value_usd numeric,
  cards_gained bigint,
  packs_opened bigint,
  reward_coins bigint,
  reward_diamonds integer,
  week_start timestamptz,
  score_start timestamptz,
  week_end timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    c.weekly_rank,c.player_id,c.username,c.weekly_value_usd::numeric,c.cards_gained,c.packs_opened,
    c.reward_coins,c.reward_diamonds,c.week_start,c.score_start,c.week_end
  from private.collection_weekly_rank_cache c
  where auth.uid() is not null
    and c.week_start=private.collection_week_start(now())
  order by c.weekly_rank,c.username
  limit greatest(1,least(coalesce(p_limit,100),200));
$function$;

revoke all on function private.refresh_collection_weekly_rank_cache() from public,anon,authenticated;
revoke all on function private.refresh_collection_weekly_rank_cache_if_due() from public,anon,authenticated;
grant execute on function private.refresh_collection_weekly_rank_cache() to service_role;
grant execute on function private.refresh_collection_weekly_rank_cache_if_due() to service_role;

do $do$
begin
  if exists(select 1 from cron.job where jobname='collection-weekly-rank-cache') then
    perform cron.unschedule((select jobid from cron.job where jobname='collection-weekly-rank-cache' limit 1));
  end if;
  perform cron.schedule(
    'collection-weekly-rank-cache',
    '* * * * *',
    'select private.refresh_collection_weekly_rank_cache_if_due();'
  );
end;
$do$;
