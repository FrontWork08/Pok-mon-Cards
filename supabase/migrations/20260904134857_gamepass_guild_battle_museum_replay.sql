-- Guild Pro, Battle Style Pass, Museum Pro and Replay Pro server features.

create or replace function public.get_guild_pro_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('guild_pro'); v_guild text; v_base_role text; begin
 select guild_id,role into v_guild,v_base_role from public.guild_members where player_id=v_player;
 if v_guild is null then raise exception 'GUILD_REQUIRED'; end if;
 return jsonb_build_object(
  'guild',(select jsonb_build_object('id',g.id,'name',g.name,'color',g.color,'motto',g.motto,'level',g.level,'xp',g.xp,'baseRole',v_base_role) from public.guilds g where g.id=v_guild),
  'settings',coalesce((select jsonb_build_object('accentColor',s.accent_color,'badge',s.badge,'announcement',s.announcement,'updatedAt',s.updated_at) from public.guild_pro_settings s where s.guild_id=v_guild),jsonb_build_object('accentColor','#FFD447','badge','PRO','announcement','')),
  'members',coalesce((select jsonb_agg(jsonb_build_object('playerId',gm.player_id,'username',p.username,'baseRole',gm.role,'proRole',gr.role_key,'joinedAt',gm.joined_at) order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end,p.username) from public.guild_members gm join public.players p on p.id=gm.player_id left join public.guild_pro_member_roles gr on gr.guild_id=gm.guild_id and gr.player_id=gm.player_id where gm.guild_id=v_guild),'[]'::jsonb),
  'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorId',a.actor_id,'actorUsername',ap.username,'targetId',a.target_id,'targetUsername',tp.username,'metadata',a.metadata,'createdAt',a.created_at) order by a.created_at desc) from (select * from public.guild_pro_audit_log where guild_id=v_guild order by created_at desc limit 100) a left join public.players ap on ap.id=a.actor_id left join public.players tp on tp.id=a.target_id),'[]'::jsonb),
  'roleOptions',jsonb_build_array('strategist','recruiter','collector','defender','event_lead','market_lead'),
  'canManage',v_base_role in ('leader','officer'));
end; $$;

