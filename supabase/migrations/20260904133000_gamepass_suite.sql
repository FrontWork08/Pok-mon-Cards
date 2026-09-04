begin;

alter table public.player_gamepasses drop constraint if exists player_gamepasses_id_check;
alter table public.player_gamepasses add constraint player_gamepasses_id_check check (gamepass_id in (
  'booster_auto_open','booster_auto_plus','trainer_vip','bag_pro','deck_pro','marketplace_pro',
  'collector_pass','cosmetic_pass','guild_pro','battle_style_pass','trainer_profile_plus','lucky_vault',
  'pack_queue','museum_pro','replay_pro','trainer_plus'
));

create table if not exists public.gamepass_catalog (
  id text primary key,
  name text not null,
  description text not null default '',
  icon text not null default 'sparkles',
  category text not null default 'convenience',
  sort_order integer not null default 0,
  active boolean not null default true,
  included_in_trainer_plus boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.gamepass_catalog enable row level security;
drop policy if exists gamepass_catalog_read on public.gamepass_catalog;
create policy gamepass_catalog_read on public.gamepass_catalog for select to authenticated using (active=true);
grant select on public.gamepass_catalog to authenticated;

insert into public.gamepass_catalog(id,name,description,icon,category,sort_order,active,included_in_trainer_plus,metadata) values
('booster_auto_open','Auto Booster','Abre vários boosters de uma vez com custo total confirmado antes da abertura.','flash','booster',10,true,true,jsonb_build_object('benefits',jsonb_build_array('Até 50 boosters por lote','Resumo completo das cartas e gasto'),'route','/auto-open')),
('booster_auto_plus','Auto Booster+','Versão avançada com lotes maiores e parada automática por valor ou raridade.','rocket','booster',20,true,false,jsonb_build_object('benefits',jsonb_build_array('Até 100 boosters por lote','Parar ao encontrar carta acima de um valor','Parar ao atingir uma raridade escolhida'),'route','/auto-open-plus')),
('trainer_vip','Trainer VIP','Identidade VIP permanente com selo, título e destaque visual, sem bônus de combate.','star','identity',30,true,false,jsonb_build_object('benefits',jsonb_build_array('Selo VIP','Título VIP exclusivo','Destaque visual no perfil e áreas sociais'))),
('bag_pro','Bag Pro','Ferramentas avançadas para organizar e reencontrar cartas rapidamente.','albums','collection',40,true,true,jsonb_build_object('benefits',jsonb_build_array('Filtros salvos','Pastas e presets de organização','Ordenações avançadas'),'route','/(tabs)/bag')),
('deck_pro','Deck Pro','Ferramentas extras de criação e manutenção de decks.','layers','battle',50,true,true,jsonb_build_object('benefits',jsonb_build_array('Copiar deck com um toque','Presets e versões de deck','Mais ferramentas de organização'),'route','/decks')),
('marketplace_pro','Marketplace Pro','Recursos avançados de acompanhamento e organização do mercado.','storefront','market',60,true,true,jsonb_build_object('benefits',jsonb_build_array('Alertas e favoritos avançados','Histórico de preço ampliado','Mais ferramentas para anúncios'),'route','/marketplace')),
('collector_pass','Collector Pass','Painel avançado de progresso e estatísticas da coleção.','analytics','collection',70,true,true,jsonb_build_object('benefits',jsonb_build_array('Estatísticas avançadas','Progresso por set e tipo','Metas e recomendações de coleção'),'route','/trainer-insights')),
('cosmetic_pass','Cosmetic Pass','Pacote de personalização visual sem vantagem competitiva.','color-palette','cosmetic',80,true,false,jsonb_build_object('benefits',jsonb_build_array('Cosméticos exclusivos','Efeitos de perfil e carta','Itens visuais de edição limitada'),'route','/cosmetics')),
('guild_pro','Guild Pro','Ferramentas extras para organização de guilda sem bônus de dano.','shield','guild',90,true,false,jsonb_build_object('benefits',jsonb_build_array('Mais opções de cargos','Histórico administrativo ampliado','Personalização extra da guilda'),'route','/guilds')),
('battle_style_pass','Battle Style Pass','Personalização visual da arena e das animações de batalha.','game-controller','cosmetic',100,true,false,jsonb_build_object('benefits',jsonb_build_array('Arenas exclusivas','Efeitos de entrada e troca','Estilos visuais de batalha'),'route','/(tabs)/battle')),
('trainer_profile_plus','Trainer Profile+','Expande a vitrine e a personalização do perfil público.','person-circle','identity',110,true,true,jsonb_build_object('benefits',jsonb_build_array('12 slots de vitrine em vez de 6','Mais destaques de coleção','Personalização ampliada'),'route','/showcase')),
('lucky_vault','Lucky Vault','Controle quando as cargas 2× Lucky serão gastas.','sparkles','booster',120,true,false,jsonb_build_object('benefits',jsonb_build_array('Ativar ou pausar o consumo do 2× Lucky','Preservar cargas para boosters escolhidos'))),
('pack_queue','Pack Queue','Monte uma fila com boosters diferentes e abra em sequência.','list','booster',130,true,true,jsonb_build_object('benefits',jsonb_build_array('Fila com vários boosters','Custo total antes de iniciar','Resumo consolidado ao final'),'route','/pack-queue')),
('museum_pro','Museum Pro','Amplia a apresentação e leitura histórica da coleção.','library','collection',140,true,true,jsonb_build_object('benefits',jsonb_build_array('Painel de museu expandido','Mais destaques históricos','Visão premium da trajetória'),'route','/account-museum')),
('replay_pro','Replay Pro','Ferramentas extras para rever e organizar batalhas antigas.','videocam','battle',150,true,true,jsonb_build_object('benefits',jsonb_build_array('Mais replays salvos','Favoritos e organização','Comparação histórica de batalhas'),'route','/history')),
('trainer_plus','Trainer Plus','Pacote principal de conveniência com vários recursos Pro em uma única ativação.','diamond','bundle',160,true,false,jsonb_build_object('benefits',jsonb_build_array('Auto Booster','Bag Pro','Deck Pro','Marketplace Pro','Collector Pass','Trainer Profile+','Pack Queue','Museum Pro','Replay Pro')))
on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,category=excluded.category,sort_order=excluded.sort_order,active=excluded.active,included_in_trainer_plus=excluded.included_in_trainer_plus,metadata=excluded.metadata;

create or replace function private.player_has_gamepass(p_player uuid,p_gamepass text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    exists(select 1 from public.player_gamepasses g where g.player_id=p_player and g.gamepass_id=p_gamepass and g.active=true)
    or (
      p_gamepass<>'trainer_plus'
      and exists(select 1 from public.player_gamepasses g where g.player_id=p_player and g.gamepass_id='trainer_plus' and g.active=true)
      and exists(select 1 from public.gamepass_catalog c where c.id=p_gamepass and c.active=true and c.included_in_trainer_plus=true)
    );
$function$;
revoke all on function private.player_has_gamepass(uuid,text) from public,anon,authenticated;

create or replace function public.get_my_gamepasses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_owner text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select p.username into v_owner from public.admin_members a join public.players p on p.id=a.player_id where a.role='owner' order by a.created_at limit 1;
  return jsonb_build_object(
    'purchaseMethod','manual_real_money',
    'contactOwnerUsername',v_owner,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.name,'description',c.description,'icon',c.icon,'category',c.category,
        'sortOrder',c.sort_order,'includedInTrainerPlus',c.included_in_trainer_plus,'metadata',c.metadata,
        'activeDirect',exists(select 1 from public.player_gamepasses g where g.player_id=v_player and g.gamepass_id=c.id and g.active=true),
        'active',private.player_has_gamepass(v_player,c.id),
        'viaTrainerPlus',private.player_has_gamepass(v_player,c.id) and not exists(select 1 from public.player_gamepasses g where g.player_id=v_player and g.gamepass_id=c.id and g.active=true)
      ) order by c.sort_order,c.name)
      from public.gamepass_catalog c where c.active=true
    ),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.get_my_gamepasses() from public,anon;
