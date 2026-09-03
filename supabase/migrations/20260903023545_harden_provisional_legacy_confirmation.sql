-- Keep provisional legacy confirmation callable by authenticated users without
-- exposing a SECURITY DEFINER RPC. Only the recalculated submission fields may
-- be updated directly; the trigger forces their canonical values.

grant update(selected_count,auto_filled_count,confirmed_at)
on public.release_campaign_legacy_submissions to authenticated;

drop policy if exists release_campaign_legacy_submissions_update_own
on public.release_campaign_legacy_submissions;

create policy release_campaign_legacy_submissions_update_own
on public.release_campaign_legacy_submissions
for update to authenticated
using (
  (select auth.uid())=release_campaign_legacy_submissions.player_id
  and release_campaign_legacy_submissions.locked_at is null
  and exists (
    select 1 from public.release_campaigns c
    where c.id=release_campaign_legacy_submissions.campaign_id
      and c.active
      and c.phase='legacy_selection'
      and c.legacy_selection_enabled
      and (c.legacy_edit_deadline is null or now()<=c.legacy_edit_deadline)
  )
)
with check (
  (select auth.uid())=release_campaign_legacy_submissions.player_id
  and release_campaign_legacy_submissions.locked_at is null
  and exists (
    select 1 from public.release_campaigns c
    where c.id=release_campaign_legacy_submissions.campaign_id
      and c.active
      and c.phase='legacy_selection'
      and c.legacy_selection_enabled
      and (c.legacy_edit_deadline is null or now()<=c.legacy_edit_deadline)
  )
);

create or replace function public.confirm_my_legacy_selection(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer;
  v_deadline timestamptz;
  v_count integer;
  v_auto_count integer;
  v_row public.release_campaign_legacy_submissions%rowtype;
begin
  if v_uid is null then
    raise exception using errcode='P0001',message='UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:'||p_campaign_id::text||':'||v_uid::text,0));

  select c.legacy_card_limit,c.legacy_edit_deadline
  into v_limit,v_deadline
  from public.release_campaigns c
  where c.id=p_campaign_id
    and c.active
    and c.phase='legacy_selection'
    and c.legacy_selection_enabled;

  if not found then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_CLOSED';
  end if;
  if v_deadline is not null and now()>v_deadline then
    raise exception using errcode='P0001',message='LEGACY_EDIT_DEADLINE_PASSED';
  end if;
  if exists(
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=p_campaign_id
      and sub.player_id=v_uid
      and sub.locked_at is not null
  ) then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_LOCKED';
  end if;

  select count(*)::integer,count(*) filter(where selection_source='automatic')::integer
  into v_count,v_auto_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id=p_campaign_id and s.player_id=v_uid;

  if v_count<1 then
    raise exception using errcode='P0001',message='LEGACY_SELECT_AT_LEAST_ONE';
  end if;
  if v_count>greatest(0,coalesce(v_limit,0)) then
    raise exception using errcode='P0001',message='LEGACY_LIMIT_REACHED';
  end if;

  insert into public.release_campaign_legacy_submissions(
    campaign_id,player_id,selected_count,auto_filled_count,confirmed_at
  )
  values(p_campaign_id,v_uid,v_count,v_auto_count,now())
  on conflict(campaign_id,player_id)
  do update set
    selected_count=excluded.selected_count,
    auto_filled_count=excluded.auto_filled_count,
    confirmed_at=excluded.confirmed_at
  returning * into v_row;

  return jsonb_build_object(
    'campaign_id',v_row.campaign_id,
    'player_id',v_row.player_id,
    'selected_count',v_row.selected_count,
    'auto_filled_count',v_row.auto_filled_count,
    'confirmed_at',v_row.confirmed_at,
    'locked_at',v_row.locked_at,
    'lock_source',v_row.lock_source
  );
end;
$$;

revoke all on function public.confirm_my_legacy_selection(uuid)
from public,anon;
grant execute on function public.confirm_my_legacy_selection(uuid)
to authenticated;
