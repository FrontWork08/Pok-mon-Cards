-- Add Diamond rewards to the weekly collection podium.

alter table private.collection_weekly_config
  add column if not exists first_reward_diamonds integer not null default 5,
  add column if not exists second_reward_diamonds integer not null default 3,
  add column if not exists third_reward_diamonds integer not null default 1;

update private.collection_weekly_config
set first_reward_diamonds=5,
    second_reward_diamonds=3,
    third_reward_diamonds=1,
    updated_at=now()
where id=1;

alter table private.collection_weekly_rewards
  add column if not exists reward_diamonds integer not null default 0;

drop function if exists public.get_collection_weekly_leaderboard(integer);

CREATE OR REPLACE FUNCTION private.finalize_collection_week(p_week_start timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_awards jsonb := '[]'::jsonb;
begin
  v_start := coalesce(
    p_week_start,
    private.collection_week_start(now()-interval '7 days')
  );
  v_end := v_start+interval '7 days';

  if v_end>now() then
    raise exception 'WEEK_NOT_FINISHED';
  end if;

  with rewards as (
    select
      first_reward_coins,second_reward_coins,third_reward_coins,
      first_reward_diamonds,second_reward_diamonds,third_reward_diamonds
    from private.collection_weekly_config
    where id=1
  ),
  ranked as (
    select
      row_number() over(
        order by s.weekly_value_usd desc,s.cards_gained desc,s.packs_opened desc,s.username asc
      )::smallint as rank,
      s.*
    from private.collection_weekly_scores(v_start,v_end) s
  ),
  winners as (
    select
      v_start as week_start,
      v_end as week_end,
      r.rank,
      r.player_id,
      r.username,
      r.weekly_value_usd,
      r.cards_gained,
      r.packs_opened,
      case r.rank
        when 1 then rw.first_reward_coins
        when 2 then rw.second_reward_coins
        when 3 then rw.third_reward_coins
      end::bigint as reward_coins,
      case r.rank
        when 1 then rw.first_reward_diamonds
        when 2 then rw.second_reward_diamonds
        when 3 then rw.third_reward_diamonds
      end::integer as reward_diamonds
    from ranked r
    cross join rewards rw
    where r.rank<=3
  ),
  inserted as (
    insert into private.collection_weekly_rewards(
      week_start,week_end,rank,player_id,username,weekly_value_usd,
      cards_gained,packs_opened,reward_coins,reward_diamonds
    )
    select
      week_start,week_end,rank,player_id,username,weekly_value_usd,
      cards_gained,packs_opened,reward_coins,reward_diamonds
    from winners
    on conflict do nothing
    returning *
  ),
  credited as (
    update public.players p
    set coins=p.coins+i.reward_coins,
        diamonds=p.diamonds+i.reward_diamonds
    from inserted i
    where p.id=i.player_id
    returning
      i.player_id,i.username,i.rank,i.weekly_value_usd,
      i.cards_gained,i.packs_opened,i.reward_coins,i.reward_diamonds,
      p.coins as new_coin_balance,p.diamonds as new_diamond_balance
  ),
  notified as (
    insert into public.notifications(player_id,type,title,body,metadata)
    select
      c.player_id,
      'collection_weekly_reward',
      case c.rank
        when 1 then '🥇 Campeão da Coleção Semanal'
        when 2 then '🥈 2º lugar na Coleção Semanal'
        else '🥉 3º lugar na Coleção Semanal'
      end,
      'Você terminou a semana em #'||c.rank||
      ' com US$ '||to_char(c.weekly_value_usd,'FM999999990.00')||
      ' em valor conquistado e recebeu '||
      to_char(c.reward_coins,'FM999G999G990')||' Coins + '||
      c.reward_diamonds||' Diamante(s).',
      jsonb_build_object(
        'weekStart',v_start,
        'weekEnd',v_end,
        'rank',c.rank,
        'weeklyValueUsd',c.weekly_value_usd,
        'cardsGained',c.cards_gained,
        'packsOpened',c.packs_opened,
        'rewardCoins',c.reward_coins,
        'rewardDiamonds',c.reward_diamonds,
        'newCoinBalance',c.new_coin_balance,
        'newDiamondBalance',c.new_diamond_balance
      )
    from credited c
    returning player_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',c.player_id,
    'username',c.username,
    'rank',c.rank,
    'weeklyValueUsd',c.weekly_value_usd,
    'rewardCoins',c.reward_coins,
    'rewardDiamonds',c.reward_diamonds,
    'newCoinBalance',c.new_coin_balance,
    'newDiamondBalance',c.new_diamond_balance
  ) order by c.rank),'[]'::jsonb)
  into v_awards
  from credited c;

  return jsonb_build_object(
    'weekStart',v_start,
    'weekEnd',v_end,
    'awards',v_awards
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_collection_weekly_leaderboard(p_limit integer DEFAULT 100)
 RETURNS TABLE(weekly_rank bigint, player_id uuid, username text, weekly_value_usd numeric, cards_gained bigint, packs_opened bigint, reward_coins bigint, reward_diamonds integer, week_start timestamp with time zone, score_start timestamp with time zone, week_end timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select
      private.collection_week_start(now()) as week_start,
      greatest(
        private.collection_week_start(now()),
        (select activated_at from private.collection_weekly_config where id=1)
      ) as score_start,
      private.collection_week_start(now())+interval '7 days' as week_end
  ),
  ranked as (
    select
      row_number() over(
        order by s.weekly_value_usd desc,s.cards_gained desc,s.packs_opened desc,s.username asc
      ) as weekly_rank,
      s.*
    from bounds b
    cross join lateral private.collection_weekly_scores(b.week_start,b.week_end) s
  ),
  rewards as (
    select
      first_reward_coins,second_reward_coins,third_reward_coins,
      first_reward_diamonds,second_reward_diamonds,third_reward_diamonds
    from private.collection_weekly_config
    where id=1
  )
  select
    r.weekly_rank,
    r.player_id,
    r.username,
    r.weekly_value_usd::numeric(14,2),
    r.cards_gained,
    r.packs_opened,
    case r.weekly_rank
      when 1 then rw.first_reward_coins
      when 2 then rw.second_reward_coins
      when 3 then rw.third_reward_coins
      else 0
    end::bigint as reward_coins,
    case r.weekly_rank
      when 1 then rw.first_reward_diamonds
      when 2 then rw.second_reward_diamonds
      when 3 then rw.third_reward_diamonds
      else 0
    end::integer as reward_diamonds,
    b.week_start,
    b.score_start,
    b.week_end
  from ranked r
  cross join bounds b
  cross join rewards rw
  where auth.uid() is not null
  order by r.weekly_rank,r.username
  limit greatest(1,least(coalesce(p_limit,100),200));
$function$;

revoke all on function public.get_collection_weekly_leaderboard(integer)
from public,anon,authenticated;
grant execute on function public.get_collection_weekly_leaderboard(integer) to authenticated;

revoke all on function private.finalize_collection_week(timestamptz)
from public,anon,authenticated;
grant execute on function private.finalize_collection_week(timestamptz) to service_role;

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Pódio da Coleção Semanal agora também recebe Diamantes: 1º = 5, 2º = 3 e 3º = 1, além das Coins já existentes'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
