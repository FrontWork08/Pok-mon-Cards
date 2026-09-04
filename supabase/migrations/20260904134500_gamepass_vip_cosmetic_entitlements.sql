begin;

insert into public.achievement_definitions(id,name,title,description,icon,category,target,sort_order,active,secret)
values('gamepass_trainer_vip','Trainer VIP','Trainer VIP','Título exclusivo para quem possui a Gamepass Trainer VIP.','star','special',1,980,true,true)
on conflict(id) do update set name=excluded.name,title=excluded.title,description=excluded.description,icon=excluded.icon,category=excluded.category,target=excluded.target,sort_order=excluded.sort_order,active=excluded.active,secret=excluded.secret;

insert into public.cosmetic_definitions(id,kind,name,description,icon,primary_color,secondary_color,unlock_type,threshold,unlock_key,sort_order,active) values
('frame_trainer_vip','frame','Moldura Trainer VIP','Moldura exclusiva da Gamepass Trainer VIP.','star','#FFD447','#8B5CFF','gamepass',0,'trainer_vip',980,true),
('bg_trainer_vip','background','Fundo Trainer VIP','Fundo exclusivo da Gamepass Trainer VIP.','sparkles','#15102B','#FFD447','gamepass',0,'trainer_vip',981,true),
('frame_cosmetic_pass_prism','frame','Prisma Premium','Moldura exclusiva do Cosmetic Pass.','color-palette','#55E6FF','#C493FF','gamepass',0,'cosmetic_pass',982,true),
('bg_cosmetic_pass_nebula','background','Nebulosa Premium','Fundo exclusivo do Cosmetic Pass.','planet','#120D2B','#55E6FF','gamepass',0,'cosmetic_pass',983,true),
('frame_cosmetic_pass_crown','frame','Coroa Premium','Segunda moldura exclusiva do Cosmetic Pass.','diamond','#FFD447','#FF667A','gamepass',0,'cosmetic_pass',984,true),
('bg_cosmetic_pass_aurora','background','Aurora Premium','Segundo fundo exclusivo do Cosmetic Pass.','color-wand','#071D2D','#8B5CFF','gamepass',0,'cosmetic_pass',985,true)
on conflict(id) do update set kind=excluded.kind,name=excluded.name,description=excluded.description,icon=excluded.icon,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,unlock_type=excluded.unlock_type,threshold=excluded.threshold,unlock_key=excluded.unlock_key,sort_order=excluded.sort_order,active=excluded.active;

create or replace function public.owner_set_gamepass(p_target_ids uuid[],p_gamepass_id text,p_enabled boolean,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_count integer:=0;
  v_items jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.admin_members where player_id=v_actor and role='owner') then raise exception 'OWNER_ONLY'; end if;
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
$function$;
revoke all on function public.owner_set_gamepass(uuid[],text,boolean,text) from public,anon;
grant execute on function public.owner_set_gamepass(uuid[],text,boolean,text) to authenticated;

commit;
