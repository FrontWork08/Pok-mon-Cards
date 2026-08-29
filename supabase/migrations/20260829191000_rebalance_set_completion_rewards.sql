-- Rebalance set-completion rewards so tiny sets cannot self-fund large booster chains.
-- Existing claimed rewards are preserved; only future claims use set_scaled_v2.

alter table public.collection_milestone_claims
  add column if not exists reward_rule_version text;

update public.collection_milestone_claims
set reward_rule_version = case
  when milestone_kind='set_complete' then 'legacy_set_floor_10000_v1'
  else 'legacy_collection_milestone_v1'
end
where reward_rule_version is null;

CREATE OR REPLACE FUNCTION private.claim_collection_milestone(p_kind text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid := auth.uid();
  v_progress integer := 0;
  v_target integer := 0;
  v_coins bigint := 0;
  v_diamonds integer := 0;
  v_gen integer;
  v_min integer;
  v_max integer;
  v_reward jsonb;
  v_rule_version text := 'collection_milestone_v1';
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  if p_kind not in ('pokedex_total','pokedex_gen','set_complete') then raise exception 'INVALID_MILESTONE'; end if;
  if exists(
    select 1
    from public.collection_milestone_claims
    where player_id=v_player
      and milestone_kind=p_kind
      and milestone_key=p_key
  ) then
    raise exception 'ALREADY_CLAIMED';
  end if;

  if p_kind='pokedex_total' then
    v_target := p_key::integer;
    if v_target not in (50,151,251,386,493,649,721,809,905,1025) then
      raise exception 'INVALID_MILESTONE';
    end if;

    select count(distinct n) into v_progress
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=v_player and pc.quantity>0;

    v_coins := 2500 + v_target*40;
    v_diamonds := case
      when v_target>=905 then 5
      when v_target>=649 then 3
      when v_target>=251 then 2
      else 1
    end;
    v_rule_version := 'pokedex_total_v1';

  elsif p_kind='pokedex_gen' then
    v_gen := p_key::integer;
    if v_gen<1 or v_gen>9 then raise exception 'INVALID_MILESTONE'; end if;

    v_min := case v_gen
      when 1 then 1 when 2 then 152 when 3 then 252 when 4 then 387 when 5 then 494
      when 6 then 650 when 7 then 722 when 8 then 810 else 906
    end;
    v_max := case v_gen
      when 1 then 151 when 2 then 251 when 3 then 386 when 4 then 493 when 5 then 649
      when 6 then 721 when 7 then 809 when 8 then 905 else 1025
    end;
    v_target := v_max-v_min+1;

    select count(distinct n) into v_progress
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=v_player and pc.quantity>0 and n between v_min and v_max;

    v_coins := 12000 + v_gen*2500;
    v_diamonds := 2 + floor(v_gen/3.0)::integer;
    v_rule_version := 'pokedex_generation_v1';

  else
    v_reward := private.collection_set_completion_reward(p_key);
    v_target := (v_reward->>'totalCards')::integer;
    v_coins := (v_reward->>'coins')::bigint;
    v_diamonds := (v_reward->>'diamonds')::integer;
    v_rule_version := coalesce(v_reward->>'ruleVersion','set_scaled_v2');

    select count(*) into v_progress
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=v_player
      and pc.quantity>0
      and c.set_id=p_key;
  end if;

  if v_progress<v_target then raise exception 'MILESTONE_NOT_COMPLETE'; end if;

  insert into public.collection_milestone_claims(
    player_id,milestone_kind,milestone_key,
    reward_coins,reward_diamonds,reward_rule_version
  )
  values(
    v_player,p_kind,p_key,
    v_coins,v_diamonds,v_rule_version
  );

  update public.players
  set coins=coins+v_coins,
      diamonds=diamonds+v_diamonds
  where id=v_player;

  return jsonb_build_object(
    'kind',p_kind,
    'key',p_key,
    'progress',v_progress,
    'target',v_target,
    'coins',v_coins,
    'diamonds',v_diamonds,
    'rewardRuleVersion',v_rule_version
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.collection_set_completion_reward(p_set_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_total integer;
  v_rare integer;
  v_coins bigint;
  v_diamonds integer;
begin
  select
    count(*)::integer,
    count(*) filter(where public.rarity_tier(c.rarity)>=3)::integer
  into v_total,v_rare
  from public.cards c
  where c.set_id=p_set_id;

  if v_total<1 then
    raise exception 'SET_NOT_FOUND';
  end if;

  v_coins := least(
    12000::bigint,
    greatest(
      500::bigint,
      (ceil(((v_total*35 + v_rare*20)::numeric)/250.0)*250)::bigint
    )
  );

  v_diamonds := case
    when v_total>=240 then 3
    when v_total>=150 then 2
    when v_total>=80 then 1
    when v_rare>=20 then 1
    else 0
  end;

  return jsonb_build_object(
    'setId',p_set_id,
    'totalCards',v_total,
    'rareCards',v_rare,
    'coins',v_coins,
    'diamonds',v_diamonds,
    'ruleVersion','set_scaled_v2'
  );
end;
$function$;

revoke all on function private.collection_set_completion_reward(text)
from public,anon,authenticated;
grant execute on function private.collection_set_completion_reward(text) to service_role;

revoke all on function private.claim_collection_milestone(text,text)
from public,anon,authenticated;
grant execute on function private.claim_collection_milestone(text,text) to authenticated,service_role;

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Recompensas por completar sets foram rebalanceadas: sets pequenos não dão mais 10.000 Coins fixos e agora escalam por tamanho e quantidade de cartas raras',
    'Novos resgates de set completo usam uma curva de 500 a 12.000 Coins e 0 a 3 Diamantes; recompensas antigas não foram removidas'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
