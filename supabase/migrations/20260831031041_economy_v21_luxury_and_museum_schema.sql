create table if not exists public.player_luxury_rotation (
  player_id uuid primary key references public.players(id) on delete cascade,
  week_start date not null default date_trunc('week',now())::date,
  reroll_count integer not null default 0 check (reroll_count >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.player_museum_progress (
  player_id uuid primary key references public.players(id) on delete cascade,
  level integer not null default 0 check (level between 0 and 5),
  total_spent_coins bigint not null default 0 check (total_spent_coins >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.player_museum_cards (
  player_id uuid not null references public.players(id) on delete cascade,
  slot integer not null check (slot between 1 and 18),
  card_id text not null references public.cards(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key(player_id,slot),
  unique(player_id,card_id)
);
alter table public.players add column if not exists equipped_economy_title_id text references public.economy_store_items(id) on delete set null;
alter table public.player_luxury_rotation enable row level security;
alter table public.player_museum_progress enable row level security;
alter table public.player_museum_cards enable row level security;
drop policy if exists "own luxury rotation readable" on public.player_luxury_rotation;
create policy "own luxury rotation readable" on public.player_luxury_rotation for select to authenticated using(player_id=auth.uid());
drop policy if exists "own museum progress readable" on public.player_museum_progress;
create policy "own museum progress readable" on public.player_museum_progress for select to authenticated using(player_id=auth.uid());
drop policy if exists "own museum cards readable" on public.player_museum_cards;
create policy "own museum cards readable" on public.player_museum_cards for select to authenticated using(player_id=auth.uid());
grant select on public.player_luxury_rotation,public.player_museum_progress,public.player_museum_cards to authenticated;

insert into public.cosmetic_definitions(id,kind,name,description,icon,primary_color,secondary_color,unlock_type,threshold,unlock_key,sort_order,active) values
('lux_frame_crimson','frame','Crimson Crown','Moldura semanal da Loja de Luxo.','flame','#FF667A','#2B1017','coin_shop',0,null,220,true),
('lux_bg_celestial','background','Celestial Vault','Background semanal de alto prestígio.','planet','#8EE7FF','#12152B','coin_shop',0,null,221,true)
on conflict(id) do nothing;

insert into public.economy_store_items(id,category,name,description,icon,price_coins,rarity,metadata,sort_order) values
('lux_frame_crimson','profile_frame','Crimson Crown','Moldura exclusiva da rotação semanal.','flame',350000,'luxury','{"cosmeticId":"lux_frame_crimson","luxuryOnly":true}',100),
('lux_bg_celestial','profile_background','Celestial Vault','Background exclusivo da rotação semanal.','planet',600000,'luxury','{"cosmeticId":"lux_bg_celestial","luxuryOnly":true}',101),
('lux_card_prism','card_style','Prism Signature','Acabamento raro para uma carta da galeria.','color-wand',500000,'luxury','{"applyCost":150000,"luxuryOnly":true}',102),
('lux_deck_crown','deck_style','Crown Deck','Visual raro para um deck de prestígio.','trophy',400000,'luxury','{"applyCost":100000,"luxuryOnly":true}',103),
('lux_shop_celestial','shop_theme','Celestial Market','Tema semanal para a loja do Marketplace.','planet',900000,'luxury','{"themeStyle":"celestial","luxuryOnly":true}',104),
('lux_fx_legend','booster_fx','Legend Burst','Efeito de abertura da Loja de Luxo.','flash',2500000,'luxury','{"luxuryOnly":true}',105),
('lux_title_tycoon','title','Magnata Trainer','Título econômico da rotação de luxo.','diamond',1500000,'luxury','{"luxuryOnly":true}',106),
('auction_master_crown','trophy','Master Crown','Troféu exclusivo de leilões oficiais do jogo.','trophy',9999999,'auction','{"notForDirectSale":true}',120)
on conflict(id) do update set category=excluded.category,name=excluded.name,description=excluded.description,icon=excluded.icon,price_coins=excluded.price_coins,rarity=excluded.rarity,metadata=excluded.metadata,sort_order=excluded.sort_order;
