
create or replace function public.get_my_weekly_collection_rank()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with me as (
    select auth.uid() as player_id
  ),
  rows as (
    select *
    from public.get_collection_weekly_leaderboard(200)
  ),
  mine as (
    select *
    from rows
    where player_id=(select player_id from me)
    limit 1
  ),
  bounds as (
    select
      private.collection_week_start(now()) as week_start,
      private.collection_week_start(now())+interval '7 days' as week_end
  )
  select jsonb_build_object(
    'rank',coalesce((select weekly_rank from mine),0),
    'weeklyValueUsd',coalesce((select weekly_value_usd from mine),0),
    'cardsGained',coalesce((select cards_gained from mine),0),
    'packsOpened',coalesce((select packs_opened from mine),0),
    'rewardCoins',coalesce((select reward_coins from mine),0),
    'total',(select count(*) from rows),
    'weekStart',(select week_start from bounds),
    'weekEnd',(select week_end from bounds)
  );
$function$;

revoke all on function public.get_my_weekly_collection_rank() from public;
grant execute on function public.get_my_weekly_collection_rank() to authenticated;
