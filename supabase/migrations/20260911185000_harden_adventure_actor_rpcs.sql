-- Harden adventure Team 3 RPCs against actor-id spoofing.

create or replace function public.server_set_adventure_battle_team(
  p_actor_id uuid,
  p_battle_id uuid,
  p_card_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx public.adventure_battle_context%rowtype;
  v_required text;
  v_invalid integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then
    raise exception 'FORBIDDEN';
  end if;

  select * into ctx
  from public.adventure_battle_context
  where battle_id=p_battle_id;

  if ctx.battle_id is null then
    return public.server_set_battle_team(p_actor_id,p_battle_id,p_card_ids);
  end if;

  if ctx.player_id<>p_actor_id then
    raise exception 'FORBIDDEN';
  end if;

  if ctx.kind='challenge' then
    select required_type into v_required
    from public.battle_challenges
    where id=ctx.ref_id and active=true;

    if v_required is not null then
      select count(*) into v_invalid
      from unnest(p_card_ids) cid
      left join public.cards c on c.id=cid
      where c.id is null
         or not exists(
           select 1
           from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t
           where lower(t)=lower(v_required)
         );
      if v_invalid>0 then raise exception 'CHALLENGE_TEAM_TYPE_REQUIRED'; end if;
    end if;
  elsif ctx.kind='rogue' then
    select count(*) into v_invalid
    from unnest(p_card_ids) cid
    where not exists(
      select 1 from public.rogue_run_cards rr
      where rr.run_id=ctx.run_id and rr.card_id=cid
    );
    if v_invalid>0 then raise exception 'ROGUE_CARD_NOT_IN_RUN_POOL'; end if;
  end if;

  return public.server_set_battle_team(p_actor_id,p_battle_id,p_card_ids);
end;
$$;

create or replace function public.server_list_adventure_team_battle_cards(
  p_actor_id uuid,
  p_battle_id uuid,
  p_search text default null,
  p_limit integer default 120,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ctx public.adventure_battle_context%rowtype;
  v_required text;
  v_limit integer:=least(greatest(coalesce(p_limit,120),1),250);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_items jsonb;
  v_total integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_actor_id then
    raise exception 'FORBIDDEN';
  end if;

  select * into ctx
  from public.adventure_battle_context
  where battle_id=p_battle_id and player_id=p_actor_id;

  if ctx.battle_id is null then return null; end if;

  if ctx.kind='challenge' then
    select required_type into v_required from public.battle_challenges where id=ctx.ref_id;
  end if;

  select count(*) into v_total
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  where pc.player_id=p_actor_id
    and pc.quantity>0
    and private.battle_game_profile_for_card(c.id) is not null
    and (ctx.kind<>'rogue' or exists(
      select 1 from public.rogue_run_cards rr where rr.run_id=ctx.run_id and rr.card_id=c.id
    ))
    and (v_required is null or exists(
      select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t where lower(t)=lower(v_required)
    ))
    and (
      nullif(trim(coalesce(p_search,'')),'') is null
      or c.pokemon_name ilike '%'||trim(p_search)||'%'
      or c.id ilike '%'||trim(p_search)||'%'
    );

  select coalesce(jsonb_agg(x.item order by x.power desc,x.name),'[]'::jsonb)
  into v_items
  from (
    select
      jsonb_build_object(
        'cardId',c.id,
        'name',coalesce(c.pokemon_name,gp->>'identifier','Pokémon'),
        'cardName',c.pokemon_name,
        'image',coalesce(c.image_large,c.image_small),
        'setName',c.set_name,
        'rarity',c.rarity,
        'types',coalesce(gp->'types',to_jsonb(c.types),'[]'::jsonb),
        'hp',nullif(gp->>'baseHp','')::integer,
        'attack',nullif(gp->>'baseAttack','')::integer,
        'defense',nullif(gp->>'baseDefense','')::integer,
        'spAttack',nullif(gp->>'baseSpAttack','')::integer,
        'spDefense',nullif(gp->>'baseSpDefense','')::integer,
        'speed',nullif(gp->>'baseSpeed','')::integer,
        'gameValue',coalesce(c.game_value,0),
        'quantity',pc.quantity,
        'pokemonId',nullif(gp->>'pokemonId','')::integer,
        'profile',gp->>'identifier'
      ) as item,
      private.adventure_card_power(c.id) as power,
      coalesce(c.pokemon_name,gp->>'identifier','') as name
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral private.battle_game_profile_for_card(c.id) gp
    where pc.player_id=p_actor_id
      and pc.quantity>0
      and gp is not null
      and (ctx.kind<>'rogue' or exists(
        select 1 from public.rogue_run_cards rr where rr.run_id=ctx.run_id and rr.card_id=c.id
      ))
      and (v_required is null or exists(
        select 1 from unnest(coalesce(c.game_types,c.types,'{}'::text[])) t where lower(t)=lower(v_required)
      ))
      and (
        nullif(trim(coalesce(p_search,'')),'') is null
        or c.pokemon_name ilike '%'||trim(p_search)||'%'
        or c.id ilike '%'||trim(p_search)||'%'
      )
    order by private.adventure_card_power(c.id) desc,c.pokemon_name
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'items',v_items,
    'total',v_total,
    'limit',v_limit,
    'offset',v_offset,
    'adventure',true,
    'kind',ctx.kind
  );
end;
$$;

revoke all on function public.server_set_adventure_battle_team(uuid,uuid,text[]) from public, anon;
grant execute on function public.server_set_adventure_battle_team(uuid,uuid,text[]) to authenticated;

revoke all on function public.server_list_adventure_team_battle_cards(uuid,uuid,text,integer,integer) from public, anon;
grant execute on function public.server_list_adventure_team_battle_cards(uuid,uuid,text,integer,integer) to authenticated;
