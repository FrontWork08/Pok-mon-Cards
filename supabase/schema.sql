create extension if not exists pgcrypto;
create schema if not exists private;

create type public.friend_status as enum ('pending', 'accepted', 'blocked');
create type public.trade_status as enum ('pending', 'accepted', 'rejected', 'cancelled', 'completed');

create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  coins bigint not null default 1000 check (coins >= 0),
  level integer not null default 1 check (level >= 1),
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);

create table public.cards (
  id text primary key,
  pokemon_name text not null,
  pokedex_numbers integer[] not null default '{}',
  set_id text not null,
  set_name text not null,
  card_number text,
  rarity text,
  types text[] not null default '{}',
  image_small text,
  image_large text,
  tcg_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cards_name_idx on public.cards using gin (to_tsvector('simple', pokemon_name));
create index cards_set_idx on public.cards(set_id);

create table public.player_cards (
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  favorite boolean not null default false,
  first_obtained_at timestamptz not null default now(),
  primary key (player_id, card_id)
);

create table public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  set_id text not null,
  price bigint not null check (price >= 0),
  cards_per_pack integer not null default 10 check (cards_per_pack > 0),
  image_url text,
  active boolean not null default true
);

create unique index packs_set_id_unique on public.packs(set_id);

create table public.pack_openings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  pack_id uuid not null references public.packs(id) on delete restrict,
  cards_received jsonb not null,
  opened_at timestamptz not null default now()
);

create table public.friendships (
  requester_id uuid not null references public.players(id) on delete cascade,
  addressee_id uuid not null references public.players(id) on delete cascade,
  status public.friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.players(id) on delete cascade,
  receiver_id uuid not null references public.players(id) on delete cascade,
  status public.trade_status not null default 'pending',
  sender_confirmed boolean not null default false,
  receiver_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table public.trade_cards (
  trade_id uuid not null references public.trades(id) on delete cascade,
  owner_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  primary key (trade_id, owner_id, card_id)
);

alter table public.players enable row level security;
alter table public.cards enable row level security;
alter table public.player_cards enable row level security;
alter table public.packs enable row level security;
alter table public.pack_openings enable row level security;
alter table public.friendships enable row level security;
alter table public.trades enable row level security;
alter table public.trade_cards enable row level security;

grant usage on schema public to authenticated;
grant select on public.players, public.cards, public.player_cards, public.packs,
  public.pack_openings, public.friendships, public.trades, public.trade_cards to authenticated;

grant usage on schema public to service_role;
grant select, insert, update on public.cards, public.packs to service_role;

create policy "cards readable by authenticated players" on public.cards for select to authenticated using (true);
create policy "packs readable by authenticated players" on public.packs for select to authenticated using (active = true);
create policy "players readable by authenticated players" on public.players for select to authenticated using (true);
create policy "own inventory readable" on public.player_cards for select to authenticated using (player_id = (select auth.uid()));
create policy "own openings readable" on public.pack_openings for select to authenticated using (player_id = (select auth.uid()));
create policy "trade participants can read trades" on public.trades for select to authenticated using (sender_id = (select auth.uid()) or receiver_id = (select auth.uid()));
create policy "trade participants can read trade cards" on public.trade_cards for select to authenticated using (exists (select 1 from public.trades t where t.id = trade_id and (t.sender_id = (select auth.uid()) or t.receiver_id = (select auth.uid()))));
create policy "friend participants can read" on public.friendships for select to authenticated using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired_username text;
begin
  desired_username := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), 'trainer_' || substr(new.id::text, 1, 8));
  insert into public.players (id, username) values (new.id, desired_username);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- Server-only RPC. Coins, inventory and opening history commit together.
-- Packs prefer a real-like composition: commons + uncommons + at least one
-- rare-or-higher when that set has those rarity pools, then random fallback.
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
begin
  select * into v_pack from public.packs where id = p_pack_id and active = true for share;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;

  select coins into v_coins from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  if v_coins < v_pack.price then raise exception 'NOT_ENOUGH_COINS'; end if;

  select count(*) into v_count from public.cards where set_id = v_pack.set_id;
  if v_count < 1 then raise exception 'EMPTY_PACK_POOL'; end if;

  with common_pick as (
    select id, pokemon_name, rarity, image_large
    from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity, '')) = 'common'
    order by random()
    limit greatest(v_pack.cards_per_pack - 3, 0)
  ), uncommon_pick as (
    select id, pokemon_name, rarity, image_large
    from public.cards
    where set_id = v_pack.set_id and lower(coalesce(rarity, '')) = 'uncommon'
      and id not in (select id from common_pick)
    order by random()
    limit least(2, greatest(v_pack.cards_per_pack - 1, 0))
  ), rare_pick as (
    select id, pokemon_name, rarity, image_large
    from public.cards
    where set_id = v_pack.set_id
      and rarity is not null
      and lower(rarity) not in ('common', 'uncommon')
      and id not in (select id from common_pick)
      and id not in (select id from uncommon_pick)
    order by random()
    limit case when v_pack.cards_per_pack > 0 then 1 else 0 end
  ), preset as (
    select * from common_pick
    union all select * from uncommon_pick
    union all select * from rare_pick
  ), filler as (
    select id, pokemon_name, rarity, image_large
    from public.cards
    where set_id = v_pack.set_id
      and id not in (select id from preset)
    order by random()
    limit greatest(v_pack.cards_per_pack - (select count(*) from preset), 0)
  ), picked as (
    select * from preset
    union all select * from filler
  ), upserted as (
    insert into public.player_cards (player_id, card_id, quantity)
    select p_player_id, id, 1 from picked
    on conflict (player_id, card_id)
    do update set quantity = public.player_cards.quantity + 1
    returning card_id
  )
  select jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.pokemon_name,
    'rarity', p.rarity,
    'image', p.image_large
  )) into v_cards
  from picked p;

  update public.players set coins = coins - v_pack.price where id = p_player_id;

  insert into public.pack_openings (player_id, pack_id, cards_received)
  values (p_player_id, p_pack_id, coalesce(v_cards, '[]'::jsonb))
  returning id into v_opening_id;

  return jsonb_build_object('openingId', v_opening_id, 'cards', coalesce(v_cards, '[]'::jsonb));
end;
$$;

revoke all on function public.server_open_pack(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_open_pack(uuid, uuid) to service_role;

-- Client users receive only SELECT grants. Mutations involving coins, Bag,
-- boosters, catalog administration and trade settlement stay server-side.
