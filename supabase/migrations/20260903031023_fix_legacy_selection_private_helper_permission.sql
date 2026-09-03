-- Fix Legacy selection saving for authenticated users without exposing the
-- broader private availability helper. The safe helper always binds checks to auth.uid().

create or replace function private.legacy_card_is_available_for_current_user(
  p_card_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    auth.uid() is not null
    and private.legacy_card_is_available(auth.uid(),p_card_id);
$$;

revoke all on function private.legacy_card_is_available_for_current_user(text)
from public,anon;
grant execute on function private.legacy_card_is_available_for_current_user(text)
to authenticated,service_role;

drop policy if exists release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections
for insert to authenticated
with check (
  (select auth.uid())=release_campaign_legacy_selections.player_id
  and exists (
    select 1 from public.release_campaigns c
    where c.id=release_campaign_legacy_selections.campaign_id
      and c.active
      and c.phase='legacy_selection'
      and c.legacy_selection_enabled
      and (c.legacy_edit_deadline is null or now()<=c.legacy_edit_deadline)
  )
  and private.legacy_card_is_available_for_current_user(
    release_campaign_legacy_selections.card_id
  )
  and not exists (
    select 1
    from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=release_campaign_legacy_selections.campaign_id
      and sub.player_id=release_campaign_legacy_selections.player_id
      and sub.locked_at is not null
  )
);

create or replace function public.save_my_legacy_selection(
  p_campaign_id uuid,
  p_card_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer;
  v_deadline timestamptz;
  v_card_ids text[];
  v_count integer;
  v_has_submission boolean:=false;
begin
  if v_uid is null then
    raise exception using errcode='P0001',message='UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('legacy:'||p_campaign_id::text||':'||v_uid::text,0)
  );

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

  select exists(
    select 1
    from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=p_campaign_id
      and sub.player_id=v_uid
  )
  into v_has_submission;

  if exists (
    select 1
    from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=p_campaign_id
      and sub.player_id=v_uid
      and sub.locked_at is not null
  ) then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_LOCKED';
  end if;

  select coalesce(array_agg(x.card_id order by x.first_pos),array[]::text[])
  into v_card_ids
  from (
    select u.card_id,min(u.ord) first_pos
    from unnest(coalesce(p_card_ids,array[]::text[]))
         with ordinality u(card_id,ord)
    where nullif(btrim(u.card_id),'') is not null
    group by u.card_id
  ) x;

  v_count:=cardinality(v_card_ids);

  if v_count<1 then
    raise exception using errcode='P0001',message='LEGACY_SELECT_AT_LEAST_ONE';
  end if;

  if v_count>greatest(0,coalesce(v_limit,0)) then
    raise exception using errcode='P0001',message='LEGACY_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from unnest(v_card_ids) requested(card_id)
    where not private.legacy_card_is_available_for_current_user(requested.card_id)
  ) then
    raise exception using errcode='P0001',message='LEGACY_CARD_NOT_OWNED';
  end if;

  delete from public.release_campaign_legacy_selections s
  where s.campaign_id=p_campaign_id
    and s.player_id=v_uid
    and not (s.card_id=any(v_card_ids));

  insert into public.release_campaign_legacy_selections(
    campaign_id,player_id,card_id
  )
  select p_campaign_id,v_uid,requested.card_id
  from unnest(v_card_ids) requested(card_id)
  where not exists (
    select 1
    from public.release_campaign_legacy_selections s
    where s.campaign_id=p_campaign_id
      and s.player_id=v_uid
      and s.card_id=requested.card_id
  );

  if v_has_submission then
    perform public.confirm_my_legacy_selection(p_campaign_id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'selectedCount',v_count,
    'cardIds',to_jsonb(v_card_ids),
    'provisionalConfirmed',v_has_submission
  );
end;
$$;

revoke all on function public.save_my_legacy_selection(uuid,text[])
from public,anon;
grant execute on function public.save_my_legacy_selection(uuid,text[])
to authenticated;
