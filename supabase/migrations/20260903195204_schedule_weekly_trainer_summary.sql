
-- Weekly summary delivery: one in-app/push-ready notification around 09:00 local time every Monday.
create or replace function private.queue_due_weekly_summaries()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_local timestamp;
  v_week_key text;
  v_count integer:=0;
begin
  for r in
    select
      p.id player_id,
      coalesce(s.timezone_offset_minutes,0) timezone_offset_minutes
    from public.players p
    join public.player_settings s on s.player_id=p.id
    where p.account_status='active'
      and coalesce(s.weekly_summary_notifications,true)
      and coalesce(s.notify_progress,true)
  loop
    v_local:=(now() at time zone 'UTC')-make_interval(mins=>r.timezone_offset_minutes);
    if extract(isodow from v_local)<>1 or extract(hour from v_local)<>9 then
      continue;
    end if;
    v_week_key:=to_char(v_local::date,'IYYY-IW');
    if exists(
      select 1 from public.notifications n
      where n.player_id=r.player_id
        and n.type='weekly_summary'
        and n.metadata->>'weekKey'=v_week_key
    ) then
      continue;
    end if;

    perform public.server_queue_notification(
      r.player_id,
      'weekly_summary',
      'Seu resumo semanal está pronto',
      'Veja seus melhores pulls, batalhas, evolução da coleção e progresso dos últimos 7 dias.',
      jsonb_build_object('route','/weekly-summary','weekKey',v_week_key)
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.queue_due_weekly_summaries() from public,anon,authenticated;
grant execute on function private.queue_due_weekly_summaries() to service_role;

do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname='trainer-weekly-summary'
  loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule(
    'trainer-weekly-summary',
    '7 * * * *',
    'select private.queue_due_weekly_summaries();'
  );
end $$;
