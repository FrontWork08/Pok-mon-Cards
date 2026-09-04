create or replace function public.get_home_dashboard()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_player uuid := auth.uid();
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'coins', p.coins,
      'diamonds', p.diamonds,
      'profile_icon', p.profile_icon,
      'avatar_path', p.avatar_path,
      'avatar_updated_at', p.avatar_updated_at,
      'level', p.level,
      'xp', p.xp,
      'battle_rating', p.battle_rating,
      'last_daily_claim_at', p.last_daily_claim_at,
      'daily_claimed_today', coalesce(ls.last_claim_date=current_date,false),
      'daily_streak', coalesce(ls.current_streak,0),
      'daily_cycle_day', case when coalesce(ls.current_streak,0)>0 then ((ls.current_streak-1)%7)+1 else 0 end
    ),
    'stats', jsonb_build_object(
      'totalCards', coalesce((
        select sum(pc.quantity)
        from public.player_cards pc
        where pc.player_id=v_player and pc.quantity>0
      ),0),
      'species', coalesce((
        select count(distinct c.pokedex_numbers[1])
        from public.player_cards pc
        join public.cards c on c.id=pc.card_id
        where pc.player_id=v_player
          and pc.quantity>0
          and cardinality(c.pokedex_numbers)>0
      ),0),
      'completedTrades', coalesce((
        select count(*)
        from public.trades t
        where t.status='completed'
          and (t.sender_id=v_player or t.receiver_id=v_player)
      ),0)
    )
  )
  into v_result
  from public.players p
  left join public.player_login_streaks ls on ls.player_id=p.id
  where p.id=v_player;

  if v_result is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return v_result;
end;
$function$;
