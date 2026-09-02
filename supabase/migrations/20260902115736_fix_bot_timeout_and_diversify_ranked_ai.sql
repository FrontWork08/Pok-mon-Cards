create or replace function private.ranked_bot_pick_card(
  p_bot_id uuid,
  p_battle_id uuid,
  p_exclude text[] default array[]::text[]
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rating integer;
  v_target numeric;
  v_card text;
begin
  select coalesce(bot_rating_base,battle_rating,1000)
  into v_rating
  from public.players
  where id=p_bot_id and is_bot=true;

  if v_rating is null then raise exception 'RANKED_BOT_NOT_FOUND'; end if;
  v_target:=private.ranked_bot_target_power(v_rating);

  with last_battles as materialized (
    select b.id
    from public.battles b
    where b.id<>p_battle_id
      and b.is_bot_match=true
      and b.status='completed'
      and p_bot_id in (b.challenger_id,b.opponent_id)
    order by b.completed_at desc nulls last
    limit 4
  ),
  current_species as materialized (
    select distinct coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name)) species_key
    from (
      select d.card_id
      from public.battle_draft_cards d
      where d.battle_id=p_battle_id and d.player_id=p_bot_id
      union all
      select s.card_id
      from public.battle_selections s
      where s.battle_id=p_battle_id and s.player_id=p_bot_id
    ) used
    join public.cards c on c.id=used.card_id
  ),
  recent_species as materialized (
    select distinct coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name)) species_key
    from public.battle_selections s
    join last_battles lb on lb.id=s.battle_id
    join public.cards c on c.id=s.card_id
    where s.player_id=p_bot_id
  ),
  strong_pool as materialized (
    select
      cp.card_id,
      cp.battle_power,
      coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name)) species_key,
      exists(
        select 1 from current_species cs
        where cs.species_key=coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name))
      ) current_repeat,
      exists(
        select 1 from recent_species rs
        where rs.species_key=coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name))
      ) recent_repeat,
      abs(cp.battle_power-v_target) gap
    from private.ranked_bot_card_pool cp
    join public.cards c on c.id=cp.card_id
    where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
      and cp.battle_power between greatest(18,v_target*.94) and least(334.4,v_target*1.05)
    order by
      exists(
        select 1 from current_species cs
        where cs.species_key=coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name))
      ),
      exists(
        select 1 from recent_species rs
        where rs.species_key=coalesce(c.pokedex_numbers[1]::text,lower(c.pokemon_name))
      ),
      abs(cp.battle_power-v_target)
    limit 48
  ),
  diverse_pool as materialized (
    select *
    from strong_pool
    where current_repeat=false
    order by recent_repeat,gap
    limit 24
  )
  select d.card_id
  into v_card
  from diverse_pool d
  order by d.recent_repeat,random()
  limit 1;

  if v_card is null then
    select sp.card_id
    into v_card
    from strong_pool sp
    order by sp.current_repeat,sp.recent_repeat,random()
    limit 1;
  end if;

  if v_card is null then
    select cp.card_id
    into v_card
    from private.ranked_bot_card_pool cp
    where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    order by abs(cp.battle_power-v_target),random()
    limit 1;
  end if;

  if v_card is null then raise exception 'RANKED_BOT_NO_CARD'; end if;
  return v_card;
end;
$$;

