-- Keep the Trainer Collection 1.0 legacy selection editable through the end
-- of the calendar day before the freeze/release date (America/Sao_Paulo).
-- Manual confirmations are provisional until that cutoff. Full 10-card saved
-- selections are auto-confirmed by the minutely background tick at the deadline.

alter table public.release_campaigns
  add column if not exists legacy_edit_deadline timestamptz;

alter table public.release_campaign_legacy_submissions
  add column if not exists locked_at timestamptz,
  add column if not exists lock_source text;

alter table public.release_campaign_legacy_submissions
  drop constraint if exists release_campaign_legacy_submissions_lock_source_check;

alter table public.release_campaign_legacy_submissions
  add constraint release_campaign_legacy_submissions_lock_source_check
  check (lock_source is null or lock_source in ('deadline','freeze'));

create or replace function private.sync_release_legacy_edit_deadline()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.release_date is not null then
    new.legacy_edit_deadline :=
      (((new.release_date::date - 1) + time '23:59:59.999999') at time zone 'America/Sao_Paulo');
  else
    new.legacy_edit_deadline := null;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_release_legacy_edit_deadline()
from public,anon,authenticated;

drop trigger if exists trg_sync_release_legacy_edit_deadline on public.release_campaigns;
create trigger trg_sync_release_legacy_edit_deadline
before insert or update of release_date on public.release_campaigns
for each row execute function private.sync_release_legacy_edit_deadline();

update public.release_campaigns
set legacy_edit_deadline =
      (((release_date::date - 1) + time '23:59:59.999999') at time zone 'America/Sao_Paulo'),
    body = 'A Beta continua funcionando normalmente até o lançamento. Veteranos poderão manter até 10 cartas. As cartas salvas continuam editáveis até o fim do dia anterior ao freeze. Quem tiver 10 cartas salvas e ainda não tiver confirmado será confirmado automaticamente no prazo. Se houver vagas restantes no freeze, o sistema completa com as cartas de maior valor de mercado da coleção.',
    updated_at=now()
where code='trainer_collection_1_0_beta_transition'
  and active=true;

update public.release_campaign_legacy_submissions sub
set locked_at=null,
    lock_source=null
from public.release_campaigns c
where sub.campaign_id=c.id
  and c.code='trainer_collection_1_0_beta_transition'
  and c.active=true
  and c.phase='legacy_selection'
  and (c.legacy_edit_deadline is null or now() <= c.legacy_edit_deadline);

create or replace function private.validate_release_legacy_selection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer;
  v_count integer;
  v_enabled boolean;
  v_phase text;
  v_frozen boolean;
  v_deadline timestamptz;
  v_auto boolean:=coalesce(current_setting('app.legacy_autofill',true),'')='1';
begin
  if not v_auto and (v_uid is null or v_uid<>new.player_id) then
    raise exception using errcode='P0001',message='LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:'||new.campaign_id::text||':'||new.player_id::text,0));

  select c.legacy_card_limit,c.legacy_selection_enabled,c.phase,c.economy_frozen,c.legacy_edit_deadline
  into v_limit,v_enabled,v_phase,v_frozen,v_deadline
  from public.release_campaigns c
  where c.id=new.campaign_id and c.active=true;

  if not found then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_CLOSED';
  end if;

  if v_auto then
    if v_phase<>'freeze' or not coalesce(v_frozen,false) then
      raise exception using errcode='P0001',message='LEGACY_FREEZE_REQUIRED';
    end if;
    new.selection_source:='automatic';
  else
    if not coalesce(v_enabled,false) or v_phase<>'legacy_selection' then
      raise exception using errcode='P0001',message='LEGACY_SELECTION_CLOSED';
    end if;
    if v_deadline is not null and now()>v_deadline then
      raise exception using errcode='P0001',message='LEGACY_EDIT_DEADLINE_PASSED';
    end if;
    if exists(
      select 1 from public.release_campaign_legacy_submissions s
      where s.campaign_id=new.campaign_id
        and s.player_id=new.player_id
        and s.locked_at is not null
    ) then
      raise exception using errcode='P0001',message='LEGACY_SELECTION_LOCKED';
    end if;
    new.selection_source:='manual';
  end if;

  if not private.legacy_card_is_available(new.player_id,new.card_id) then
    raise exception using errcode='P0001',message='LEGACY_CARD_NOT_OWNED';
  end if;

  select count(*) into v_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id=new.campaign_id and s.player_id=new.player_id;

  if v_count>=greatest(0,coalesce(v_limit,0)) then
    raise exception using errcode='P0001',message='LEGACY_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_release_legacy_selection()
