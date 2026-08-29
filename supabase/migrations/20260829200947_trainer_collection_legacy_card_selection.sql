create table if not exists public.release_campaign_legacy_selections (
  campaign_id uuid not null references public.release_campaigns(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  selected_at timestamptz not null default now(),
  primary key (campaign_id, player_id, card_id)
);

create table if not exists public.release_campaign_legacy_submissions (
  campaign_id uuid not null references public.release_campaigns(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  selected_count integer not null default 0 check (selected_count >= 1),
  confirmed_at timestamptz not null default now(),
  primary key (campaign_id, player_id)
);

create index if not exists release_campaign_legacy_selections_player_idx
  on public.release_campaign_legacy_selections(player_id, selected_at desc);

alter table public.release_campaign_legacy_selections enable row level security;
alter table public.release_campaign_legacy_submissions enable row level security;

revoke all on table public.release_campaign_legacy_selections from anon, authenticated;
revoke all on table public.release_campaign_legacy_submissions from anon, authenticated;

grant select, insert, delete on table public.release_campaign_legacy_selections to authenticated;
grant select, insert on table public.release_campaign_legacy_submissions to authenticated;
grant select, insert, update, delete on table public.release_campaign_legacy_selections to service_role;
grant select, insert, update, delete on table public.release_campaign_legacy_submissions to service_role;

drop policy if exists release_campaign_legacy_selections_read_own on public.release_campaign_legacy_selections;
create policy release_campaign_legacy_selections_read_own
on public.release_campaign_legacy_selections
for select
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists release_campaign_legacy_selections_insert_own on public.release_campaign_legacy_selections;
create policy release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections
for insert
to authenticated
with check (
  (select auth.uid()) = player_id
  and exists (
    select 1
    from public.release_campaigns c
    where c.id = campaign_id
      and c.active = true
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled = true
  )
  and exists (
    select 1
    from public.player_cards pc
    where pc.player_id = release_campaign_legacy_selections.player_id
      and pc.card_id = release_campaign_legacy_selections.card_id
      and pc.quantity > 0
  )
  and not exists (
    select 1
    from public.release_campaign_legacy_submissions s
    where s.campaign_id = release_campaign_legacy_selections.campaign_id
      and s.player_id = release_campaign_legacy_selections.player_id
  )
);

drop policy if exists release_campaign_legacy_selections_delete_own on public.release_campaign_legacy_selections;
create policy release_campaign_legacy_selections_delete_own
on public.release_campaign_legacy_selections
for delete
to authenticated
using (
  (select auth.uid()) = player_id
  and exists (
    select 1
    from public.release_campaigns c
    where c.id = campaign_id
      and c.active = true
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled = true
  )
  and not exists (
    select 1
    from public.release_campaign_legacy_submissions s
    where s.campaign_id = campaign_id
      and s.player_id = player_id
  )
);

drop policy if exists release_campaign_legacy_submissions_read_own on public.release_campaign_legacy_submissions;
create policy release_campaign_legacy_submissions_read_own
on public.release_campaign_legacy_submissions
for select
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists release_campaign_legacy_submissions_insert_own on public.release_campaign_legacy_submissions;
create policy release_campaign_legacy_submissions_insert_own
on public.release_campaign_legacy_submissions
for insert
to authenticated
with check (
  (select auth.uid()) = player_id
  and exists (
    select 1
    from public.release_campaigns c
    where c.id = campaign_id
      and c.active = true
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled = true
  )
);

create or replace function private.validate_release_legacy_selection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_enabled boolean;
  v_phase text;
begin
  if v_uid is null or v_uid <> new.player_id then
    raise exception using errcode = 'P0001', message = 'LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:' || new.campaign_id::text || ':' || new.player_id::text, 0));

  select c.legacy_card_limit, c.legacy_selection_enabled, c.phase
  into v_limit, v_enabled, v_phase
  from public.release_campaigns c
  where c.id = new.campaign_id
    and c.active = true;

  if not found or not coalesce(v_enabled, false) or v_phase <> 'legacy_selection' then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  if exists (
    select 1
    from public.release_campaign_legacy_submissions s
    where s.campaign_id = new.campaign_id
      and s.player_id = new.player_id
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_LOCKED';
  end if;

  if not exists (
    select 1
    from public.player_cards pc
    where pc.player_id = new.player_id
      and pc.card_id = new.card_id
      and pc.quantity > 0
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  select count(*)
  into v_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id = new.campaign_id
    and s.player_id = new.player_id;

  if v_count >= greatest(0, coalesce(v_limit, 0)) then
    raise exception using errcode = 'P0001', message = 'LEGACY_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_release_legacy_selection() from public, anon, authenticated;

drop trigger if exists trg_validate_release_legacy_selection on public.release_campaign_legacy_selections;
create trigger trg_validate_release_legacy_selection
before insert on public.release_campaign_legacy_selections
for each row execute function private.validate_release_legacy_selection();

create or replace function private.validate_release_legacy_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_count integer;
  v_enabled boolean;
  v_phase text;
begin
  if v_uid is null or v_uid <> new.player_id then
    raise exception using errcode = 'P0001', message = 'LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:' || new.campaign_id::text || ':' || new.player_id::text, 0));

  select c.legacy_card_limit, c.legacy_selection_enabled, c.phase
  into v_limit, v_enabled, v_phase
  from public.release_campaigns c
  where c.id = new.campaign_id
    and c.active = true;

  if not found or not coalesce(v_enabled, false) or v_phase <> 'legacy_selection' then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  select count(*)
  into v_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id = new.campaign_id
    and s.player_id = new.player_id;

  if v_count < 1 then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECT_AT_LEAST_ONE';
  end if;

  if v_count > greatest(0, coalesce(v_limit, 0)) then
    raise exception using errcode = 'P0001', message = 'LEGACY_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from public.release_campaign_legacy_selections s
    left join public.player_cards pc
      on pc.player_id = s.player_id
     and pc.card_id = s.card_id
     and pc.quantity > 0
    where s.campaign_id = new.campaign_id
      and s.player_id = new.player_id
      and pc.player_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  new.selected_count := v_count;
  new.confirmed_at := now();
  return new;
end;
$$;

revoke all on function private.validate_release_legacy_submission() from public, anon, authenticated;

drop trigger if exists trg_validate_release_legacy_submission on public.release_campaign_legacy_submissions;
create trigger trg_validate_release_legacy_submission
before insert on public.release_campaign_legacy_submissions
for each row execute function private.validate_release_legacy_submission();

create or replace function private.protect_confirmed_legacy_card()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_locked boolean := false;
begin
  if v_uid is null or v_uid <> old.player_id then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select exists (
    select 1
    from public.release_campaign_legacy_selections s
    join public.release_campaign_legacy_submissions sub
      on sub.campaign_id = s.campaign_id
     and sub.player_id = s.player_id
    join public.release_campaigns c
      on c.id = s.campaign_id
    where s.player_id = old.player_id
      and s.card_id = old.card_id
      and c.active = true
      and c.phase in ('legacy_selection', 'freeze')
  )
  into v_locked;

  if not v_locked then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' or new.quantity < 1 then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_LOCKED';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_confirmed_legacy_card() from public, anon, authenticated;

drop trigger if exists trg_protect_confirmed_legacy_card on public.player_cards;
create trigger trg_protect_confirmed_legacy_card
before update of quantity or delete on public.player_cards
for each row execute function private.protect_confirmed_legacy_card();
