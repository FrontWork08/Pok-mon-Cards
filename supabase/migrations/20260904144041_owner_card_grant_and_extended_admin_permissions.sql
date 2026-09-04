-- Owner-only card grants + granular permissions for the newer admin tools.
-- Mirrors the production migration applied on 2026-09-04.

create table if not exists private.admin_card_grants (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.players(id) on delete restrict,
  target_id uuid not null references public.players(id) on delete restrict,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= quantity_before),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists admin_card_grants_actor_created_idx on private.admin_card_grants(actor_id,created_at desc);
create index if not exists admin_card_grants_target_created_idx on private.admin_card_grants(target_id,created_at desc);
create index if not exists admin_card_grants_card_created_idx on private.admin_card_grants(card_id,created_at desc);

alter table private.admin_member_permissions drop constraint if exists admin_member_permissions_allowed_check;
alter table private.admin_member_permissions add constraint admin_member_permissions_allowed_check check (
  permissions <@ array[
    'audit_users','moderate_users','economy_grant','economy_remove',
    'battlepass_grant','codes_manage','announcements_manage','events_manage',
    'maintenance_manage','guilds_manage','gamepasses_manage','battle_lab_manage',
    'economy_control','feature_flags_manage','feedback_manage','system_health_view'
  ]::text[]
);

create or replace function public.server_admin_access(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_permissions text[];
begin
  select am.role,
         case
           when am.role='owner' then array[
             'audit_users','moderate_users','economy_grant','economy_remove',
             'battlepass_grant','codes_manage','announcements_manage','events_manage',
             'maintenance_manage','guilds_manage','gamepasses_manage','battle_lab_manage',
             'economy_control','feature_flags_manage','feedback_manage','system_health_view'
           ]::text[]
           else coalesce(amp.permissions,'{}'::text[])
         end
  into v_role,v_permissions
  from public.admin_members am
  left join private.admin_member_permissions amp on amp.player_id=am.player_id
  where am.player_id=p_actor_id;

  if v_role is null then raise exception 'FORBIDDEN'; end if;

  return jsonb_build_object(
    'playerId',p_actor_id,
    'role',v_role,
    'isOwner',v_role='owner',
    'permissions',to_jsonb(v_permissions)
  );
end;
$$;
revoke all on function public.server_admin_access(uuid) from public,anon,authenticated;
grant execute on function public.server_admin_access(uuid) to service_role;

create or replace function public.server_owner_grant_card(
  p_actor_id uuid,
  p_target_id uuid,
  p_card_id text,
  p_quantity integer default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before integer:=0;
  v_after integer:=0;
  v_target_name text;
  v_card record;
  v_grant_id bigint;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id and role='owner') then
    raise exception 'OWNER_ONLY';
  end if;
  if p_quantity is null or p_quantity<1 or p_quantity>100 then raise exception 'INVALID_CARD_QUANTITY'; end if;
  select username into v_target_name from public.players where id=p_target_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select id,pokemon_name,set_id,card_number,rarity,image_small,image_large,market_price_usd
  into v_card from public.cards where id=p_card_id;
  if not found then raise exception 'CARD_NOT_FOUND'; end if;

  select quantity into v_before
  from public.player_cards
  where player_id=p_target_id and card_id=p_card_id
  for update;
  if not found then v_before:=0; end if;

  insert into public.player_cards(player_id,card_id,quantity,first_obtained_at)
  values(p_target_id,p_card_id,p_quantity,now())
  on conflict(player_id,card_id) do update
    set quantity=public.player_cards.quantity+excluded.quantity
  returning quantity into v_after;

  insert into private.admin_card_grants(actor_id,target_id,card_id,quantity,quantity_before,quantity_after,note)
  values(p_actor_id,p_target_id,p_card_id,p_quantity,v_before,v_after,left(nullif(btrim(coalesce(p_note,'')),''),500))
  returning id into v_grant_id;

  perform public.server_refresh_player_achievements(p_target_id);
  perform public.server_queue_notification(
    p_target_id,
    'admin_card_grant',
    'Carta adicionada à sua coleção',
    coalesce(v_card.pokemon_name,'Carta')||' foi adicionada à sua conta pelo Criador.',
    jsonb_build_object('cardId',p_card_id,'quantity',p_quantity,'grantId',v_grant_id)
  );

  return jsonb_build_object(
    'grantId',v_grant_id,
    'targetId',p_target_id,
    'username',v_target_name,
    'card',jsonb_build_object(
      'id',v_card.id,'name',v_card.pokemon_name,'setId',v_card.set_id,'number',v_card.card_number,
      'rarity',v_card.rarity,'image',coalesce(v_card.image_large,v_card.image_small),
      'marketPriceUsd',v_card.market_price_usd
    ),
    'quantityAdded',p_quantity,
    'quantityBefore',v_before,
    'quantityAfter',v_after
  );
end;
$$;
revoke all on function public.server_owner_grant_card(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.server_owner_grant_card(uuid,uuid,text,integer,text) to service_role;

-- Gamepass management is delegable, while purchase/card grant ownership remains server-controlled.
create or replace function public.owner_list_gamepasses()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not private.admin_has_permission(v_actor,'gamepasses_manage') then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'playerId',g.player_id,'username',p.username,'gamepassId',g.gamepass_id,'gamepassName',c.name,'active',g.active,
    'grantedAt',g.granted_at,'updatedAt',g.updated_at,'note',g.note
  ) order by p.username,c.sort_order) from public.player_gamepasses g join public.players p on p.id=g.player_id left join public.gamepass_catalog c on c.id=g.gamepass_id),'[]'::jsonb);
