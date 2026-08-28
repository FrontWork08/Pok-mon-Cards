-- Admin Abuse economy rule:
-- Coin boosters are free.
-- Diamond boosters are 50% off, rounded up for odd prices (ceil(price / 2)).
-- The Legendary Diamond Vault follows the same diamond rule.

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.server_open_pack(uuid,uuid)'::regprocedure) into v_def;

  if position(
    '  v_effective_price := case when v_free_until is null then v_pack.price else 0 end;' || E'\n' ||
    '  v_currency := coalesce(v_pack.currency,''coins'');'
    in v_def
  ) = 0 then
    raise exception 'SERVER_OPEN_PACK_SOURCE_MISMATCH';
  end if;

  v_def := replace(
    v_def,
    '  v_effective_price := case when v_free_until is null then v_pack.price else 0 end;' || E'\n' ||
    '  v_currency := coalesce(v_pack.currency,''coins'');',
    '  v_currency := coalesce(v_pack.currency,''coins'');' || E'\n' ||
    '  v_effective_price := case' || E'\n' ||
    '    when v_free_until is null then v_pack.price' || E'\n' ||
    '    when v_currency = ''diamonds'' then (v_pack.price + 1) / 2' || E'\n' ||
    '    else 0' || E'\n' ||
    '  end;'
  );

  execute v_def;
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.server_open_legendary_diamond_pack(uuid)'::regprocedure) into v_def;

  if position('  v_opening_id uuid;' in v_def) = 0
     or position(
       '  if v_diamonds < v_config.cost_diamonds then raise exception ''NOT_ENOUGH_DIAMONDS''; end if;'
       in v_def
     ) = 0 then
    raise exception 'LEGENDARY_PACK_SOURCE_MISMATCH';
  end if;

  v_def := replace(
    v_def,
    '  v_opening_id uuid;',
    '  v_opening_id uuid;' || E'\n' ||
    '  v_free_until timestamptz;' || E'\n' ||
    '  v_effective_price integer;'
  );

  v_def := replace(
    v_def,
    '  if not found or not v_config.active then raise exception ''PACK_NOT_AVAILABLE''; end if;',
    '  if not found or not v_config.active then raise exception ''PACK_NOT_AVAILABLE''; end if;' || E'\n' ||
    '  select max(ends_at) into v_free_until' || E'\n' ||
    '  from public.admin_game_events' || E'\n' ||
    '  where event_type = ''free_boosters''' || E'\n' ||
    '    and active = true and starts_at <= now() and ends_at > now();' || E'\n' ||
    '  v_effective_price := case' || E'\n' ||
    '    when v_free_until is null then v_config.cost_diamonds' || E'\n' ||
    '    else (v_config.cost_diamonds + 1) / 2' || E'\n' ||
    '  end;'
  );

  v_def := replace(
    v_def,
    '  if v_diamonds < v_config.cost_diamonds then raise exception ''NOT_ENOUGH_DIAMONDS''; end if;',
    '  if v_diamonds < v_effective_price then raise exception ''NOT_ENOUGH_DIAMONDS''; end if;'
  );

  v_def := replace(
    v_def,
    '  update public.players set diamonds=diamonds-v_config.cost_diamonds',
    '  update public.players set diamonds=diamonds-v_effective_price'
  );

  v_def := replace(
    v_def,
    '  values(p_player_id,v_card.id,v_config.cost_diamonds,v_snapshot)',
    '  values(p_player_id,v_card.id,v_effective_price,v_snapshot)'
  );

  v_def := replace(
    v_def,
    '    ''diamonds'',v_diamonds,''pricePaid'',v_config.cost_diamonds',
    '    ''diamonds'',v_diamonds,''pricePaid'',v_effective_price,''freeBoostersUntil'',v_free_until'
  );

  execute v_def;
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.server_admin_start_free_boosters(uuid,integer)'::regprocedure) into v_def;

  if position('''Admin Abuse: boosters grátis''' in v_def) = 0 then
    raise exception 'ADMIN_ABUSE_SOURCE_MISMATCH';
  end if;

  v_def := replace(
    v_def,
    '''Admin Abuse: boosters grátis''',
    '''Admin Abuse: Coins grátis + Diamantes 50% OFF'''
  );

  execute v_def;
end $$;

revoke all on function public.server_open_pack(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.server_open_pack(uuid,uuid)
to service_role;

revoke all on function public.server_open_legendary_diamond_pack(uuid)
from public,anon,authenticated;
grant execute on function public.server_open_legendary_diamond_pack(uuid)
to service_role;

revoke all on function public.server_admin_start_free_boosters(uuid,integer)
from public,anon,authenticated;
grant execute on function public.server_admin_start_free_boosters(uuid,integer)
to service_role;

update public.app_update_logs
set changes = (
  select array_agg(distinct item order by item)
  from unnest(
    changes || array[
      'Admin Abuse: boosters de Coins ficam grátis e boosters de Diamantes recebem 50% de desconto, com valores ímpares arredondados para cima'
    ]::text[]
  ) item
)
where version='0.1.1 • OTA 28/08';
