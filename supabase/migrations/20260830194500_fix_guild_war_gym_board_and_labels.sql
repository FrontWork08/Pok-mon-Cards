create or replace function public.get_guild_war_gyms(p_war_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  perform private.ensure_guild_war_gyms(p_war_id);

  select jsonb_build_object(
    'warId', w.id,
    'status', w.status,
    'startsAt', w.starts_at,
    'endsAt', w.ends_at,
    'guildA', jsonb_build_object('id', ga.id, 'name', ga.name, 'color', ga.color),
    'guildB', jsonb_build_object('id', gb.id, 'name', gb.name, 'color', gb.color),
    'gyms', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', gym.id,
          'slot', gym.slot,
          'key', gym.gym_key,
          'name', gym.gym_name,
          'ownerGuild', case
            when owner.id is null then null
            else jsonb_build_object('id', owner.id, 'name', owner.name, 'color', owner.color)
          end,
          'controlledSince', gym.controlled_since,
          'captureCount', gym.capture_count,
          'lastAttackedAt', gym.last_attacked_at,
          'defenders', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', d.id,
                'playerId', d.player_id,
                'username', p.username,
                'guildId', d.guild_id,
                'cardId', d.card_id,
                'pokemonName', c.pokemon_name,
                'imageSmall', c.image_small,
                'rarity', c.rarity,
                'types', c.types,
                'maxHp', d.max_hp,
                'currentHp', d.current_hp,
                'maxDamage', d.max_damage,
                'wins', d.wins,
                'placedAt', d.placed_at,
                'updatedAt', d.updated_at
              )
              order by (d.current_hp > 0) desc, d.placed_at, d.id
            )
            from public.guild_war_gym_defenders d
            join public.players p on p.id = d.player_id
            join public.cards c on c.id = d.card_id
            where d.gym_id = gym.id
          ), '[]'::jsonb)
        )
        order by gym.slot
      )
      from public.guild_war_gyms gym
      left join public.guilds owner on owner.id = gym.owner_guild_id
      where gym.war_id = w.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e."createdAt" desc)
      from (
        select
          ge.id,
          ge.gym_id as "gymId",
          ge.event_type as "eventType",
          ge.actor_id as "actorId",
          ge.guild_id as "guildId",
          ge.message,
          ge.metadata,
          ge.created_at as "createdAt"
        from public.guild_war_gym_events ge
        where ge.war_id = w.id
        order by ge.created_at desc
        limit 20
      ) e
    ), '[]'::jsonb)
  )
  into v_result
  from public.guild_wars w
  join public.guilds ga on ga.id = w.guild_a_id
  join public.guilds gb on gb.id = w.guild_b_id
  where w.id = p_war_id;

  if v_result is null then
    raise exception 'WAR_NOT_FOUND';
  end if;

  return v_result;
end;
$$;

create or replace function private.normalize_guild_war_gym_event_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'capture' then
    new.message := regexp_replace(new.message, '^Guilda[[:space:]]+Guilda[[:space:]]+', 'Guilda ', 'i');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_guild_war_gym_event_message on public.guild_war_gym_events;
create trigger normalize_guild_war_gym_event_message
before insert or update of message,event_type on public.guild_war_gym_events
for each row execute function private.normalize_guild_war_gym_event_message();

update public.guild_war_gym_events
set message = regexp_replace(message, '^Guilda[[:space:]]+Guilda[[:space:]]+', 'Guilda ', 'i')
where event_type='capture' and message ~* '^Guilda[[:space:]]+Guilda[[:space:]]+';
