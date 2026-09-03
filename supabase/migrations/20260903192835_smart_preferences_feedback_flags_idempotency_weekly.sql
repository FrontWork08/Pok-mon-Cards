
-- 21-24) Smart notifications, performance, accessibility and feedback preferences.
alter table public.player_settings
  add column if not exists smart_notifications boolean not null default true,
  add column if not exists notify_battles boolean not null default true,
  add column if not exists notify_social boolean not null default true,
  add column if not exists notify_market boolean not null default true,
  add column if not exists notify_progress boolean not null default true,
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time not null default '22:00',
  add column if not exists quiet_hours_end time not null default '08:00',
  add column if not exists timezone_offset_minutes integer not null default 0,
  add column if not exists weekly_summary_notifications boolean not null default true,
  add column if not exists performance_mode text not null default 'auto',
  add column if not exists reduce_motion boolean not null default false,
  add column if not exists high_contrast boolean not null default false,
  add column if not exists large_text boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='player_settings_performance_mode_chk') then
    alter table public.player_settings add constraint player_settings_performance_mode_chk
      check(performance_mode in ('auto','full','reduced'));
  end if;
  if not exists(select 1 from pg_constraint where conname='player_settings_timezone_offset_chk') then
    alter table public.player_settings add constraint player_settings_timezone_offset_chk
      check(timezone_offset_minutes between -840 and 840);
  end if;
end $$;

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
set search_path='public'
as $$
declare
  v_id uuid;
  v_smart boolean:=true;
  v_type text:=left(coalesce(p_type,'system'),40);
  v_title text:=left(coalesce(nullif(p_title,''),'Trainer Collection'),120);
  v_body text:=left(coalesce(p_body,''),500);
  v_urgent boolean;
begin
  select coalesce(smart_notifications,true)
  into v_smart
  from public.player_settings
  where player_id=p_player_id;

  v_urgent:=v_type in (
    'match_found','battle_started','battle_invite','battle_turn','battle_timeout',
    'trade_offer','trade_accepted','market_offer_accepted','security','account'
  );

  if coalesce(v_smart,true) and not v_urgent then
    select id into v_id
    from public.notifications
    where player_id=p_player_id
      and type=v_type
      and title=v_title
      and body=v_body
      and created_at>=now()-interval '5 minutes'
      and read_at is null
    order by created_at desc
    limit 1;
    if found then return v_id; end if;
  end if;

  insert into public.notifications(player_id,type,title,body,metadata)
  values(p_player_id,v_type,v_title,v_body,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.server_dispatch_push_notifications()
returns integer
language plpgsql
security definer
set search_path='public','extensions'
as $$
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

    v_channel:=case
      when v_category='battle' then 'battles'
      when v_category='social' then 'social'
      when v_category='market' then 'trades'
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
            'type',n.type,
            'category',v_category
          )
        )
      );
      v_count:=v_count+1;
    end loop;

    update public.notifications
    set push_sent_at=now(),push_attempts=push_attempts+1
    where id=n.id;
  end loop;

  return v_count;
end;
$$;