end;
$$;

create or replace function public.owner_set_gamepass(p_target_ids uuid[], p_gamepass_id text, p_enabled boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_count integer:=0;
  v_items jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not private.admin_has_permission(v_actor,'gamepasses_manage') then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.gamepass_catalog where id=p_gamepass_id and active=true) then raise exception 'GAMEPASS_NOT_FOUND'; end if;
  if coalesce(array_length(p_target_ids,1),0)<1 or array_length(p_target_ids,1)>100 then raise exception 'INVALID_TARGETS'; end if;
  if exists(select 1 from unnest(p_target_ids) t(id) left join public.players p on p.id=t.id where p.id is null) then raise exception 'PLAYER_NOT_FOUND'; end if;

  insert into public.player_gamepasses(player_id,gamepass_id,active,granted_by,granted_at,updated_at,note)
  select distinct id,p_gamepass_id,coalesce(p_enabled,false),v_actor,now(),now(),left(nullif(trim(coalesce(p_note,'')),''),300)
  from unnest(p_target_ids) t(id)
  on conflict(player_id,gamepass_id) do update set active=excluded.active,granted_by=excluded.granted_by,
    granted_at=case when excluded.active then now() else public.player_gamepasses.granted_at end,updated_at=now(),note=excluded.note;

  if p_gamepass_id='trainer_vip' then
    if p_enabled then
      insert into public.player_achievements(player_id,achievement_id,progress,unlocked_at,updated_at)
      select distinct id,'gamepass_trainer_vip',1,now(),now() from unnest(p_target_ids) t(id)
      on conflict(player_id,achievement_id) do update set progress=1,unlocked_at=coalesce(public.player_achievements.unlocked_at,now()),updated_at=now();
      insert into public.player_cosmetics(player_id,cosmetic_id)
      select id,cid from (select distinct id from unnest(p_target_ids) t(id)) p cross join unnest(array['frame_trainer_vip','bg_trainer_vip']) c(cid)
      on conflict do nothing;
    else
      update public.players set equipped_title_id=null where id=any(p_target_ids) and equipped_title_id='gamepass_trainer_vip';
      update public.players set equipped_frame_id='frame_classic' where id=any(p_target_ids) and equipped_frame_id='frame_trainer_vip';
      update public.players set equipped_background_id='bg_midnight' where id=any(p_target_ids) and equipped_background_id='bg_trainer_vip';
      delete from public.player_achievements where player_id=any(p_target_ids) and achievement_id='gamepass_trainer_vip';
      delete from public.player_cosmetics where player_id=any(p_target_ids) and cosmetic_id in('frame_trainer_vip','bg_trainer_vip');
    end if;
  elsif p_gamepass_id='cosmetic_pass' then
    if p_enabled then
      insert into public.player_cosmetics(player_id,cosmetic_id)
      select id,cid from (select distinct id from unnest(p_target_ids) t(id)) p cross join unnest(array['frame_cosmetic_pass_prism','bg_cosmetic_pass_nebula','frame_cosmetic_pass_crown','bg_cosmetic_pass_aurora']) c(cid)
      on conflict do nothing;
    else
      update public.players set equipped_frame_id='frame_classic' where id=any(p_target_ids) and equipped_frame_id in('frame_cosmetic_pass_prism','frame_cosmetic_pass_crown');
      update public.players set equipped_background_id='bg_midnight' where id=any(p_target_ids) and equipped_background_id in('bg_cosmetic_pass_nebula','bg_cosmetic_pass_aurora');
      delete from public.player_cosmetics where player_id=any(p_target_ids) and cosmetic_id in('frame_cosmetic_pass_prism','bg_cosmetic_pass_nebula','frame_cosmetic_pass_crown','bg_cosmetic_pass_aurora');
    end if;
  end if;

  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'active',coalesce(p_enabled,false)) order by p.username),'[]'::jsonb)
  into v_count,v_items from public.players p where p.id=any(p_target_ids);
  return jsonb_build_object('gamepassId',p_gamepass_id,'enabled',coalesce(p_enabled,false),'recipientCount',v_count,'recipients',v_items);
