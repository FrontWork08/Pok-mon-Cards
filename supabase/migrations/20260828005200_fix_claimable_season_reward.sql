-- Align season reward claiming with the latest ended season the current player
-- actually participated in and has not claimed yet.

CREATE OR REPLACE FUNCTION private.claim_season_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid:=auth.uid();
  v_season_id text;
  v_season public.seasons%rowtype;
  v_ps public.player_seasons%rowtype;
  v_tier text:='bronze';
  v_coins bigint:=0;
  v_diamonds integer:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select s.id
  into v_season_id
  from public.seasons s
  join public.player_seasons ps on ps.season_id=s.id
  where ps.player_id=v_player
    and not ps.reward_claimed
    and s.ends_at<=now()
  order by s.ends_at desc
  limit 1;

  if v_season_id is null then raise exception 'NO_CLAIMABLE_SEASON'; end if;

  select * into v_season
  from public.seasons
  where id=v_season_id;

  select * into v_ps
  from public.player_seasons
  where season_id=v_season_id and player_id=v_player
  for update;

  v_tier:=case
    when v_ps.points>=2600 then 'grand'
    when v_ps.points>=1800 then 'master'
    when v_ps.points>=1200 then 'platinum'
    when v_ps.points>=700 then 'gold'
    when v_ps.points>=300 then 'silver'
    else 'bronze'
  end;

  v_coins:=coalesce((v_season.reward_config->v_tier->>'coins')::bigint,0);
  v_diamonds:=coalesce((v_season.reward_config->v_tier->>'diamonds')::integer,0);

  update public.player_seasons
  set reward_claimed=true,updated_at=now()
  where season_id=v_season.id and player_id=v_player;

  update public.players
  set coins=coins+v_coins,diamonds=diamonds+v_diamonds
  where id=v_player;

  return jsonb_build_object(
    'seasonId',v_season.id,
    'seasonName',v_season.name,
    'tier',v_tier,
    'points',v_ps.points,
    'coins',v_coins,
    'diamonds',v_diamonds
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.claim_season_reward()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.claim_season_reward(); $function$


revoke all on function private.claim_season_reward() from public,anon;
grant execute on function private.claim_season_reward() to authenticated,service_role;
revoke all on function public.claim_season_reward() from public,anon;
grant execute on function public.claim_season_reward() to authenticated;
