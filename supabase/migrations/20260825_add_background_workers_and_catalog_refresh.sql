-- Background workers: expired battles, push delivery and progressive TCG data refresh.
create or replace function public.server_process_expired_battles()
returns integer language plpgsql security definer set search_path=public as $$
declare r record;b battles%rowtype;v_card text;v_processed integer:=0;
begin
  for r in select id from battles where status='selecting' and selection_deadline is not null and selection_deadline<=now() order by selection_deadline asc limit 50 loop
    begin
      select * into b from battles where id=r.id for update;
      if b.status<>'selecting' or b.selection_deadline is null or b.selection_deadline>now() then continue;end if;
      if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id) then
        select card_id into v_card from player_cards where player_id=b.challenger_id and quantity>0 order by random() limit 1;
        if v_card is null then
          update players p set coins=p.coins+e.amount from battle_coin_escrows e where e.battle_id=b.id and e.player_id=p.id and e.status='held';
          update battle_coin_escrows set status='refunded',updated_at=now() where battle_id=b.id and status='held';
          perform server_return_card_stakes(b.id);update battles set status='cancelled',updated_at=now() where id=b.id;
          insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_cancelled',jsonb_build_object('reason','challenger_no_cards'));continue;
        end if;
        insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.challenger_id,v_card) on conflict do nothing;
        insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.challenger_id,'round',b.active_round));
      end if;
      if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id) then
        select card_id into v_card from player_cards where player_id=b.opponent_id and quantity>0 order by random() limit 1;
        if v_card is null then
          update players p set coins=p.coins+e.amount from battle_coin_escrows e where e.battle_id=b.id and e.player_id=p.id and e.status='held';
          update battle_coin_escrows set status='refunded',updated_at=now() where battle_id=b.id and status='held';
          perform server_return_card_stakes(b.id);update battles set status='cancelled',updated_at=now() where id=b.id;
          insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_cancelled',jsonb_build_object('reason','opponent_no_cards'));continue;
        end if;
        insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.opponent_id,v_card) on conflict do nothing;
        insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.opponent_id,'round',b.active_round));
      end if;
      perform server_resolve_battle_round(b.id);v_processed:=v_processed+1;
    exception when others then
      begin insert into battle_events(battle_id,event_type,payload) values(r.id,'worker_error',jsonb_build_object('message',sqlerrm));exception when others then null;end;
    end;
  end loop;return v_processed;
end $$;

