create extension if not exists pgcrypto;

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

create policy "cards readable by authenticated players" on public.cards for select to authenticated using (true);
create policy "packs readable by authenticated players" on public.packs for select to authenticated using (active = true);
create policy "players readable by authenticated players" on public.players for select to authenticated using (true);
create policy "own inventory readable" on public.player_cards for select to authenticated using (player_id = auth.uid());
create policy "own openings readable" on public.pack_openings for select to authenticated using (player_id = auth.uid());
create policy "trade participants can read trades" on public.trades for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "trade participants can read trade cards" on public.trade_cards for select to authenticated using (exists (select 1 from public.trades t where t.id = trade_id and (t.sender_id = auth.uid() or t.receiver_id = auth.uid())));
create policy "friend participants can read" on public.friendships for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Intencionalmente não existem policies de INSERT/UPDATE para moedas,
-- inventário, packs abertos ou conclusão de trocas. Essas mutações devem
-- acontecer por funções server-side usando uma service role.
