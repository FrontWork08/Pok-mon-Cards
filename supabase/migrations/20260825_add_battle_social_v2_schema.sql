-- Battle/social v2 infrastructure. Applied to production on 2026-08-25.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions;

alter table public.players add column if not exists battle_rating integer not null default 1000;
alter table public.players add column if not exists battle_wins integer not null default 0;
alter table public.players add column if not exists battle_losses integer not null default 0;
alter table public.players add column if not exists battle_streak integer not null default 0;
alter table public.players add column if not exists best_battle_streak integer not null default 0;

alter table public.player_settings add column if not exists push_notifications boolean not null default true;
alter table public.player_settings add column if not exists battle_sounds boolean not null default true;
alter table public.player_settings add column if not exists battle_vibration boolean not null default true;

alter table public.battles add column if not exists rematch_of uuid references public.battles(id) on delete set null;
alter table public.battles add column if not exists reward_eligible boolean not null default true;
alter table public.battles add column if not exists challenger_rating_before integer;
alter table public.battles add column if not exists challenger_rating_after integer;
alter table public.battles add column if not exists opponent_rating_before integer;
alter table public.battles add column if not exists opponent_rating_after integer;

create index if not exists battles_completed_pair_idx on public.battles(completed_at,challenger_id,opponent_id) where status='completed';
create index if not exists battles_rematch_idx on public.battles(rematch_of) where rematch_of is not null;
create index if not exists players_battle_rating_idx on public.players(battle_rating desc);
create index if not exists battle_card_stakes_status_idx on public.battle_card_stakes(battle_id,status);