create or replace function public.set_guild_pro_member_role(p_target_id uuid,p_role_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('guild_pro'); v_guild text; v_role text; begin
 select guild_id,role into v_guild,v_role from public.guild_members where player_id=v_player;
 if v_guild is null then raise exception 'GUILD_REQUIRED'; end if;
 if v_role not in ('leader','officer') then raise exception 'GUILD_MANAGER_REQUIRED'; end if;
 if not exists(select 1 from public.guild_members where player_id=p_target_id and guild_id=v_guild) then raise exception 'TARGET_NOT_IN_GUILD'; end if;
 if p_role_key is null or btrim(p_role_key)='' then
  delete from public.guild_pro_member_roles where guild_id=v_guild and player_id=p_target_id;
  insert into public.guild_pro_audit_log(guild_id,actor_id,action,target_id,metadata) values(v_guild,v_player,'clear_pro_role',p_target_id,'{}'::jsonb);
 else
  if p_role_key not in ('strategist','recruiter','collector','defender','event_lead','market_lead') then raise exception 'INVALID_PRO_ROLE'; end if;
  insert into public.guild_pro_member_roles(guild_id,player_id,role_key,assigned_by,updated_at) values(v_guild,p_target_id,p_role_key,v_player,now()) on conflict(guild_id,player_id) do update set role_key=excluded.role_key,assigned_by=excluded.assigned_by,updated_at=now();
  insert into public.guild_pro_audit_log(guild_id,actor_id,action,target_id,metadata) values(v_guild,v_player,'set_pro_role',p_target_id,jsonb_build_object('role',p_role_key));
 end if;
 return jsonb_build_object('targetId',p_target_id,'role',nullif(btrim(coalesce(p_role_key,'')),''));
end; $$;

create or replace function public.save_guild_pro_settings(p_accent_color text,p_badge text,p_announcement text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('guild_pro'); v_guild text; v_role text; begin
 select guild_id,role into v_guild,v_role from public.guild_members where player_id=v_player;
 if v_guild is null then raise exception 'GUILD_REQUIRED'; end if;
 if v_role not in ('leader','officer') then raise exception 'GUILD_MANAGER_REQUIRED'; end if;
 if coalesce(p_accent_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'INVALID_COLOR'; end if;
 insert into public.guild_pro_settings(guild_id,accent_color,badge,announcement,updated_by,updated_at) values(v_guild,p_accent_color,left(coalesce(p_badge,''),16),left(coalesce(p_announcement,''),180),v_player,now()) on conflict(guild_id) do update set accent_color=excluded.accent_color,badge=excluded.badge,announcement=excluded.announcement,updated_by=v_player,updated_at=now();
 insert into public.guild_pro_audit_log(guild_id,actor_id,action,metadata) values(v_guild,v_player,'update_pro_identity',jsonb_build_object('accentColor',p_accent_color,'badge',left(coalesce(p_badge,''),16),'announcement',left(coalesce(p_announcement,''),180)));
 return jsonb_build_object('accentColor',p_accent_color,'badge',left(coalesce(p_badge,''),16),'announcement',left(coalesce(p_announcement,''),180));
end; $$;

create or replace function public.get_my_battle_style()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=auth.uid(); v_has boolean; begin
 if v_player is null then raise exception 'UNAUTHORIZED'; end if;
 v_has:=private.player_has_gamepass(v_player,'battle_style_pass');
 return jsonb_build_object('active',v_has,'style',coalesce((select jsonb_build_object('arenaStyle',s.arena_style,'entranceFx',s.entrance_fx,'switchFx',s.switch_fx,'updatedAt',s.updated_at) from public.player_battle_styles s where s.player_id=v_player),jsonb_build_object('arenaStyle','classic','entranceFx','flash','switchFx','pulse')));
end; $$;

create or replace function public.set_my_battle_style(p_arena_style text,p_entrance_fx text,p_switch_fx text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('battle_style_pass'); begin
 if p_arena_style not in ('classic','kanto_night','neon_grid','champion_gold','galaxy_void') then raise exception 'INVALID_ARENA_STYLE'; end if;
 if p_entrance_fx not in ('flash','scan','spark','warp','none') then raise exception 'INVALID_ENTRANCE_FX'; end if;
 if p_switch_fx not in ('pulse','slide','spark','warp','none') then raise exception 'INVALID_SWITCH_FX'; end if;
 insert into public.player_battle_styles(player_id,arena_style,entrance_fx,switch_fx,updated_at) values(v_player,p_arena_style,p_entrance_fx,p_switch_fx,now()) on conflict(player_id) do update set arena_style=excluded.arena_style,entrance_fx=excluded.entrance_fx,switch_fx=excluded.switch_fx,updated_at=now();
 return jsonb_build_object('arenaStyle',p_arena_style,'entranceFx',p_entrance_fx,'switchFx',p_switch_fx);
end; $$;

create or replace function public.get_museum_pro_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('museum_pro'); begin
 return jsonb_build_object(
  'summary',jsonb_build_object(
   'uniqueCards',(select count(*) from public.player_cards where player_id=v_player and quantity>0),
   'totalCopies',(select coalesce(sum(quantity),0) from public.player_cards where player_id=v_player and quantity>0),
   'collectionValueUsd',(select coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0) from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0),
   'packsOpened',(select count(*) from public.pack_openings where player_id=v_player),
   'battlesPlayed',(select count(*) from public.battles where challenger_id=v_player or opponent_id=v_player),
   'wins',(select count(*) from public.battles where winner_id=v_player),
   'tradesCompleted',(select count(*) from public.trades where status='completed' and (sender_id=v_player or receiver_id=v_player))),
  'topCards',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.pokemon_name,'setName',x.set_name,'rarity',x.rarity,'image',coalesce(x.image_large,x.image_small),'marketPriceUsd',x.market_price_usd,'quantity',x.quantity) order by x.market_price_usd desc nulls last) from (select c.id,c.pokemon_name,c.set_name,c.rarity,c.image_large,c.image_small,c.market_price_usd,pc.quantity from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 order by c.market_price_usd desc nulls last limit 20) x),'[]'::jsonb),
  'rarities',coalesce((select jsonb_agg(jsonb_build_object('rarity',x.rarity,'unique',x.unique_count,'copies',x.copies) order by x.unique_count desc) from (select coalesce(c.rarity,'Sem raridade') rarity,count(*) unique_count,sum(pc.quantity) copies from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 group by coalesce(c.rarity,'Sem raridade') order by count(*) desc limit 20) x),'[]'::jsonb),
  'sets',coalesce((select jsonb_agg(jsonb_build_object('setId',x.set_id,'setName',x.set_name,'owned',x.owned,'valueUsd',x.value_usd) order by x.value_usd desc) from (select c.set_id,max(c.set_name) set_name,count(distinct c.id) owned,sum(pc.quantity*coalesce(c.market_price_usd,0)) value_usd from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 group by c.set_id order by value_usd desc limit 15) x),'[]'::jsonb),
  'activityByMonth',coalesce((select jsonb_agg(jsonb_build_object('month',x.month_label,'packs',x.packs,'battles',x.battles) order by x.month_start) from (with months as (select date_trunc('month',now())-(i||' months')::interval as month_start from generate_series(11,0,-1) i) select m.month_start,to_char(m.month_start,'YYYY-MM') as month_label,(select count(*) from public.pack_openings p where p.player_id=v_player and date_trunc('month',p.opened_at)=m.month_start) as packs,(select count(*) from public.battles b where (b.challenger_id=v_player or b.opponent_id=v_player) and date_trunc('month',b.created_at)=m.month_start) as battles from months m) x),'[]'::jsonb),
  'displayCards',coalesce((select jsonb_agg(jsonb_build_object('slot',pm.slot,'id',c.id,'name',c.pokemon_name,'image',coalesce(c.image_large,c.image_small),'rarity',c.rarity,'marketPriceUsd',c.market_price_usd) order by pm.slot) from public.player_museum_cards pm join public.cards c on c.id=pm.card_id where pm.player_id=v_player),'[]'::jsonb));