-- 25) "What's New" read state.
create table if not exists public.player_update_log_seen(
  player_id uuid not null references public.players(id) on delete cascade,
  update_log_id bigint not null references public.app_update_logs(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key(player_id,update_log_id)
);
alter table public.player_update_log_seen enable row level security;
drop policy if exists player_update_log_seen_select_own on public.player_update_log_seen;
create policy player_update_log_seen_select_own on public.player_update_log_seen
for select to authenticated using((select auth.uid())=player_id);
revoke all on table public.player_update_log_seen from anon;
grant select on table public.player_update_log_seen to authenticated;

create or replace function public.get_my_whats_new(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return jsonb_build_object(
    'unseenCount',(
      select count(*) from public.app_update_logs l
      where l.active and not exists(
        select 1 from public.player_update_log_seen s
        where s.player_id=v_player and s.update_log_id=l.id
      )
    ),
    'logs',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'version',l.version,'title',l.title,'summary',l.summary,
        'changes',l.changes,'publishedAt',l.published_at,
        'seen',exists(select 1 from public.player_update_log_seen s where s.player_id=v_player and s.update_log_id=l.id)
      ) order by l.published_at desc)
      from (
        select * from public.app_update_logs
        where active
        order by published_at desc
        limit greatest(1,least(coalesce(p_limit,20),50))
      ) l
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_my_whats_new(integer) from public,anon;
grant execute on function public.get_my_whats_new(integer) to authenticated,service_role;

create or replace function public.mark_update_log_seen(p_update_log_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.app_update_logs where id=p_update_log_id and active) then raise exception 'UPDATE_LOG_NOT_FOUND'; end if;
  insert into public.player_update_log_seen(player_id,update_log_id)
  values(v_player,p_update_log_id)
  on conflict(player_id,update_log_id) do update set seen_at=now();
end;
$$;
revoke all on function public.mark_update_log_seen(bigint) from public,anon;
grant execute on function public.mark_update_log_seen(bigint) to authenticated,service_role;

-- 26) In-app feedback.
create table if not exists public.app_feedback(
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  category text not null,
  message text not null,
  route text null,
  app_version text null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  admin_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_feedback_category_chk check(category in ('bug','suggestion','balance','ux','other')),
  constraint app_feedback_status_chk check(status in ('new','reviewing','planned','resolved','closed')),
  constraint app_feedback_message_chk check(char_length(message) between 5 and 2000)
);
create index if not exists app_feedback_player_created_idx on public.app_feedback(player_id,created_at desc);
create index if not exists app_feedback_status_created_idx on public.app_feedback(status,created_at desc);
alter table public.app_feedback enable row level security;
drop policy if exists app_feedback_select_own on public.app_feedback;
create policy app_feedback_select_own on public.app_feedback
for select to authenticated using((select auth.uid())=player_id);
revoke all on table public.app_feedback from anon;
grant select on table public.app_feedback to authenticated;

create or replace function public.submit_app_feedback(
  p_category text,p_message text,p_route text default null,p_app_version text default null,p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());v_id uuid;v_count integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_category not in ('bug','suggestion','balance','ux','other') then raise exception 'INVALID_FEEDBACK_CATEGORY'; end if;
  if char_length(btrim(coalesce(p_message,'')))<5 or char_length(p_message)>2000 then raise exception 'INVALID_FEEDBACK_MESSAGE'; end if;
  select count(*) into v_count from public.app_feedback where player_id=v_player and created_at>=now()-interval '1 hour';
  if v_count>=10 then raise exception 'FEEDBACK_RATE_LIMIT'; end if;
  insert into public.app_feedback(player_id,category,message,route,app_version,context)
  values(v_player,p_category,btrim(p_message),left(nullif(btrim(p_route),''),200),left(nullif(btrim(p_app_version),''),40),
    case when pg_column_size(coalesce(p_context,'{}'::jsonb))<=16384 then coalesce(p_context,'{}'::jsonb) else '{}'::jsonb end)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_app_feedback(text,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_app_feedback(text,text,text,text,jsonb) to authenticated,service_role;

create or replace function public.get_my_feedback()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',id,'category',category,'message',message,'route',route,'appVersion',app_version,
      'status',status,'adminNote',admin_note,'createdAt',created_at,'updatedAt',updated_at
    ) order by created_at desc)
    from (select * from public.app_feedback where player_id=v_player order by created_at desc limit 100) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.get_my_feedback() from public,anon;
grant execute on function public.get_my_feedback() to authenticated,service_role;

create or replace function public.get_admin_feedback(p_status text default null,p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',f.id,'playerId',f.player_id,'username',p.username,'category',f.category,'message',f.message,
      'route',f.route,'appVersion',f.app_version,'context',f.context,'status',f.status,'adminNote',f.admin_note,
      'createdAt',f.created_at,'updatedAt',f.updated_at
    ) order by f.created_at desc)
    from (
      select * from public.app_feedback
      where p_status is null or status=p_status
      order by created_at desc
      limit greatest(1,least(coalesce(p_limit,100),500))
    ) f join public.players p on p.id=f.player_id
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_feedback(text,integer) from public,anon;
grant execute on function public.get_admin_feedback(text,integer) to authenticated,service_role;

create or replace function public.server_admin_update_feedback(p_feedback_id uuid,p_status text,p_admin_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.app_feedback%rowtype;
begin
  if (select auth.uid()) is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('new','reviewing','planned','resolved','closed') then raise exception 'INVALID_FEEDBACK_STATUS'; end if;
  update public.app_feedback
  set status=p_status,admin_note=left(nullif(btrim(p_admin_note),''),1000),updated_at=now()
  where id=p_feedback_id
  returning * into v_row;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'adminNote',v_row.admin_note,'updatedAt',v_row.updated_at);
end;
$$;
revoke all on function public.server_admin_update_feedback(uuid,text,text) from public,anon;
grant execute on function public.server_admin_update_feedback(uuid,text,text) to authenticated,service_role;