create table if not exists public.catalog_refresh_state(
  job_name text primary key,next_offset integer not null default 0,total_sets integer not null default 0,status text not null default 'running',
  imported_cards bigint not null default 0,processed_sets integer not null default 0,errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.catalog_refresh_state enable row level security;
revoke all on public.catalog_refresh_state from anon,authenticated;

insert into public.catalog_refresh_state(job_name,next_offset,status,started_at,updated_at,completed_at,errors,imported_cards,processed_sets)
values('full_tcg_refresh',0,'running',now(),now(),null,'[]'::jsonb,0,0)
on conflict(job_name) do nothing;

create or replace function public.server_refresh_catalog_batch(p_batch_size integer default 2)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_state catalog_refresh_state%rowtype;v_sets_response extensions.http_response;v_cards_response extensions.http_response;v_sets jsonb;v_set jsonb;v_cards jsonb;v_total integer;v_index integer;v_done integer:=0;v_imported integer:=0;v_count integer;v_set_id text;v_error text;
begin
  select * into v_state from catalog_refresh_state where job_name='full_tcg_refresh' for update;
  if v_state.job_name is null then insert into catalog_refresh_state(job_name) values('full_tcg_refresh') returning * into v_state;end if;
  if v_state.status='completed' then return jsonb_build_object('status','completed','offset',v_state.next_offset,'totalSets',v_state.total_sets,'importedCards',v_state.imported_cards);end if;
  v_sets_response:=extensions.http_get('https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json');if v_sets_response.status<>200 then raise exception 'SETS_FETCH_FAILED_%',v_sets_response.status;end if;
  v_sets:=v_sets_response.content::jsonb;v_total:=jsonb_array_length(v_sets);update catalog_refresh_state set total_sets=v_total,updated_at=now() where job_name='full_tcg_refresh';
  for v_index in v_state.next_offset..least(v_state.next_offset+greatest(1,least(p_batch_size,4))-1,v_total-1) loop
    begin
      v_set:=v_sets->v_index;v_set_id:=v_set->>'id';v_cards_response:=extensions.http_get('https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/'||v_set_id||'.json');if v_cards_response.status<>200 then raise exception 'CARDS_FETCH_FAILED_%',v_cards_response.status;end if;v_cards:=v_cards_response.content::jsonb;
      insert into cards(id,pokemon_name,pokedex_numbers,set_id,set_name,card_number,rarity,types,image_small,image_large,tcg_data)
      select c->>'id',c->>'name',coalesce(array(select jsonb_array_elements_text(coalesce(c->'nationalPokedexNumbers','[]'::jsonb))::integer),array[]::integer[]),v_set_id,v_set->>'name',c->>'number',c->>'rarity',coalesce(array(select jsonb_array_elements_text(coalesce(c->'types','[]'::jsonb))),array[]::text[]),c#>>'{images,small}',c#>>'{images,large}',
      jsonb_build_object('supertype',c->>'supertype','subtypes',coalesce(c->'subtypes','[]'::jsonb),'hp',c->>'hp','artist',c->>'artist','regulationMark',c->>'regulationMark','abilities',coalesce(c->'abilities','[]'::jsonb),'attacks',coalesce(c->'attacks','[]'::jsonb),'weaknesses',coalesce(c->'weaknesses','[]'::jsonb),'resistances',coalesce(c->'resistances','[]'::jsonb),'retreatCost',coalesce(c->'retreatCost','[]'::jsonb),'convertedRetreatCost',coalesce((c->>'convertedRetreatCost')::integer,0),'rules',coalesce(c->'rules','[]'::jsonb))
      from jsonb_array_elements(v_cards)c where c->>'supertype'='Pokémon'
      on conflict(id) do update set pokemon_name=excluded.pokemon_name,pokedex_numbers=excluded.pokedex_numbers,set_id=excluded.set_id,set_name=excluded.set_name,card_number=excluded.card_number,rarity=excluded.rarity,types=excluded.types,image_small=excluded.image_small,image_large=excluded.image_large,tcg_data=excluded.tcg_data;
      get diagnostics v_count=row_count;v_imported:=v_imported+v_count;
      insert into packs(name,set_id,price,cards_per_pack,image_url,active)
      values((v_set->>'name')||' Booster',v_set_id,case when nullif(left(coalesce(v_set->>'releaseDate',''),4),'')::integer<=2010 then 650 when nullif(left(coalesce(v_set->>'releaseDate',''),4),'')::integer<=2019 then 575 else 500 end,greatest(5,least(10,v_count)),v_set#>>'{images,logo}',v_count>0)
      on conflict(set_id) do update set name=excluded.name,price=excluded.price,image_url=excluded.image_url,active=excluded.active;v_done:=v_done+1;
    exception when others then
      v_error:=sqlerrm;update catalog_refresh_state set errors=errors||jsonb_build_array(jsonb_build_object('offset',v_index,'setId',coalesce(v_set_id,'?'),'error',v_error,'at',now())) where job_name='full_tcg_refresh';v_done:=v_done+1;
    end;
  end loop;
  update catalog_refresh_state set next_offset=least(v_total,v_state.next_offset+v_done),processed_sets=processed_sets+v_done,imported_cards=imported_cards+v_imported,status=case when v_state.next_offset+v_done>=v_total then 'completed' else 'running' end,completed_at=case when v_state.next_offset+v_done>=v_total then now() else null end,updated_at=now() where job_name='full_tcg_refresh' returning * into v_state;
  return jsonb_build_object('status',v_state.status,'offset',v_state.next_offset,'totalSets',v_state.total_sets,'processedThisRun',v_done,'importedThisRun',v_imported,'importedCards',v_state.imported_cards);
end $$;

create or replace function public.server_background_tick()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_battles integer;v_push integer;v_catalog jsonb;
begin
  v_battles:=server_process_expired_battles();v_push:=server_dispatch_push_notifications();
  if exists(select 1 from catalog_refresh_state where job_name='full_tcg_refresh' and status='running') then begin v_catalog:=server_refresh_catalog_batch(2);exception when others then v_catalog:=jsonb_build_object('error',sqlerrm);end;else v_catalog:=jsonb_build_object('status','idle');end if;
  return jsonb_build_object('battles',v_battles,'pushes',v_push,'catalog',v_catalog,'at',now());
end $$;

revoke all on function public.server_process_expired_battles() from public,anon,authenticated;
revoke all on function public.server_background_tick() from public,anon,authenticated;
revoke all on function public.server_refresh_catalog_batch(integer) from public,anon,authenticated;
grant execute on function public.server_process_expired_battles() to service_role;
grant execute on function public.server_background_tick() to service_role;
grant execute on function public.server_refresh_catalog_batch(integer) to service_role;

do $$ declare j bigint;begin select jobid into j from cron.job where jobname='pokemon-cards-background';if j is not null then perform cron.unschedule(j);end if;end $$;
select cron.schedule('pokemon-cards-background','* * * * *','select public.server_background_tick();');