create or replace function public.server_timeout_battle(p_actor_id uuid,p_battle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  b public.battles%rowtype;
  v_card text;
  v_count integer;
  v_result jsonb;
  v_challenger_bot boolean:=false;
  v_opponent_bot boolean:=false;
  v_turn_bot boolean:=false;
begin
  select * into b from public.battles where id=p_battle_id for update;
  if b.id is null then raise exception 'BATTLE_NOT_FOUND'; end if;
  if p_actor_id not in (b.challenger_id,b.opponent_id) then raise exception 'FORBIDDEN'; end if;
  if b.status not in ('drafting','selecting') then
    return jsonb_build_object('alreadyResolved',true,'status',b.status,'round',b.active_round);
  end if;
  if b.selection_deadline is null or now()<b.selection_deadline then
    raise exception 'NOT_EXPIRED';
  end if;

  select coalesce(p.is_bot,false) into v_challenger_bot
  from public.players p where p.id=b.challenger_id;
  select coalesce(p.is_bot,false) into v_opponent_bot
  from public.players p where p.id=b.opponent_id;

  if b.status='drafting' then
    select coalesce(p.is_bot,false) into v_turn_bot
    from public.players p where p.id=b.draft_turn_id;

    if v_turn_bot then
      v_result:=private.ranked_bot_take_turn(b.id);
      return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
        'timedOut',true,'autoBotPick',true
      );
    end if;

    select pc.card_id into v_card
    from public.player_cards pc
    where pc.player_id=b.draft_turn_id
      and pc.quantity>0
      and private.battle_card_rules_ready(pc.card_id)
      and not exists(
        select 1 from public.battle_draft_cards d
        where d.battle_id=b.id
          and d.player_id=b.draft_turn_id
          and d.card_id=pc.card_id
      )
    order by random()
    limit 1;

    if v_card is null then
      update public.players p
      set coins=p.coins+e.amount
      from public.battle_coin_escrows e
      where e.battle_id=b.id and e.player_id=p.id and e.status='held';

      update public.battle_coin_escrows
      set status='refunded',updated_at=now()
      where battle_id=b.id and status='held';

      perform public.server_return_card_stakes(b.id);
      update public.battles set status='cancelled',updated_at=now() where id=b.id;
      return jsonb_build_object('cancelled',true,'reason','draft_player_no_eligible_cards');
    end if;

    update public.battles
    set selection_deadline=now()+interval '1 second'
    where id=b.id;

    v_result:=public.server_pick_battle_draft_card(b.draft_turn_id,b.id,v_card);

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'draft_auto_picked',
      jsonb_build_object('playerId',b.draft_turn_id,'cardId',v_card,'timedOut',true)
    );

    return v_result||jsonb_build_object('timedOut',true,'autoPicked',true);
  end if;

  if v_challenger_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id
     )
  then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  if v_opponent_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id
     )
  then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  if not v_challenger_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.challenger_id
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      where d.battle_id=b.id
        and d.player_id=b.challenger_id
        and private.battle_card_rules_ready(d.card_id)
        and not exists(
          select 1 from public.battle_selections s
          where s.battle_id=b.id
            and s.player_id=b.challenger_id
            and s.card_id=d.card_id
        )
      order by random()
      limit 1;
    else
      select pc.card_id into v_card
      from public.player_cards pc
      where pc.player_id=b.challenger_id
        and pc.quantity>0
        and private.battle_card_rules_ready(pc.card_id)
      order by random()
      limit 1;
    end if;

    if v_card is null then raise exception 'CHALLENGER_NO_ELIGIBLE_CARDS'; end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,b.challenger_id,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'auto_locked',
      jsonb_build_object('playerId',b.challenger_id,'round',b.active_round,'timedOut',true)
    );
  end if;

  if not v_opponent_bot
     and not exists(
       select 1 from public.battle_selections
       where battle_id=b.id and round_no=b.active_round and player_id=b.opponent_id
     )
  then
    if b.mode='draft3' then
      select d.card_id into v_card
      from public.battle_draft_cards d
      where d.battle_id=b.id
        and d.player_id=b.opponent_id
        and private.battle_card_rules_ready(d.card_id)
        and not exists(
          select 1 from public.battle_selections s
          where s.battle_id=b.id
            and s.player_id=b.opponent_id
            and s.card_id=d.card_id
        )
      order by random()
      limit 1;
    else
      select pc.card_id into v_card
      from public.player_cards pc
      where pc.player_id=b.opponent_id
        and pc.quantity>0
        and private.battle_card_rules_ready(pc.card_id)
      order by random()
      limit 1;
    end if;

    if v_card is null then raise exception 'OPPONENT_NO_ELIGIBLE_CARDS'; end if;

    insert into public.battle_selections(battle_id,round_no,player_id,card_id)
    values(b.id,b.active_round,b.opponent_id,v_card)
    on conflict do nothing;

    insert into public.battle_events(battle_id,event_type,payload)
    values(
      b.id,'auto_locked',
      jsonb_build_object('playerId',b.opponent_id,'round',b.active_round,'timedOut',true)
    );
  end if;

  if b.is_bot_match then
    perform private.ranked_bot_take_turn(b.id);
  end if;

  select count(*) into v_count
  from public.battle_selections
  where battle_id=b.id and round_no=b.active_round;

  return jsonb_build_object(
    'bothLocked',v_count=2,
    'round',b.active_round,
    'timedOut',true,
    'autoResolvedSelection',true
  );
end;
$$;