grant execute on function public.get_my_gamepasses() to authenticated;

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

  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'active',coalesce(p_enabled,false)) order by p.username),'[]'::jsonb)
  into v_count,v_items from public.players p where p.id=any(p_target_ids);
  return jsonb_build_object('gamepassId',p_gamepass_id,'enabled',coalesce(p_enabled,false),'recipientCount',v_count,'recipients',v_items);
end;
$function$;
revoke all on function public.owner_set_gamepass(uuid[],text,boolean,text) from public,anon;
grant execute on function public.owner_set_gamepass(uuid[],text,boolean,text) to authenticated;

create or replace function public.owner_list_gamepasses()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.admin_members where player_id=v_actor and role='owner') then raise exception 'OWNER_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'playerId',g.player_id,'username',p.username,'gamepassId',g.gamepass_id,'gamepassName',c.name,'active',g.active,
    'grantedAt',g.granted_at,'updatedAt',g.updated_at,'note',g.note
  ) order by p.username,c.sort_order) from public.player_gamepasses g join public.players p on p.id=g.player_id left join public.gamepass_catalog c on c.id=g.gamepass_id),'[]'::jsonb);
end;
$function$;
revoke all on function public.owner_list_gamepasses() from public,anon;
grant execute on function public.owner_list_gamepasses() to authenticated;

