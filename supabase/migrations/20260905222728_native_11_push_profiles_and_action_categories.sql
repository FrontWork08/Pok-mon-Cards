alter table public.push_tokens add column if not exists app_version text;

create or replace function public.server_dispatch_push_notifications()
returns integer
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  n public.notifications%rowtype;
  t public.push_tokens%rowtype;
  v_count integer:=0;
  v_allow boolean;
  v_chat boolean;
  v_smart boolean;
  v_battles boolean;
  v_social boolean;
  v_market boolean;
  v_progress boolean;
  v_quiet boolean;
  v_quiet_start time;
  v_quiet_end time;
  v_offset integer;
  v_local_time time;
  v_in_quiet boolean;
  v_urgent boolean;
  v_channel text;
  v_category text;
  v_sound text;
  v_category_id text;
  v_native_v11 boolean;
  v_payload jsonb;
begin
  for n in
    select *
    from public.notifications
    where push_sent_at is null
      and push_attempts<3
    order by created_at asc
    limit 50
  loop
    select
      coalesce(push_notifications,true),
      coalesce(chat_notifications,true),
      coalesce(smart_notifications,true),
      coalesce(notify_battles,true),
      coalesce(notify_social,true),
      coalesce(notify_market,true),
      coalesce(notify_progress,true),
      coalesce(quiet_hours_enabled,false),
      coalesce(quiet_hours_start,'22:00'::time),
      coalesce(quiet_hours_end,'08:00'::time),
      coalesce(timezone_offset_minutes,0)
    into v_allow,v_chat,v_smart,v_battles,v_social,v_market,v_progress,
         v_quiet,v_quiet_start,v_quiet_end,v_offset
    from public.player_settings
    where player_id=n.player_id;

    v_allow:=coalesce(v_allow,true);
    v_chat:=coalesce(v_chat,true);
    v_smart:=coalesce(v_smart,true);
    v_battles:=coalesce(v_battles,true);
    v_social:=coalesce(v_social,true);
    v_market:=coalesce(v_market,true);
    v_progress:=coalesce(v_progress,true);
    v_quiet:=coalesce(v_quiet,false);
    v_offset:=coalesce(v_offset,0);

    v_category:=case
      when n.type like 'battle_%' or n.type='match_found' then 'battle'
      when n.type in ('message','friend_request','friend_accepted','guild_message','guild_invite','guild_notice') or n.type like 'guild_%' then 'social'
      when n.type like 'market_%' or n.type like 'trade_%' then 'market'
      when n.type like 'mission_%' or n.type like 'achievement_%' or n.type like 'journey_%' or n.type like 'weekly_%' then 'progress'
      else 'default'
    end;

    v_urgent:=n.type in (
      'match_found','battle_started','battle_invite','battle_turn','battle_timeout',
      'trade_offer','trade_accepted','market_offer_accepted','security','account'
    );

    v_local_time:=((now() at time zone 'UTC') - make_interval(mins=>v_offset))::time;
    v_in_quiet:=case
      when not v_quiet then false
      when v_quiet_start=v_quiet_end then true
      when v_quiet_start<v_quiet_end then v_local_time>=v_quiet_start and v_local_time<v_quiet_end
      else v_local_time>=v_quiet_start or v_local_time<v_quiet_end
    end;

    if not v_allow
       or (n.type='message' and not v_chat)
       or (v_category='battle' and not v_battles)
       or (v_category='social' and not v_social)
       or (v_category='market' and not v_market)
       or (v_category='progress' and not v_progress)
       or (v_smart and v_in_quiet and not v_urgent)
    then
      update public.notifications
      set push_sent_at=now(),push_attempts=push_attempts+1
      where id=n.id;
      continue;
    end if;

    for t in
      select *
      from public.push_tokens
      where player_id=n.player_id
        and enabled
    loop
      v_native_v11:=false;
      if coalesce(t.app_version,'') ~ '^[0-9]+\.[0-9]+' then
        v_native_v11 := split_part(t.app_version,'.',1)::integer > 1
          or (split_part(t.app_version,'.',1)::integer = 1 and split_part(t.app_version,'.',2)::integer >= 1);
      end if;

      if v_native_v11 then
        v_channel:=case
          when v_category='battle' then 'battles_v11'
          when v_category='social' then 'social_v11'
          when v_category='market' then 'trades_v11'
          else 'default_v11'
        end;
        v_sound:=case
          when v_category='battle' then 'tc_battle.wav'
          when v_category='social' then 'tc_social.wav'
          when v_category='market' then 'tc_trade.wav'
          else 'tc_default.wav'
        end;
        v_category_id:=case
          when v_category='battle' then 'tc_battle'
          when v_category='social' then 'tc_social'
          when v_category='market' then 'tc_trade'
          else null
        end;
      else
        v_channel:=case
          when v_category='battle' then 'battles'
          when v_category='social' then 'social'
          when v_category='market' then 'trades'
          else 'default'
        end;
        v_sound:='default';
        v_category_id:=null;
      end if;

      v_payload:=jsonb_build_object(
        'to',t.expo_push_token,
        'title',coalesce(nullif(n.title,''),'Trainer Collection'),
        'body',n.body,
        'sound',v_sound,
        'channelId',v_channel,
        'priority',case when v_urgent then 'high' else 'default' end,
        'data',n.metadata||jsonb_build_object(
          'notificationId',n.id,
          'type',n.type,
          'category',v_category
        )
      );
      if v_category_id is not null then
        v_payload:=v_payload||jsonb_build_object('categoryId',v_category_id);
      end if;

      perform net.http_post(
        url:='https://exp.host/--/api/v2/push/send',
        headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
        body:=v_payload
      );
      v_count:=v_count+1;
    end loop;

    update public.notifications
    set push_sent_at=now(),push_attempts=push_attempts+1
    where id=n.id;
  end loop;

  return v_count;
end;
$function$;
