create or replace function private.ranked_bot_target_power(p_rating integer)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when coalesce(p_rating,1000)<=900 then 75
    when p_rating<=1050 then 100
    when p_rating<=1200 then 135
    when p_rating<=1400 then 165
    when p_rating<=1600 then 205
    when p_rating<=1800 then 245
    else 285
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
    and cp.battle_power between v_target*.94 and v_target*1.16
  order by abs(cp.battle_power-(v_target*1.12)), random()
  limit 1;

  if v_card is null then
    select cp.card_id into v_card
    from private.ranked_bot_card_pool cp
    where not (cp.card_id=any(coalesce(p_exclude,array[]::text[])))
    order by abs(cp.battle_power-(v_target*1.08)),random()
    limit 1;
  end if;

  if v_card is null then raise exception 'RANKED_BOT_NO_CARD'; end if;
  return v_card;
end;
$$;

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='server_matchmaking_join'
  limit 1;

  if v_def is null then raise exception 'SERVER_MATCHMAKING_JOIN_NOT_FOUND'; end if;

  v_old := '  order by abs(coalesce(p.bot_rating_base,p.battle_rating)-v_rating),random()';
  v_new := '  order by abs(coalesce(p.bot_rating_base,p.battle_rating)-(v_rating+60)),random()';

  if strpos(v_def,v_new)=0 then
    if strpos(v_def,v_old)=0 then raise exception 'BOT_MATCHMAKING_DIFFICULTY_ANCHOR_NOT_FOUND'; end if;
    execute replace(v_def,v_old,v_new);
  end if;
end
$patch$;