from public,anon,authenticated;

create or replace function private.validate_release_legacy_submission()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer;
  v_count integer;
  v_auto_count integer;
  v_enabled boolean;
  v_phase text;
  v_frozen boolean;
  v_deadline timestamptz;
  v_auto boolean:=coalesce(current_setting('app.legacy_autofill',true),'')='1';
  v_deadline_auto boolean:=coalesce(current_setting('app.legacy_deadline_lock',true),'')='1';
  v_listing record;
begin
  if not v_auto and not v_deadline_auto and (v_uid is null or v_uid<>new.player_id) then
    raise exception using errcode='P0001',message='LEGACY_NOT_AUTHORIZED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy:'||new.campaign_id::text||':'||new.player_id::text,0));

  select c.legacy_card_limit,c.legacy_selection_enabled,c.phase,c.economy_frozen,c.legacy_edit_deadline
  into v_limit,v_enabled,v_phase,v_frozen,v_deadline
  from public.release_campaigns c
  where c.id=new.campaign_id and c.active=true;

  if not found then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_CLOSED';
  end if;

  if v_auto then
    if v_phase<>'freeze' or not coalesce(v_frozen,false) then
      raise exception using errcode='P0001',message='LEGACY_FREEZE_REQUIRED';
    end if;
  elsif v_deadline_auto then
    if v_phase<>'legacy_selection' or v_deadline is null or now()<=v_deadline then
      raise exception using errcode='P0001',message='LEGACY_DEADLINE_NOT_REACHED';
    end if;
  else
    if not coalesce(v_enabled,false) or v_phase<>'legacy_selection' then
      raise exception using errcode='P0001',message='LEGACY_SELECTION_CLOSED';
    end if;
    if v_deadline is not null and now()>v_deadline then
      raise exception using errcode='P0001',message='LEGACY_EDIT_DEADLINE_PASSED';
    end if;
    if tg_op='UPDATE' and old.locked_at is not null then
      raise exception using errcode='P0001',message='LEGACY_SELECTION_LOCKED';
    end if;
  end if;

  select count(*),count(*) filter(where selection_source='automatic')
  into v_count,v_auto_count
  from public.release_campaign_legacy_selections s
  where s.campaign_id=new.campaign_id and s.player_id=new.player_id;

  if v_count<1 then
    raise exception using errcode='P0001',message='LEGACY_SELECT_AT_LEAST_ONE';
  end if;
  if v_count>greatest(0,coalesce(v_limit,0)) then
    raise exception using errcode='P0001',message='LEGACY_LIMIT_REACHED';
  end if;

  if exists(
    select 1 from public.release_campaign_legacy_selections s
    where s.campaign_id=new.campaign_id
      and s.player_id=new.player_id
      and not private.legacy_card_is_available(s.player_id,s.card_id)
  ) then
    raise exception using errcode='P0001',message='LEGACY_CARD_NOT_OWNED';
  end if;

  for v_listing in
    select ml.id,ml.card_id,ml.quantity
    from public.market_listings ml
    where ml.seller_id=new.player_id
      and ml.status='active'
      and exists(
        select 1 from public.release_campaign_legacy_selections s
        where s.campaign_id=new.campaign_id
          and s.player_id=new.player_id
          and s.card_id=ml.card_id
      )
    order by ml.id
    for update
  loop
    update public.market_offers
    set status='rejected',updated_at=now()
    where listing_id=v_listing.id and status='pending';

    insert into public.player_cards(player_id,card_id,quantity)
    values(new.player_id,v_listing.card_id,v_listing.quantity)
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+excluded.quantity;

    update public.market_listings
    set status='cancelled',updated_at=now()
    where id=v_listing.id;
  end loop;

  if exists(
    select 1
    from public.release_campaign_legacy_selections s
    left join public.player_cards pc
      on pc.player_id=s.player_id
     and pc.card_id=s.card_id
     and pc.quantity>0
    where s.campaign_id=new.campaign_id
      and s.player_id=new.player_id
      and pc.player_id is null
  ) then
    raise exception using errcode='P0001',message='LEGACY_CARD_NOT_OWNED';
  end if;

  new.selected_count:=v_count;
  new.auto_filled_count:=v_auto_count;
  new.confirmed_at:=case when v_auto or v_deadline_auto then coalesce(new.confirmed_at,now()) else now() end;

  if v_deadline_auto then
    new.locked_at:=coalesce(new.locked_at,now());
    new.lock_source:='deadline';
  elsif v_auto then
    new.locked_at:=coalesce(new.locked_at,now());
    new.lock_source:=coalesce(new.lock_source,'freeze');
  else
    new.locked_at:=null;
    new.lock_source:=null;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_release_legacy_submission()
