-- Make "Criador Supremo" exclusive to the single owner account.
-- Fixes the old achievement refresh path that treated any admin member as creator.

do $$
declare
  v_def text;
  v_old text := 'select exists(select 1 from public.admin_members a where a.player_id=p_player_id) into v_creator;
  perform public.server_set_achievement_progress(p_player_id,''creator_owner'',case when v_creator then 1 else 0 end);';
  v_new text := 'select exists(select 1 from public.admin_members a where a.player_id=p_player_id and a.role=''owner'') into v_creator;
  if v_creator then
    perform public.server_set_achievement_progress(p_player_id,''creator_owner'',1);
  end if;';
begin
  select pg_get_functiondef('public.server_refresh_player_achievements(uuid)'::regprocedure)
  into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'CREATOR_REFRESH_PATCH_ANCHOR_NOT_FOUND';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end;
$$;

update public.players p
set equipped_title_id=null
where p.equipped_title_id='creator_owner'
  and not exists (
    select 1
    from public.admin_members a
    where a.player_id=p.id
      and a.role='owner'
  );

delete from public.player_achievements pa
where pa.achievement_id='creator_owner'
  and not exists (
    select 1
    from public.admin_members a
    where a.player_id=pa.player_id
      and a.role='owner'
  );

insert into public.player_achievements(
  player_id,achievement_id,progress,unlocked_at,updated_at
)
select
  a.player_id,
  d.id,
  d.target,
  now(),
  now()
from public.admin_members a
join public.achievement_definitions d
  on d.id='creator_owner'
 and d.active=true
where a.role='owner'
on conflict(player_id,achievement_id)
do update set
  progress=greatest(public.player_achievements.progress,excluded.progress),
  unlocked_at=coalesce(public.player_achievements.unlocked_at,now()),
  updated_at=now();

update public.global_chat_messages m
set sender_title_id=null,
    sender_title=null,
    sender_title_icon=null
where m.sender_title_id='creator_owner'
  and not exists (
    select 1
    from public.admin_members a
    where a.player_id=m.player_id
      and a.role='owner'
  );

update public.guild_chat_messages m
set sender_title_id=null,
    sender_title=null,
    sender_title_icon=null
where m.sender_title_id='creator_owner'
  and not exists (
    select 1
    from public.admin_members a
    where a.player_id=m.player_id
      and a.role='owner'
  );

create or replace function private.guard_creator_owner_achievement()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.achievement_id='creator_owner'
     and not exists (
       select 1
       from public.admin_members a
       where a.player_id=new.player_id
         and a.role='owner'
     )
  then
    raise exception using errcode='P0001',message='CREATOR_TITLE_OWNER_ONLY';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_creator_owner_achievement()
from public,anon,authenticated;

drop trigger if exists trg_guard_creator_owner_achievement
on public.player_achievements;

create trigger trg_guard_creator_owner_achievement
before insert or update of achievement_id,progress,unlocked_at
on public.player_achievements
for each row
execute function private.guard_creator_owner_achievement();

create or replace function public.enforce_equipped_title_unlock()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if new.equipped_title_id is distinct from old.equipped_title_id
     and new.equipped_title_id='creator_owner'
     and not exists (
       select 1
       from public.admin_members a
       where a.player_id=new.id
         and a.role='owner'
     )
  then
    raise exception using errcode='P0001',message='CREATOR_TITLE_OWNER_ONLY';
  end if;

  if new.equipped_title_id is distinct from old.equipped_title_id
    and new.equipped_title_id is not null
    and not exists (
      select 1
      from public.player_achievements pa
      where pa.player_id=new.id
        and pa.achievement_id=new.equipped_title_id
        and pa.unlocked_at is not null
    )
  then
    raise exception using errcode='P0001',message='ACHIEVEMENT_LOCKED';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_equipped_title_unlock()
from public,anon,authenticated;

create unique index if not exists player_achievements_creator_owner_singleton_idx
  on public.player_achievements(achievement_id)
  where achievement_id='creator_owner';

create unique index if not exists players_creator_owner_equipped_singleton_idx
  on public.players(equipped_title_id)
  where equipped_title_id='creator_owner';
