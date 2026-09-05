create or replace function public.server_process_expired_battles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  b public.battles%rowtype;
  v_result jsonb;
  v_processed integer := 0;
begin
  for r in
    select id,challenger_id
    from public.battles
    where status='invited'
      and created_at <= now() - interval '15 minutes'
    order by created_at asc
    limit 50
  loop
    begin
      perform public.server_cancel_battle(r.challenger_id,r.id);
      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm,'stage','expire_invite'));
      exception when others then null;
      end;
    end;
  end loop;

  for r in
    select id
    from public.battles
    where status in ('drafting','selecting','revealing')
      and selection_deadline is not null
      and selection_deadline<=now()
    order by selection_deadline asc
    limit 50
  loop
    begin
      select * into b from public.battles where id=r.id;

      if b.mode='team3' then
        v_result:=public.server_timeout_team_battle(b.challenger_id,b.id);
      else
        v_result:=public.server_timeout_battle(b.challenger_id,b.id);
        select * into b from public.battles where id=r.id;

        if coalesce((v_result->>'resolveReady')::boolean,false) then
          perform public.server_resolve_battle_round(b.id);
        end if;
      end if;

      v_processed:=v_processed+1;
    exception when others then
      begin
        insert into public.battle_events(battle_id,event_type,payload)
        values(r.id,'worker_error',jsonb_build_object('message',sqlerrm,'stage','battle_timeout','mode',b.mode));
      exception when others then null;
      end;
    end;
  end loop;

  return v_processed;
end;
$function$;

create or replace function private.dispatch_push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.server_dispatch_push_notifications();
  return null;
end;
$function$;

revoke all on function private.dispatch_push_on_notification_insert() from public, anon, authenticated;
grant execute on function private.dispatch_push_on_notification_insert() to service_role;

drop trigger if exists trg_notifications_fast_push on public.notifications;
create trigger trg_notifications_fast_push
after insert on public.notifications
for each statement
execute function private.dispatch_push_on_notification_insert();
