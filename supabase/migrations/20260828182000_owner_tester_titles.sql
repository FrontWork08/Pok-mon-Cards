-- Owner-only tester titles.
-- The first administrator becomes the single owner; future admins remain standard admins.

alter table public.admin_members
  add column if not exists role text not null default 'admin';

alter table public.admin_members
  drop constraint if exists admin_members_role_check;
alter table public.admin_members
  add constraint admin_members_role_check check (role in ('owner','admin'));

update public.admin_members
set role='owner'
where player_id=(
  select player_id
  from public.admin_members
  order by created_at asc,player_id asc
  limit 1
)
and not exists(
  select 1 from public.admin_members where role='owner'
);

create unique index if not exists admin_members_single_owner_idx
  on public.admin_members ((role))
  where role='owner';

insert into public.achievement_definitions(
  id,name,title,description,icon,category,target,sort_order,active
)
values(
  'tester_official',
  'Programa de Testers',
  'Tester Oficial',
  'Título exclusivo concedido pelo criador aos testers oficiais de Pokémon Cards.',
  '🧪',
  'special',
  1,
  85,
  true
)
on conflict(id) do update set
  name=excluded.name,
  title=excluded.title,
  description=excluded.description,
  icon=excluded.icon,
  category=excluded.category,
  target=excluded.target,
  sort_order=excluded.sort_order,
  active=true;

create table if not exists public.admin_tester_title_grants(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.players(id) on delete restrict,
  target_id uuid not null references public.players(id) on delete cascade,
  achievement_id text not null references public.achievement_definitions(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  note text,
  unique(target_id,achievement_id)
);

create index if not exists admin_tester_title_grants_owner_idx
  on public.admin_tester_title_grants(owner_id,granted_at desc);
create index if not exists admin_tester_title_grants_target_idx
  on public.admin_tester_title_grants(target_id,achievement_id);
create index if not exists admin_tester_title_grants_achievement_idx
  on public.admin_tester_title_grants(achievement_id);

alter table public.admin_tester_title_grants enable row level security;
revoke all on table public.admin_tester_title_grants from anon,authenticated;

create or replace function public.server_owner_grant_tester_title(
  p_actor_id uuid,
  p_target_id uuid,
  p_achievement_id text default 'tester_official',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_title public.achievement_definitions%rowtype;
  v_username text;
begin
  if not exists(
    select 1 from public.admin_members
    where player_id=p_actor_id and role='owner'
  ) then
    raise exception 'OWNER_ONLY';
  end if;

  if p_target_id is null or p_target_id=p_actor_id then
    raise exception 'INVALID_TARGET';
  end if;

  if not exists(
    select 1
    from public.friendships f
    where f.status='accepted'
      and (
        (f.requester_id=p_actor_id and f.addressee_id=p_target_id)
        or
        (f.addressee_id=p_actor_id and f.requester_id=p_target_id)
      )
  ) then
    raise exception 'TARGET_MUST_BE_FRIEND';
  end if;

  select * into v_title
  from public.achievement_definitions
  where id=p_achievement_id
    and active=true
    and id like 'tester_%';

  if v_title.id is null then raise exception 'TESTER_TITLE_NOT_FOUND'; end if;

  select username into v_username
  from public.players
  where id=p_target_id;

  if v_username is null then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.player_achievements(
    player_id,achievement_id,progress,unlocked_at,updated_at
  )
  values(p_target_id,v_title.id,v_title.target,now(),now())
  on conflict(player_id,achievement_id) do update
  set progress=greatest(public.player_achievements.progress,v_title.target),
      unlocked_at=coalesce(public.player_achievements.unlocked_at,now()),
      updated_at=now();

  insert into public.admin_tester_title_grants(
    owner_id,target_id,achievement_id,granted_at,revoked_at,note
  )
  values(
    p_actor_id,p_target_id,v_title.id,now(),null,
    nullif(left(trim(coalesce(p_note,'')),180),'')
  )
  on conflict(target_id,achievement_id) do update
  set owner_id=excluded.owner_id,
      granted_at=now(),
      revoked_at=null,
      note=excluded.note;

  return jsonb_build_object(
    'targetId',p_target_id,
    'username',v_username,
    'achievementId',v_title.id,
    'title',v_title.title,
    'icon',v_title.icon
  );
end;
$$;

create or replace function public.server_owner_revoke_tester_title(
  p_actor_id uuid,
  p_target_id uuid,
  p_achievement_id text default 'tester_official'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text;
  v_title text;
begin
  if not exists(
    select 1 from public.admin_members
    where player_id=p_actor_id and role='owner'
  ) then
    raise exception 'OWNER_ONLY';
  end if;

  if p_achievement_id not like 'tester_%' then
    raise exception 'TESTER_TITLE_NOT_FOUND';
  end if;

  select p.username,d.title
  into v_username,v_title
  from public.players p
  cross join public.achievement_definitions d
  where p.id=p_target_id and d.id=p_achievement_id;

  if v_username is null then raise exception 'PLAYER_NOT_FOUND'; end if;

  update public.players
  set equipped_title_id=null
  where id=p_target_id and equipped_title_id=p_achievement_id;

  delete from public.player_achievements
  where player_id=p_target_id
    and achievement_id=p_achievement_id;

  update public.admin_tester_title_grants
  set revoked_at=now()
  where target_id=p_target_id
    and achievement_id=p_achievement_id
    and revoked_at is null;

  return jsonb_build_object(
    'targetId',p_target_id,
    'username',v_username,
    'achievementId',p_achievement_id,
    'title',v_title
  );
end;
$$;

revoke all on function public.server_owner_grant_tester_title(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.server_owner_grant_tester_title(uuid,uuid,text,text) to service_role;

revoke all on function public.server_owner_revoke_tester_title(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_owner_revoke_tester_title(uuid,uuid,text) to service_role;
