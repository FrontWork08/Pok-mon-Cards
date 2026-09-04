-- Gamepass Pro foundation: private-by-default storage and server entitlement guard.

create table if not exists public.bag_pro_presets (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
  name text not null, filters jsonb not null default '{}'::jsonb, sort_mode text not null default 'recent',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(player_id,name),
  check (char_length(btrim(name)) between 1 and 40), check (sort_mode in ('recent','name','value','damage','hp','quantity','rarity'))
);
create table if not exists public.bag_pro_folders (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
  name text not null, icon text not null default 'folder', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(player_id,name), unique(id,player_id), check (char_length(btrim(name)) between 1 and 40)
);
create table if not exists public.bag_pro_folder_cards (
  folder_id uuid not null, player_id uuid not null references public.players(id) on delete cascade,
  card_id text not null references public.cards(id) on delete cascade, added_at timestamptz not null default now(),
  primary key(folder_id,card_id), foreign key(folder_id,player_id) references public.bag_pro_folders(id,player_id) on delete cascade
);
create table if not exists public.marketplace_pro_watches (
  player_id uuid not null references public.players(id) on delete cascade, card_id text not null references public.cards(id) on delete cascade,
  target_price_usd numeric, target_listing_coins bigint, notify_below boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(player_id,card_id),
  check (target_price_usd is null or target_price_usd > 0), check (target_listing_coins is null or target_listing_coins > 0)
);
create table if not exists public.collector_pro_goals (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.players(id) on delete cascade,
  kind text not null, goal_key text not null default '', label text not null, target numeric not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (kind in ('set','type','unique','value')), check (char_length(btrim(label)) between 1 and 60), check (target > 0)
);
create table if not exists public.guild_pro_member_roles (
  guild_id text not null references public.guilds(id) on delete cascade, player_id uuid not null references public.players(id) on delete cascade,
  role_key text not null, assigned_by uuid not null references public.players(id) on delete cascade, updated_at timestamptz not null default now(),
  primary key(guild_id,player_id), check (role_key in ('strategist','recruiter','collector','defender','event_lead','market_lead'))
);
create table if not exists public.guild_pro_settings (
  guild_id text primary key references public.guilds(id) on delete cascade, accent_color text not null default '#FFD447', badge text not null default 'PRO',
  announcement text not null default '', updated_by uuid not null references public.players(id) on delete cascade, updated_at timestamptz not null default now(),
  check (accent_color ~ '^#[0-9A-Fa-f]{6}$'), check (char_length(badge) <= 16), check (char_length(announcement) <= 180)
);
create table if not exists public.guild_pro_audit_log (
  id bigint generated always as identity primary key, guild_id text not null references public.guilds(id) on delete cascade,
  actor_id uuid not null references public.players(id) on delete cascade, action text not null, target_id uuid references public.players(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.player_battle_styles (
  player_id uuid primary key references public.players(id) on delete cascade, arena_style text not null default 'classic',
  entrance_fx text not null default 'flash', switch_fx text not null default 'pulse', updated_at timestamptz not null default now(),
  check (arena_style in ('classic','kanto_night','neon_grid','champion_gold','galaxy_void')),
  check (entrance_fx in ('flash','scan','spark','warp','none')), check (switch_fx in ('pulse','slide','spark','warp','none'))
);
create table if not exists public.replay_pro_favorites (
  player_id uuid not null references public.players(id) on delete cascade, battle_id uuid not null references public.battles(id) on delete cascade,
  label text not null default '', notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(player_id,battle_id), check (char_length(label) <= 40), check (char_length(notes) <= 240)
);

do $$ declare t text; begin
  foreach t in array array['bag_pro_presets','bag_pro_folders','bag_pro_folder_cards','marketplace_pro_watches','collector_pro_goals','guild_pro_member_roles','guild_pro_settings','guild_pro_audit_log','player_battle_styles','replay_pro_favorites'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
  end loop;
end $$;

create or replace function private.require_gamepass(p_gamepass text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_player uuid:=auth.uid(); begin if v_player is null then raise exception 'UNAUTHORIZED'; end if; if not private.player_has_gamepass(v_player,p_gamepass) then raise exception 'GAMEPASS_REQUIRED:%',p_gamepass; end if; return v_player; end; $$;
revoke all on function private.require_gamepass(text) from public,anon,authenticated;

update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/bag-pro"'::jsonb,true) where id='bag_pro';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/marketplace-pro"'::jsonb,true) where id='marketplace_pro';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/collector-pass"'::jsonb,true) where id='collector_pass';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/guild-pro"'::jsonb,true) where id='guild_pro';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/battle-style-pass"'::jsonb,true) where id='battle_style_pass';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/museum-pro"'::jsonb,true) where id='museum_pro';
update public.gamepass_catalog set metadata=jsonb_set(metadata,'{route}','"/replay-pro"'::jsonb,true) where id='replay_pro';
