-- Trainer Collection 1.0 transition campaign.
-- The Beta keeps running normally. This only powers the recurring notice,
-- per-account poll, and future server-controlled transition states.

create table if not exists public.release_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  target_version text not null,
  release_date date not null,
  phase text not null default 'notice'
    check (phase in ('notice','legacy_selection','freeze','update_required','completed')),
  body text not null,
  active boolean not null default true,
  reward_coins bigint not null default 0 check (reward_coins >= 0),
  reward_diamonds integer not null default 0 check (reward_diamonds >= 0),
  legacy_card_limit integer not null default 0 check (legacy_card_limit >= 0),
  legacy_selection_enabled boolean not null default false,
  economy_frozen boolean not null default false,
  force_update boolean not null default false,
  download_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_campaign_votes (
  campaign_id uuid not null references public.release_campaigns(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  vote smallint not null check (vote in (-1,1)),
  feedback_text text check (feedback_text is null or char_length(feedback_text) <= 1000),
  responded_at timestamptz not null default now(),
  primary key (campaign_id, player_id)
);

create index if not exists release_campaign_votes_player_idx
  on public.release_campaign_votes(player_id, responded_at desc);

alter table public.release_campaigns enable row level security;
alter table public.release_campaign_votes enable row level security;

revoke all on table public.release_campaigns from anon, authenticated;
revoke all on table public.release_campaign_votes from anon, authenticated;

grant select on table public.release_campaigns to authenticated;
grant select, insert on table public.release_campaign_votes to authenticated;
grant select, insert, update, delete on table public.release_campaigns to service_role;
grant select, insert, update, delete on table public.release_campaign_votes to service_role;

drop policy if exists release_campaigns_authenticated_read on public.release_campaigns;
create policy release_campaigns_authenticated_read
on public.release_campaigns
for select
to authenticated
using (active = true);

drop policy if exists release_campaign_votes_read_own on public.release_campaign_votes;
create policy release_campaign_votes_read_own
on public.release_campaign_votes
for select
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists release_campaign_votes_insert_own on public.release_campaign_votes;
create policy release_campaign_votes_insert_own
on public.release_campaign_votes
for insert
to authenticated
with check (
  (select auth.uid()) = player_id
  and exists (
    select 1
    from public.release_campaigns c
    where c.id = campaign_id
      and c.active = true
  )
);

insert into public.release_campaigns (
  code,title,target_version,release_date,phase,body,
  reward_coins,reward_diamonds,legacy_card_limit,
  legacy_selection_enabled,economy_frozen,force_update,download_url,active
)
values (
  'trainer_collection_1_0_beta_transition',
  'Trainer Collection 1.0',
  '1.0.0',
  date '2026-09-05',
  'notice',
  'A Beta continua funcionando normalmente até o lançamento. Na versão 1.0 sua conta será preservada, mas o progresso econômico será reiniciado para começar uma economia justa. Veteranos poderão manter até 10 cartas escolhidas e receberão a recompensa de lançamento.',
  100000,
  15,
  10,
  false,
  false,
  false,
  null,
  true
)
on conflict (code) do update
set
  title=excluded.title,
  target_version=excluded.target_version,
  release_date=excluded.release_date,
  phase=excluded.phase,
  body=excluded.body,
  reward_coins=excluded.reward_coins,
  reward_diamonds=excluded.reward_diamonds,
  legacy_card_limit=excluded.legacy_card_limit,
  legacy_selection_enabled=excluded.legacy_selection_enabled,
  economy_frozen=excluded.economy_frozen,
  force_update=excluded.force_update,
  download_url=excluded.download_url,
  active=excluded.active,
  updated_at=now();