alter table public.player_booster_luck add column if not exists lucky_2x_enabled boolean not null default true;

create or replace function public.set_my_lucky_2x_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_player uuid:=auth.uid(); v_uses integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not private.player_has_gamepass(v_player,'lucky_vault') then raise exception 'LUCKY_VAULT_GAMEPASS_REQUIRED'; end if;
  insert into public.player_booster_luck(player_id,lucky_2x_uses,lucky_2x_enabled,updated_at)
  values(v_player,0,coalesce(p_enabled,true),now())
  on conflict(player_id) do update set lucky_2x_enabled=excluded.lucky_2x_enabled,updated_at=now()
  returning lucky_2x_uses into v_uses;
  return jsonb_build_object('enabled',coalesce(p_enabled,true),'lucky2xUses',coalesce(v_uses,0));
end;
$function$;
revoke all on function public.set_my_lucky_2x_enabled(boolean) from public,anon;
grant execute on function public.set_my_lucky_2x_enabled(boolean) to authenticated;

create or replace function public.get_my_booster_perks()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid(); v_lucky integer:=0; v_lucky_enabled boolean:=true; v_auto boolean:=false; v_plus boolean:=false; v_queue boolean:=false; v_vault boolean:=false; v_owner text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(lucky_2x_uses,0),coalesce(lucky_2x_enabled,true) into v_lucky,v_lucky_enabled from public.player_booster_luck where player_id=v_player;
  v_lucky:=coalesce(v_lucky,0); v_lucky_enabled:=coalesce(v_lucky_enabled,true);
  v_auto:=private.player_has_gamepass(v_player,'booster_auto_open');
  v_plus:=private.player_has_gamepass(v_player,'booster_auto_plus');
  v_queue:=private.player_has_gamepass(v_player,'pack_queue');
  v_vault:=private.player_has_gamepass(v_player,'lucky_vault');
  select p.username into v_owner from public.admin_members a join public.players p on p.id=a.player_id where a.role='owner' order by a.created_at limit 1;
  return jsonb_build_object(
    'lucky2xUses',v_lucky,'lucky2xEnabled',v_lucky_enabled,'luckyVaultGamepass',v_vault,
    'autoOpenGamepass',v_auto,'autoOpenPlusGamepass',v_plus,'packQueueGamepass',v_queue,
    'purchaseMethod','manual_real_money','contactOwnerUsername',v_owner,'maxAutoOpenQuantity',case when v_plus then 100 else 50 end
  );
end;
$function$;
revoke all on function public.get_my_booster_perks() from public,anon;
grant execute on function public.get_my_booster_perks() to authenticated;

