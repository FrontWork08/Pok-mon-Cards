
create or replace function public.get_public_trainer_identity(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_player_id is null then raise exception 'PLAYER_NOT_FOUND'; end if;

  if not exists(
    select 1 from public.players
    where id=p_player_id and account_status='active' and coalesce(is_bot,false)=false
  ) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  with species as (
    select count(distinct n)::integer count
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
    where pc.player_id=p_player_id and pc.quantity>0
  ),
  completed_sets as (
    select count(*)::integer count
    from (
      select c.set_id
      from public.player_cards pc
      join public.cards c on c.id=pc.card_id
      where pc.player_id=p_player_id and pc.quantity>0 and c.set_id is not null
      group by c.set_id
      having count(distinct c.id)>=(select count(*) from public.cards c2 where c2.set_id=c.set_id)
    ) s
  ),
  achievements as (
    select count(*)::integer count
    from public.player_achievements
    where player_id=p_player_id and unlocked_at is not null
  ),
  social as (
    select
      (select count(*) from public.friendships
       where status='accepted' and (requester_id=p_player_id or addressee_id=p_player_id))::integer friends,
      (select count(*) from public.trades
       where status='completed' and (sender_id=p_player_id or receiver_id=p_player_id))::integer trades
  ),
  season_stats as (
    select
      count(*) filter(where matches>0)::integer seasons_played,
      coalesce(max(best_streak),0)::integer best_season_streak,
      coalesce(sum(wins),0)::integer season_wins
    from public.player_seasons
    where player_id=p_player_id
  ),
  cards as (
    select count(*)::integer unique_cards
    from public.player_cards
    where player_id=p_player_id and quantity>0
  )
  select jsonb_build_object(
    'species',(select count from species),
    'completedSets',(select count from completed_sets),
    'achievementsUnlocked',(select count from achievements),
    'friends',(select friends from social),
    'completedTrades',(select trades from social),
    'seasonsPlayed',(select seasons_played from season_stats),
    'bestSeasonStreak',(select best_season_streak from season_stats),
    'careerScore',
      least(2500,(select unique_cards from cards)*2)
      + least(2500,(select count from species)*5)
      + least(2000,p.battle_wins*20)
      + least(1000,(select trades from social)*25)
      + least(1000,(select friends from social)*20)
      + least(1000,(select count from achievements)*50)
  )
  into v_result
  from public.players p
  where p.id=p_player_id;

  return v_result;
end;
$function$;

revoke all on function public.get_public_trainer_identity(uuid) from public,anon;
grant execute on function public.get_public_trainer_identity(uuid) to authenticated;

comment on function public.get_public_trainer_identity(uuid) is
  'Non-sensitive public Trainer Career summary for another authenticated player profile.';
