-- Deliver every active global announcement at most once per authenticated player.
-- The claim happens atomically in the database so reconnects, app restarts and
-- multiple client refreshes cannot make the same announcement pop up repeatedly.

create table if not exists public.global_announcement_views (
  announcement_id uuid not null references public.global_announcements(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, player_id)
);

create index if not exists idx_global_announcement_views_player_seen
  on public.global_announcement_views(player_id, seen_at desc);

alter table public.global_announcement_views enable row level security;

revoke all on table public.global_announcement_views from anon, authenticated;
grant select, insert on table public.global_announcement_views to authenticated;

drop policy if exists "players read own announcement views" on public.global_announcement_views;
create policy "players read own announcement views"
  on public.global_announcement_views
  for select
  to authenticated
  using ((select auth.uid()) = player_id);

drop policy if exists "players create own announcement views" on public.global_announcement_views;
create policy "players create own announcement views"
  on public.global_announcement_views
  for insert
  to authenticated
  with check ((select auth.uid()) = player_id);

create or replace function public.get_my_unseen_global_announcement()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_player_id uuid := auth.uid();
  v_announcement_id uuid;
  v_result jsonb;
begin
  if v_player_id is null then
    return null;
  end if;

  with candidate as (
    select ga.id
    from public.global_announcements ga
    where ga.active = true
      and ga.starts_at <= now()
      and (ga.ends_at is null or ga.ends_at > now())
      and not exists (
        select 1
        from public.global_announcement_views seen
        where seen.announcement_id = ga.id
          and seen.player_id = v_player_id
      )
    order by ga.created_at desc
    limit 1
  ),
  claimed as (
    insert into public.global_announcement_views(announcement_id, player_id)
    select c.id, v_player_id
    from candidate c
    on conflict (announcement_id, player_id) do nothing
    returning announcement_id
  )
  select announcement_id
  into v_announcement_id
  from claimed
  limit 1;

  if v_announcement_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'id', ga.id,
    'title', ga.title,
    'body', ga.body,
    'severity', ga.severity,
    'starts_at', ga.starts_at,
    'ends_at', ga.ends_at,
    'created_at', ga.created_at
  )
  into v_result
  from public.global_announcements ga
  where ga.id = v_announcement_id;

  return v_result;
end;
$$;

revoke all on function public.get_my_unseen_global_announcement() from public, anon;
grant execute on function public.get_my_unseen_global_announcement() to authenticated;