end; $$;

create or replace function private.replay_pro_battle_summary(p_player uuid,p_battle uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'createdAt',b.created_at,'mode',b.mode,'ranked',b.is_ranked,'won',b.winner_id=p_player,
  'myScore',case when b.challenger_id=p_player then b.challenger_score else b.opponent_score end,
  'opponentScore',case when b.challenger_id=p_player then b.opponent_score else b.challenger_score end,
  'ratingBefore',case when b.challenger_id=p_player then b.challenger_rating_before else b.opponent_rating_before end,
  'ratingAfter',case when b.challenger_id=p_player then b.challenger_rating_after else b.opponent_rating_after end,
  'rounds',(select count(*) from public.battle_rounds r where r.battle_id=b.id),
  'opponentUsername',(select p.username from public.players p where p.id=case when b.challenger_id=p_player then b.opponent_id else b.challenger_id end))
 from public.battles b where b.id=p_battle;
$$;
revoke all on function private.replay_pro_battle_summary(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_replay_pro_dashboard(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('replay_pro'); v_limit integer:=greatest(1,least(coalesce(p_limit,100),200)); begin
 return jsonb_build_object(
  'limit',v_limit,
  'battles',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'mode',x.mode,'status',x.status,'ranked',x.is_ranked,'engineVersion',x.engine_version,'createdAt',x.created_at,'completedAt',x.completed_at,'winnerId',x.winner_id,'won',x.winner_id=v_player,'opponentId',x.opponent_id_resolved,'opponentUsername',x.opponent_username,'myScore',x.my_score,'opponentScore',x.opponent_score,'ratingBefore',x.rating_before,'ratingAfter',x.rating_after,'rounds',x.round_count,'favorite',x.favorite,'label',x.label,'notes',x.notes) order by x.created_at desc) from (select b.id,b.mode,b.status,b.is_ranked,b.engine_version,b.created_at,b.completed_at,b.winner_id,case when b.challenger_id=v_player then b.opponent_id else b.challenger_id end opponent_id_resolved,op.username opponent_username,case when b.challenger_id=v_player then b.challenger_score else b.opponent_score end my_score,case when b.challenger_id=v_player then b.opponent_score else b.challenger_score end opponent_score,case when b.challenger_id=v_player then b.challenger_rating_before else b.opponent_rating_before end rating_before,case when b.challenger_id=v_player then b.challenger_rating_after else b.opponent_rating_after end rating_after,(select count(*) from public.battle_rounds r where r.battle_id=b.id) round_count,(f.battle_id is not null) favorite,coalesce(f.label,'') label,coalesce(f.notes,'') notes from public.battles b left join public.players op on op.id=case when b.challenger_id=v_player then b.opponent_id else b.challenger_id end left join public.replay_pro_favorites f on f.player_id=v_player and f.battle_id=b.id where b.challenger_id=v_player or b.opponent_id=v_player order by b.created_at desc limit v_limit) x),'[]'::jsonb),
  'favorites',(select count(*) from public.replay_pro_favorites where player_id=v_player),
  'summary',jsonb_build_object('total',(select count(*) from public.battles where challenger_id=v_player or opponent_id=v_player),'wins',(select count(*) from public.battles where winner_id=v_player),'ranked',(select count(*) from public.battles where is_ranked and (challenger_id=v_player or opponent_id=v_player))));
