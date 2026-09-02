create or replace function private.ranked_bot_target_power(p_rating integer)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when coalesce(p_rating,1000)<=900 then 180
    when p_rating<=1050 then 285
    when p_rating<=1200 then 305
    when p_rating<=1400 then 318
    when p_rating<=1600 then 326
    when p_rating<=1800 then 332
    else 334
  end::numeric;
$$;

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

  select cp.card_id into v_card
  from private.ranked_bot_card_pool cp
  where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    and cp.battle_power between greatest(18,v_target*.96) and least(334.4,v_target*1.04)
  order by abs(cp.battle_power-v_target),random()
  limit 1;

  if v_card is null then
    select cp.card_id into v_card
    from private.ranked_bot_card_pool cp
    where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    order by abs(cp.battle_power-v_target),random()
    limit 1;
  end if;

  if v_card is null then raise exception 'RANKED_BOT_NO_CARD'; end if;
  return v_card;
end;
$$;
