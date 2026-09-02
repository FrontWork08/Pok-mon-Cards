create or replace function private.ranked_bot_elo_scale(p_prior integer)
returns numeric
language sql
immutable
set search_path=''
as $$
  select case
    when coalesce(p_prior,0)<6 then 1::numeric
    when p_prior<12 then .35::numeric
    else 0::numeric
  end;
$$;

create or replace function private.prepare_ranked_bot_completion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_bot uuid;
  v_human uuid;
  v_prior integer:=0;
  v_scale numeric:=1;
  v_before integer;
  v_raw_after integer;
  v_after integer;
begin
  if new.status<>'completed' or old.status='completed' or not coalesce(new.is_bot_match,false) then
    return new;
  end if;

  select p.id into v_bot
  from public.players p
  where p.id in (new.challenger_id,new.opponent_id) and p.is_bot=true
  limit 1;

  if v_bot is null then return new; end if;
  v_human:=case when v_bot=new.challenger_id then new.opponent_id else new.challenger_id end;

  select count(*) into v_prior
  from public.battles b
  where b.id<>new.id
    and b.is_bot_match=true
    and b.status='completed'
    and b.completed_at>=date_trunc('day',now())
    and v_human in (b.challenger_id,b.opponent_id);

  v_scale:=private.ranked_bot_elo_scale(v_prior);

  if v_human=new.challenger_id then
    v_before:=coalesce(new.challenger_rating_before,(select battle_rating from public.players where id=v_human),1000);
    v_raw_after:=coalesce(new.challenger_rating_after,v_before);
    v_after:=v_before+round((v_raw_after-v_before)*v_scale)::integer;
    new.challenger_rating_after:=v_after;
  else
    v_before:=coalesce(new.opponent_rating_before,(select battle_rating from public.players where id=v_human),1000);
    v_raw_after:=coalesce(new.opponent_rating_after,v_before);
    v_after:=v_before+round((v_raw_after-v_before)*v_scale)::integer;
    new.opponent_rating_after:=v_after;
  end if;

  update public.players
  set battle_rating=v_after
  where id=v_human;

  update public.players
  set battle_rating=coalesce(bot_rating_base,battle_rating),
      battle_wins=0,battle_losses=0,battle_streak=0,best_battle_streak=0,
      xp=0,level=1,coins=0,diamonds=0
  where id=v_bot and is_bot=true;

  if v_prior>=12 then
    new.reward_eligible:=false;
  end if;

  return new;
end;
$$;
