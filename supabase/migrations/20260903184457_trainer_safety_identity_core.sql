create table if not exists public.player_card_metadata(
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  locked boolean not null default false,
  tags text[] not null default '{}'::text[],
  note text null,
  updated_at timestamptz not null default now(),
  primary key(player_id,card_id),
  constraint player_card_metadata_tags_chk check (
    tags <@ array['team','collection','trade','sell','do_not_sell']::text[]
    and cardinality(tags)<=5
  ),
  constraint player_card_metadata_note_chk check (note is null or char_length(note)<=240)
);
alter table public.player_card_metadata enable row level security;
drop policy if exists player_card_metadata_select_own on public.player_card_metadata;
create policy player_card_metadata_select_own on public.player_card_metadata
for select to authenticated using ((select auth.uid())=player_id);
revoke all on table public.player_card_metadata from anon;
grant select on table public.player_card_metadata to authenticated;

create table if not exists private.economy_ledger(
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  currency text not null check(currency in ('coins','diamonds')),
  amount bigint not null,
  balance_before bigint not null,
  balance_after bigint not null,
  reason text not null default 'system_transaction',
  source_type text null,
  source_id text null,
  operation_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists economy_ledger_player_created_idx on private.economy_ledger(player_id,created_at desc);
create unique index if not exists economy_ledger_operation_currency_uidx
  on private.economy_ledger(player_id,operation_id,currency)
  where operation_id is not null;

create table if not exists private.app_error_log(
  id bigint generated always as identity primary key,
  player_id uuid null references public.players(id) on delete set null,
  source text not null,
  code text null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists app_error_log_created_idx on private.app_error_log(created_at desc);
create index if not exists app_error_log_source_created_idx on private.app_error_log(source,created_at desc);

create or replace function private.card_is_locked(p_player uuid,p_card text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select m.locked from public.player_card_metadata m where m.player_id=p_player and m.card_id=p_card),false);
$$;

create or replace function private.audit_player_currency_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_reason text:=coalesce(nullif(current_setting('trainer.currency_reason',true),''),'system_transaction');
  v_source_type text:=nullif(current_setting('trainer.currency_source_type',true),'');
  v_source_id text:=nullif(current_setting('trainer.currency_source_id',true),'');
  v_operation uuid;
begin
  begin v_operation:=nullif(current_setting('trainer.operation_id',true),'')::uuid;
  exception when others then v_operation:=null; end;
  if new.coins is distinct from old.coins then
    insert into private.economy_ledger(player_id,currency,amount,balance_before,balance_after,reason,source_type,source_id,operation_id)
    values(new.id,'coins',new.coins-old.coins,old.coins,new.coins,v_reason,v_source_type,v_source_id,v_operation)
    on conflict do nothing;
  end if;
  if new.diamonds is distinct from old.diamonds then
    insert into private.economy_ledger(player_id,currency,amount,balance_before,balance_after,reason,source_type,source_id,operation_id)
    values(new.id,'diamonds',new.diamonds-old.diamonds,old.diamonds,new.diamonds,v_reason,v_source_type,v_source_id,v_operation)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists audit_player_currency_change on public.players;
create trigger audit_player_currency_change after update of coins,diamonds on public.players
for each row execute function private.audit_player_currency_change();

insert into private.economy_ledger(player_id,currency,amount,balance_before,balance_after,reason,source_type,source_id)
select p.id,'coins',0,p.coins,p.coins,'ledger_baseline','migration','trainer_safety_identity_core'
from public.players p
where not exists(select 1 from private.economy_ledger l where l.player_id=p.id and l.currency='coins' and l.reason='ledger_baseline');
insert into private.economy_ledger(player_id,currency,amount,balance_before,balance_after,reason,source_type,source_id)
select p.id,'diamonds',0,p.diamonds,p.diamonds,'ledger_baseline','migration','trainer_safety_identity_core'
from public.players p
where not exists(select 1 from private.economy_ledger l where l.player_id=p.id and l.currency='diamonds' and l.reason='ledger_baseline');

create or replace function public.set_my_card_metadata(p_card_id text,p_locked boolean default null,p_tags text[] default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());v_locked boolean;v_tags text[];v_note text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.player_cards where player_id=v_player and card_id=p_card_id and quantity>0) then raise exception 'CARD_NOT_OWNED'; end if;
  if coalesce(p_locked,false) and not private.card_is_locked(v_player,p_card_id) then
    if exists(select 1 from public.market_listings where seller_id=v_player and card_id=p_card_id and status='active')
      or exists(select 1 from public.trade_cards tc join public.trades t on t.id=tc.trade_id where tc.owner_id=v_player and tc.card_id=p_card_id and t.status='pending')
      or exists(select 1 from public.battle_card_stakes s join public.battles b on b.id=s.battle_id where s.player_id=v_player and s.card_id=p_card_id and s.status='held' and b.status not in ('completed','cancelled','declined'))
    then raise exception 'CARD_BUSY'; end if;
  end if;
  select coalesce(m.locked,false),coalesce(m.tags,'{}'::text[]),m.note into v_locked,v_tags,v_note
  from public.player_card_metadata m where m.player_id=v_player and m.card_id=p_card_id;
  v_locked:=coalesce(p_locked,v_locked,false);
  v_tags:=case when p_tags is null then coalesce(v_tags,'{}'::text[]) else array(select distinct x from unnest(p_tags) x order by x) end;
  v_note:=case when p_note is null then v_note else nullif(btrim(p_note),'') end;
  if not (v_tags <@ array['team','collection','trade','sell','do_not_sell']::text[]) or cardinality(v_tags)>5 then raise exception 'INVALID_CARD_TAGS'; end if;
  if v_note is not null and char_length(v_note)>240 then raise exception 'CARD_NOTE_TOO_LONG'; end if;
  insert into public.player_card_metadata(player_id,card_id,locked,tags,note,updated_at)
  values(v_player,p_card_id,v_locked,v_tags,v_note,now())
  on conflict(player_id,card_id) do update set locked=excluded.locked,tags=excluded.tags,note=excluded.note,updated_at=now();
  return jsonb_build_object('cardId',p_card_id,'locked',v_locked,'tags',v_tags,'note',v_note);
