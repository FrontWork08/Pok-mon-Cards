-- Follow-up for the retention/gameplay expansion.
-- Finalizes claimable season rewards, generation medals and weekly Guild rewards.

create table if not exists public.guild_weekly_reward_claims (
  player_id uuid not null references public.players(id) on delete cascade,
  guild_id text not null references public.guilds(id) on delete cascade,
  week_start date not null,
  reward_coins bigint not null default 0,
  reward_diamonds integer not null default 0,
  completed_missions integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key(player_id,guild_id,week_start)
);
alter table public.guild_weekly_reward_claims enable row level security;
grant select on public.guild_weekly_reward_claims to authenticated;
drop policy if exists "own guild reward claims readable" on public.guild_weekly_reward_claims;
create policy "own guild reward claims readable"
on public.guild_weekly_reward_claims for select to authenticated
using ((select auth.uid())=player_id);


do $realtime$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='guild_weekly_reward_claims'
  ) then
    alter publication supabase_realtime add table public.guild_weekly_reward_claims;
  end if;
end $realtime$;

insert into public.achievement_definitions(id,name,description,category,target,title,icon,sort_order,active)
values
('pokedex_gen_1','Kanto completo','Descubra todas as 151 espécies de Kanto.','collection',151,'Mestre de Kanto','🔴',31,true),
('pokedex_gen_2','Johto completo','Descubra todas as 100 espécies de Johto.','collection',100,'Mestre de Johto','🟡',32,true),
('pokedex_gen_3','Hoenn completo','Descubra todas as 135 espécies de Hoenn.','collection',135,'Mestre de Hoenn','🟢',33,true),
('pokedex_gen_4','Sinnoh completo','Descubra todas as 107 espécies de Sinnoh.','collection',107,'Mestre de Sinnoh','🔷',34,true),
('pokedex_gen_5','Unova completo','Descubra todas as 156 espécies de Unova.','collection',156,'Mestre de Unova','⚫',35,true),
('pokedex_gen_6','Kalos completo','Descubra todas as 72 espécies de Kalos.','collection',72,'Mestre de Kalos','🔵',36,true),
('pokedex_gen_7','Alola completo','Descubra todas as 88 espécies de Alola.','collection',88,'Mestre de Alola','🌴',37,true),
('pokedex_gen_8','Galar completo','Descubra todas as 96 espécies de Galar.','collection',96,'Mestre de Galar','⚔️',38,true),
('pokedex_gen_9','Paldea completo','Descubra todas as 120 espécies de Paldea.','collection',120,'Mestre de Paldea','🍊',39,true)
on conflict(id) do update set
name=excluded.name,description=excluded.description,category=excluded.category,target=excluded.target,
title=excluded.title,icon=excluded.icon,sort_order=excluded.sort_order,active=true;

CREATE OR REPLACE FUNCTION private.claim_guild_weekly_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid:=auth.uid();
  v_status jsonb;
  v_guild text;
  v_week date;
  v_completed integer;
  v_coins bigint;
  v_diamonds integer;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  v_status:=private.get_guild_weekly_reward_status();
  v_guild:=v_status->>'guildId';
  if coalesce(v_guild,'')='' then raise exception 'NO_GUILD'; end if;
  if coalesce((v_status->>'claimed')::boolean,false) then raise exception 'ALREADY_CLAIMED'; end if;
  if not coalesce((v_status->>'claimable')::boolean,false) then raise exception 'GUILD_MISSIONS_NOT_COMPLETE'; end if;

  v_week:=(v_status->>'weekStart')::date;
  v_completed:=(v_status->>'completedMissions')::integer;
  v_coins:=(v_status->>'coins')::bigint;
  v_diamonds:=(v_status->>'diamonds')::integer;

  insert into public.guild_weekly_reward_claims(
    player_id,guild_id,week_start,reward_coins,reward_diamonds,completed_missions
  )
  values(v_player,v_guild,v_week,v_coins,v_diamonds,v_completed);

  update public.players
  set coins=coins+v_coins,diamonds=diamonds+v_diamonds
  where id=v_player;

  return jsonb_build_object(
    'guildId',v_guild,'weekStart',v_week,'completedMissions',v_completed,
    'coins',v_coins,'diamonds',v_diamonds,'claimed',true
  );
end;
$function$;


