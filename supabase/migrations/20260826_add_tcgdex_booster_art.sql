-- Real booster pack artwork from TCGdex.
alter table public.packs
  add column if not exists booster_art_url text,
  add column if not exists booster_art_urls text[] not null default '{}',
  add column if not exists booster_back_url text,
  add column if not exists booster_logo_url text,
  add column if not exists booster_art_source text,
  add column if not exists booster_art_checked_at timestamptz;

create index if not exists idx_packs_booster_art_checked_at
  on public.packs(booster_art_checked_at);

create or replace function public.server_refresh_booster_art_batch(p_batch_size integer default 4)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sets_response extensions.http_response;
  v_set_response extensions.http_response;
  v_sets jsonb := '[]'::jsonb;
  v_set jsonb;
  v_boosters jsonb;
  v_pack record;
  v_set_name text;
  v_tcg_id text;
  v_fronts text[];
  v_backs text[];
  v_logo text;
  v_processed integer := 0;
  v_found integer := 0;
  v_errors integer := 0;
begin
  v_sets_response := extensions.http_get('https://api.tcgdex.net/v2/en/sets');
  if v_sets_response.status <> 200 then
    return jsonb_build_object(
      'processed', 0,
      'found', 0,
      'errors', 1,
      'error', 'TCGDEX_SETS_FETCH_' || v_sets_response.status
    );
  end if;

  v_sets := v_sets_response.content::jsonb;

  for v_pack in
    select p.id, p.set_id, p.name
    from public.packs p
    where p.active = true
      and (
        p.booster_art_checked_at is null
        or p.booster_art_checked_at < now() - interval '30 days'
      )
    order by p.booster_art_checked_at nulls first, p.set_id
    limit greatest(1, least(coalesce(p_batch_size, 4), 20))
  loop
    begin
      v_processed := v_processed + 1;
      v_fronts := array[]::text[];
      v_backs := array[]::text[];
      v_logo := null;
      v_tcg_id := null;

      select c.set_name into v_set_name
      from public.cards c
      where c.set_id = v_pack.set_id
      limit 1;

      v_set_name := coalesce(v_set_name, regexp_replace(v_pack.name, '\s+Booster$', '', 'i'));

      select s->>'id' into v_tcg_id
      from jsonb_array_elements(v_sets) s
      where lower(s->>'id') = lower(v_pack.set_id)
      limit 1;

      if v_tcg_id is null then
        select s->>'id' into v_tcg_id
        from jsonb_array_elements(v_sets) s
        where regexp_replace(lower(coalesce(s->>'name','')), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(coalesce(v_set_name,'')), '[^a-z0-9]', '', 'g')
        limit 1;
      end if;

      if v_tcg_id is null then
        update public.packs
        set booster_art_checked_at = now(),
            booster_art_source = 'tcgdex:no_match'
        where id = v_pack.id;
        continue;
      end if;

      v_set_response := extensions.http_get(
        'https://api.tcgdex.net/v2/en/sets/' || v_tcg_id
      );

      if v_set_response.status <> 200 then
        update public.packs
        set booster_art_checked_at = now(),
            booster_art_source = 'tcgdex:http_' || v_set_response.status
        where id = v_pack.id;
        v_errors := v_errors + 1;
        continue;
      end if;

      v_set := v_set_response.content::jsonb;
      v_boosters := coalesce(v_set->'boosters', '[]'::jsonb);

      select coalesce(array_agg(front_url order by ord), array[]::text[])
      into v_fronts
      from (
        select
          b.ordinality as ord,
          case
            when nullif(b.value->>'artwork_front','') is null then null
            when (b.value->>'artwork_front') ~* '\.(png|jpe?g|webp)$' then b.value->>'artwork_front'
            else (b.value->>'artwork_front') || '.png'
          end as front_url
        from jsonb_array_elements(v_boosters) with ordinality as b(value, ordinality)
      ) q
      where front_url is not null;

      select coalesce(array_agg(back_url order by ord), array[]::text[])
      into v_backs
      from (
        select
          b.ordinality as ord,
          case
            when nullif(b.value->>'artwork_back','') is null then null
            when (b.value->>'artwork_back') ~* '\.(png|jpe?g|webp)$' then b.value->>'artwork_back'
            else (b.value->>'artwork_back') || '.png'
          end as back_url
        from jsonb_array_elements(v_boosters) with ordinality as b(value, ordinality)
      ) q
      where back_url is not null;

      select
        case
          when nullif(b.value->>'logo','') is null then null
          when (b.value->>'logo') ~* '\.(png|jpe?g|webp)$' then b.value->>'logo'
          else (b.value->>'logo') || '.png'
        end
      into v_logo
      from jsonb_array_elements(v_boosters) with ordinality as b(value, ordinality)
      where nullif(b.value->>'logo','') is not null
      order by b.ordinality
      limit 1;

      update public.packs
      set booster_art_url = case when cardinality(v_fronts) > 0 then v_fronts[1] else null end,
          booster_art_urls = v_fronts,
          booster_back_url = case when cardinality(v_backs) > 0 then v_backs[1] else null end,
          booster_logo_url = v_logo,
          booster_art_source = case when cardinality(v_fronts) > 0 then 'tcgdex' else 'tcgdex:no_art' end,
          booster_art_checked_at = now()
      where id = v_pack.id;

      if cardinality(v_fronts) > 0 then
        v_found := v_found + 1;
      end if;
    exception when others then
      v_errors := v_errors + 1;
      update public.packs
      set booster_art_checked_at = now(),
          booster_art_source = 'tcgdex:error'
      where id = v_pack.id;
    end;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'found', v_found,
    'errors', v_errors,
    'remaining', (
      select count(*)
      from public.packs p
      where p.active = true
        and (
          p.booster_art_checked_at is null
          or p.booster_art_checked_at < now() - interval '30 days'
        )
    )
  );
end;
$$;

revoke all on function public.server_refresh_booster_art_batch(integer)
  from public, anon, authenticated;
grant execute on function public.server_refresh_booster_art_batch(integer)
  to service_role;

create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_boosters jsonb;
begin
  v_battles := server_process_expired_battles();
  v_push := server_dispatch_push_notifications();

  if exists(
    select 1 from catalog_refresh_state
    where job_name='full_tcg_refresh' and status='running'
  ) then
    begin
      v_catalog := server_refresh_catalog_batch(2);
    exception when others then
      v_catalog := jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog := jsonb_build_object('status','idle');
  end if;

  if exists(
    select 1
    from packs
    where active = true
      and (
        booster_art_checked_at is null
        or booster_art_checked_at < now() - interval '30 days'
      )
  ) then
    begin
      v_boosters := server_refresh_booster_art_batch(3);
    exception when others then
      v_boosters := jsonb_build_object('error',sqlerrm);
    end;
  else
    v_boosters := jsonb_build_object('status','idle');
  end if;

  return jsonb_build_object(
    'battles',v_battles,
    'pushes',v_push,
    'catalog',v_catalog,
    'boosterArt',v_boosters,
    'at',now()
  );
end;
$$;

revoke all on function public.server_background_tick()
  from public,anon,authenticated;
grant execute on function public.server_background_tick()
  to service_role;
