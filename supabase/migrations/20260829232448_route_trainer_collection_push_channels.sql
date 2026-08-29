create or replace function public.server_dispatch_push_notifications()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  n notifications%rowtype;
  t push_tokens%rowtype;
  v_count integer:=0;
  v_allow boolean;
  v_chat boolean;
  v_channel text;
begin
  for n in
    select *
    from notifications
    where push_sent_at is null
      and push_attempts<3
    order by created_at asc
    limit 50
  loop
    select
      coalesce(push_notifications,true),
      coalesce(chat_notifications,true)
    into v_allow,v_chat
    from player_settings
    where player_id=n.player_id;

    if coalesce(v_allow,true)=false
       or (n.type='message' and coalesce(v_chat,true)=false)
    then
      update notifications
      set push_sent_at=now(),push_attempts=push_attempts+1
      where id=n.id;
      continue;
    end if;

    v_channel := case
      when n.type like 'battle_%' or n.type='match_found' then 'battles'
      when n.type in ('message','friend_request','friend_accepted','guild_message','guild_invite','guild_notice') then 'social'
      when n.type like 'market_%' or n.type like 'trade_%' then 'trades'
      else 'default'
    end;

    for t in
      select *
      from push_tokens
      where player_id=n.player_id
        and enabled
    loop
      perform net.http_post(
        url:='https://exp.host/--/api/v2/push/send',
        headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
        body:=jsonb_build_object(
          'to',t.expo_push_token,
          'title',coalesce(nullif(n.title,''),'Trainer Collection'),
          'body',n.body,
          'sound','default',
          'channelId',v_channel,
          'data',n.metadata||jsonb_build_object(
            'notificationId',n.id,
            'type',n.type
          )
        )
      );
      v_count:=v_count+1;
    end loop;

    update notifications
    set push_sent_at=now(),push_attempts=push_attempts+1
    where id=n.id;
  end loop;

  return v_count;
end
$$;

create or replace function public.server_queue_notification(
  p_player_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  insert into notifications(player_id,type,title,body,metadata)
  values(
    p_player_id,
    left(coalesce(p_type,'system'),40),
    left(coalesce(nullif(p_title,''),'Trainer Collection'),120),
    left(coalesce(p_body,''),500),
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end
$$;