end;
$$;

revoke all on function public.owner_list_gamepasses() from public,anon;
revoke all on function public.owner_set_gamepass(uuid[],text,boolean,text) from public,anon;
grant execute on function public.owner_list_gamepasses() to authenticated,service_role;
grant execute on function public.owner_set_gamepass(uuid[],text,boolean,text) to authenticated,service_role;

-- Wrap existing admin tools so their original behavior is preserved while access becomes granular.
do $$ begin
  if to_regprocedure('public.get_admin_battle_lab_catalog_legacy_admin(text,integer,integer)') is null and to_regprocedure('public.get_admin_battle_lab_catalog(text,integer,integer)') is not null then
    alter function public.get_admin_battle_lab_catalog(text,integer,integer) rename to get_admin_battle_lab_catalog_legacy_admin;
  end if;
end $$;
revoke all on function public.get_admin_battle_lab_catalog_legacy_admin(text,integer,integer) from public,anon,authenticated;
create or replace function public.get_admin_battle_lab_catalog(p_search text default null,p_offset integer default 0,p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not private.admin_has_permission(v_actor,'battle_lab_manage') then raise exception 'FORBIDDEN'; end if;
  return public.get_admin_battle_lab_catalog_legacy_admin(p_search,p_offset,p_limit);
end $$;

do $$ begin
  if to_regprocedure('public.get_battle_lab_matchup_legacy_admin(text,text,integer)') is null and to_regprocedure('public.get_battle_lab_matchup(text,text,integer)') is not null then
    alter function public.get_battle_lab_matchup(text,text,integer) rename to get_battle_lab_matchup_legacy_admin;
  end if;
end $$;
revoke all on function public.get_battle_lab_matchup_legacy_admin(text,text,integer) from public,anon,authenticated;
create or replace function public.get_battle_lab_matchup(p_card_a text,p_card_b text,p_iterations integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not private.admin_has_permission(v_actor,'battle_lab_manage') then raise exception 'FORBIDDEN'; end if;
  return public.get_battle_lab_matchup_legacy_admin(p_card_a,p_card_b,p_iterations);
end $$;

do $$ begin
  if to_regprocedure('public.get_admin_battle_lab_matrix_legacy_admin(text[],integer)') is null and to_regprocedure('public.get_admin_battle_lab_matrix(text[],integer)') is not null then
    alter function public.get_admin_battle_lab_matrix(text[],integer) rename to get_admin_battle_lab_matrix_legacy_admin;
  end if;
end $$;
revoke all on function public.get_admin_battle_lab_matrix_legacy_admin(text[],integer) from public,anon,authenticated;
create or replace function public.get_admin_battle_lab_matrix(p_card_ids text[],p_iterations integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); begin
  if v_actor is null or not private.admin_has_permission(v_actor,'battle_lab_manage') then raise exception 'FORBIDDEN'; end if;
  return public.get_admin_battle_lab_matrix_legacy_admin(p_card_ids,p_iterations);
end $$;

-- Economy wrappers keep the existing calculations intact but require the new permission.
do $$ begin
  if to_regprocedure('public.server_get_economy_health_legacy_admin(uuid)') is null and to_regprocedure('public.server_get_economy_health(uuid)') is not null then alter function public.server_get_economy_health(uuid) rename to server_get_economy_health_legacy_admin; end if;
end $$;
revoke all on function public.server_get_economy_health_legacy_admin(uuid) from public,anon,authenticated;
create or replace function public.server_get_economy_health(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if not private.admin_has_permission(p_actor_id,'economy_control') then raise exception 'FORBIDDEN'; end if; return public.server_get_economy_health_legacy_admin(p_actor_id); end $$;

do $$ begin
  if to_regprocedure('public.server_get_economy_trend_legacy_admin(uuid,integer)') is null and to_regprocedure('public.server_get_economy_trend(uuid,integer)') is not null then alter function public.server_get_economy_trend(uuid,integer) rename to server_get_economy_trend_legacy_admin; end if;
end $$;
revoke all on function public.server_get_economy_trend_legacy_admin(uuid,integer) from public,anon,authenticated;
create or replace function public.server_get_economy_trend(p_actor_id uuid,p_limit integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if not private.admin_has_permission(p_actor_id,'economy_control') then raise exception 'FORBIDDEN'; end if; return public.server_get_economy_trend_legacy_admin(p_actor_id,p_limit); end $$;

do $$ begin
  if to_regprocedure('public.server_capture_economy_snapshot_legacy_admin(uuid)') is null and to_regprocedure('public.server_capture_economy_snapshot(uuid)') is not null then alter function public.server_capture_economy_snapshot(uuid) rename to server_capture_economy_snapshot_legacy_admin; end if;
end $$;
revoke all on function public.server_capture_economy_snapshot_legacy_admin(uuid) from public,anon,authenticated;
create or replace function public.server_capture_economy_snapshot(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if not private.admin_has_permission(p_actor_id,'economy_control') then raise exception 'FORBIDDEN'; end if; return public.server_capture_economy_snapshot_legacy_admin(p_actor_id); end $$;

do $$ begin
  if to_regprocedure('public.server_refresh_economy_advisor_legacy_admin(uuid)') is null and to_regprocedure('public.server_refresh_economy_advisor(uuid)') is not null then alter function public.server_refresh_economy_advisor(uuid) rename to server_refresh_economy_advisor_legacy_admin; end if;
end $$;
revoke all on function public.server_refresh_economy_advisor_legacy_admin(uuid) from public,anon,authenticated;
create or replace function public.server_refresh_economy_advisor(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if not private.admin_has_permission(p_actor_id,'economy_control') then raise exception 'FORBIDDEN'; end if; return public.server_refresh_economy_advisor_legacy_admin(p_actor_id); end $$;

-- Small admin tools can be wrapped without changing their behavior.
do $$ begin if to_regprocedure('public.get_admin_feature_flags_legacy_admin()') is null and to_regprocedure('public.get_admin_feature_flags()') is not null then alter function public.get_admin_feature_flags() rename to get_admin_feature_flags_legacy_admin; end if; end $$;
revoke all on function public.get_admin_feature_flags_legacy_admin() from public,anon,authenticated;
create or replace function public.get_admin_feature_flags() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if auth.uid() is null or not private.admin_has_permission(auth.uid(),'feature_flags_manage') then raise exception 'FORBIDDEN'; end if; return public.get_admin_feature_flags_legacy_admin(); end $$;

create or replace function public.server_admin_set_feature_flag(p_key text,p_enabled boolean,p_rollout_percent integer default 100,p_tester_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v public.feature_flags%rowtype;
begin
  if v_actor is null or not private.admin_has_permission(v_actor,'feature_flags_manage') then raise exception 'FORBIDDEN'; end if;
  if p_rollout_percent not between 0 and 100 then raise exception 'INVALID_ROLLOUT'; end if;
  update public.feature_flags set enabled=p_enabled,rollout_percent=p_rollout_percent,tester_only=p_tester_only,updated_by=v_actor,updated_at=now() where key=p_key returning * into v;
  if not found then raise exception 'FEATURE_FLAG_NOT_FOUND'; end if;
  return jsonb_build_object('key',v.key,'enabled',v.enabled,'rolloutPercent',v.rollout_percent,'testerOnly',v.tester_only,'updatedAt',v.updated_at);
end $$;

do $$ begin if to_regprocedure('public.get_admin_feedback_legacy_admin(text,integer)') is null and to_regprocedure('public.get_admin_feedback(text,integer)') is not null then alter function public.get_admin_feedback(text,integer) rename to get_admin_feedback_legacy_admin; end if; end $$;
revoke all on function public.get_admin_feedback_legacy_admin(text,integer) from public,anon,authenticated;
create or replace function public.get_admin_feedback(p_status text default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if auth.uid() is null or not private.admin_has_permission(auth.uid(),'feedback_manage') then raise exception 'FORBIDDEN'; end if; return public.get_admin_feedback_legacy_admin(p_status,p_limit); end $$;

do $$ begin if to_regprocedure('public.server_admin_update_feedback_legacy_admin(uuid,text,text)') is null and to_regprocedure('public.server_admin_update_feedback(uuid,text,text)') is not null then alter function public.server_admin_update_feedback(uuid,text,text) rename to server_admin_update_feedback_legacy_admin; end if; end $$;
revoke all on function public.server_admin_update_feedback_legacy_admin(uuid,text,text) from public,anon,authenticated;
create or replace function public.server_admin_update_feedback(p_feedback_id uuid,p_status text,p_admin_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$ begin if auth.uid() is null or not private.admin_has_permission(auth.uid(),'feedback_manage') then raise exception 'FORBIDDEN'; end if; return public.server_admin_update_feedback_legacy_admin(p_feedback_id,p_status,p_admin_note); end $$;

do $$ begin if to_regprocedure('public.get_admin_health_check_legacy_admin()') is null and to_regprocedure('public.get_admin_health_check()') is not null then alter function public.get_admin_health_check() rename to get_admin_health_check_legacy_admin; end if; end $$;
revoke all on function public.get_admin_health_check_legacy_admin() from public,anon,authenticated;
create or replace function public.get_admin_health_check() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if auth.uid() is null or not private.admin_has_permission(auth.uid(),'system_health_view') then raise exception 'FORBIDDEN'; end if; return public.get_admin_health_check_legacy_admin(); end $$;

do $$ begin if to_regprocedure('public.get_admin_recent_errors_legacy_admin(integer)') is null and to_regprocedure('public.get_admin_recent_errors(integer)') is not null then alter function public.get_admin_recent_errors(integer) rename to get_admin_recent_errors_legacy_admin; end if; end $$;
revoke all on function public.get_admin_recent_errors_legacy_admin(integer) from public,anon,authenticated;
create or replace function public.get_admin_recent_errors(p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if auth.uid() is null or not private.admin_has_permission(auth.uid(),'system_health_view') then raise exception 'FORBIDDEN'; end if; return public.get_admin_recent_errors_legacy_admin(p_limit); end $$;

revoke all on function public.get_admin_battle_lab_catalog(text,integer,integer) from public,anon;
revoke all on function public.get_battle_lab_matchup(text,text,integer) from public,anon;
revoke all on function public.get_admin_battle_lab_matrix(text[],integer) from public,anon;
revoke all on function public.server_get_economy_health(uuid) from public,anon;
revoke all on function public.server_get_economy_trend(uuid,integer) from public,anon;
revoke all on function public.server_capture_economy_snapshot(uuid) from public,anon;
revoke all on function public.server_refresh_economy_advisor(uuid) from public,anon;
revoke all on function public.get_admin_feature_flags() from public,anon;
revoke all on function public.server_admin_set_feature_flag(text,boolean,integer,boolean) from public,anon;
revoke all on function public.get_admin_feedback(text,integer) from public,anon;
revoke all on function public.server_admin_update_feedback(uuid,text,text) from public,anon;
revoke all on function public.get_admin_health_check() from public,anon;
revoke all on function public.get_admin_recent_errors(integer) from public,anon;

grant execute on function public.get_admin_battle_lab_catalog(text,integer,integer) to authenticated,service_role;
grant execute on function public.get_battle_lab_matchup(text,text,integer) to authenticated,service_role;
grant execute on function public.get_admin_battle_lab_matrix(text[],integer) to authenticated,service_role;
grant execute on function public.server_get_economy_health(uuid) to authenticated,service_role;
grant execute on function public.server_get_economy_trend(uuid,integer) to authenticated,service_role;
grant execute on function public.server_capture_economy_snapshot(uuid) to authenticated,service_role;
grant execute on function public.server_refresh_economy_advisor(uuid) to authenticated,service_role;
grant execute on function public.get_admin_feature_flags() to authenticated,service_role;
grant execute on function public.server_admin_set_feature_flag(text,boolean,integer,boolean) to authenticated,service_role;
grant execute on function public.get_admin_feedback(text,integer) to authenticated,service_role;
grant execute on function public.server_admin_update_feedback(uuid,text,text) to authenticated,service_role;
grant execute on function public.get_admin_health_check() to authenticated,service_role;
grant execute on function public.get_admin_recent_errors(integer) to authenticated,service_role;
