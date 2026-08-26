create or replace function public.calculate_card_game_value(p_rarity text, p_tcg_data jsonb default '{}'::jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_base integer;
  v_hp integer := 0;
  v_attacks integer := 0;
  v_abilities integer := 0;
  v_rarity text := lower(coalesce(p_rarity,''));
begin
  v_base := case
    when v_rarity like '%special illustration%' then 850
    when v_rarity like '%hyper rare%' then 950
    when v_rarity like '%rainbow%' then 900
    when v_rarity like '%secret%' then 900
    when v_rarity like '%rare holo star%' then 1200
    when v_rarity like '%shiny gx%' then 650
    when v_rarity like '%rare shiny%' or v_rarity like '%shiny rare%' then 480
    when v_rarity like '%illustration rare%' then 420
    when v_rarity like '%rare ultra%' or v_rarity = 'ultra rare' then 500
    when v_rarity like '%double rare%' then 300
    when v_rarity like '%vmax%' or v_rarity like '%vstar%' then 360
    when v_rarity like '%gx%' or v_rarity like '% ex%' then 280
    when v_rarity like '%rare holo%' then 190
    when v_rarity = 'rare' or v_rarity like 'rare %' then 130
    when v_rarity = 'promo' then 160
    when v_rarity = 'uncommon' then 65
    when v_rarity = 'common' then 35
    else 50
  end;
  begin v_hp := greatest(0, least(350, coalesce((p_tcg_data->>'hp')::integer,0))); exception when others then v_hp := 0; end;
  v_attacks := case when jsonb_typeof(p_tcg_data->'attacks')='array' then jsonb_array_length(p_tcg_data->'attacks') else 0 end;
  v_abilities := case when jsonb_typeof(p_tcg_data->'abilities')='array' then jsonb_array_length(p_tcg_data->'abilities') else 0 end;
  return greatest(20, v_base + (v_hp / 5) + v_attacks * 12 + v_abilities * 20);
end;
$$;

alter table public.cards add column if not exists game_value integer not null default 35;
alter table public.cards drop constraint if exists cards_game_value_check;
alter table public.cards add constraint cards_game_value_check check (game_value between 1 and 1000000);
update public.cards set game_value = public.calculate_card_game_value(rarity, tcg_data);

create or replace function public.set_card_game_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.game_value := public.calculate_card_game_value(new.rarity, new.tcg_data);
  return new;
end;
$$;

drop trigger if exists trg_cards_game_value on public.cards;
create trigger trg_cards_game_value before insert or update of rarity, tcg_data on public.cards for each row execute function public.set_card_game_value();
create index if not exists idx_cards_game_value on public.cards(game_value desc);

alter table public.packs add column if not exists art_url text;
update public.packs p set art_url = (
  select c.image_large from public.cards c
  where c.set_id = p.set_id and c.image_large is not null
  order by c.game_value desc, c.id limit 1
) where p.art_url is null or p.art_url='';
create index if not exists idx_packs_set_id on public.packs(set_id);

create or replace function public.server_timeout_battle(p_actor_id uuid, p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare b battles%rowtype;v_card text;v_count integer;
begin
  select * into b from battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND';end if;
  if p_actor_id not in(b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN';end if;
  if b.status<>'selecting' then return jsonb_build_object('alreadyResolved',true,'status',b.status,'round',b.active_round);end if;
  if b.selection_deadline is null or now()<b.selection_deadline then raise exception 'NOT_EXPIRED';end if;
  if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id) then
    select card_id into v_card from player_cards where player_id=b.challenger_id and quantity>0 order by random() limit 1;
    if v_card is null then raise exception 'CHALLENGER_NO_CARDS';end if;
    insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.challenger_id,v_card) on conflict do nothing;
    insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.challenger_id,'round',b.active_round));
  end if;
  if not exists(select 1 from battle_selections where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id) then
    select card_id into v_card from player_cards where player_id=b.opponent_id and quantity>0 order by random() limit 1;
    if v_card is null then raise exception 'OPPONENT_NO_CARDS';end if;
    insert into battle_selections(battle_id,round_no,player_id,card_id) values(b.id,b.active_round,b.opponent_id,v_card) on conflict do nothing;
    insert into battle_events(battle_id,event_type,payload) values(b.id,'auto_locked',jsonb_build_object('playerId',b.opponent_id,'round',b.active_round));
  end if;
  select count(*) into v_count from battle_selections where battle_id=b.id and round_no=b.active_round;
  return jsonb_build_object('bothLocked',v_count=2,'round',b.active_round,'timedOut',true);
end
$$;
revoke all on function public.server_timeout_battle(uuid,uuid) from public, anon, authenticated;
grant execute on function public.server_timeout_battle(uuid,uuid) to service_role;