end;
$$;
revoke all on function public.set_my_card_metadata(text,boolean,text[],text) from public,anon;
grant execute on function public.set_my_card_metadata(text,boolean,text[],text) to authenticated,service_role;

create or replace function public.get_card_passport(p_card_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.cards where id=p_card_id) then raise exception 'CARD_NOT_FOUND'; end if;
  with acquisition_events as (
    select 'pack'::text kind,po.id::text source_id,po.opened_at created_at,1 quantity,jsonb_build_object('packId',po.pack_id,'pricePaid',po.price_paid,'currency',po.currency_at_open) metadata
    from public.pack_openings po where po.player_id=v_player and exists(select 1 from jsonb_array_elements(coalesce(po.cards_received,'[]'::jsonb)) e where e->>'id'=p_card_id)
    union all
    select 'diamond_pack',d.id::text,d.created_at,1,jsonb_build_object('diamondsSpent',d.diamonds_spent,'marketValueUsdAtOpen',d.market_value_usd_at_open)
    from public.diamond_pack_openings d where d.player_id=v_player and d.card_id=p_card_id
    union all
    select 'market_purchase',ml.id::text,coalesce(ml.sold_at,ml.updated_at),ml.quantity,jsonb_build_object('sellerId',ml.seller_id,'unitPriceCoins',ml.unit_price_coins)
    from public.market_listings ml where ml.buyer_id=v_player and ml.card_id=p_card_id and ml.status='sold'
    union all
    select 'trade_receive',t.id::text,t.updated_at,tc.quantity,jsonb_build_object('fromPlayerId',tc.owner_id)
    from public.trades t join public.trade_cards tc on tc.trade_id=t.id and tc.card_id=p_card_id
    where t.status='completed' and ((t.sender_id=v_player and tc.owner_id=t.receiver_id) or (t.receiver_id=v_player and tc.owner_id=t.sender_id))
  ), owner_ids as (
    select v_player id
    union select ml.seller_id from public.market_listings ml where ml.buyer_id=v_player and ml.card_id=p_card_id and ml.status='sold'
    union select tc.owner_id from public.trades t join public.trade_cards tc on tc.trade_id=t.id and tc.card_id=p_card_id
      where t.status='completed' and ((t.sender_id=v_player and tc.owner_id=t.receiver_id) or (t.receiver_id=v_player and tc.owner_id=t.sender_id))
  ), rounds as (
    select f.battle_id,f.round_no,f.player_id from private.battle_game_fighters f where f.player_id=v_player and f.card_id=p_card_id
  ), card_kos as (
    select count(*)::integer kos from private.battle_game_turns bt join rounds r on r.battle_id=bt.battle_id and r.round_no=bt.round_no
    where ((bt.result->'firstMove'->>'playerId')::uuid=v_player and coalesce((bt.result->'firstMove'->>'targetHpAfter')::integer,1)=0)
       or ((bt.result->'secondMove'->>'playerId')::uuid=v_player and coalesce((bt.result->'secondMove'->>'targetHpAfter')::integer,1)=0)
  ), card_wins as (
    select count(*)::integer wins from public.battle_rounds br join rounds r on r.battle_id=br.battle_id and r.round_no=br.round_no where br.winner_id=v_player
  )
  select jsonb_build_object(
    'card',jsonb_build_object('id',c.id,'name',c.pokemon_name,'setName',c.set_name,'rarity',c.rarity,'imageSmall',c.image_small,'imageLarge',c.image_large,'marketPriceUsd',c.market_price_usd,'gameTypes',c.game_types),
    'ownership',jsonb_build_object('owned',coalesce(pc.quantity,0)>0,'quantity',coalesce(pc.quantity,0),'firstObtainedAt',pc.first_obtained_at,'locked',coalesce(md.locked,false),'tags',coalesce(md.tags,'{}'::text[]),'note',md.note,'trackedTrainerCount',(select count(*) from owner_ids)),
    'battle',jsonb_build_object('rounds',coalesce((select count(*) from rounds),0),'wins',coalesce((select wins from card_wins),0),'knockouts',coalesce((select kos from card_kos),0)),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('kind',a.kind,'sourceId',a.source_id,'createdAt',a.created_at,'quantity',a.quantity,'metadata',a.metadata) order by a.created_at desc) from (select * from acquisition_events order by created_at desc limit 30) a),'[]'::jsonb)
  ) into v_result
  from public.cards c left join public.player_cards pc on pc.player_id=v_player and pc.card_id=c.id
  left join public.player_card_metadata md on md.player_id=v_player and md.card_id=c.id where c.id=p_card_id;
  return v_result;
end;
$$;
revoke all on function public.get_card_passport(text) from public,anon;
grant execute on function public.get_card_passport(text) to authenticated,service_role;