from public,anon,authenticated;

drop trigger if exists trg_validate_release_legacy_submission
on public.release_campaign_legacy_submissions;

create trigger trg_validate_release_legacy_submission
before insert or update on public.release_campaign_legacy_submissions
for each row execute function private.validate_release_legacy_submission();

drop policy if exists release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_insert_own
on public.release_campaign_legacy_selections
for insert to authenticated
with check(
  (select auth.uid())=release_campaign_legacy_selections.player_id
  and exists(
    select 1 from public.release_campaigns c
    where c.id=release_campaign_legacy_selections.campaign_id
      and c.active
      and c.phase='legacy_selection'
      and c.legacy_selection_enabled
      and (c.legacy_edit_deadline is null or now()<=c.legacy_edit_deadline)
  )
  and private.legacy_card_is_available(
    release_campaign_legacy_selections.player_id,
    release_campaign_legacy_selections.card_id
  )
  and not exists(
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=release_campaign_legacy_selections.campaign_id
      and sub.player_id=release_campaign_legacy_selections.player_id
      and sub.locked_at is not null
  )
);

drop policy if exists release_campaign_legacy_selections_delete_own
on public.release_campaign_legacy_selections;

create policy release_campaign_legacy_selections_delete_own
on public.release_campaign_legacy_selections
for delete to authenticated
using(
  (select auth.uid())=release_campaign_legacy_selections.player_id
  and exists(
    select 1 from public.release_campaigns c
    where c.id=release_campaign_legacy_selections.campaign_id
      and c.active
      and c.phase='legacy_selection'
      and c.legacy_selection_enabled
      and (c.legacy_edit_deadline is null or now()<=c.legacy_edit_deadline)
  )
  and not exists(
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=release_campaign_legacy_selections.campaign_id
      and sub.player_id=release_campaign_legacy_selections.player_id
      and sub.locked_at is not null
  )
);

drop policy if exists release_campaign_legacy_submissions_insert_own
on public.release_campaign_legacy_submissions;