CREATE OR REPLACE FUNCTION private.get_guild_weekly_reward_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid:=auth.uid();
  v_guild text;
  v_week timestamptz:=date_trunc('week',now());
  v_collection numeric:=0;
  v_packs integer:=0;
  v_wins integer:=0;
  v_completed integer:=0;
  v_claimed boolean:=false;
  v_coins bigint:=0;
  v_diamonds integer:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select gm.guild_id into v_guild
  from public.guild_members gm
  where gm.player_id=v_player
  limit 1;

  if v_guild is null then
    return jsonb_build_object(
      'guildId',null,'weekStart',v_week::date,'completedMissions',0,
      'claimed',false,'claimable',false,'coins',0,'diamonds',0,
      'collectionValueUsd',0,'packs',0,'wins',0
    );
  end if;

  select coalesce(sum(coalesce(c.market_price_usd,0)),0)
  into v_collection
  from public.guild_members gm
  join public.player_cards pc on pc.player_id=gm.player_id and pc.quantity>0
  join public.cards c on c.id=pc.card_id
  where gm.guild_id=v_guild;

  select count(*) into v_packs
  from public.pack_openings po
  join public.guild_members gm on gm.player_id=po.player_id
  where gm.guild_id=v_guild and po.opened_at>=v_week;

  select count(*) into v_wins
  from public.battles b
  join public.guild_members gm on gm.player_id=b.winner_id
  where gm.guild_id=v_guild
    and b.status='completed'
    and coalesce(b.reward_eligible,true)
    and b.completed_at>=v_week;

  v_completed:=
    (case when v_collection>=10000 then 1 else 0 end)+
    (case when v_packs>=25 then 1 else 0 end)+
    (case when v_wins>=10 then 1 else 0 end);

  select exists(
    select 1 from public.guild_weekly_reward_claims c
    where c.player_id=v_player
      and c.guild_id=v_guild
      and c.week_start=v_week::date
  ) into v_claimed;

  v_coins:=case v_completed when 1 then 10000 when 2 then 25000 when 3 then 50000 else 0 end;
  v_diamonds:=case v_completed when 2 then 1 when 3 then 3 else 0 end;

  return jsonb_build_object(
    'guildId',v_guild,
    'weekStart',v_week::date,
    'completedMissions',v_completed,
    'claimed',v_claimed,
    'claimable',v_completed>0 and not v_claimed,
    'coins',v_coins,
    'diamonds',v_diamonds,
    'collectionValueUsd',v_collection,
    'packs',v_packs,
    'wins',v_wins
  );
end;
$function$;


CREATE OR REPLACE FUNCTION private.get_retention_hub()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_player uuid:=auth.uid();
  v_season text;
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  v_season:=private.current_season_id();

  select jsonb_build_object(
    'season',(
      select jsonb_build_object(
        'id',s.id,'name',s.name,'subtitle',s.subtitle,'themeColor',s.theme_color,
        'startsAt',s.starts_at,'endsAt',s.ends_at,'rewardConfig',s.reward_config,
        'my',coalesce((
          select jsonb_build_object(
            'points',ps.points,'wins',ps.wins,'losses',ps.losses,'matches',ps.matches,
            'bestStreak',ps.best_streak,'rewardClaimed',ps.reward_claimed
          ) from public.player_seasons ps where ps.season_id=s.id and ps.player_id=v_player
        ),jsonb_build_object('points',0,'wins',0,'losses',0,'matches',0,'bestStreak',0,'rewardClaimed',false)),
        'top',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rank',x.rn,'playerId',x.player_id,'username',x.username,'points',x.points,'wins',x.wins,'matches',x.matches
          ) order by x.rn)
          from (
            select row_number() over(order by ps.points desc,ps.wins desc,ps.matches asc,p.username) rn,
              ps.player_id,p.username,ps.points,ps.wins,ps.matches
            from public.player_seasons ps join public.players p on p.id=ps.player_id
            where ps.season_id=s.id and p.account_status<>'banned'
            order by ps.points desc,ps.wins desc,ps.matches asc,p.username
            limit 20
          ) x
        ),'[]'::jsonb)
      )
      from public.seasons s where s.id=v_season
    ),
    'claimableSeason',(
      select jsonb_build_object(
        'id',s.id,'name',s.name,'endedAt',s.ends_at,'points',ps.points,
        'wins',ps.wins,'matches',ps.matches,'rewardConfig',s.reward_config
      )
      from public.player_seasons ps
      join public.seasons s on s.id=ps.season_id
      where ps.player_id=v_player and not ps.reward_claimed and s.ends_at<=now()
      order by s.ends_at desc limit 1
    ),
    'login',coalesce((
      select jsonb_build_object(
        'currentStreak',current_streak,'bestStreak',best_streak,'totalClaims',total_claims,
        'lastClaimDate',last_claim_date,'claimedToday',last_claim_date=current_date
      ) from public.player_login_streaks where player_id=v_player
    ),jsonb_build_object('currentStreak',0,'bestStreak',0,'totalClaims',0,'lastClaimDate',null,'claimedToday',false)),
    'wishlistCount',(select count(*) from public.card_wishlist where player_id=v_player),
    'milestoneClaims',coalesce((
      select jsonb_agg(jsonb_build_object('kind',milestone_kind,'key',milestone_key,'claimedAt',claimed_at))
      from public.collection_milestone_claims where player_id=v_player
    ),'[]'::jsonb),
    'guild',(
      select jsonb_build_object('id',g.id,'name',g.name,'level',g.level,'xp',g.xp,'color',g.color)
      from public.guild_members gm join public.guilds g on g.id=gm.guild_id
      where gm.player_id=v_player limit 1
    ),
    'activeEvents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'type',e.event_type,'title',e.title,'startsAt',e.starts_at,'endsAt',e.ends_at,'payload',e.payload
      ) order by e.ends_at)
      from public.admin_game_events e
      where e.active and e.starts_at<=now() and e.ends_at>now()
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;


