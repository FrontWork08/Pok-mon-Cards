-- Bag Pro, Marketplace Pro and Collector Pass server features.

create or replace function public.get_bag_pro_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('bag_pro'); begin
return jsonb_build_object(
 'presets',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'filters',p.filters,'sortMode',p.sort_mode,'updatedAt',p.updated_at) order by p.updated_at desc) from public.bag_pro_presets p where p.player_id=v_player),'[]'::jsonb),
 'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'icon',f.icon,'count',(select count(*) from public.bag_pro_folder_cards fc where fc.folder_id=f.id),'updatedAt',f.updated_at) order by f.updated_at desc) from public.bag_pro_folders f where f.player_id=v_player),'[]'::jsonb),
 'sortModes',jsonb_build_array('recent','name','value','damage','hp','quantity','rarity'));
end; $$;

create or replace function public.save_bag_pro_preset(p_id uuid,p_name text,p_filters jsonb,p_sort_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('bag_pro'); v_id uuid; begin
 if char_length(btrim(coalesce(p_name,'')))<1 or char_length(btrim(coalesce(p_name,'')))>40 then raise exception 'INVALID_NAME'; end if;
 if coalesce(p_sort_mode,'') not in ('recent','name','value','damage','hp','quantity','rarity') then raise exception 'INVALID_SORT_MODE'; end if;
 if p_id is null then
   if (select count(*) from public.bag_pro_presets where player_id=v_player)>=30 then raise exception 'PRESET_LIMIT_REACHED'; end if;
   insert into public.bag_pro_presets(player_id,name,filters,sort_mode) values(v_player,btrim(p_name),coalesce(p_filters,'{}'::jsonb),p_sort_mode) returning id into v_id;
 else
   update public.bag_pro_presets set name=btrim(p_name),filters=coalesce(p_filters,'{}'::jsonb),sort_mode=p_sort_mode,updated_at=now() where id=p_id and player_id=v_player returning id into v_id;
   if v_id is null then raise exception 'PRESET_NOT_FOUND'; end if;
 end if;
 return jsonb_build_object('id',v_id,'ok',true);
end; $$;

create or replace function public.delete_bag_pro_preset(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$ declare v_player uuid:=private.require_gamepass('bag_pro'); begin delete from public.bag_pro_presets where id=p_id and player_id=v_player; return found; end; $$;

create or replace function public.create_bag_pro_folder(p_name text,p_icon text default 'folder')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('bag_pro'); v_id uuid; begin
 if char_length(btrim(coalesce(p_name,'')))<1 or char_length(btrim(coalesce(p_name,'')))>40 then raise exception 'INVALID_NAME'; end if;
 if (select count(*) from public.bag_pro_folders where player_id=v_player)>=30 then raise exception 'FOLDER_LIMIT_REACHED'; end if;
 insert into public.bag_pro_folders(player_id,name,icon) values(v_player,btrim(p_name),left(coalesce(nullif(btrim(p_icon),''),'folder'),30)) returning id into v_id; return v_id;
end; $$;

create or replace function public.delete_bag_pro_folder(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$ declare v_player uuid:=private.require_gamepass('bag_pro'); begin delete from public.bag_pro_folders where id=p_id and player_id=v_player; return found; end; $$;

create or replace function public.set_bag_pro_folder_card(p_folder_id uuid,p_card_id text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('bag_pro'); begin
 if not exists(select 1 from public.bag_pro_folders where id=p_folder_id and player_id=v_player) then raise exception 'FOLDER_NOT_FOUND'; end if;
 if not exists(select 1 from public.player_cards where player_id=v_player and card_id=p_card_id and quantity>0) then raise exception 'CARD_NOT_OWNED'; end if;
 if coalesce(p_enabled,false) then insert into public.bag_pro_folder_cards(folder_id,player_id,card_id) values(p_folder_id,v_player,p_card_id) on conflict do nothing;
 else delete from public.bag_pro_folder_cards where folder_id=p_folder_id and player_id=v_player and card_id=p_card_id; end if;
 return jsonb_build_object('folderId',p_folder_id,'cardId',p_card_id,'enabled',coalesce(p_enabled,false));
end; $$;

create or replace function public.get_bag_pro_folder_cards(p_folder_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('bag_pro'); begin
 if not exists(select 1 from public.bag_pro_folders where id=p_folder_id and player_id=v_player) then raise exception 'FOLDER_NOT_FOUND'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.pokemon_name,'setName',c.set_name,'rarity',c.rarity,'image',coalesce(c.image_small,c.image_large),'marketPriceUsd',c.market_price_usd,'quantity',pc.quantity) order by c.pokemon_name) from public.bag_pro_folder_cards fc join public.cards c on c.id=fc.card_id join public.player_cards pc on pc.player_id=v_player and pc.card_id=fc.card_id where fc.folder_id=p_folder_id and fc.player_id=v_player),'[]'::jsonb);
end; $$;

create or replace function public.get_marketplace_pro_dashboard(p_card_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('marketplace_pro'); begin
return jsonb_build_object(
 'watches',coalesce((select jsonb_agg(jsonb_build_object('cardId',w.card_id,'name',c.pokemon_name,'setName',c.set_name,'image',coalesce(c.image_small,c.image_large),'marketPriceUsd',c.market_price_usd,'targetPriceUsd',w.target_price_usd,'targetListingCoins',w.target_listing_coins,'notifyBelow',w.notify_below,'updatedAt',w.updated_at) order by w.updated_at desc) from public.marketplace_pro_watches w join public.cards c on c.id=w.card_id where w.player_id=v_player),'[]'::jsonb),
 'seller',jsonb_build_object('activeListings',(select count(*) from public.market_listings m where m.seller_id=v_player and m.status='active'),'soldListings',(select count(*) from public.market_listings m where m.seller_id=v_player and m.status='sold'),'grossCoins',coalesce((select sum(m.gross_coins) from private.market_fee_log m where m.seller_id=v_player),0),'netCoins',coalesce((select sum(m.seller_net_coins) from private.market_fee_log m where m.seller_id=v_player),0)),
 'selectedCard',case when p_card_id is null then null else (select jsonb_build_object(
   'cardId',c.id,'name',c.pokemon_name,'setName',c.set_name,'image',coalesce(c.image_small,c.image_large),'marketPriceUsd',c.market_price_usd,
   'priceHistory',coalesce((select jsonb_agg(jsonb_build_object('priceUsd',h.price_usd,'recordedAt',h.recorded_at) order by h.recorded_at) from (select price_usd,recorded_at from public.card_market_price_history where card_id=c.id order by recorded_at desc limit 365) h),'[]'::jsonb),
   'listingStats',(select jsonb_build_object('count',count(*),'minCoins',min(m.unit_price_coins),'avgCoins',round(avg(m.unit_price_coins)),'maxCoins',max(m.unit_price_coins)) from public.market_listings m where m.card_id=c.id and m.status='active'),
   'recommendedCoins',(select case when count(*)=0 then null else greatest(1::numeric,round(avg(m.unit_price_coins)*0.98))::bigint end from public.market_listings m where m.card_id=c.id and m.status='active')
 ) from public.cards c where c.id=p_card_id) end);
end; $$;

create or replace function public.set_marketplace_pro_watch(p_card_id text,p_target_price_usd numeric,p_target_listing_coins bigint,p_enabled boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('marketplace_pro'); begin
 if not exists(select 1 from public.cards where id=p_card_id) then raise exception 'CARD_NOT_FOUND'; end if;
 if coalesce(p_enabled,false) then
   if (select count(*) from public.marketplace_pro_watches where player_id=v_player and card_id<>p_card_id)>=100 then raise exception 'WATCH_LIMIT_REACHED'; end if;
   insert into public.marketplace_pro_watches(player_id,card_id,target_price_usd,target_listing_coins,updated_at) values(v_player,p_card_id,p_target_price_usd,p_target_listing_coins,now()) on conflict(player_id,card_id) do update set target_price_usd=excluded.target_price_usd,target_listing_coins=excluded.target_listing_coins,updated_at=now();
 else delete from public.marketplace_pro_watches where player_id=v_player and card_id=p_card_id; end if;
 return jsonb_build_object('cardId',p_card_id,'enabled',coalesce(p_enabled,false));
end; $$;

create or replace function public.get_collector_pass_dashboard()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('collector_pass'); v_unique bigint; v_value numeric; begin
 select count(*),coalesce(sum(pc.quantity*coalesce(c.market_price_usd,0)),0) into v_unique,v_value from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0;
 return jsonb_build_object(
  'summary',jsonb_build_object('uniqueCards',v_unique,'collectionValueUsd',v_value,'totalCopies',(select coalesce(sum(quantity),0) from public.player_cards where player_id=v_player and quantity>0)),
  'bySet',coalesce((select jsonb_agg(jsonb_build_object('setId',x.set_id,'setName',x.set_name,'owned',x.owned,'total',x.total,'percent',case when x.total>0 then round(x.owned*100.0/x.total,1) else 0 end,'missing',greatest(x.total-x.owned,0)) order by (x.owned*1.0/nullif(x.total,0)) desc nulls last,x.total desc) from (select c.set_id,max(c.set_name) set_name,count(distinct c.id) total,count(distinct pc.card_id) filter(where pc.quantity>0) owned from public.cards c left join public.player_cards pc on pc.card_id=c.id and pc.player_id=v_player group by c.set_id order by count(distinct c.id) desc limit 120) x),'[]'::jsonb),
  'byType',coalesce((select jsonb_agg(jsonb_build_object('type',x.type,'owned',x.owned,'copies',x.copies) order by x.owned desc) from (select t.type,count(distinct pc.card_id) owned,coalesce(sum(pc.quantity),0) copies from public.player_cards pc join public.cards c on c.id=pc.card_id cross join lateral unnest(coalesce(c.types,array[]::text[])) t(type) where pc.player_id=v_player and pc.quantity>0 group by t.type) x),'[]'::jsonb),
  'nearCompleteSets',coalesce((select jsonb_agg(jsonb_build_object('setId',x.set_id,'setName',x.set_name,'owned',x.owned,'total',x.total,'missing',x.total-x.owned,'percent',round(x.owned*100.0/nullif(x.total,0),1)) order by (x.total-x.owned),x.total desc) from (select c.set_id,max(c.set_name) set_name,count(distinct c.id) total,count(distinct pc.card_id) filter(where pc.quantity>0) owned from public.cards c left join public.player_cards pc on pc.card_id=c.id and pc.player_id=v_player group by c.set_id) x where x.owned>0 and x.owned<x.total and x.total-x.owned<=25 limit 20),'[]'::jsonb),
  'goals',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'kind',g.kind,'key',g.goal_key,'label',g.label,'target',g.target,'progress',case when g.kind='unique' then v_unique when g.kind='value' then v_value when g.kind='set' then (select count(distinct pc.card_id) from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 and c.set_id=g.goal_key) when g.kind='type' then (select count(distinct pc.card_id) from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 and g.goal_key=any(coalesce(c.types,array[]::text[]))) else 0 end,'updatedAt',g.updated_at) order by g.updated_at desc) from public.collector_pro_goals g where g.player_id=v_player),'[]'::jsonb));
