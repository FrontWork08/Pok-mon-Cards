alter table public.pokemon_3d_models
  add column if not exists source_url text,
  add column if not exists source_author text,
  add column if not exists source_license text,
  add column if not exists source_license_url text;

comment on column public.pokemon_3d_models.source_url is 'Original source or direct asset URL used for the registered 3D model.';
comment on column public.pokemon_3d_models.source_author is 'Author or provider attribution for the 3D model.';
comment on column public.pokemon_3d_models.source_license is 'License or permission basis recorded when the 3D model was registered.';
comment on column public.pokemon_3d_models.source_license_url is 'Optional HTTPS URL describing the model license or permission terms.';
