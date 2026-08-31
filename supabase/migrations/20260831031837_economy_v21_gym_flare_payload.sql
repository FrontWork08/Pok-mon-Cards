alter table public.guild_war_gyms
  add column if not exists flare_key text,
  add column if not exists flare_until timestamptz;

alter table public.economy_policy
  add column if not exists soft_cap_enabled boolean not null default false,
  add column if not exists soft_cap_daily_coins bigint not null default 100000,
  add column if not exists soft_cap_multiplier numeric not null default 0.35;

create or replace function public.purchase_guild_war_gym_flare(p_gym_id uuid,p_flare text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_gym public.guild_war_gyms%rowtype;
  v_guild text;
  v_cost bigint;
  v_duration interval;
  v_balance bigint;
  v_until timestamptz;
  v_message text;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;
  if v_guild is null then raise exception 'NOT_IN_GUILD'; end if;

  select * into v_gym from public.guild_war_gyms where id=p_gym_id for update;
  if not found then raise exception 'GYM_NOT_FOUND'; end if;
  if v_gym.owner_guild_id is distinct from v_guild then raise exception 'GYM_NOT_OWNED_BY_GUILD'; end if;

  case p_flare
    when 'banner' then v_cost:=50000; v_duration:=interval '24 hours'; v_message:='Bandeira da guilda instalada no ginásio.';
    when 'champion' then v_cost:=150000; v_duration:=interval '24 hours'; v_message:='Efeito Champion ativado no ginásio.';
    when 'legendary' then v_cost:=400000; v_duration:=interval '48 hours'; v_message:='Aura Lendária ativada no ginásio.';
    else raise exception 'INVALID_GYM_FLARE';
  end case;

  v_balance:=private.spend_player_coins(
    v_player,v_cost,'guild_war_cosmetic',
    jsonb_build_object('gymId',p_gym_id,'warId',v_gym.war_id,'flare',p_flare),
    v_guild
  );

  v_until:=greatest(now(),coalesce(v_gym.flare_until,now()))+v_duration;
  update public.guild_war_gyms
  set flare_key=p_flare,flare_until=v_until,updated_at=now()
  where id=p_gym_id;

  insert into public.guild_war_gym_events(
    war_id,gym_id,event_type,actor_id,guild_id,message,metadata
  ) values(
    v_gym.war_id,p_gym_id,'cosmetic',v_player,v_guild,v_message,
    jsonb_build_object('flare',p_flare,'costCoins',v_cost,'until',v_until)
  );

  return jsonb_build_object('ok',true,'gymId',p_gym_id,'flare',p_flare,'until',v_until,'spentCoins',v_cost,'coins',v_balance);
end;
$$;
grant execute on function public.purchase_guild_war_gym_flare(uuid,text) to authenticated;

create or replace function public.get_guild_war_gyms(p_war_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  perform private.ensure_guild_war_gyms(p_war_id);

  select jsonb_build_object(
    'warId',w.id,'status',w.status,'startsAt',w.starts_at,'endsAt',w.ends_at,
    'guildA',jsonb_build_object('id',ga.id,'name',ga.name,'color',ga.color),
    'guildB',jsonb_build_object('id',gb.id,'name',gb.name,'color',gb.color),
    'gyms',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',gym.id,'slot',gym.slot,'key',gym.gym_key,'name',gym.gym_name,
          'ownerGuild',case when owner.id is null then null else jsonb_build_object('id',owner.id,'name',owner.name,'color',owner.color) end,
          'controlledSince',gym.controlled_since,'captureCount',gym.capture_count,'lastAttackedAt',gym.last_attacked_at,
          'flareKey',case when gym.flare_until>now() then gym.flare_key else null end,
          'flareUntil',case when gym.flare_until>now() then gym.flare_until else null end,
          'defenders',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',d.id,'playerId',d.player_id,'username',p.username,'guildId',d.guild_id,
              'cardId',d.card_id,'pokemonName',c.pokemon_name,'imageSmall',c.image_small,'rarity',c.rarity,'types',c.types,
              'maxHp',d.max_hp,'currentHp',d.current_hp,'maxDamage',d.max_damage,'wins',d.wins,
              'placedAt',d.placed_at,'updatedAt',d.updated_at
            ) order by (d.current_hp>0) desc,d.placed_at,d.id)
            from public.guild_war_gym_defenders d
            join public.players p on p.id=d.player_id
            join public.cards c on c.id=d.card_id
            where d.gym_id=gym.id
          ),'[]'::jsonb)
        ) order by gym.slot
      )
      from public.guild_war_gyms gym
      left join public.guilds owner on owner.id=gym.owner_guild_id
      where gym.war_id=w.id
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(to_jsonb(e) order by e."createdAt" desc)
      from (
        select ge.id,ge.gym_id as "gymId",ge.event_type as "eventType",
          ge.actor_id as "actorId",ge.guild_id as "guildId",ge.message,ge.metadata,ge.created_at as "createdAt"
        from public.guild_war_gym_events ge
        where ge.war_id=w.id
        order by ge.created_at desc limit 20
      ) e
    ),'[]'::jsonb)
  ) into v_result
  from public.guild_wars w
  join public.guilds ga on ga.id=w.guild_a_id
  join public.guilds gb on gb.id=w.guild_b_id
  where w.id=p_war_id;

  if v_result is null then raise exception 'WAR_NOT_FOUND'; end if;
  return v_result;
end;
$$;
