alter table public.players add column if not exists last_daily_claim_at timestamptz;

create index if not exists cards_pokedex_first_idx on public.cards ((pokedex_numbers[1]));

create or replace view public.pokedex_catalog with (security_invoker = true) as
select distinct on (c.pokedex_numbers[1])
  c.pokedex_numbers[1] as pokedex_number,
  c.pokemon_name,
  c.types,
  c.image_small,
  c.id as representative_card_id
from public.cards c
where array_length(c.pokedex_numbers, 1) > 0
  and c.pokedex_numbers[1] is not null
order by c.pokedex_numbers[1], (c.image_small is null), c.id;

grant select on public.pokedex_catalog to authenticated;

create or replace function public.server_set_favorite(p_player_id uuid, p_card_id text, p_favorite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.player_cards
  set favorite = p_favorite
  where player_id = p_player_id and card_id = p_card_id and quantity > 0;
  if not found then raise exception 'CARD_NOT_OWNED'; end if;
end;
$$;

create or replace function public.server_friend_action(p_actor_id uuid, p_target_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id = p_target_id then raise exception 'CANNOT_FRIEND_SELF'; end if;
  if not exists (select 1 from public.players where id = p_target_id) then raise exception 'PLAYER_NOT_FOUND'; end if;

  if p_action = 'send' then
    if exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = p_actor_id and addressee_id = p_target_id)
          or (requester_id = p_target_id and addressee_id = p_actor_id))
    ) then return 'accepted'; end if;

    update public.friendships
    set status = 'accepted'
    where requester_id = p_target_id and addressee_id = p_actor_id and status = 'pending';
    if found then return 'accepted'; end if;

    insert into public.friendships(requester_id, addressee_id, status)
    values (p_actor_id, p_target_id, 'pending')
    on conflict (requester_id, addressee_id)
    do update set status = case when public.friendships.status = 'blocked' then public.friendships.status else 'pending'::public.friend_status end;
    return 'pending';

  elsif p_action = 'accept' then
    update public.friendships
    set status = 'accepted'
    where requester_id = p_target_id and addressee_id = p_actor_id and status = 'pending';
    if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;
    return 'accepted';

  elsif p_action = 'decline' then
    delete from public.friendships
    where requester_id = p_target_id and addressee_id = p_actor_id and status = 'pending';
    if not found then raise exception 'FRIEND_REQUEST_NOT_FOUND'; end if;
    return 'declined';

  elsif p_action = 'remove' then
    delete from public.friendships
    where status = 'accepted'
      and ((requester_id = p_actor_id and addressee_id = p_target_id)
        or (requester_id = p_target_id and addressee_id = p_actor_id));
    if not found then raise exception 'FRIENDSHIP_NOT_FOUND'; end if;
    return 'removed';
  else
    raise exception 'INVALID_FRIEND_ACTION';
  end if;
end;
$$;

create or replace function public.server_claim_daily_reward(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_now timestamptz := now();
  v_coins bigint;
  v_xp bigint;
  v_level integer;
begin
  select last_daily_claim_at into v_last from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_last is not null and v_last + interval '24 hours' > v_now then raise exception 'DAILY_NOT_READY'; end if;

  update public.players
  set coins = coins + 750,
      xp = xp + 20,
      level = greatest(level, 1 + floor((xp + 20) / 250.0)::integer),
      last_daily_claim_at = v_now
  where id = p_player_id
  returning coins, xp, level into v_coins, v_xp, v_level;

  return jsonb_build_object('coins', v_coins, 'xp', v_xp, 'level', v_level, 'rewardCoins', 750, 'rewardXp', 20, 'claimedAt', v_now);
end;
$$;

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
    select id, pokemon_name, rarity, image_large from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity, '')) = 'common'
    order by random() limit greatest(v_pack.cards_per_pack - 3, 0)
  ), uncommon_pick as (
    select id, pokemon_name, rarity, image_large from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity, '')) = 'uncommon'
      and id not in (select id from common_pick)
    order by random() limit least(2, greatest(v_pack.cards_per_pack - 1, 0))
  ), rare_pick as (
    select id, pokemon_name, rarity, image_large from public.cards
    where set_id = v_pack.set_id and rarity is not null
      and lower(rarity) not in ('common', 'uncommon')
      and id not in (select id from common_pick)
      and id not in (select id from uncommon_pick)
    order by random() limit case when v_pack.cards_per_pack > 0 then 1 else 0 end
  ), preset as (
    select * from common_pick union all select * from uncommon_pick union all select * from rare_pick
  ), filler as (
    select id, pokemon_name, rarity, image_large from public.cards
    where set_id = v_pack.set_id and id not in (select id from preset)
    order by random() limit greatest(v_pack.cards_per_pack - (select count(*) from preset), 0)
  ), picked as (
    select * from preset union all select * from filler
  ), upserted as (
    insert into public.player_cards (player_id, card_id, quantity)
    select p_player_id, id, 1 from picked
    on conflict (player_id, card_id)
    do update set quantity = public.player_cards.quantity + 1
    returning card_id
  )
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.pokemon_name, 'rarity', p.rarity, 'image', p.image_large))
  into v_cards from picked p;

  update public.players
  set coins = coins - v_pack.price,
      xp = xp + 20,
      level = greatest(level, 1 + floor((xp + 20) / 250.0)::integer)
  where id = p_player_id
  returning coins, xp, level into v_new_coins, v_new_xp, v_new_level;

  insert into public.pack_openings (player_id, pack_id, cards_received)
  values (p_player_id, p_pack_id, coalesce(v_cards, '[]'::jsonb))
  returning id into v_opening_id;

  return jsonb_build_object('openingId', v_opening_id, 'cards', coalesce(v_cards, '[]'::jsonb), 'coins', v_new_coins, 'xp', v_new_xp, 'level', v_new_level, 'xpGained', 20);
end;
$$;

revoke all on function public.server_set_favorite(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.server_friend_action(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.server_claim_daily_reward(uuid) from public, anon, authenticated;
revoke all on function public.server_open_pack(uuid, uuid) from public, anon, authenticated;

grant execute on function public.server_set_favorite(uuid, text, boolean) to service_role;
grant execute on function public.server_friend_action(uuid, uuid, text) to service_role;
grant execute on function public.server_claim_daily_reward(uuid) to service_role;
grant execute on function public.server_open_pack(uuid, uuid) to service_role;