-- 27) Feature flags with gradual rollout / tester targeting.
create table if not exists public.feature_flags(
  key text primary key,
  name text not null,
  description text not null,
  enabled boolean not null default false,
  tester_only boolean not null default false,
  admin_only boolean not null default false,
  rollout_percent smallint not null default 100,
  updated_by uuid null references public.players(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint feature_flags_rollout_chk check(rollout_percent between 0 and 100)
);
alter table public.feature_flags enable row level security;
revoke all on table public.feature_flags from anon,authenticated;

insert into public.feature_flags(key,name,description,enabled,tester_only,admin_only,rollout_percent)
values
 ('card_passport','Passaporte da Carta','Histórico, tags e proteção da carta.',true,false,false,100),
 ('battle_replay','Replay de Batalha','Replay detalhado game_v1.',true,false,false,100),
 ('battle_lab','Battle Lab','Simulações de confronto sem writes.',true,false,false,100),
 ('spectator_mode','Modo Espectador','Permite espectadores opt-in em batalhas casuais.',true,false,false,100),
 ('trainer_insights','Insights do Treinador','Estatísticas e recomendações consultivas.',true,false,false,100),
 ('smart_notifications','Notificações Inteligentes','Categorias, dedupe e horário silencioso.',true,false,false,100),
 ('admin_mass_battle_lab','Battle Lab Admin','Matriz massiva administrativa.',true,false,true,100)
on conflict(key) do nothing;

create or replace function private.feature_flag_enabled(p_player uuid,p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v public.feature_flags%rowtype;v_admin boolean;v_tester boolean;v_bucket integer;
begin
  select * into v from public.feature_flags where key=p_key;
  if not found or not v.enabled then return false; end if;
  select exists(select 1 from public.admin_members where player_id=p_player) into v_admin;
  select exists(
    select 1 from public.admin_tester_title_grants
    where target_id=p_player and achievement_id='tester_official' and revoked_at is null
  ) into v_tester;
  if v.admin_only and not v_admin then return false; end if;
  if v.tester_only and not (v_tester or v_admin) then return false; end if;
  if v.rollout_percent>=100 then return true; end if;
  if v.rollout_percent<=0 then return false; end if;
  v_bucket:=mod(abs(hashtext(p_player::text||':'||p_key)),100);
  return v_bucket<v.rollout_percent;
end;
$$;

create or replace function public.get_my_feature_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_object_agg(f.key,private.feature_flag_enabled(v_player,f.key))
    from public.feature_flags f
  ),'{}'::jsonb);
end;
$$;
revoke all on function public.get_my_feature_flags() from public,anon;
grant execute on function public.get_my_feature_flags() to authenticated,service_role;

create or replace function public.get_admin_feature_flags()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if (select auth.uid()) is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key',key,'name',name,'description',description,'enabled',enabled,'testerOnly',tester_only,
      'adminOnly',admin_only,'rolloutPercent',rollout_percent,'updatedAt',updated_at
    ) order by key)
    from public.feature_flags
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_feature_flags() from public,anon;
grant execute on function public.get_admin_feature_flags() to authenticated,service_role;

create or replace function public.server_admin_set_feature_flag(
  p_key text,p_enabled boolean,p_rollout_percent integer default 100,p_tester_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v public.feature_flags%rowtype;
begin
  if v_actor is null or not private.admin_has_permission(v_actor,'system_manage') then
    if not exists(select 1 from public.admin_members where player_id=v_actor and role='owner') then raise exception 'FORBIDDEN'; end if;
  end if;
  if p_rollout_percent not between 0 and 100 then raise exception 'INVALID_ROLLOUT'; end if;
  update public.feature_flags
  set enabled=p_enabled,rollout_percent=p_rollout_percent,tester_only=p_tester_only,updated_by=v_actor,updated_at=now()
  where key=p_key returning * into v;
  if not found then raise exception 'FEATURE_FLAG_NOT_FOUND'; end if;
  return jsonb_build_object('key',v.key,'enabled',v.enabled,'rolloutPercent',v.rollout_percent,'testerOnly',v.tester_only,'updatedAt',v.updated_at);
end;
$$;
revoke all on function public.server_admin_set_feature_flag(text,boolean,integer,boolean) from public,anon;
grant execute on function public.server_admin_set_feature_flag(text,boolean,integer,boolean) to authenticated,service_role;

-- 28) Beta / Tester hub.
create or replace function public.get_my_beta_tester_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());v_tester record;v_campaign record;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select granted_at,note into v_tester
  from public.admin_tester_title_grants
  where target_id=v_player and achievement_id='tester_official' and revoked_at is null
  order by granted_at desc limit 1;

  select id,code,title,target_version,phase,release_date,active into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition'
  order by updated_at desc limit 1;

  return jsonb_build_object(
    'isTester',v_tester.granted_at is not null,
    'testerSince',v_tester.granted_at,
    'testerNote',v_tester.note,
    'campaign',case when v_campaign.id is null then null else jsonb_build_object(
      'id',v_campaign.id,'code',v_campaign.code,'title',v_campaign.title,'targetVersion',v_campaign.target_version,
      'phase',v_campaign.phase,'releaseDate',v_campaign.release_date,'active',v_campaign.active
    ) end,
    'feedback',jsonb_build_object(
      'total',(select count(*) from public.app_feedback where player_id=v_player),
      'resolved',(select count(*) from public.app_feedback where player_id=v_player and status='resolved'),
      'planned',(select count(*) from public.app_feedback where player_id=v_player and status='planned')
    ),
    'featureFlags',public.get_my_feature_flags()
  );