CREATE OR REPLACE FUNCTION public.claim_guild_weekly_reward()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.claim_guild_weekly_reward(); $function$;


CREATE OR REPLACE FUNCTION public.get_guild_weekly_reward_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.get_guild_weekly_reward_status(); $function$;


CREATE OR REPLACE FUNCTION public.get_retention_hub()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.get_retention_hub(); $function$;


CREATE OR REPLACE FUNCTION public.server_refresh_player_achievements(p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.players%rowtype;
  v_count integer;
  v_creator boolean;
begin
  select * into p from public.players where id=p_player_id;
  if p.id is null then return; end if;

  select exists(select 1 from public.admin_members a where a.player_id=p_player_id) into v_creator;
  perform public.server_set_achievement_progress(p_player_id,'creator_owner',case when v_creator then 1 else 0 end);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.winner_id=p_player_id
    and exists(
      select 1 from public.admin_members a
      where a.player_id=case when b.challenger_id=p_player_id then b.opponent_id else b.challenger_id end
    );
  perform public.server_set_achievement_progress(p_player_id,'beat_creator',v_count);

  perform public.server_set_achievement_progress(p_player_id,'first_win',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_10',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_50',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'wins_100',p.battle_wins);
  perform public.server_set_achievement_progress(p_player_id,'streak_3',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_5',p.best_battle_streak);
  perform public.server_set_achievement_progress(p_player_id,'streak_10',p.best_battle_streak);

  select count(*) into v_count from public.battles b
  where b.status='completed' and b.mode='draft3' and b.winner_id=p_player_id;
  perform public.server_set_achievement_progress(p_player_id,'draft_win',v_count);

  select count(*) into v_count from public.battles b
  where b.status='completed' and b.mode='draft3' and b.winner_id=p_player_id
    and (
      (b.challenger_id=p_player_id and b.challenger_score=3 and b.opponent_score=0)
      or (b.opponent_id=p_player_id and b.opponent_score=3 and b.challenger_score=0)
    );
  perform public.server_set_achievement_progress(p_player_id,'draft_perfect',v_count);

  select count(*) into v_count from public.player_cards pc
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'collector_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_500',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_1000',v_count);

  select count(*) into v_count from public.pack_openings po where po.player_id=p_player_id;
  perform public.server_set_achievement_progress(p_player_id,'packs_25',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_500',v_count);

  select count(*) into v_count from public.trades t
  where t.status::text='completed' and p_player_id in (t.sender_id,t.receiver_id);
  perform public.server_set_achievement_progress(p_player_id,'trades_10',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_151',v_count);

  select count(*) into v_count
  from (
    select c.set_id
    from public.player_cards pc
    join public.cards c on c.id=pc.card_id
    where pc.player_id=p_player_id and pc.quantity>0
    group by c.set_id
    having count(*) >= (select count(*) from public.cards c2 where c2.set_id=c.set_id)
  ) completed_sets;
  perform public.server_set_achievement_progress(p_player_id,'set_complete_1',v_count);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.is_ranked
    and p_player_id in (b.challenger_id,b.opponent_id);
  perform public.server_set_achievement_progress(p_player_id,'ranked_25',v_count);

  perform public.server_set_achievement_progress(p_player_id,'rank_starter',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_ace',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_veteran',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_elite',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_master',p.battle_rating);
  perform public.server_set_achievement_progress(p_player_id,'rank_grand',p.battle_rating);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 1 and 151;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_1',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 152 and 251;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_2',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 252 and 386;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_3',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 387 and 493;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_4',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 494 and 649;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_5',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 650 and 721;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_6',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 722 and 809;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_7',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 810 and 905;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_8',v_count);

  select count(distinct n) into v_count
  from public.player_cards pc join public.cards c on c.id=pc.card_id
  cross join lateral unnest(coalesce(c.pokedex_numbers,array[]::integer[])) n
  where pc.player_id=p_player_id and pc.quantity>0 and n between 906 and 1025;
  perform public.server_set_achievement_progress(p_player_id,'pokedex_gen_9',v_count);

  if v_creator and p.equipped_title_id is null then
    update public.players set equipped_title_id='creator_owner' where id=p_player_id;
  end if;
end;
$function$;



revoke all on function private.get_retention_hub() from public,anon;
grant execute on function private.get_retention_hub() to authenticated,service_role;
revoke all on function public.get_retention_hub() from public,anon;
grant execute on function public.get_retention_hub() to authenticated;

revoke all on function private.get_guild_weekly_reward_status() from public,anon;
grant execute on function private.get_guild_weekly_reward_status() to authenticated,service_role;
revoke all on function public.get_guild_weekly_reward_status() from public,anon;
grant execute on function public.get_guild_weekly_reward_status() to authenticated;

revoke all on function private.claim_guild_weekly_reward() from public,anon;
grant execute on function private.claim_guild_weekly_reward() to authenticated,service_role;
revoke all on function public.claim_guild_weekly_reward() from public,anon;
grant execute on function public.claim_guild_weekly_reward() to authenticated;


create index if not exists guild_weekly_reward_claims_guild_idx
  on public.guild_weekly_reward_claims(guild_id);