create or replace function public.get_battle_replay(p_battle_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());v_b public.battles%rowtype;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_b from public.battles where id=p_battle_id;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if v_player<>v_b.challenger_id and v_player<>v_b.opponent_id then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'battle',jsonb_build_object('id',v_b.id,'mode',v_b.mode,'status',v_b.status,'engineVersion',v_b.engine_version,'challengerId',v_b.challenger_id,'opponentId',v_b.opponent_id,'winnerId',v_b.winner_id,'challengerScore',v_b.challenger_score,'opponentScore',v_b.opponent_score,'createdAt',v_b.created_at,'completedAt',v_b.completed_at),
    'players',(select jsonb_agg(jsonb_build_object('id',p.id,'username',p.username,'profileIcon',p.profile_icon)) from public.players p where p.id in(v_b.challenger_id,v_b.opponent_id)),
    'turns',coalesce((select jsonb_agg(jsonb_build_object('round',t.round_no,'turn',t.turn_no,'challengerMoveId',t.challenger_move_id,'opponentMoveId',t.opponent_move_id,'result',t.result,'resolvedAt',t.resolved_at) order by t.round_no,t.turn_no) from private.battle_game_turns t where t.battle_id=p_battle_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type',e.event_type,'payload',e.payload,'createdAt',e.created_at) order by e.id) from public.battle_events e where e.battle_id=p_battle_id),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_battle_replay(uuid) from public,anon;
grant execute on function public.get_battle_replay(uuid) to authenticated,service_role;

create or replace function public.report_client_error(p_source text,p_code text,p_message text,p_context jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  insert into private.app_error_log(player_id,source,code,message,context)
  values(v_player,left(coalesce(nullif(btrim(p_source),''),'client'),80),left(nullif(p_code,''),80),left(coalesce(nullif(btrim(p_message),''),'Unknown error'),800),
    case when pg_column_size(coalesce(p_context,'{}'::jsonb))<=16384 then coalesce(p_context,'{}'::jsonb) else '{}'::jsonb end);
end;
$$;
revoke all on function public.report_client_error(text,text,text,jsonb) from public,anon;
grant execute on function public.report_client_error(text,text,text,jsonb) to authenticated,service_role;

create or replace function public.get_my_economy_ledger(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'currency',l.currency,'amount',l.amount,'balanceBefore',l.balance_before,'balanceAfter',l.balance_after,'reason',l.reason,'sourceType',l.source_type,'sourceId',l.source_id,'operationId',l.operation_id,'metadata',l.metadata,'createdAt',l.created_at) order by l.created_at desc,l.id desc)
    from (select * from private.economy_ledger where player_id=v_player order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,100),250)) offset greatest(coalesce(p_offset,0),0)) l),'[]'::jsonb);
end;
$$;
revoke all on function public.get_my_economy_ledger(integer,integer) from public,anon;
grant execute on function public.get_my_economy_ledger(integer,integer) to authenticated,service_role;

create or replace function public.get_admin_player_economy_ledger(p_target_id uuid,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
  if v_actor is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'currency',l.currency,'amount',l.amount,'balanceBefore',l.balance_before,'balanceAfter',l.balance_after,'reason',l.reason,'sourceType',l.source_type,'sourceId',l.source_id,'operationId',l.operation_id,'metadata',l.metadata,'createdAt',l.created_at) order by l.created_at desc,l.id desc)
    from (select * from private.economy_ledger where player_id=p_target_id order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(coalesce(p_offset,0),0)) l),'[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_player_economy_ledger(uuid,integer,integer) from public,anon;
grant execute on function public.get_admin_player_economy_ledger(uuid,integer,integer) to authenticated,service_role;

create or replace function public.get_admin_recent_errors(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'playerId',e.player_id,'username',p.username,'source',e.source,'code',e.code,'message',e.message,'context',e.context,'createdAt',e.created_at) order by e.created_at desc,e.id desc)
    from (select * from private.app_error_log order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,100),500))) e left join public.players p on p.id=e.player_id),'[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_recent_errors(integer) from public,anon;
grant execute on function public.get_admin_recent_errors(integer) to authenticated,service_role;

create or replace function public.get_admin_health_check()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_cards bigint;v_packs bigint;v_bad_packs bigint;v_price_age_hours numeric;v_stuck_trades bigint;v_open_alerts bigint;v_errors bigint;v_game_v1 bigint;
begin
  if (select auth.uid()) is null or not private.is_current_user_admin() then raise exception 'FORBIDDEN'; end if;
  select count(*) into v_cards from public.cards;
  select count(*) into v_packs from public.packs where active;
  select count(*) into v_bad_packs from public.packs p where p.active and not exists(select 1 from public.cards c where c.set_id=p.set_id);
  select extract(epoch from (now()-max(recorded_at)))/3600 into v_price_age_hours from public.card_market_price_history;
  select count(*) into v_stuck_trades from public.trades t where t.status='pending' and t.updated_at<now()-interval '24 hours' and not exists(select 1 from public.trade_cards tc where tc.trade_id=t.id);
  select count(*) into v_open_alerts from public.economy_alerts where resolved_at is null;
  select count(*) into v_errors from private.app_error_log where created_at>=now()-interval '24 hours';
  select count(*) into v_game_v1 from public.battles where engine_version='game_v1' and created_at>=now()-interval '7 days';
  return jsonb_build_object('checkedAt',now(),
    'overall',case when v_bad_packs>0 or v_stuck_trades>10 then 'error' when coalesce(v_price_age_hours,999)>96 or v_open_alerts>0 or v_errors>0 then 'warning' else 'ok' end,
    'checks',jsonb_build_array(
      jsonb_build_object('id','database','label','Banco/Supabase','status','ok','detail','Conexão e RPC administrativas respondendo.'),
      jsonb_build_object('id','cards','label','Catálogo de cartas','status',case when v_cards>10000 then 'ok' else 'warning' end,'detail',v_cards||' cartas cadastradas.'),
      jsonb_build_object('id','packs','label','Boosters','status',case when v_packs>0 and v_bad_packs=0 then 'ok' else 'error' end,'detail',v_packs||' ativos • '||v_bad_packs||' sem pool de cartas.'),
      jsonb_build_object('id','battle','label','Motor game_v1','status','ok','detail',v_game_v1||' batalha(s) game_v1 nos últimos 7 dias.'),
      jsonb_build_object('id','prices','label','Preços','status',case when coalesce(v_price_age_hours,999)<=96 then 'ok' else 'warning' end,'detail','Último snapshot há '||round(coalesce(v_price_age_hours,999),1)||'h.'),
      jsonb_build_object('id','trades','label','Trocas','status',case when v_stuck_trades=0 then 'ok' when v_stuck_trades<=10 then 'warning' else 'error' end,'detail',v_stuck_trades||' troca(s) vazia(s) antigas.'),
      jsonb_build_object('id','economy','label','Economia','status',case when v_open_alerts=0 then 'ok' else 'warning' end,'detail',v_open_alerts||' alerta(s) econômico(s) aberto(s).'),
      jsonb_build_object('id','errors','label','Erros recentes','status',case when v_errors=0 then 'ok' else 'warning' end,'detail',v_errors||' erro(s) registrados em 24h.')
    ));