end;
$$;
revoke all on function public.get_my_beta_tester_hub() from public,anon;
grant execute on function public.get_my_beta_tester_hub() to authenticated,service_role;

-- 29) Critical idempotency store and wrappers.
create table if not exists private.idempotency_operations(
  player_id uuid not null references public.players(id) on delete cascade,
  scope text not null,
  operation_id uuid not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(player_id,scope,operation_id)
);
create index if not exists idempotency_operations_created_idx on private.idempotency_operations(created_at);

create or replace function public.server_idempotent_marketplace_action(
  p_operation_id uuid,
  p_action text,
  p_listing_id uuid default null,
  p_card_id text default null,
  p_quantity integer default null,
  p_price bigint default null,
  p_shop_name text default null,
  p_theme_style text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_result jsonb;v_scope text:='marketplace:'||coalesce(p_action,'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_operation_id is null then raise exception 'OPERATION_ID_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations
  where player_id=v_actor and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;
  if p_action='list' and private.card_is_locked(v_actor,p_card_id) then raise exception 'CARD_LOCKED'; end if;
  v_result:=private.marketplace_action(p_action,p_listing_id,p_card_id,p_quantity,p_price,p_shop_name,p_theme_style);
  insert into private.idempotency_operations(player_id,scope,operation_id,response)
  values(v_actor,v_scope,p_operation_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.server_idempotent_marketplace_action(uuid,text,uuid,text,integer,bigint,text,text) from public,anon;
grant execute on function public.server_idempotent_marketplace_action(uuid,text,uuid,text,integer,bigint,text,text) to authenticated,service_role;

create or replace function public.server_idempotent_sell_duplicate_cards(p_operation_id uuid,p_card_id text,p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_result jsonb;v_scope text:='sell_duplicate:'||coalesce(p_card_id,'');
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations where player_id=v_actor and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;
  v_result:=public.sell_duplicate_cards(p_card_id,p_quantity);
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(v_actor,v_scope,p_operation_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.server_idempotent_sell_duplicate_cards(uuid,text,integer) from public,anon;
grant execute on function public.server_idempotent_sell_duplicate_cards(uuid,text,integer) to authenticated,service_role;

create or replace function public.server_idempotent_sell_all_duplicate_cards(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());v_result jsonb;v_scope text:='sell_all_duplicates';
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations where player_id=v_actor and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;
  v_result:=public.sell_all_duplicate_cards();
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(v_actor,v_scope,p_operation_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.server_idempotent_sell_all_duplicate_cards(uuid) from public,anon;
grant execute on function public.server_idempotent_sell_all_duplicate_cards(uuid) to authenticated,service_role;

create or replace function public.server_idempotent_open_pack(p_player_id uuid,p_pack_id uuid,p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;v_scope text:='open_pack:'||p_pack_id::text;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations where player_id=p_player_id and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;
  v_result:=public.server_open_pack(p_player_id,p_pack_id);
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(p_player_id,v_scope,p_operation_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.server_idempotent_open_pack(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_idempotent_open_pack(uuid,uuid,uuid) to service_role;

create or replace function public.server_idempotent_open_legendary_pack(p_player_id uuid,p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;v_scope text:='open_legendary_pack';
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_result from private.idempotency_operations where player_id=p_player_id and scope=v_scope and operation_id=p_operation_id;
  if found then return v_result; end if;
  v_result:=public.server_open_legendary_diamond_pack(p_player_id);
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(p_player_id,v_scope,p_operation_id,v_result);
  return v_result;
end;
$$;
revoke all on function public.server_idempotent_open_legendary_pack(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_idempotent_open_legendary_pack(uuid,uuid) to service_role;

-- 30) Weekly trainer summary.
create or replace function public.get_my_weekly_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_player uuid:=(select auth.uid());v_start timestamptz:=now()-interval '7 days';
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return jsonb_build_object(
    'period',jsonb_build_object('startsAt',v_start,'endsAt',now()),
    'collection',jsonb_build_object(
      'newUniqueCards',(select count(*) from public.player_cards where player_id=v_player and quantity>0 and first_obtained_at>=v_start),
      'currentUniqueCards',(select count(*) from public.player_cards where player_id=v_player and quantity>0),
      'bestPull',(
        select jsonb_build_object('cardId',x.card_id,'name',x.name,'marketPriceUsd',x.price,'openedAt',x.opened_at)
        from (
          select e->>'id' card_id,e->>'name' name,coalesce(nullif(e->>'marketPriceUsd','')::numeric,c.market_price_usd,0) price,po.opened_at
          from public.pack_openings po
          cross join lateral jsonb_array_elements(coalesce(po.cards_received,'[]'::jsonb)) e
          left join public.cards c on c.id=e->>'id'
          where po.player_id=v_player and po.opened_at>=v_start
          order by coalesce(nullif(e->>'marketPriceUsd','')::numeric,c.market_price_usd,0) desc,po.opened_at desc
          limit 1
        ) x
      )
    ),
    'packs',jsonb_build_object(
      'opened',(select count(*) from public.pack_openings where player_id=v_player and opened_at>=v_start),
      'coinsSpent',(select coalesce(sum(price_paid),0) from public.pack_openings where player_id=v_player and opened_at>=v_start and currency_at_open='coins'),
      'diamondsSpent',(select coalesce(sum(price_paid),0) from public.pack_openings where player_id=v_player and opened_at>=v_start and currency_at_open='diamonds')
    ),
    'battles',jsonb_build_object(
      'played',(select count(*) from public.battles where status='completed' and completed_at>=v_start and v_player in(challenger_id,opponent_id)),
      'wins',(select count(*) from public.battles where status='completed' and completed_at>=v_start and winner_id=v_player),
      'losses',(select count(*) from public.battles where status='completed' and completed_at>=v_start and v_player in(challenger_id,opponent_id) and winner_id is distinct from v_player),
      'ratingDelta',coalesce((
        select sum(case when challenger_id=v_player then coalesce(challenger_rating_after,challenger_rating_before)-coalesce(challenger_rating_before,challenger_rating_after)
                        else coalesce(opponent_rating_after,opponent_rating_before)-coalesce(opponent_rating_before,opponent_rating_after) end)
        from public.battles where status='completed' and completed_at>=v_start and v_player in(challenger_id,opponent_id)
      ),0)
    ),
    'social',jsonb_build_object(
      'trades',(select count(*) from public.trades where status='completed' and updated_at>=v_start and v_player in(sender_id,receiver_id))
    ),
    'economy',jsonb_build_object(
      'coinsEarned',(select coalesce(sum(amount),0) from private.economy_ledger where player_id=v_player and currency='coins' and amount>0 and created_at>=v_start),
      'coinsSpent',(select abs(coalesce(sum(amount),0)) from private.economy_ledger where player_id=v_player and currency='coins' and amount<0 and created_at>=v_start),
      'diamondsEarned',(select coalesce(sum(amount),0) from private.economy_ledger where player_id=v_player and currency='diamonds' and amount>0 and created_at>=v_start),
      'diamondsSpent',(select abs(coalesce(sum(amount),0)) from private.economy_ledger where player_id=v_player and currency='diamonds' and amount<0 and created_at>=v_start)
    ),
    'progress',jsonb_build_object(
      'achievementsUnlocked',(select count(*) from public.player_achievements where player_id=v_player and unlocked_at>=v_start),
      'currentRating',(select battle_rating from public.players where id=v_player),
      'currentLevel',(select level from public.players where id=v_player)
    )
  );
end;
$$;
revoke all on function public.get_my_weekly_summary() from public,anon;
grant execute on function public.get_my_weekly_summary() to authenticated,service_role;
