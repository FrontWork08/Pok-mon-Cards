drop policy if exists release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections
for insert
to authenticated
with check (
  (select auth.uid()) = release_campaign_legacy_selections.player_id
  and exists (
    select 1
    from public.release_campaigns c
    where c.id = release_campaign_legacy_selections.campaign_id
      and c.active = true
      and c.phase = 'legacy_selection'
      and c.legacy_selection_enabled = true
  )
  and (
    exists (
      select 1
      from public.player_cards pc
      where pc.player_id = release_campaign_legacy_selections.player_id
        and pc.card_id = release_campaign_legacy_selections.card_id
        and pc.quantity > 0
    )
    or exists (
      select 1
      from public.market_listings ml
      where ml.seller_id = release_campaign_legacy_selections.player_id
        and ml.card_id = release_campaign_legacy_selections.card_id
        and ml.status = 'active'
        and ml.quantity > 0
    )
  )
  and not exists (
    select 1
    from public.release_campaign_legacy_submissions sub
    where sub.campaign_id = release_campaign_legacy_selections.campaign_id
      and sub.player_id = release_campaign_legacy_selections.player_id
  )
);

create or replace function public.save_my_legacy_selection(
  p_campaign_id uuid,
  p_card_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer;
  v_card_ids text[];
  v_count integer;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('legacy:' || p_campaign_id::text || ':' || v_uid::text, 0)
  );

  select c.legacy_card_limit
  into v_limit
  from public.release_campaigns c
  where c.id = p_campaign_id
    and c.active = true
    and c.phase = 'legacy_selection'
    and c.legacy_selection_enabled = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_CLOSED';
  end if;

  if exists (
    select 1
    from public.release_campaign_legacy_submissions sub
    where sub.campaign_id = p_campaign_id
      and sub.player_id = v_uid
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECTION_LOCKED';
  end if;

  select coalesce(array_agg(x.card_id order by x.first_pos), array[]::text[])
  into v_card_ids
  from (
    select u.card_id, min(u.ord) as first_pos
    from unnest(coalesce(p_card_ids, array[]::text[])) with ordinality as u(card_id, ord)
    where nullif(btrim(u.card_id), '') is not null
    group by u.card_id
  ) x;

  v_count := cardinality(v_card_ids);

  if v_count < 1 then
    raise exception using errcode = 'P0001', message = 'LEGACY_SELECT_AT_LEAST_ONE';
  end if;

  if v_count > greatest(0, coalesce(v_limit, 0)) then
    raise exception using errcode = 'P0001', message = 'LEGACY_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from unnest(v_card_ids) requested(card_id)
    where not (
      exists (
        select 1
        from public.player_cards pc
        where pc.player_id = v_uid
          and pc.card_id = requested.card_id
          and pc.quantity > 0
      )
      or exists (
        select 1
        from public.market_listings ml
        where ml.seller_id = v_uid
          and ml.card_id = requested.card_id
          and ml.status = 'active'
          and ml.quantity > 0
      )
    )
  ) then
    raise exception using errcode = 'P0001', message = 'LEGACY_CARD_NOT_OWNED';
  end if;

  delete from public.release_campaign_legacy_selections s
  where s.campaign_id = p_campaign_id
    and s.player_id = v_uid
    and not (s.card_id = any(v_card_ids));

  insert into public.release_campaign_legacy_selections(campaign_id, player_id, card_id)
  select p_campaign_id, v_uid, requested.card_id
  from unnest(v_card_ids) requested(card_id)
  where not exists (
    select 1
    from public.release_campaign_legacy_selections s
    where s.campaign_id = p_campaign_id
      and s.player_id = v_uid
      and s.card_id = requested.card_id
  );

  return jsonb_build_object(
    'ok', true,
    'selectedCount', v_count,
    'cardIds', to_jsonb(v_card_ids)
  );
end;
$$;

revoke all on function public.save_my_legacy_selection(uuid,text[]) from public, anon;
grant execute on function public.save_my_legacy_selection(uuid,text[]) to authenticated;
