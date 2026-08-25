-- Social, chat, decks, Mystery Battle and daily missions foundation.
create table if not exists public.player_settings (
  player_id uuid primary key references public.players(id) on delete cascade,
  appearance text not null default 'dark' check (appearance in ('system','dark','light')),
  theme text not null default 'trainer' check (theme in ('trainer','midnight','poke_red','electric','ghost','fire','water')),
  chat_notifications boolean not null default true,
  battle_invites boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.player_settings(player_id) select id from public.players on conflict(player_id) do nothing;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.players(id) on delete cascade,
  player_b uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(player_a<>player_b), unique(player_a,player_b)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.players(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 1000),
  kind text not null default 'text' check(kind in ('text','battle_invite','battle_event','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), read_at timestamptz
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 40), is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade,
  quantity integer not null default 1 check(quantity between 1 and 4), primary key(deck_id,card_id)
);

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.players(id) on delete cascade,
  opponent_id uuid not null references public.players(id) on delete cascade,
  mode text not null default 'quick' check(mode in ('quick','mystery')),
  stake_type text not null default 'none' check(stake_type in ('none','coins','card')),
  wager_coins bigint not null default 0 check(wager_coins>=0),
  status text not null default 'invited' check(status in ('invited','selecting','revealing','completed','declined','cancelled','expired')),
  rounds_to_win integer not null default 1 check(rounds_to_win between 1 and 2),
  active_round integer not null default 1 check(active_round between 1 and 3),
  selection_seconds integer not null default 30 check(selection_seconds between 10 and 90),
  selection_deadline timestamptz,
  challenger_score integer not null default 0, opponent_score integer not null default 0,
  winner_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  check(challenger_id<>opponent_id),
  check((stake_type='coins' and wager_coins>0) or (stake_type<>'coins' and wager_coins=0))
);
create table if not exists public.battle_selections (
  battle_id uuid not null references public.battles(id) on delete cascade,
  round_no integer not null check(round_no between 1 and 3),
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  locked_at timestamptz not null default now(), primary key(battle_id,round_no,player_id)
);
create table if not exists public.battle_rounds (
  battle_id uuid not null references public.battles(id) on delete cascade,
  round_no integer not null check(round_no between 1 and 3),
  challenger_card_id text not null references public.cards(id) on delete restrict,
  opponent_card_id text not null references public.cards(id) on delete restrict,
  challenger_power numeric not null, opponent_power numeric not null,
  challenger_roll numeric not null, opponent_roll numeric not null,
  winner_id uuid references public.players(id) on delete set null,
  resolved_at timestamptz not null default now(), primary key(battle_id,round_no)
);
create table if not exists public.battle_coin_escrows (
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  amount bigint not null check(amount>0), status text not null default 'held' check(status in ('held','paid','refunded')),
  updated_at timestamptz not null default now(), primary key(battle_id,player_id)
);
create table if not exists public.battle_card_stakes (
  battle_id uuid not null references public.battles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete restrict,
  quantity integer not null default 1 check(quantity=1), status text not null default 'held' check(status in ('held','paid','refunded')),
  updated_at timestamptz not null default now(), primary key(battle_id,player_id)
);
create table if not exists public.battle_events (
  id bigint generated by default as identity primary key,
  battle_id uuid not null references public.battles(id) on delete cascade,
  event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.mission_templates (
  id text primary key, title text not null, description text not null, event_type text not null,
  target integer not null check(target>0), reward_coins bigint not null default 0 check(reward_coins>=0),
  reward_xp bigint not null default 0 check(reward_xp>=0), active boolean not null default true
);
create table if not exists public.player_daily_missions (
  player_id uuid not null references public.players(id) on delete cascade,
  mission_date date not null default current_date,
  mission_id text not null references public.mission_templates(id) on delete cascade,
  progress integer not null default 0 check(progress>=0), claimed boolean not null default false,
  updated_at timestamptz not null default now(), primary key(player_id,mission_date,mission_id)
);
insert into public.mission_templates(id,title,description,event_type,target,reward_coins,reward_xp) values
 ('open_2_packs','Abridor de boosters','Abra 2 boosters hoje.','pack_opened',2,400,25),
 ('play_2_battles','Treinador ativo','Participe de 2 batalhas hoje.','battle_completed',2,500,30),
 ('win_1_battle','Vitória misteriosa','Vença 1 batalha hoje.','battle_won',1,750,50),
 ('use_3_species','Variedade de equipe','Use 3 espécies diferentes em batalhas.','battle_species',3,350,25)
on conflict(id) do update set title=excluded.title,description=excluded.description,event_type=excluded.event_type,target=excluded.target,reward_coins=excluded.reward_coins,reward_xp=excluded.reward_xp,active=true;

create index if not exists conversations_player_a_idx on public.conversations(player_a,updated_at desc);
create index if not exists conversations_player_b_idx on public.conversations(player_b,updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists messages_unread_idx on public.messages(conversation_id,read_at) where read_at is null;
create index if not exists messages_sender_idx on public.messages(sender_id);
create index if not exists decks_player_idx on public.decks(player_id,updated_at desc);
create index if not exists deck_cards_card_idx on public.deck_cards(card_id);
create unique index if not exists decks_one_default_per_player on public.decks(player_id) where is_default;
create index if not exists battles_challenger_idx on public.battles(challenger_id,updated_at desc);
create index if not exists battles_opponent_idx on public.battles(opponent_id,updated_at desc);
create index if not exists battles_winner_idx on public.battles(winner_id);
create index if not exists battle_events_battle_idx on public.battle_events(battle_id,id desc);
create index if not exists battle_selections_player_idx on public.battle_selections(player_id);
create index if not exists battle_selections_card_idx on public.battle_selections(card_id);
create index if not exists battle_rounds_challenger_card_idx on public.battle_rounds(challenger_card_id);
create index if not exists battle_rounds_opponent_card_idx on public.battle_rounds(opponent_card_id);
create index if not exists battle_rounds_winner_idx on public.battle_rounds(winner_id);
create index if not exists battle_coin_escrows_player_idx on public.battle_coin_escrows(player_id);
create index if not exists battle_card_stakes_card_idx on public.battle_card_stakes(card_id);
create index if not exists battle_card_stakes_player_idx on public.battle_card_stakes(player_id);
create index if not exists player_daily_missions_mission_idx on public.player_daily_missions(mission_id);

alter table public.player_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.battles enable row level security;
alter table public.battle_selections enable row level security;
alter table public.battle_rounds enable row level security;
alter table public.battle_coin_escrows enable row level security;
alter table public.battle_card_stakes enable row level security;
alter table public.battle_events enable row level security;
alter table public.mission_templates enable row level security;
alter table public.player_daily_missions enable row level security;

create policy player_settings_own_select on public.player_settings for select using(player_id=(select auth.uid()));
create policy player_settings_own_update on public.player_settings for update using(player_id=(select auth.uid())) with check(player_id=(select auth.uid()));
create policy player_settings_own_insert on public.player_settings for insert with check(player_id=(select auth.uid()));
create policy conversations_participant_select on public.conversations for select using((select auth.uid()) in(player_a,player_b));
create policy messages_participant_select on public.messages for select using(exists(select 1 from public.conversations c where c.id=conversation_id and (select auth.uid()) in(c.player_a,c.player_b)));
create policy decks_owner_select on public.decks for select using(player_id=(select auth.uid()));
create policy deck_cards_owner_select on public.deck_cards for select using(exists(select 1 from public.decks d where d.id=deck_id and d.player_id=(select auth.uid())));
create policy battles_participant_select on public.battles for select using((select auth.uid()) in(challenger_id,opponent_id));
create policy battle_selections_deny_client on public.battle_selections for all to anon,authenticated using(false) with check(false);
create policy battle_rounds_participant_select on public.battle_rounds for select using(exists(select 1 from public.battles b where b.id=battle_id and (select auth.uid()) in(b.challenger_id,b.opponent_id)));
create policy battle_escrows_participant_select on public.battle_coin_escrows for select using(exists(select 1 from public.battles b where b.id=battle_id and (select auth.uid()) in(b.challenger_id,b.opponent_id)));
create policy battle_card_stakes_participant_select on public.battle_card_stakes for select using(exists(select 1 from public.battles b where b.id=battle_id and (select auth.uid()) in(b.challenger_id,b.opponent_id)));
create policy battle_events_participant_select on public.battle_events for select using(exists(select 1 from public.battles b where b.id=battle_id and (select auth.uid()) in(b.challenger_id,b.opponent_id)));
create policy mission_templates_authenticated_select on public.mission_templates for select to authenticated using(active);
create policy player_daily_missions_own_select on public.player_daily_missions for select using(player_id=(select auth.uid()));

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battles') then alter publication supabase_realtime add table public.battles; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battle_events') then alter publication supabase_realtime add table public.battle_events; end if;
  end if;
end $$;