create table if not exists public.player_daily_battle_species(
  player_id uuid not null references public.players(id) on delete cascade,
  mission_date date not null default current_date,
  species_key text not null,
  card_id text references public.cards(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(player_id,mission_date,species_key)
);
alter table public.player_daily_battle_species enable row level security;
drop policy if exists player_daily_species_own_select on public.player_daily_battle_species;
create policy player_daily_species_own_select on public.player_daily_battle_species for select to authenticated using(player_id=(select auth.uid()));

grant select on public.player_daily_battle_species to authenticated;

create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_sent_at timestamptz,
  push_attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists notifications_player_created_idx on public.notifications(player_id,created_at desc);
create index if not exists notifications_push_queue_idx on public.notifications(created_at) where push_sent_at is null;
alter table public.notifications enable row level security;
drop policy if exists notifications_own_select on public.notifications;
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated using(player_id=(select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated using(player_id=(select auth.uid())) with check(player_id=(select auth.uid()));
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

create table if not exists public.push_tokens(
  expo_push_token text primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  platform text not null default 'unknown',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_player_idx on public.push_tokens(player_id) where enabled;
alter table public.push_tokens enable row level security;
drop policy if exists push_tokens_own_select on public.push_tokens;
drop policy if exists push_tokens_own_insert on public.push_tokens;
drop policy if exists push_tokens_own_update on public.push_tokens;
drop policy if exists push_tokens_own_delete on public.push_tokens;
create policy push_tokens_own_select on public.push_tokens for select to authenticated using(player_id=(select auth.uid()));
create policy push_tokens_own_insert on public.push_tokens for insert to authenticated with check(player_id=(select auth.uid()));
create policy push_tokens_own_update on public.push_tokens for update to authenticated using(player_id=(select auth.uid())) with check(player_id=(select auth.uid()));
create policy push_tokens_own_delete on public.push_tokens for delete to authenticated using(player_id=(select auth.uid()));
grant select,insert,update,delete on public.push_tokens to authenticated;

create or replace function public.server_queue_notification(p_player_id uuid,p_type text,p_title text,p_body text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into notifications(player_id,type,title,body,metadata)
  values(p_player_id,left(coalesce(p_type,'system'),40),left(coalesce(p_title,'Pokémon Cards'),120),left(coalesce(p_body,''),500),coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.server_send_message(p_actor_id uuid,p_conversation_id uuid,p_body text,p_kind text default 'text',p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_other uuid;v_sender text;v_notify boolean;
begin
  p_body:=btrim(coalesce(p_body,''));
  if char_length(p_body)<1 or char_length(p_body)>1000 then raise exception 'INVALID_MESSAGE'; end if;
  if p_kind not in('text','battle_invite','battle_event','system') then raise exception 'INVALID_KIND'; end if;
  select case when player_a=p_actor_id then player_b when player_b=p_actor_id then player_a else null end into v_other from conversations where id=p_conversation_id;
  if v_other is null then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from friendships f where f.status::text='accepted' and ((f.requester_id=p_actor_id and f.addressee_id=v_other) or (f.requester_id=v_other and f.addressee_id=p_actor_id))) then raise exception 'NOT_FRIENDS'; end if;
  insert into messages(conversation_id,sender_id,body,kind,metadata) values(p_conversation_id,p_actor_id,p_body,p_kind,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  update conversations set updated_at=now() where id=p_conversation_id;
  select username into v_sender from players where id=p_actor_id;
  select coalesce(chat_notifications,true) into v_notify from player_settings where player_id=v_other;
  if coalesce(v_notify,true) then
    perform server_queue_notification(v_other,case when p_kind='battle_invite' then 'battle_invite' else 'message' end,case when p_kind='battle_invite' then 'Novo desafio' else '@'||coalesce(v_sender,'Treinador') end,case when p_kind='battle_invite' then p_body else left(p_body,180) end,jsonb_build_object('conversationId',p_conversation_id,'senderId',p_actor_id,'messageId',v_id)||coalesce(p_metadata,'{}'::jsonb));
  end if;
  return v_id;
end $$;

create or replace function public.get_my_conversation_summaries()
returns table(conversation_id uuid,friend_id uuid,friend_username text,friend_level integer,last_body text,last_kind text,last_metadata jsonb,last_created_at timestamptz,unread_count bigint)
language sql security definer set search_path=public as $$
  with me as(select auth.uid() uid),conv as(
    select c.*,case when c.player_a=me.uid then c.player_b else c.player_a end friend_id
    from conversations c,me where me.uid in(c.player_a,c.player_b)
  )
  select conv.id,conv.friend_id,p.username,p.level,l.body,l.kind,l.metadata,l.created_at,
    (select count(*) from messages u where u.conversation_id=conv.id and u.sender_id<>(select uid from me) and u.read_at is null)
  from conv join players p on p.id=conv.friend_id
  left join lateral(select m.body,m.kind,m.metadata,m.created_at from messages m where m.conversation_id=conv.id order by m.created_at desc limit 1) l on true
  order by coalesce(l.created_at,conv.updated_at) desc;
$$;

create or replace function public.server_dispatch_push_notifications()
returns integer language plpgsql security definer set search_path=public,extensions as $$
declare n notifications%rowtype;t push_tokens%rowtype;v_count integer:=0;v_allow boolean;v_chat boolean;
begin
  for n in select * from notifications where push_sent_at is null and push_attempts<3 order by created_at asc limit 50 loop
    select coalesce(push_notifications,true),coalesce(chat_notifications,true) into v_allow,v_chat from player_settings where player_id=n.player_id;
    if coalesce(v_allow,true)=false or(n.type='message' and coalesce(v_chat,true)=false) then
      update notifications set push_sent_at=now(),push_attempts=push_attempts+1 where id=n.id;continue;
    end if;
    for t in select * from push_tokens where player_id=n.player_id and enabled loop
      perform net.http_post(url:='https://exp.host/--/api/v2/push/send',headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,body:=jsonb_build_object('to',t.expo_push_token,'title',n.title,'body',n.body,'sound','default','data',n.metadata||jsonb_build_object('notificationId',n.id,'type',n.type)));
      v_count:=v_count+1;
    end loop;
    update notifications set push_sent_at=now(),push_attempts=push_attempts+1 where id=n.id;
  end loop;
  return v_count;
end $$;

revoke all on function public.server_queue_notification(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.server_dispatch_push_notifications() from public,anon,authenticated;
grant execute on function public.server_queue_notification(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.server_dispatch_push_notifications() to service_role;
grant execute on function public.get_my_conversation_summaries() to authenticated;