end; $$;

create or replace function public.save_collector_pro_goal(p_id uuid,p_kind text,p_key text,p_label text,p_target numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_player uuid:=private.require_gamepass('collector_pass'); v_id uuid; begin
 if p_kind not in ('set','type','unique','value') then raise exception 'INVALID_GOAL_KIND'; end if;
 if char_length(btrim(coalesce(p_label,'')))<1 or char_length(btrim(coalesce(p_label,'')))>60 or coalesce(p_target,0)<=0 then raise exception 'INVALID_GOAL'; end if;
 if p_id is null then
   if (select count(*) from public.collector_pro_goals where player_id=v_player)>=20 then raise exception 'GOAL_LIMIT_REACHED'; end if;
   insert into public.collector_pro_goals(player_id,kind,goal_key,label,target) values(v_player,p_kind,coalesce(p_key,''),btrim(p_label),p_target) returning id into v_id;
 else
   update public.collector_pro_goals set kind=p_kind,goal_key=coalesce(p_key,''),label=btrim(p_label),target=p_target,updated_at=now() where id=p_id and player_id=v_player returning id into v_id;
   if v_id is null then raise exception 'GOAL_NOT_FOUND'; end if;
 end if; return v_id;
end; $$;

create or replace function public.delete_collector_pro_goal(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$ declare v_player uuid:=private.require_gamepass('collector_pass'); begin delete from public.collector_pro_goals where id=p_id and player_id=v_player; return found; end; $$;

revoke all on function public.get_bag_pro_dashboard() from public,anon; grant execute on function public.get_bag_pro_dashboard() to authenticated;
revoke all on function public.save_bag_pro_preset(uuid,text,jsonb,text) from public,anon; grant execute on function public.save_bag_pro_preset(uuid,text,jsonb,text) to authenticated;
revoke all on function public.delete_bag_pro_preset(uuid) from public,anon; grant execute on function public.delete_bag_pro_preset(uuid) to authenticated;
revoke all on function public.create_bag_pro_folder(text,text) from public,anon; grant execute on function public.create_bag_pro_folder(text,text) to authenticated;
revoke all on function public.delete_bag_pro_folder(uuid) from public,anon; grant execute on function public.delete_bag_pro_folder(uuid) to authenticated;
revoke all on function public.set_bag_pro_folder_card(uuid,text,boolean) from public,anon; grant execute on function public.set_bag_pro_folder_card(uuid,text,boolean) to authenticated;
revoke all on function public.get_bag_pro_folder_cards(uuid) from public,anon; grant execute on function public.get_bag_pro_folder_cards(uuid) to authenticated;
revoke all on function public.get_marketplace_pro_dashboard(text) from public,anon; grant execute on function public.get_marketplace_pro_dashboard(text) to authenticated;
revoke all on function public.set_marketplace_pro_watch(text,numeric,bigint,boolean) from public,anon; grant execute on function public.set_marketplace_pro_watch(text,numeric,bigint,boolean) to authenticated;
revoke all on function public.get_collector_pass_dashboard() from public,anon; grant execute on function public.get_collector_pass_dashboard() to authenticated;
revoke all on function public.save_collector_pro_goal(uuid,text,text,text,numeric) from public,anon; grant execute on function public.save_collector_pro_goal(uuid,text,text,text,numeric) to authenticated;
revoke all on function public.delete_collector_pro_goal(uuid) from public,anon; grant execute on function public.delete_collector_pro_goal(uuid) to authenticated;
