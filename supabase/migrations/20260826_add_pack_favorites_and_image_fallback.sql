create table if not exists public.player_favorite_packs (
  player_id uuid not null references public.players(id) on delete cascade,
  pack_id uuid not null references public.packs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, pack_id)
);

alter table public.player_favorite_packs enable row level security;

drop policy if exists "favorite packs own select" on public.player_favorite_packs;
create policy "favorite packs own select"
on public.player_favorite_packs
for select to authenticated
using (player_id = (select auth.uid()));

drop policy if exists "favorite packs own insert" on public.player_favorite_packs;
create policy "favorite packs own insert"
on public.player_favorite_packs
for insert to authenticated
with check (player_id = (select auth.uid()));

drop policy if exists "favorite packs own delete" on public.player_favorite_packs;
create policy "favorite packs own delete"
on public.player_favorite_packs
for delete to authenticated
using (player_id = (select auth.uid()));

grant select, insert, delete on public.player_favorite_packs to authenticated;
create index if not exists idx_player_favorite_packs_created_at
  on public.player_favorite_packs(player_id, created_at desc);

create or replace function public.server_open_pack(p_player_id uuid, p_pack_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.packs%rowtype;
  v_coins bigint;
  v_cards jsonb;
  v_opening_id uuid;
  v_count integer;
  v_new_coins bigint;
  v_new_xp bigint;
  v_new_level integer;
begin
  select * into v_pack from public.packs where id = p_pack_id and active = true for share;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;

  select coins into v_coins from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_coins < v_pack.price then raise exception 'NOT_ENOUGH_COINS'; end if;

  select count(*) into v_count from public.cards where set_id = v_pack.set_id;
  if v_count < 1 then raise exception 'EMPTY_PACK_POOL'; end if;

  with common_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity,''))='common'
    order by random()
    limit greatest(v_pack.cards_per_pack-3,0)
  ), uncommon_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity,''))='uncommon'
      and id not in(select id from common_pick)
    order by random()
    limit least(2,greatest(v_pack.cards_per_pack-1,0))
  ), rare_pick as (
    select id, pokemon_name, rarity, image_small, image_large
    from public.cards
    where set_id = v_pack.set_id and rarity is not null
      and lower(rarity) not in('common','uncommon')
      and id not in(select id from common_pick)
      and id not in(select id from uncommon_pick)
    order by random()
    limit case when v_pack.cards_per_pack>0 then 1 else 0 end
  ), preset as (
    select * from common_pick
    union all select * from uncommon_pick
    union all select * from rare_pick
  ), filler as (
    select id,pokemon_name,rarity,image_small,image_large
    from public.cards
    where set_id=v_pack.set_id and id not in(select id from preset)
    order by random()
    limit greatest(v_pack.cards_per_pack-(select count(*) from preset),0)
  ), picked as (
    select * from preset
    union all select * from filler
  ), upserted as (
    insert into public.player_cards(player_id,card_id,quantity)
    select p_player_id,id,1 from picked
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+1
    returning card_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'id',p.id,
      'name',p.pokemon_name,
      'rarity',p.rarity,
      'image',coalesce(nullif(p.image_large,''),nullif(p.image_small,'')),
      'imageLarge',nullif(p.image_large,''),
      'imageSmall',nullif(p.image_small,'')
    )
  )
  into v_cards
  from picked p;

  update public.players
  set coins=coins-v_pack.price,
      xp=xp+20,
      level=greatest(level,1+floor((xp+20)/250.0)::integer)
  where id=p_player_id
  returning coins,xp,level into v_new_coins,v_new_xp,v_new_level;

  insert into public.pack_openings(player_id,pack_id,cards_received)
  values(p_player_id,p_pack_id,coalesce(v_cards,'[]'::jsonb))
  returning id into v_opening_id;

  insert into public.player_daily_missions(player_id,mission_date,mission_id,progress)
  values(p_player_id,current_date,'open_2_packs',1)
  on conflict(player_id,mission_date,mission_id)
  do update set progress=public.player_daily_missions.progress+1,updated_at=now();

  return jsonb_build_object(
    'openingId',v_opening_id,
    'cards',coalesce(v_cards,'[]'::jsonb),
    'coins',v_new_coins,
    'xp',v_new_xp,
    'level',v_new_level,
    'xpGained',20
  );
end;
$$;

revoke all on function public.server_open_pack(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.server_open_pack(uuid, uuid)
to service_role;
