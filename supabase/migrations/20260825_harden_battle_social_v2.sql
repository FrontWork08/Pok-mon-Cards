-- Follow-up hardening after Supabase advisors.
create index if not exists player_daily_battle_species_card_idx on public.player_daily_battle_species(card_id);

drop policy if exists catalog_refresh_deny_clients on public.catalog_refresh_state;
create policy catalog_refresh_deny_clients on public.catalog_refresh_state for all to anon,authenticated using(false) with check(false);

create or replace function public.battle_rarity_bonus(p_rarity text)
returns numeric language plpgsql immutable set search_path=public as $$
declare s text:=lower(coalesce(p_rarity,''));
begin
  if s like '%hyper%' or s like '%secret%' then return 18;end if;
  if s like '%special illustration%' then return 16;end if;
  if s like '%ultra%' then return 14;end if;
  if s like '%illustration%' then return 12;end if;
  if s like '%double rare%' then return 10;end if;
  if s like '%rare%' or s like '%holo%' then return 7;end if;
  if s like '%uncommon%' then return 3;end if;
  return 0;
end $$;

create or replace function public.get_my_conversation_summaries()
returns table(conversation_id uuid,friend_id uuid,friend_username text,friend_level integer,last_body text,last_kind text,last_metadata jsonb,last_created_at timestamptz,unread_count bigint)
language sql security invoker set search_path=public as $$
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
revoke all on function public.get_my_conversation_summaries() from public,anon;
grant execute on function public.get_my_conversation_summaries() to authenticated;

create or replace function public.server_expire_battle_invites(p_max_age interval default interval '15 minutes')
returns integer language plpgsql security definer set search_path=public as $$
declare r battles%rowtype;v_count integer:=0;
begin
  for r in select * from battles where status='invited' and created_at<now()-p_max_age order by created_at asc limit 100 for update skip locked loop
    if r.stake_type='card' then perform server_return_card_stakes(r.id);end if;
    update battles set status='cancelled',updated_at=now() where id=r.id and status='invited';
    if found then
      insert into battle_events(battle_id,event_type,payload) values(r.id,'invite_expired',jsonb_build_object('maxAge',p_max_age::text));
      perform server_queue_notification(r.challenger_id,'battle_expired','Desafio expirado','O desafio não foi aceito a tempo. Qualquer aposta em escrow foi devolvida.',jsonb_build_object('battleId',r.id));
      v_count:=v_count+1;
    end if;
  end loop;return v_count;
end $$;

create or replace function public.server_background_tick()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_battles integer;v_expired integer;v_push integer;v_catalog jsonb;
begin
  v_expired:=server_expire_battle_invites();v_battles:=server_process_expired_battles();v_push:=server_dispatch_push_notifications();
  if exists(select 1 from catalog_refresh_state where job_name='full_tcg_refresh' and status='running') then begin v_catalog:=server_refresh_catalog_batch(2);exception when others then v_catalog:=jsonb_build_object('error',sqlerrm);end;else v_catalog:=jsonb_build_object('status','idle');end if;
  return jsonb_build_object('expiredInvites',v_expired,'battles',v_battles,'pushes',v_push,'catalog',v_catalog,'at',now());
end $$;

revoke all on function public.server_expire_battle_invites(interval) from public,anon,authenticated;
grant execute on function public.server_expire_battle_invites(interval) to service_role;