end; $$;

create or replace function public.set_replay_pro_favorite(p_battle_id uuid,p_favorite boolean,p_label text default '',p_notes text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('replay_pro'); begin
 if not exists(select 1 from public.battles where id=p_battle_id and (challenger_id=v_player or opponent_id=v_player)) then raise exception 'BATTLE_NOT_FOUND'; end if;
 if coalesce(p_favorite,false) then
  if (select count(*) from public.replay_pro_favorites where player_id=v_player and battle_id<>p_battle_id)>=100 then raise exception 'FAVORITE_LIMIT_REACHED'; end if;
  insert into public.replay_pro_favorites(player_id,battle_id,label,notes,updated_at) values(v_player,p_battle_id,left(coalesce(p_label,''),40),left(coalesce(p_notes,''),240),now()) on conflict(player_id,battle_id) do update set label=excluded.label,notes=excluded.notes,updated_at=now();
 else delete from public.replay_pro_favorites where player_id=v_player and battle_id=p_battle_id; end if;
 return jsonb_build_object('battleId',p_battle_id,'favorite',coalesce(p_favorite,false));
end; $$;

create or replace function public.compare_replay_pro_battles(p_battle_a uuid,p_battle_b uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('replay_pro'); begin
 if not exists(select 1 from public.battles where id=p_battle_a and (challenger_id=v_player or opponent_id=v_player)) or not exists(select 1 from public.battles where id=p_battle_b and (challenger_id=v_player or opponent_id=v_player)) then raise exception 'BATTLE_NOT_FOUND'; end if;
 return jsonb_build_object('a',private.replay_pro_battle_summary(v_player,p_battle_a),'b',private.replay_pro_battle_summary(v_player,p_battle_b));
end; $$;

revoke all on function public.get_guild_pro_dashboard() from public,anon; grant execute on function public.get_guild_pro_dashboard() to authenticated;
revoke all on function public.set_guild_pro_member_role(uuid,text) from public,anon; grant execute on function public.set_guild_pro_member_role(uuid,text) to authenticated;
revoke all on function public.save_guild_pro_settings(text,text,text) from public,anon; grant execute on function public.save_guild_pro_settings(text,text,text) to authenticated;
revoke all on function public.get_my_battle_style() from public,anon; grant execute on function public.get_my_battle_style() to authenticated;
revoke all on function public.set_my_battle_style(text,text,text) from public,anon; grant execute on function public.set_my_battle_style(text,text,text) to authenticated;
revoke all on function public.get_museum_pro_dashboard() from public,anon; grant execute on function public.get_museum_pro_dashboard() to authenticated;
revoke all on function public.get_replay_pro_dashboard(integer) from public,anon; grant execute on function public.get_replay_pro_dashboard(integer) to authenticated;
revoke all on function public.set_replay_pro_favorite(uuid,boolean,text,text) from public,anon; grant execute on function public.set_replay_pro_favorite(uuid,boolean,text,text) to authenticated;
revoke all on function public.compare_replay_pro_battles(uuid,uuid) from public,anon; grant execute on function public.compare_replay_pro_battles(uuid,uuid) to authenticated;