end;
$$;
revoke all on function public.get_admin_health_check() from public,anon;
grant execute on function public.get_admin_health_check() to authenticated,service_role;

create or replace function public.get_account_museum()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_player uuid:=(select auth.uid());
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  return jsonb_build_object(
    'museum',coalesce((select jsonb_build_object('level',mp.level,'totalSpentCoins',mp.total_spent_coins) from public.player_museum_progress mp where mp.player_id=v_player),jsonb_build_object('level',1,'totalSpentCoins',0)),
    'displayCards',coalesce((select jsonb_agg(jsonb_build_object('slot',pm.slot,'card',jsonb_build_object('id',c.id,'name',c.pokemon_name,'image',coalesce(c.image_large,c.image_small),'rarity',c.rarity,'marketPriceUsd',c.market_price_usd)) order by pm.slot) from public.player_museum_cards pm join public.cards c on c.id=pm.card_id where pm.player_id=v_player),'[]'::jsonb),
    'moments',coalesce((
      with moments as (
        select 'first_pack'::text kind,'Primeiro booster' title,po.opened_at occurred_at,jsonb_build_object('packId',po.pack_id,'pricePaid',po.price_paid,'currency',po.currency_at_open) metadata
        from public.pack_openings po where po.player_id=v_player order by po.opened_at limit 1
      ), more as (
        select * from moments
        union all (select 'first_battle','Primeira batalha',b.created_at,jsonb_build_object('battleId',b.id,'won',b.winner_id=v_player) from public.battles b where b.challenger_id=v_player or b.opponent_id=v_player order by b.created_at limit 1)
        union all (select 'first_win','Primeira vitória',coalesce(b.completed_at,b.updated_at),jsonb_build_object('battleId',b.id) from public.battles b where b.winner_id=v_player order by coalesce(b.completed_at,b.updated_at) limit 1)
        union all (select 'first_trade','Primeira troca',t.updated_at,jsonb_build_object('tradeId',t.id) from public.trades t where t.status='completed' and (t.sender_id=v_player or t.receiver_id=v_player) order by t.updated_at limit 1)
        union all (select 'oldest_card','Carta mais antiga ainda na coleção',pc.first_obtained_at,jsonb_build_object('cardId',c.id,'name',c.pokemon_name,'image',c.image_small,'rarity',c.rarity) from public.player_cards pc join public.cards c on c.id=pc.card_id where pc.player_id=v_player and pc.quantity>0 order by pc.first_obtained_at limit 1)
        union all (select 'largest_market_sale','Maior venda no Marketplace',m.created_at,jsonb_build_object('listingId',m.listing_id,'grossCoins',m.gross_coins,'netCoins',m.seller_net_coins) from private.market_fee_log m where m.seller_id=v_player order by m.gross_coins desc,m.created_at limit 1)
        union all (select 'best_pull','Melhor pull registrado',x.opened_at,jsonb_build_object('cardId',x.card_id,'name',x.card_name,'marketPriceUsd',x.price_usd) from (
          select po.opened_at,e->>'id' card_id,e->>'name' card_name,coalesce(nullif(e->>'marketPriceUsd','')::numeric,c.market_price_usd,0) price_usd
          from public.pack_openings po cross join lateral jsonb_array_elements(coalesce(po.cards_received,'[]'::jsonb)) e left join public.cards c on c.id=e->>'id'
          where po.player_id=v_player order by coalesce(nullif(e->>'marketPriceUsd','')::numeric,c.market_price_usd,0) desc,po.opened_at limit 1
        ) x)
      )
      select jsonb_agg(jsonb_build_object('kind',kind,'title',title,'occurredAt',occurred_at,'metadata',metadata) order by occurred_at nulls last) from more where occurred_at is not null
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_account_museum() from public,anon;
grant execute on function public.get_account_museum() to authenticated,service_role;

create or replace function public.marketplace_action(p_action text,p_listing_id uuid default null,p_card_id text default null,p_quantity integer default null,p_price bigint default null,p_shop_name text default null,p_theme_style text default null)
returns jsonb language plpgsql set search_path='' as $$
declare v_actor uuid:=(select auth.uid());
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_action='list' and private.card_is_locked(v_actor,p_card_id) then raise exception 'CARD_LOCKED'; end if;
  return private.marketplace_action(p_action,p_listing_id,p_card_id,p_quantity,p_price,p_shop_name,p_theme_style);
end;
$$;
revoke all on function public.marketplace_action(text,uuid,text,integer,bigint,text,text) from public,anon;
grant execute on function public.marketplace_action(text,uuid,text,integer,bigint,text,text) to authenticated,service_role;


CREATE OR REPLACE FUNCTION public.server_set_trade_cards(p_actor_id uuid, p_trade_id uuid, p_cards jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_trade public.trades%rowtype;
  v_item jsonb;
  v_card_id text;
  v_qty integer;
  v_owned integer;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found then raise exception 'TRADE_NOT_FOUND'; end if;
  if v_trade.status <> 'pending' then raise exception 'TRADE_NOT_EDITABLE'; end if;
  if p_actor_id <> v_trade.sender_id and p_actor_id <> v_trade.receiver_id then raise exception 'NOT_TRADE_PARTICIPANT'; end if;
  if jsonb_typeof(coalesce(p_cards, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_CARDS_PAYLOAD'; end if;

  delete from public.trade_cards where trade_id = p_trade_id and owner_id = p_actor_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb))
  loop
    v_card_id := nullif(v_item ->> 'card_id', '');
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_card_id is null or v_qty <= 0 then raise exception 'INVALID_TRADE_CARD'; end if;
    if private.card_is_locked(p_actor_id,v_card_id) then raise exception 'CARD_LOCKED'; end if;

    select quantity into v_owned
    from public.player_cards
    where player_id = p_actor_id and card_id = v_card_id
    for update;

    if coalesce(v_owned, 0) < v_qty then raise exception 'INSUFFICIENT_CARD_QUANTITY'; end if;

    insert into public.trade_cards (trade_id, owner_id, card_id, quantity)
    values (p_trade_id, p_actor_id, v_card_id, v_qty)
    on conflict (trade_id, owner_id, card_id)
    do update set quantity = excluded.quantity;
  end loop;

  update public.trades
  set sender_confirmed = false,
      receiver_confirmed = false,
      updated_at = now()
  where id = p_trade_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.server_confirm_trade(p_actor_id uuid, p_trade_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_trade public.trades%rowtype;
  v_item record;
  v_owned integer;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found then raise exception 'TRADE_NOT_FOUND'; end if;
  if v_trade.status <> 'pending' then raise exception 'TRADE_NOT_CONFIRMABLE'; end if;
  if p_actor_id <> v_trade.sender_id and p_actor_id <> v_trade.receiver_id then raise exception 'NOT_TRADE_PARTICIPANT'; end if;

  if not exists (select 1 from public.trade_cards where trade_id = p_trade_id and owner_id = p_actor_id) then
    raise exception 'EMPTY_TRADE_OFFER';
  end if;

  if p_actor_id = v_trade.sender_id then
    update public.trades set sender_confirmed = true, updated_at = now() where id = p_trade_id;
  else
    update public.trades set receiver_confirmed = true, updated_at = now() where id = p_trade_id;
  end if;

  select * into v_trade from public.trades where id = p_trade_id for update;

  if v_trade.sender_confirmed and v_trade.receiver_confirmed then
    if not exists (select 1 from public.trade_cards where trade_id = p_trade_id and owner_id = v_trade.sender_id)
       or not exists (select 1 from public.trade_cards where trade_id = p_trade_id and owner_id = v_trade.receiver_id) then
      raise exception 'BOTH_SIDES_MUST_OFFER';
    end if;

    for v_item in select owner_id, card_id, quantity from public.trade_cards where trade_id = p_trade_id order by owner_id, card_id
    loop
      if private.card_is_locked(v_item.owner_id,v_item.card_id) then raise exception 'CARD_LOCKED'; end if;
      select quantity into v_owned from public.player_cards
      where player_id = v_item.owner_id and card_id = v_item.card_id for update;
      if coalesce(v_owned, 0) < v_item.quantity then raise exception 'INVENTORY_CHANGED'; end if;
    end loop;

    for v_item in select owner_id, card_id, quantity from public.trade_cards where trade_id = p_trade_id
    loop
      update public.player_cards
      set quantity = quantity - v_item.quantity
      where player_id = v_item.owner_id and card_id = v_item.card_id;

      delete from public.player_cards
      where player_id = v_item.owner_id and card_id = v_item.card_id and quantity <= 0;

      insert into public.player_cards (player_id, card_id, quantity)
      values (
        case when v_item.owner_id = v_trade.sender_id then v_trade.receiver_id else v_trade.sender_id end,
        v_item.card_id,
        v_item.quantity
      )
      on conflict (player_id, card_id)
      do update set quantity = public.player_cards.quantity + excluded.quantity;
    end loop;

    update public.trades set status = 'completed', updated_at = now() where id = p_trade_id;
    return jsonb_build_object('status', 'completed');
  end if;

  return jsonb_build_object('status', 'pending', 'senderConfirmed', v_trade.sender_confirmed, 'receiverConfirmed', v_trade.receiver_confirmed);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sell_duplicate_cards(p_card_id text, p_quantity integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid := auth.uid();
  v_inventory integer;
  v_market_price numeric;
  v_rarity text;
  v_rarity_tier smallint;
  v_base_coins bigint;
  v_rarity_multiplier numeric;
  v_drop_chance numeric;
  v_drop_multiplier numeric;
  v_coin_pack_cap bigint;
  v_unit_coins bigint;
  v_total_coins bigint;
  v_new_balance bigint;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if private.card_is_locked(v_player_id,p_card_id) then raise exception 'CARD_LOCKED'; end if;
  if p_card_id is null or btrim(p_card_id)='' or p_quantity is null or p_quantity<1 or p_quantity>10000 then
    raise exception 'INVALID_SALE';
  end if;

  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then
    raise exception 'APP_MAINTENANCE';
  end if;

  -- Free coin boosters must never be convertible directly into freshly minted coins.
  if exists(
    select 1 from public.admin_game_events
    where event_type='free_boosters'
      and active=true
      and starts_at<=now()
      and ends_at>now()
  ) then
    raise exception 'DUPLICATE_SALES_PAUSED_DURING_FREE_EVENT';
  end if;

  perform 1 from public.players
  where id=v_player_id and account_status='active'
  for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  select pc.quantity,c.market_price_usd,c.rarity
  into v_inventory,v_market_price,v_rarity
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  where pc.player_id=v_player_id and pc.card_id=p_card_id
  for update of pc;

  if not found then raise exception 'CARD_NOT_OWNED'; end if;
  if v_market_price is null or v_market_price<=0 then raise exception 'CARD_WITHOUT_MARKET_PRICE'; end if;
  if v_inventory<=1 then raise exception 'NO_DUPLICATES'; end if;
  if p_quantity>(v_inventory-1) then raise exception 'KEEP_ONE_COPY'; end if;

  v_rarity_tier:=public.rarity_tier(v_rarity);
  v_base_coins:=private.duplicate_sale_base_value(v_market_price);
  v_rarity_multiplier:=private.duplicate_sale_rarity_multiplier(v_rarity);
  v_drop_chance:=private.duplicate_sale_drop_chance(p_card_id);
  v_drop_multiplier:=private.duplicate_sale_drop_multiplier(p_card_id);
  select min(ceil(p.price::numeric*1.5))::bigint into v_coin_pack_cap
  from public.packs p
  join public.cards c on c.set_id=p.set_id
  where c.id=p_card_id and p.active=true and p.currency='coins';
  v_unit_coins:=private.duplicate_sale_coin_value(p_card_id);
  if v_unit_coins<=0 then raise exception 'CARD_WITHOUT_MARKET_PRICE'; end if;

  v_total_coins:=v_unit_coins*p_quantity;

  update public.player_cards
  set quantity=quantity-p_quantity
  where player_id=v_player_id and card_id=p_card_id;

  update public.players
  set coins=coins+v_total_coins
  where id=v_player_id
  returning coins into v_new_balance;

  insert into private.card_duplicate_sales(
    player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins,
    rarity_tier,rarity_multiplier,drop_chance_pct,drop_multiplier,coin_pack_cap
  )
  values(
    v_player_id,p_card_id,p_quantity,v_market_price,v_unit_coins,v_total_coins,
    v_rarity_tier,v_rarity_multiplier,
    case when v_drop_chance is null then null else v_drop_chance*100 end,
    v_drop_multiplier,v_coin_pack_cap
  );

  perform private.battle_pass_record_event(v_player_id,'market_sell',1);

  return jsonb_build_object(
    'ok',true,
    'cardId',p_card_id,
    'quantitySold',p_quantity,
    'remainingQuantity',v_inventory-p_quantity,
    'marketPriceUsd',v_market_price,
    'baseCoins',v_base_coins,
    'rarityTier',v_rarity_tier,
    'rarityMultiplier',v_rarity_multiplier,
    'dropChancePct',case when v_drop_chance is null then null else v_drop_chance*100 end,
    'dropMultiplier',v_drop_multiplier,
    'coinPackCap',v_coin_pack_cap,
    'unitCoins',v_unit_coins,
    'coinsEarned',v_total_coins,
    'coins',v_new_balance
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sell_all_duplicate_cards()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player_id uuid:=auth.uid();
  v_total_coins bigint:=0;
  v_total_quantity bigint:=0;
  v_unique_sold integer:=0;
  v_skipped_unique integer:=0;
  v_skipped_copies bigint:=0;
  v_new_balance bigint:=0;
begin
  if v_player_id is null then raise exception 'UNAUTHENTICATED'; end if;

  if exists(select 1 from public.app_runtime_status where id=1 and maintenance_enabled=true) then
    raise exception 'APP_MAINTENANCE';
  end if;

  if exists(
    select 1
    from public.admin_game_events
    where event_type='free_boosters'
      and active=true
      and starts_at<=now()
      and ends_at>now()
  ) then
    raise exception 'DUPLICATE_SALES_PAUSED_DURING_FREE_EVENT';
  end if;

  perform 1
  from public.players
  where id=v_player_id and account_status='active'
  for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;

  with owned as materialized (
    select
      pc.card_id,
      pc.quantity,
      c.set_id,
      c.rarity,
      c.market_price_usd,
      public.rarity_tier(c.rarity) as rarity_tier,
      public.rarity_pull_weight(c.rarity) as rarity_weight
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player_id
      and pc.quantity>1
      and not private.card_is_locked(v_player_id,pc.card_id)
    for update of pc
  ),
  owned_sets as materialized (
    select distinct set_id from owned
  ),
  set_rare_totals as materialized (
    select
      c.set_id,
      sum(public.rarity_pull_weight(c.rarity))
        filter(where public.rarity_tier(c.rarity)>=3) as rare_weight_total
    from public.cards c
    join owned_sets s on s.set_id=c.set_id
    group by c.set_id
  ),
  set_caps as materialized (
    select
      p.set_id,
      min(ceil(p.price::numeric*1.5))::bigint as coin_pack_cap
    from public.packs p
    join owned_sets s on s.set_id=p.set_id
    where p.active=true and p.currency='coins'
    group by p.set_id
  ),
  quoted as materialized (
    select
      o.*,
      greatest(o.quantity-1,0)::integer as sale_quantity,
      private.duplicate_sale_base_value(o.market_price_usd) as base_coins,
      private.duplicate_sale_rarity_multiplier(o.rarity) as rarity_multiplier,
      case
        when o.rarity_tier>=3 and rt.rare_weight_total>0
          then o.rarity_weight/rt.rare_weight_total
        else null
      end as drop_chance,
      cap.coin_pack_cap
    from owned o
    left join set_rare_totals rt on rt.set_id=o.set_id
    left join set_caps cap on cap.set_id=o.set_id
  ),
  multiplied as materialized (
    select
      q.*,
      case
        when rarity_tier<=1 then 0.80
        when rarity_tier=2 then 0.90
        when drop_chance>=0.05 then 0.85
        when drop_chance>=0.02 then 1.00
        when drop_chance>=0.01 then 1.10
        when drop_chance>=0.005 then 1.20
        when drop_chance>=0.002 then 1.35
        when drop_chance>=0.001 then 1.50
        when drop_chance>=0.0005 then 1.70
        else 2.00
      end::numeric as drop_multiplier
    from quoted q
  ),
  final_quotes as materialized (
    select
      m.*,
      case
        when market_price_usd is null or market_price_usd<=0 then 0::bigint
        else least(
          greatest(
            10,
            round((base_coins*rarity_multiplier*drop_multiplier)/10.0)*10
          )::bigint,
          coalesce(coin_pack_cap,9223372036854775807::bigint)
        )
      end as unit_coins
    from multiplied m
  ),
  sellable as materialized (
    select *
    from final_quotes
    where sale_quantity>0 and unit_coins>0
  ),
  skipped as materialized (
    select
      count(*)::integer as skipped_unique,
      coalesce(sum(sale_quantity),0)::bigint as skipped_copies
    from final_quotes
    where sale_quantity>0 and unit_coins<=0
  ),
  updated as (
    update public.player_cards pc
    set quantity=1
    from sellable s
    where pc.player_id=v_player_id
      and pc.card_id=s.card_id
      and pc.quantity>1
    returning pc.card_id
  ),
  logged as (
    insert into private.card_duplicate_sales(
      player_id,card_id,quantity,unit_market_price_usd,unit_coins,total_coins,
      rarity_tier,rarity_multiplier,drop_chance_pct,drop_multiplier,coin_pack_cap
    )
    select
      v_player_id,
      s.card_id,
      s.sale_quantity,
      s.market_price_usd,
      s.unit_coins,
      s.unit_coins*s.sale_quantity,
      s.rarity_tier,
      s.rarity_multiplier,
      case when s.drop_chance is null then null else s.drop_chance*100 end,
      s.drop_multiplier,
      s.coin_pack_cap
    from sellable s
    join updated u on u.card_id=s.card_id
    returning quantity,total_coins
  ),
  totals as (
    select
      count(*)::integer as unique_sold,
      coalesce(sum(quantity),0)::bigint as total_quantity,
      coalesce(sum(total_coins),0)::bigint as total_coins
    from logged
  )
  select
    t.unique_sold,
    t.total_quantity,
    t.total_coins,
    s.skipped_unique,
    s.skipped_copies
  into
    v_unique_sold,
    v_total_quantity,
    v_total_coins,
    v_skipped_unique,
    v_skipped_copies
  from totals t
  cross join skipped s;

  if v_total_quantity>0 then
    update public.players
    set coins=coins+v_total_coins
    where id=v_player_id
    returning coins into v_new_balance;

    perform private.battle_pass_record_event(v_player_id,'market_sell',1);
  else
    select coins into v_new_balance
    from public.players
    where id=v_player_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'uniqueCardsSold',v_unique_sold,
    'quantitySold',v_total_quantity,
    'coinsEarned',v_total_coins,
    'skippedUniqueCards',v_skipped_unique,
    'skippedCopies',v_skipped_copies,
    'coins',v_new_balance
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.server_create_battle_v2(p_actor_id uuid, p_opponent_id uuid, p_mode text, p_stake_type text, p_wager_coins bigint DEFAULT 0, p_stake_card_id text DEFAULT NULL::text, p_rematch_of uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_rounds integer; v_invites boolean; v_qty integer; v_cards integer;
begin
  if p_actor_id = p_opponent_id then raise exception 'INVALID_PLAYER'; end if;
  if p_mode not in ('quick', 'mystery', 'draft3') then raise exception 'INVALID_MODE'; end if;
  if p_stake_type not in ('none', 'coins', 'card') then raise exception 'STAKE_NOT_AVAILABLE'; end if;
  if p_stake_type = 'none' then p_wager_coins := 0; p_stake_card_id := null; end if;
  if p_stake_type = 'coins' and not (p_wager_coins = any(array[100,250,500,1000,2500]::bigint[])) then raise exception 'INVALID_WAGER'; end if;
  if p_stake_type = 'card' then p_wager_coins := 0; if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED'; end if; end if;
  if not exists(select 1 from public.friendships f where f.status::text = 'accepted' and ((f.requester_id = p_actor_id and f.addressee_id = p_opponent_id) or (f.requester_id = p_opponent_id and f.addressee_id = p_actor_id))) then raise exception 'NOT_FRIENDS'; end if;
  select battle_invites into v_invites from public.player_settings where player_id = p_opponent_id;
  if v_invites is false then raise exception 'BATTLE_INVITES_DISABLED'; end if;
  if exists(select 1 from public.battles where challenger_id = p_actor_id and opponent_id = p_opponent_id and status = 'invited' and created_at > now() - interval '2 minutes') then raise exception 'INVITE_ALREADY_PENDING'; end if;
  if p_stake_type = 'coins' and ((select coins from public.players where id = p_actor_id) < p_wager_coins or (select coins from public.players where id = p_opponent_id) < p_wager_coins) then raise exception 'NOT_ENOUGH_COINS'; end if;
  if p_mode = 'draft3' then
    select count(*) into v_cards from public.player_cards where player_id = p_actor_id and quantity > 0;
    if v_cards < 3 then raise exception 'DRAFT_NEEDS_3_CARDS'; end if;
    select count(*) into v_cards from public.player_cards where player_id = p_opponent_id and quantity > 0;
    if v_cards < 3 then raise exception 'OPPONENT_NEEDS_3_CARDS'; end if;
  end if;
  v_rounds := case when p_mode in ('mystery', 'draft3') then 2 else 1 end;
  insert into public.battles(challenger_id, opponent_id, mode, stake_type, wager_coins, rounds_to_win, rematch_of)
  values(p_actor_id, p_opponent_id, p_mode, p_stake_type, p_wager_coins, v_rounds, p_rematch_of)
  returning id into v_id;
  if p_stake_type = 'card' then
    if private.card_is_locked(p_actor_id,p_stake_card_id) then raise exception 'CARD_LOCKED'; end if;
    update public.player_cards set quantity = quantity - 1 where player_id = p_actor_id and card_id = p_stake_card_id and quantity > 0 returning quantity into v_qty;
    if not found then raise exception 'STAKE_CARD_NOT_OWNED'; end if;
    insert into public.battle_card_stakes(battle_id, player_id, card_id, quantity, status) values(v_id, p_actor_id, p_stake_card_id, 1, 'held');
  end if;
  if p_mode = 'draft3' and (select count(*) from public.player_cards where player_id = p_actor_id and quantity > 0) < 3 then raise exception 'DRAFT_NEEDS_3_CARDS_AFTER_STAKE'; end if;
  insert into public.battle_events(battle_id, event_type, payload)
  values(v_id, 'invited', jsonb_build_object('challengerId', p_actor_id, 'opponentId', p_opponent_id, 'mode', p_mode, 'stakeType', p_stake_type, 'wagerCoins', p_wager_coins, 'stakeCardId', p_stake_card_id, 'rematchOf', p_rematch_of));
  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.server_respond_battle_v2(p_actor_id uuid, p_battle_id uuid, p_accept boolean, p_stake_card_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b public.battles%rowtype; c_coins bigint; o_coins bigint; v_qty integer; v_cards integer;
begin
  select * into b from public.battles where id = p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.opponent_id <> p_actor_id then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'invited' then raise exception 'INVALID_STATUS'; end if;
  if not p_accept then
    if b.stake_type = 'card' then perform public.server_return_card_stakes(b.id); end if;
    update public.battles set status = 'declined', updated_at = now() where id = b.id;
    insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'declined', '{}');
    perform public.server_queue_notification(b.challenger_id, 'battle_declined', 'Desafio recusado', 'Seu desafio de batalha foi recusado.', jsonb_build_object('battleId', b.id));
    return jsonb_build_object('status', 'declined');
  end if;
  if b.stake_type = 'coins' then
    perform 1 from public.players where id in (b.challenger_id, b.opponent_id) order by id for update;
    select coins into c_coins from public.players where id = b.challenger_id;
    select coins into o_coins from public.players where id = b.opponent_id;
    if c_coins < b.wager_coins or o_coins < b.wager_coins then raise exception 'NOT_ENOUGH_COINS'; end if;
    update public.players set coins = coins - b.wager_coins where id in (b.challenger_id, b.opponent_id);
    insert into public.battle_coin_escrows(battle_id, player_id, amount, status)
    values(b.id, b.challenger_id, b.wager_coins, 'held'), (b.id, b.opponent_id, b.wager_coins, 'held')
    on conflict(battle_id, player_id) do nothing;
  elsif b.stake_type = 'card' then
    if p_stake_card_id is null then raise exception 'STAKE_CARD_REQUIRED'; end if;
    if private.card_is_locked(p_actor_id,p_stake_card_id) then raise exception 'CARD_LOCKED'; end if;
    update public.player_cards set quantity = quantity - 1 where player_id = p_actor_id and card_id = p_stake_card_id and quantity > 0 returning quantity into v_qty;
    if not found then raise exception 'STAKE_CARD_NOT_OWNED'; end if;
    insert into public.battle_card_stakes(battle_id, player_id, card_id, quantity, status)
    values(b.id, p_actor_id, p_stake_card_id, 1, 'held') on conflict(battle_id, player_id) do nothing;
  end if;
  if b.mode = 'draft3' then
    select count(*) into v_cards from public.player_cards where player_id = b.challenger_id and quantity > 0;
    if v_cards < 3 then raise exception 'CHALLENGER_NEEDS_3_CARDS'; end if;
    select count(*) into v_cards from public.player_cards where player_id = b.opponent_id and quantity > 0;
    if v_cards < 3 then raise exception 'OPPONENT_NEEDS_3_CARDS'; end if;
    update public.battles
    set status = 'drafting', draft_turn_id = b.challenger_id, draft_pick_count = 0,
        selection_deadline = now() + make_interval(secs => draft_seconds), updated_at = now()
    where id = b.id;
    insert into public.battle_events(battle_id, event_type, payload)
    values(b.id, 'draft_started', jsonb_build_object('turnPlayerId', b.challenger_id, 'draftSeconds', b.draft_seconds));
    perform public.server_queue_notification(b.challenger_id, 'battle_started', 'Draft 3 começou', 'É sua vez de escolher a primeira carta.', jsonb_build_object('battleId', b.id));
    return jsonb_build_object('status', 'drafting', 'turnPlayerId', b.challenger_id, 'draftSeconds', b.draft_seconds);
  end if;
  update public.battles set status = 'selecting', selection_deadline = now() + make_interval(secs => selection_seconds), updated_at = now() where id = b.id;
  insert into public.battle_events(battle_id, event_type, payload) values(b.id, 'started', jsonb_build_object('round', 1, 'selectionSeconds', b.selection_seconds));
  perform public.server_queue_notification(b.challenger_id, 'battle_started', 'Desafio aceito', 'Sua batalha começou. Escolha sua carta!', jsonb_build_object('battleId', b.id));
  return jsonb_build_object('status', 'selecting', 'round', 1, 'selectionSeconds', b.selection_seconds);
end;
$function$
;
revoke all on function public.server_set_trade_cards(uuid,uuid,jsonb) from public,anon;
revoke all on function public.server_confirm_trade(uuid,uuid) from public,anon;
revoke all on function public.server_create_battle_v2(uuid,uuid,text,text,bigint,text,uuid) from public,anon;
revoke all on function public.server_respond_battle_v2(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.server_set_trade_cards(uuid,uuid,jsonb) to service_role;
grant execute on function public.server_confirm_trade(uuid,uuid) to service_role;
grant execute on function public.server_create_battle_v2(uuid,uuid,text,text,bigint,text,uuid) to service_role;
grant execute on function public.server_respond_battle_v2(uuid,uuid,boolean,text) to service_role;
revoke all on function public.sell_duplicate_cards(text,integer) from public,anon;
revoke all on function public.sell_all_duplicate_cards() from public,anon;
grant execute on function public.sell_duplicate_cards(text,integer) to authenticated,service_role;
grant execute on function public.sell_all_duplicate_cards() to authenticated,service_role;