create or replace function public.server_idempotent_auto_open_packs_v2(
  p_player_id uuid,p_pack_id uuid,p_quantity integer,p_operation_id uuid,p_stop_min_value numeric default null,p_stop_min_tier integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_scope text; v_saved jsonb; v_result jsonb; v_cards jsonb:='[]'::jsonb; v_i integer; v_lucky integer:=0; v_lucky_enabled boolean:=true;
  v_lucky_used boolean; v_lucky_used_count integer:=0; v_total_coins bigint:=0; v_total_diamonds integer:=0; v_currency text; v_price bigint;
  v_last_coins bigint; v_last_diamonds integer; v_plus boolean:=false; v_max_qty integer:=50; v_opened integer:=0; v_stop boolean:=false;
  v_stop_reason text:=null; v_pack_max_value numeric:=0; v_pack_max_tier integer:=1; v_highest_value numeric:=0; v_highest_tier integer:=1;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  if not private.player_has_gamepass(p_player_id,'booster_auto_open') then raise exception 'AUTO_OPEN_GAMEPASS_REQUIRED'; end if;
  v_plus:=private.player_has_gamepass(p_player_id,'booster_auto_plus');
  v_max_qty:=case when v_plus then 100 else 50 end;
  if p_quantity is null or p_quantity<1 or p_quantity>v_max_qty then raise exception 'INVALID_AUTO_OPEN_QUANTITY'; end if;
  if (p_stop_min_value is not null or p_stop_min_tier is not null) and not v_plus then raise exception 'AUTO_OPEN_PLUS_REQUIRED'; end if;
  if p_stop_min_value is not null and (p_stop_min_value<0 or p_stop_min_value>1000000) then raise exception 'INVALID_STOP_VALUE'; end if;
  if p_stop_min_tier is not null and (p_stop_min_tier<3 or p_stop_min_tier>10) then raise exception 'INVALID_STOP_TIER'; end if;
  if not exists(select 1 from public.packs p where p.id=p_pack_id and p.active=true) then raise exception 'PACK_NOT_FOUND'; end if;

  v_scope:='auto_open_v2:'||p_pack_id::text||':'||p_quantity::text||':'||coalesce(p_stop_min_value::text,'-')||':'||coalesce(p_stop_min_tier::text,'-');
  perform pg_advisory_xact_lock(hashtextextended(p_player_id::text||':'||v_scope||':'||p_operation_id::text,0));
  select response into v_saved from private.idempotency_operations where player_id=p_player_id and scope=v_scope and operation_id=p_operation_id;
  if found then return v_saved; end if;

  insert into public.player_booster_luck(player_id,lucky_2x_uses) values(p_player_id,0) on conflict(player_id) do nothing;
  select lucky_2x_uses,lucky_2x_enabled into v_lucky,v_lucky_enabled from public.player_booster_luck where player_id=p_player_id for update;
  v_lucky_enabled:=coalesce(v_lucky_enabled,true);

  for v_i in 1..p_quantity loop
    v_lucky_used:=v_lucky_enabled and v_lucky>0;
    perform set_config('app.booster_lucky_multiplier',case when v_lucky_used then '2' else '1' end,true);
    v_result:=public.server_open_pack(p_player_id,p_pack_id);
    v_opened:=v_opened+1;
    v_currency:=coalesce(v_result->>'currency','coins'); v_price:=coalesce((v_result->>'pricePaid')::bigint,0);
    if v_currency='diamonds' then v_total_diamonds:=v_total_diamonds+v_price::integer; else v_total_coins:=v_total_coins+v_price; end if;
    v_cards:=v_cards||coalesce(v_result->'cards','[]'::jsonb);
    v_last_coins:=coalesce((v_result->>'coins')::bigint,v_last_coins); v_last_diamonds:=coalesce((v_result->>'diamonds')::integer,v_last_diamonds);
    if v_lucky_used then v_lucky:=v_lucky-1; v_lucky_used_count:=v_lucky_used_count+1; end if;
    update public.pack_openings set pricing_context=coalesce(pricing_context,'{}'::jsonb)||jsonb_build_object(
      'autoOpen',true,'autoOpenPlus',v_plus,'autoOpenBatchId',p_operation_id,'autoOpenIndex',v_i,
      'lucky2xApplied',v_lucky_used,'luckyMultiplier',case when v_lucky_used then 2 else 1 end
    ) where id=nullif(v_result->>'openingId','')::uuid;

    select coalesce(max(coalesce(nullif(e->>'marketPriceUsd','')::numeric,0)),0),coalesce(max(public.rarity_tier(e->>'rarity')),1)
    into v_pack_max_value,v_pack_max_tier from jsonb_array_elements(coalesce(v_result->'cards','[]'::jsonb)) e;
    v_highest_value:=greatest(v_highest_value,coalesce(v_pack_max_value,0)); v_highest_tier:=greatest(v_highest_tier,coalesce(v_pack_max_tier,1));
    if p_stop_min_value is not null and v_pack_max_value>=p_stop_min_value then v_stop:=true; v_stop_reason:='value'; exit; end if;
    if p_stop_min_tier is not null and v_pack_max_tier>=p_stop_min_tier then v_stop:=true; v_stop_reason:='rarity'; exit; end if;
  end loop;

  update public.player_booster_luck set lucky_2x_uses=v_lucky,updated_at=now() where player_id=p_player_id;
  v_saved:=jsonb_build_object(
    'batchId',p_operation_id,'packId',p_pack_id,'quantity',v_opened,'requestedQuantity',p_quantity,'cards',v_cards,
    'totalCoinsSpent',v_total_coins,'totalDiamondsSpent',v_total_diamonds,'coins',v_last_coins,'diamonds',v_last_diamonds,
    'lucky2xUsedCount',v_lucky_used_count,'lucky2xRemaining',v_lucky,'stopTriggered',v_stop,'stopReason',v_stop_reason,
    'highestValueUsd',v_highest_value,'highestRarityTier',v_highest_tier
  );
  insert into private.idempotency_operations(player_id,scope,operation_id,response) values(p_player_id,v_scope,p_operation_id,v_saved);
  return v_saved;
end;
$function$;
revoke all on function public.server_idempotent_auto_open_packs_v2(uuid,uuid,integer,uuid,numeric,integer) from public,anon,authenticated;
grant execute on function public.server_idempotent_auto_open_packs_v2(uuid,uuid,integer,uuid,numeric,integer) to service_role;

alter table public.profile_showcase drop constraint if exists profile_showcase_slot_check;
alter table public.profile_showcase add constraint profile_showcase_slot_check check (slot>=1 and slot<=12);
drop policy if exists "own showcase insert" on public.profile_showcase;
create policy "own showcase insert" on public.profile_showcase for insert to authenticated with check (
  (select auth.uid())=player_id
  and (slot<=6 or private.player_has_gamepass((select auth.uid()),'trainer_profile_plus'))
  and exists(select 1 from public.player_cards pc where pc.player_id=(select auth.uid()) and pc.card_id=profile_showcase.card_id and pc.quantity>0)
);
drop policy if exists "own showcase update" on public.profile_showcase;
create policy "own showcase update" on public.profile_showcase for update to authenticated
using ((select auth.uid())=player_id)
with check (
  (select auth.uid())=player_id
  and (slot<=6 or private.player_has_gamepass((select auth.uid()),'trainer_profile_plus'))
  and exists(select 1 from public.player_cards pc where pc.player_id=(select auth.uid()) and pc.card_id=profile_showcase.card_id and pc.quantity>0)
);

create or replace function public.server_copy_deck(p_player_id uuid,p_deck_id uuid,p_name text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_new_id uuid; v_source public.decks%rowtype; v_name text;
begin
  if auth.role()<>'service_role' then raise exception 'FORBIDDEN'; end if;
  if not private.player_has_gamepass(p_player_id,'deck_pro') then raise exception 'DECK_PRO_GAMEPASS_REQUIRED'; end if;
  select * into v_source from public.decks where id=p_deck_id and player_id=p_player_id;
  if not found then raise exception 'DECK_NOT_FOUND'; end if;
  v_name:=left(coalesce(nullif(trim(p_name),''),v_source.name||' • Cópia'),40);
  insert into public.decks(player_id,name,is_default,style_item_id) values(p_player_id,v_name,false,v_source.style_item_id) returning id into v_new_id;
  insert into public.deck_cards(deck_id,card_id,quantity) select v_new_id,card_id,quantity from public.deck_cards where deck_id=p_deck_id;
  return v_new_id;
end;
$function$;
revoke all on function public.server_copy_deck(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_copy_deck(uuid,uuid,text) to service_role;

commit;
