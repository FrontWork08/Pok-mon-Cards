create table if not exists public.pokemon_3d_models (
  id uuid primary key default gen_random_uuid(),
  pokemon_id integer not null check (pokemon_id > 0 and pokemon_id <= 10000),
  form_key text not null default 'default' check (char_length(form_key) between 1 and 80),
  storage_path text not null check (char_length(storage_path) between 1 and 500 and storage_path !~ '(^|/)\.\.(/|$)'),
  format text not null default 'glb' check (format = 'glb'),
  version integer not null default 1 check (version > 0),
  sha256 text null check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$'),
  byte_size bigint null check (byte_size is null or (byte_size > 0 and byte_size <= 26214400)),
  scale real not null default 1 check (scale > 0 and scale <= 20),
  offset_x real not null default 0 check (offset_x between -20 and 20),
  offset_y real not null default 0 check (offset_y between -20 and 20),
  offset_z real not null default 0 check (offset_z between -20 and 20),
  rotation_y real not null default 0 check (rotation_y between -6.28319 and 6.28319),
  animations jsonb not null default '{}'::jsonb check (jsonb_typeof(animations) = 'object'),
  enabled boolean not null default true,
  min_app_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pokemon_id, form_key)
);

create index if not exists pokemon_3d_models_enabled_lookup_idx
  on public.pokemon_3d_models (pokemon_id, form_key, version desc)
  where enabled = true;

alter table public.pokemon_3d_models enable row level security;

drop policy if exists pokemon_3d_models_public_read on public.pokemon_3d_models;
create policy pokemon_3d_models_public_read
  on public.pokemon_3d_models
  for select
  to anon, authenticated
  using (enabled = true);

revoke insert, update, delete, truncate, references, trigger
  on public.pokemon_3d_models from anon, authenticated;
grant select on public.pokemon_3d_models to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pokemon-3d',
  'pokemon-3d',
  true,
  26214400,
  array['model/gltf-binary', 'application/octet-stream']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.pokemon_3d_models is
  'Versioned registry for remotely delivered, licensed/user-owned Pokemon battle GLB assets. Clients have read-only access to enabled rows.';
comment on column public.pokemon_3d_models.version is
  'Increment when replacing a model so clients automatically invalidate the cached GLB.';
comment on column public.pokemon_3d_models.animations is
  'Optional semantic clip mapping, e.g. {"idle":"Idle","attack":"Attack","hit":"Hit","faint":"Faint","victory":"Victory"}.';
