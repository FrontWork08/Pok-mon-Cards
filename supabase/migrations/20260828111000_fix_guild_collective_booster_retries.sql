create or replace function private.claim_guild_collective_booster()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player uuid := auth.uid();
  v_guild text;
  v_id uuid;
  v_booster public.guild_collective_boosters%rowtype;
  v_cards jsonb;
begin
  if v_player is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select guild_id
  into v_guild
  from public.guild_members
  where player_id = v_player
  limit 1;

  if v_guild is null then
    raise exception 'NO_GUILD';
  end if;

  v_id := private.ensure_guild_collective_booster(v_guild);

  select *
  into v_booster
  from public.guild_collective_boosters
  where id = v_id
  for update;

  select cards_received
  into v_cards
  from public.guild_collective_booster_claims
  where booster_id = v_id
    and player_id = v_player;

  if found then
    return jsonb_build_object(
      'boosterId', v_id,
      'guildId', v_guild,
      'cards', coalesce(v_cards, '[]'::jsonb),
      'claimed', true,
      'replayed', true
    );
  end if;

  if v_booster.status <> 'ready' then
    raise exception 'GUILD_BOOSTER_NOT_READY';
  end if;

  with pool as materialized (
    select
      c.id,
      c.pokemon_name,
      c.rarity,
      c.set_id,
      c.card_number,
      c.image_small,
      c.image_large,
      public.rarity_tier(c.rarity) as tier,
      coalesce(pc.quantity, 0) > 0 as already_owned
    from public.cards c
    left join public.player_cards pc
      on pc.player_id = v_player
     and pc.card_id = c.id
  ), guaranteed as (
    select *
    from pool
    where tier >= 4
    order by (
      -ln(greatest(random(), 0.0000001)) /
      case tier
        when 7 then 0.35
        when 6 then 1.00
        when 5 then 3.00
        when 4 then 10.00
        else 1.00
      end
    )
    limit 1
  ), filler as (
    select *
    from pool
    where id not in (select id from guaranteed)
    order by (
      -ln(greatest(random(), 0.0000001)) /
      case tier
        when 7 then 0.35
        when 6 then 1.00
        when 5 then 3.00
        when 4 then 10.00
        when 3 then 42.00
        when 2 then 180.00
        when 1 then 520.00
        else 80.00
      end
    )
    limit 4
  ), picked as materialized (
    select * from guaranteed
    union all
    select * from filler
  ), upserted as (
    insert into public.player_cards (player_id, card_id, quantity)
    select v_player, id, 1
    from picked
    on conflict (player_id, card_id)
    do update set quantity = public.player_cards.quantity + 1
    returning card_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', pokemon_name,
      'rarity', rarity,
      'image', coalesce(nullif(image_large, ''), nullif(image_small, '')),
      'imageLarge', nullif(image_large, ''),
      'imageSmall', nullif(image_small, ''),
      'imageFallbackLarge', format(
        'https://images.pokemontcg.io/%s/%s_hires.png',
        set_id,
        card_number
      ),
      'imageFallback', format(
        'https://images.pokemontcg.io/%s/%s.png',
        set_id,
        card_number
      ),
      'isNew', not already_owned,
      'wishlistHit', false
    )
  )
  into v_cards
  from picked
  where (select count(*) from upserted) > 0;

  if jsonb_array_length(coalesce(v_cards, '[]'::jsonb)) <> 5 then
    raise exception 'GUILD_BOOSTER_CARD_POOL_UNAVAILABLE';
  end if;

  insert into public.guild_collective_booster_claims (
    booster_id,
    player_id,
    cards_received
  )
  values (
    v_id,
    v_player,
    v_cards
  );

  perform public.server_refresh_player_achievements(v_player);

  return jsonb_build_object(
    'boosterId', v_id,
    'guildId', v_guild,
    'cards', v_cards,
    'claimed', true,
    'replayed', false
  );
end;
$function$;