create policy release_campaign_legacy_submissions_insert_own
on public.release_campaign_legacy_submissions
for insert to authenticated
with check(
  (select auth.uid())=release_campaign_legacy_submissions.player_id
  and exists(
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
security definer
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
    campaign_id,player_id,selected_count,auto_filled_count,confirmed_at,locked_at,lock_source
  )
  values(p_campaign_id,v_uid,v_count,v_auto_count,now(),null,null)
  on conflict(campaign_id,player_id)
  do update set
    selected_count=excluded.selected_count,
    auto_filled_count=excluded.auto_filled_count,
    confirmed_at=excluded.confirmed_at,
    locked_at=null,
    lock_source=null
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

  select exists(
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=p_campaign_id and sub.player_id=v_uid
  ) into v_has_submission;

  if exists(
    select 1 from public.release_campaign_legacy_submissions sub
    where sub.campaign_id=p_campaign_id
      and sub.player_id=v_uid
      and sub.locked_at is not null
  ) then
    raise exception using errcode='P0001',message='LEGACY_SELECTION_LOCKED';
  end if;

  select coalesce(array_agg(x.card_id order by x.first_pos),array[]::text[])
  into v_card_ids
  from(
    select u.card_id,min(u.ord) first_pos
    from unnest(coalesce(p_card_ids,array[]::text[])) with ordinality u(card_id,ord)
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

  if exists(
    select 1 from unnest(v_card_ids) requested(card_id)
    where not private.legacy_card_is_available(v_uid,requested.card_id)
  ) then
    raise exception using errcode='P0001',message='LEGACY_CARD_NOT_OWNED';
  end if;

  delete from public.release_campaign_legacy_selections s
  where s.campaign_id=p_campaign_id
    and s.player_id=v_uid
    and not(s.card_id=any(v_card_ids));

  insert into public.release_campaign_legacy_selections(campaign_id,player_id,card_id)
  select p_campaign_id,v_uid,requested.card_id
  from unnest(v_card_ids) requested(card_id)
  where not exists(
    select 1 from public.release_campaign_legacy_selections s
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

create or replace function private.auto_lock_due_legacy_selections()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_locked_existing integer:=0;
  v_auto_confirmed integer:=0;
begin
  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition'
    and active=true
    and phase='legacy_selection'
  limit 1;

  if not found then
    return jsonb_build_object('status','inactive','lockedExisting',0,'autoConfirmedFullSelections',0);
  end if;

  if v_campaign.legacy_edit_deadline is null or now()<=v_campaign.legacy_edit_deadline then
    return jsonb_build_object(
      'status','waiting',
      'deadline',v_campaign.legacy_edit_deadline,
      'lockedExisting',0,
      'autoConfirmedFullSelections',0
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trainer_collection_1_0_legacy_deadline',0));
  perform set_config('app.legacy_deadline_lock','1',true);

  update public.release_campaign_legacy_submissions sub
  set locked_at=now(),lock_source='deadline'
  where sub.campaign_id=v_campaign.id and sub.locked_at is null;
  get diagnostics v_locked_existing=row_count;

  with counts as(
    select s.player_id,
      count(*)::integer selected_count,
      count(*) filter(where s.selection_source='automatic')::integer auto_count,
      bool_and(private.legacy_card_is_available(s.player_id,s.card_id)) all_available
    from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
    group by s.player_id
  ),
  inserted as(
    insert into public.release_campaign_legacy_submissions(
      campaign_id,player_id,selected_count,auto_filled_count,confirmed_at,locked_at,lock_source
    )
    select v_campaign.id,c.player_id,c.selected_count,c.auto_count,now(),now(),'deadline'
    from counts c
    where c.selected_count=v_campaign.legacy_card_limit
      and c.all_available
      and not exists(
        select 1 from public.release_campaign_legacy_submissions sub
        where sub.campaign_id=v_campaign.id and sub.player_id=c.player_id
      )
    returning 1
  )
  select count(*) into v_auto_confirmed from inserted;

  return jsonb_build_object(
    'status','locked',
    'deadline',v_campaign.legacy_edit_deadline,
    'lockedExisting',v_locked_existing,
    'autoConfirmedFullSelections',v_auto_confirmed
  );
end;
$$;

revoke all on function private.auto_lock_due_legacy_selections()
from public,anon,authenticated;
grant execute on function private.auto_lock_due_legacy_selections()
to service_role;

create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_market_pending integer;
  v_restored_suspensions integer;
  v_season text;
  v_legacy jsonb;
begin
  update public.players
  set account_status='active',suspended_until=null,moderation_reason=null
  where account_status='suspended'
    and suspended_until is not null and suspended_until<=now();
  get diagnostics v_restored_suspensions=row_count;

  v_season:=private.ensure_active_season();
  perform private.refresh_pack_economy();
  v_legacy:=private.auto_lock_due_legacy_selections();

  perform private.ensure_weekly_guild_wars();
  perform private.ensure_active_tournament();

  update public.market_offers
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  v_battles:=public.server_process_expired_battles();
  v_push:=public.server_dispatch_push_notifications();

  if exists(select 1 from public.catalog_refresh_state where job_name='full_tcg_refresh' and status='running') then
    begin
      v_catalog:=public.server_refresh_catalog_batch(2);
    exception when others then
      v_catalog:=jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog:=jsonb_build_object('status','idle');
  end if;

  select count(*)::integer into v_market_pending
  from private.market_price_sync_sets
  where status in('pending','running','retry');

  return jsonb_build_object(
    'battles',v_battles,'pushes',v_push,'catalog',v_catalog,
    'season',v_season,
    'legacySelection',v_legacy,
    'guildWars','checked',
    'tournaments','checked',
    'moderation',jsonb_build_object('restoredSuspensions',v_restored_suspensions),
    'marketPrices',jsonb_build_object(
      'status',case when v_market_pending>0 then 'syncing' else 'ready' end,
      'pendingSets',v_market_pending,'source','pokemontcg:tcgplayer_market_v3'
    ),
    'at',now()
  );
end;
$$;

create or replace function public.server_finalize_legacy_selections(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_inserted integer:=0;
  v_new_submissions integer:=0;
  v_updated_submissions integer:=0;
  v_fully_filled integer:=0;
  v_short_bag integer:=0;
begin
  if not exists(
    select 1 from public.admin_members a
    where a.player_id=p_actor_id and a.role='owner'
  ) then
    raise exception using errcode='P0001',message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  limit 1;

  if not found then
    raise exception using errcode='P0001',message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;
  if v_campaign.phase<>'freeze' or not coalesce(v_campaign.economy_frozen,false) then
    raise exception using errcode='P0001',message='LEGACY_FREEZE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trainer_collection_1_0_legacy_finalize',0));
  perform set_config('app.legacy_autofill','1',true);

  with existing as(
    select p.id player_id,count(s.card_id)::integer selected_count
    from public.players p
    left join public.release_campaign_legacy_selections s
      on s.player_id=p.id and s.campaign_id=v_campaign.id
    group by p.id
  ),
  candidates as(
    select pc.player_id,pc.card_id,
      row_number() over(
        partition by pc.player_id
        order by c.market_price_usd desc nulls last,
                 c.game_value desc nulls last,
                 pc.first_obtained_at asc,
                 pc.card_id asc
      ) candidate_rank
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.quantity>0
      and not exists(
        select 1 from public.release_campaign_legacy_selections s
        where s.campaign_id=v_campaign.id
          and s.player_id=pc.player_id
          and s.card_id=pc.card_id
      )
  ),
  inserted as(
    insert into public.release_campaign_legacy_selections(
      campaign_id,player_id,card_id,selection_source
    )
    select v_campaign.id,c.player_id,c.card_id,'automatic'
    from candidates c
    join existing e on e.player_id=c.player_id
    where c.candidate_rank<=greatest(v_campaign.legacy_card_limit-e.selected_count,0)
    on conflict(campaign_id,player_id,card_id) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  with counts as(
    select s.player_id,
      count(*)::integer selected_count,
      count(*) filter(where s.selection_source='automatic')::integer auto_count
    from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
    group by s.player_id
  ),
  inserted_submissions as(
    insert into public.release_campaign_legacy_submissions(
      campaign_id,player_id,selected_count,auto_filled_count,confirmed_at,locked_at,lock_source
    )
    select v_campaign.id,c.player_id,c.selected_count,c.auto_count,now(),now(),'freeze'
    from counts c
    where c.selected_count>0
      and not exists(
        select 1 from public.release_campaign_legacy_submissions sub
        where sub.campaign_id=v_campaign.id and sub.player_id=c.player_id
      )
    returning 1
  )
  select count(*) into v_new_submissions from inserted_submissions;

  with counts as(
    select s.player_id,
      count(*)::integer selected_count,
      count(*) filter(where s.selection_source='automatic')::integer auto_count
    from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
    group by s.player_id
  ),
  updated as(
    update public.release_campaign_legacy_submissions sub
    set selected_count=c.selected_count,
        auto_filled_count=c.auto_count,
        locked_at=coalesce(sub.locked_at,now()),
        lock_source=coalesce(sub.lock_source,'freeze')
    from counts c
    where sub.campaign_id=v_campaign.id
      and sub.player_id=c.player_id
      and(
        sub.selected_count is distinct from c.selected_count
        or sub.auto_filled_count is distinct from c.auto_count
        or sub.locked_at is null
      )
    returning 1
  )
  select count(*) into v_updated_submissions from updated;

  select count(*) into v_fully_filled
  from(
    select player_id
    from public.release_campaign_legacy_selections
    where campaign_id=v_campaign.id
    group by player_id
    having count(*)=v_campaign.legacy_card_limit
  ) filled;

  select count(*) into v_short_bag
  from public.players p
  where(
    select count(*) from public.player_cards pc
    where pc.player_id=p.id and pc.quantity>0
  )<v_campaign.legacy_card_limit;

  return jsonb_build_object(
    'ok',true,
    'campaignId',v_campaign.id,
    'legacyCardLimit',v_campaign.legacy_card_limit,
    'automaticCardsAdded',v_inserted,
    'newAutoConfirmedAccounts',v_new_submissions,
    'existingSubmissionsUpdated',v_updated_submissions,
    'accountsWithFullLegacy',v_fully_filled,
    'accountsWithFewerThanLimitOwned',v_short_bag,
    'selectionRule','manual_first_then_market_price_desc_game_value_desc'
  );
end;
$$;

revoke all on function public.server_finalize_legacy_selections(uuid)
from public,anon,authenticated;
grant execute on function public.server_finalize_legacy_selections(uuid)
to service_role;
