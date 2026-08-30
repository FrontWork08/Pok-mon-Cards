-- Establish a clean Trainer Collection 1.0 progression epoch while preserving Beta history.
-- Historical packs/battles/trades remain available for audit/history, but new progression,
-- weekly rankings, achievements and guild missions only count activity after the reset.
-- Also makes booster pity part of the reversible reset snapshot.

alter table public.release_campaigns
  add column if not exists progress_reset_at timestamptz;

create or replace function private.release_progress_epoch()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select c.progress_reset_at
      from public.release_campaigns c
      where c.code='trainer_collection_1_0_beta_transition'
        and c.active=true
      limit 1
    ),
    '-infinity'::timestamptz
  );
$$;

revoke all on function private.release_progress_epoch() from public, anon, authenticated;

create or replace function private.capture_release_aux_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.release_campaigns c
    where c.id=new.campaign_id
      and c.code='trainer_collection_1_0_beta_transition'
  ) then
    insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data)
    select new.id,'player_pack_pity',to_jsonb(t)
    from private.player_pack_pity t;

    insert into private.release_reset_snapshot_rows(snapshot_id,table_name,row_data)
    select new.id,'collection_weekly_config',to_jsonb(t)
    from private.collection_weekly_config t;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_release_aux_snapshot() from public, anon, authenticated;

drop trigger if exists capture_release_aux_snapshot on private.release_reset_snapshots;
create trigger capture_release_aux_snapshot
after insert on private.release_reset_snapshots
for each row execute function private.capture_release_aux_snapshot();

create or replace function private.mark_release_progress_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code <> 'trainer_collection_1_0_beta_transition' then
    return new;
  end if;

  if old.phase='freeze' and new.phase='update_required' then
    new.progress_reset_at := now();
  elsif old.phase='update_required' and new.phase='freeze' then
    new.progress_reset_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.mark_release_progress_epoch() from public, anon, authenticated;

drop trigger if exists mark_release_progress_epoch on public.release_campaigns;
create trigger mark_release_progress_epoch
before update on public.release_campaigns
for each row execute function private.mark_release_progress_epoch();

create or replace function private.apply_release_progress_epoch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code='trainer_collection_1_0_beta_transition'
     and old.phase='freeze'
     and new.phase='update_required'
  then
    delete from private.player_pack_pity;

    update private.collection_weekly_config
    set activated_at=new.progress_reset_at,
        updated_at=now()
    where id=1;
  end if;
  return new;
end;
$$;

revoke all on function private.apply_release_progress_epoch() from public, anon, authenticated;

drop trigger if exists apply_release_progress_epoch on public.release_campaigns;
create trigger apply_release_progress_epoch
after update on public.release_campaigns
for each row execute function private.apply_release_progress_epoch();

create or replace function private.restore_release_aux_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status='used' and new.status='restored' then
    delete from private.player_pack_pity;
    insert into private.player_pack_pity
    select (jsonb_populate_record(null::private.player_pack_pity,r.row_data)).*
    from private.release_reset_snapshot_rows r
    where r.snapshot_id=new.id and r.table_name='player_pack_pity';

    if exists (
      select 1
      from private.release_reset_snapshot_rows r
      where r.snapshot_id=new.id and r.table_name='collection_weekly_config'
    ) then
      delete from private.collection_weekly_config where id=1;
      insert into private.collection_weekly_config
      select (jsonb_populate_record(null::private.collection_weekly_config,r.row_data)).*
      from private.release_reset_snapshot_rows r
      where r.snapshot_id=new.id and r.table_name='collection_weekly_config';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.restore_release_aux_snapshot() from public, anon, authenticated;

drop trigger if exists restore_release_aux_snapshot on private.release_reset_snapshots;
create trigger restore_release_aux_snapshot
after update of status on private.release_reset_snapshots
for each row execute function private.restore_release_aux_snapshot();

create or replace function private.calculate_mission_progress(
  p_player_id uuid,
  p_event_type text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_progress bigint:=0;
  v_start timestamptz:=greatest(p_period_start,private.release_progress_epoch());
begin
  case p_event_type
    when 'pack_opened' then
      select count(*) into v_progress
      from public.pack_openings
      where player_id=p_player_id and opened_at>=v_start and opened_at<p_period_end;
    when 'battle_completed' then
      select count(*) into v_progress
      from public.battles
      where status='completed' and completed_at>=v_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'battle_won' then
      select count(*) into v_progress
      from public.battles
      where status='completed' and winner_id=p_player_id
        and completed_at>=v_start and completed_at<p_period_end;
    when 'ranked_match' then
      select count(*) into v_progress
      from public.battles
      where status='completed' and is_ranked
        and completed_at>=v_start and completed_at<p_period_end
        and (challenger_id=p_player_id or opponent_id=p_player_id);
    when 'ranked_win' then
      select count(*) into v_progress
      from public.battles
      where status='completed' and is_ranked and winner_id=p_player_id
        and completed_at>=v_start and completed_at<p_period_end;
    when 'trade_completed' then
      select count(*) into v_progress
      from public.trades
      where status='completed' and updated_at>=v_start and updated_at<p_period_end
        and (sender_id=p_player_id or receiver_id=p_player_id);
    when 'market_listing' then
      select count(*) into v_progress
      from public.market_listings
      where seller_id=p_player_id and created_at>=v_start and created_at<p_period_end;
    when 'market_sale' then
      select
        (select count(*) from public.market_listings
         where seller_id=p_player_id and status='sold'
           and sold_at>=v_start and sold_at<p_period_end)
        +
        (select count(*) from private.card_duplicate_sales
         where player_id=p_player_id
           and created_at>=v_start and created_at<p_period_end)
      into v_progress;
    when 'card_discovered' then
      select count(*) into v_progress
      from public.player_cards
      where player_id=p_player_id
        and first_obtained_at>=v_start and first_obtained_at<p_period_end;
    else
      v_progress:=0;
  end case;
  return least(v_progress,2147483647)::integer;
end;
$$;

create or replace function public.server_refresh_player_achievements(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  p public.players%rowtype;
  v_count integer;
  v_creator boolean;
  v_epoch timestamptz:=private.release_progress_epoch();
begin
  select * into p from public.players where id=p_player_id;
  if p.id is null then return; end if;

  select exists(select 1 from public.admin_members a where a.player_id=p_player_id) into v_creator;
  perform public.server_set_achievement_progress(p_player_id,'creator_owner',case when v_creator then 1 else 0 end);

  select count(*) into v_count
  from public.battles b
  where b.status='completed'
    and b.winner_id=p_player_id
    and b.completed_at>=v_epoch
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

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.mode='draft3'
    and b.winner_id=p_player_id and b.completed_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'draft_win',v_count);

  select count(*) into v_count
  from public.battles b
  where b.status='completed' and b.mode='draft3'
    and b.winner_id=p_player_id and b.completed_at>=v_epoch
    and (
      (b.challenger_id=p_player_id and b.challenger_score=3 and b.opponent_score=0)
      or (b.opponent_id=p_player_id and b.opponent_score=3 and b.challenger_score=0)
    );
  perform public.server_set_achievement_progress(p_player_id,'draft_perfect',v_count);

  select count(*) into v_count
  from public.player_cards pc
  where pc.player_id=p_player_id and pc.quantity>0;
  perform public.server_set_achievement_progress(p_player_id,'collector_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_500',v_count);
  perform public.server_set_achievement_progress(p_player_id,'collector_1000',v_count);

  select count(*) into v_count
  from public.pack_openings po
  where po.player_id=p_player_id and po.opened_at>=v_epoch;
  perform public.server_set_achievement_progress(p_player_id,'packs_25',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_100',v_count);
  perform public.server_set_achievement_progress(p_player_id,'packs_500',v_count);

  select count(*) into v_count
  from public.trades t
  where t.status::text='completed'
    and p_player_id in (t.sender_id,t.receiver_id)
    and t.updated_at>=v_epoch;
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
    and p_player_id in (b.challenger_id,b.opponent_id)
    and b.completed_at>=v_epoch;
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
$$;

create or replace function private.get_guild_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_week timestamptz:=date_trunc('week',now());
  v_score_start timestamptz:=greatest(date_trunc('week',now()),private.release_progress_epoch());
  v_result jsonb;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  with guild_totals as (
    select g.id,g.name,g.color,g.motto,g.leader_id,g.xp,g.level,
      leader.username as leader_username,
      count(distinct gm.player_id)::integer as member_count,
      coalesce(sum(coalesce(c.market_price_usd,0)),0)::numeric(14,2) as collection_value_usd
    from public.guilds g
    left join public.players leader on leader.id=g.leader_id
    left join public.guild_members gm on gm.guild_id=g.id
    left join public.player_cards pc on pc.player_id=gm.player_id and pc.quantity>0
    left join public.cards c on c.id=pc.card_id
    group by g.id,g.name,g.color,g.motto,g.leader_id,g.xp,g.level,leader.username
  ), ranked as (
    select *,dense_rank() over(order by collection_value_usd desc,member_count desc,name) as guild_rank
    from guild_totals
  )
  select jsonb_build_object(
    'guilds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'color',r.color,'motto',r.motto,
      'leaderId',r.leader_id,'leaderUsername',r.leader_username,
      'memberCount',r.member_count,'collectionValueUsd',r.collection_value_usd,'rank',r.guild_rank,
      'xp',r.xp,'level',r.level,
      'members',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,'username',p.username,'level',p.level,'role',gm.role,'joinedAt',gm.joined_at
        ) order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end,p.username)
        from public.guild_members gm join public.players p on p.id=gm.player_id
        where gm.guild_id=r.id
      ),'[]'::jsonb),
      'missions',jsonb_build_array(
        jsonb_build_object(
          'id','guild_xp','icon','flash','title','Ascensão da Guilda',
          'description','Ganhe XP abrindo boosters e disputando partidas ranqueadas.',
          'progress',r.xp%500,'target',500,'completed',false
        ),
        jsonb_build_object(
          'id','collection_value','icon','diamond','title','Tesouro da Guilda',
          'description','Somar US$ 10.000 em cartas únicas entre todos os membros.',
          'progress',least(r.collection_value_usd,10000),'target',10000,
          'completed',r.collection_value_usd>=10000
        ),
        jsonb_build_object(
          'id','weekly_boosters','icon','cube','title','Caçadores de Boosters',
          'description','Abrir 25 boosters em conjunto nesta semana.',
          'progress',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_score_start),
          'target',25,
          'completed',(select count(*) from public.pack_openings po join public.guild_members gm2 on gm2.player_id=po.player_id where gm2.guild_id=r.id and po.opened_at>=v_score_start)>=25
        ),
        jsonb_build_object(
          'id','weekly_wins','icon','trophy','title','Domínio da Arena',
          'description','Conquistar 10 vitórias válidas em batalha nesta semana.',
          'progress',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_score_start),
          'target',10,
          'completed',(select count(*) from public.battles b join public.guild_members gm2 on gm2.player_id=b.winner_id where gm2.guild_id=r.id and b.status='completed' and coalesce(b.reward_eligible,true) and b.completed_at>=v_score_start)>=10
        )
      )
    ) order by r.guild_rank,r.name) from ranked r),'[]'::jsonb),
    'myMembership',(
      select jsonb_build_object('guildId',gm.guild_id,'role',gm.role,'joinedAt',gm.joined_at)
      from public.guild_members gm where gm.player_id=v_actor
    ),
    'myInvites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',gi.id,'guildId',gi.guild_id,'guildName',g.name,'guildColor',g.color,
        'invitedBy',gi.invited_by,'invitedByUsername',p.username,'createdAt',gi.created_at
      ) order by gi.created_at desc)
      from public.guild_invites gi
      join public.guilds g on g.id=gi.guild_id
      join public.players p on p.id=gi.invited_by
      where gi.invited_player_id=v_actor and gi.status='pending'
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function private.get_guild_weekly_reward_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_player uuid:=auth.uid();
  v_guild text;
  v_week timestamptz:=date_trunc('week',now());
  v_score_start timestamptz:=greatest(date_trunc('week',now()),private.release_progress_epoch());
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
  where gm.guild_id=v_guild and po.opened_at>=v_score_start;

  select count(*) into v_wins
  from public.battles b
  join public.guild_members gm on gm.player_id=b.winner_id
  where gm.guild_id=v_guild
    and b.status='completed'
    and coalesce(b.reward_eligible,true)
    and b.completed_at>=v_score_start;

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
$$;

create or replace function public.server_complete_release(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_campaign public.release_campaigns%rowtype;
  v_maintenance boolean := false;
  v_used_snapshot uuid;
  v_bad_players integer := 0;
  v_bad_cards integer := 0;
  v_unpreserved_cards integer := 0;
  v_pity_rows integer := 0;
  v_launch_at timestamptz:=now();
begin
  if not exists (
    select 1 from public.admin_members a
    where a.player_id = p_actor_id and a.role = 'owner'
  ) then
    raise exception using errcode='P0001', message='OWNER_ONLY';
  end if;

  select * into v_campaign
  from public.release_campaigns
  where code='trainer_collection_1_0_beta_transition' and active=true
  for update;

  if not found then
    raise exception using errcode='P0001', message='RELEASE_CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.phase <> 'update_required' or not coalesce(v_campaign.economy_frozen,false) then
    raise exception using errcode='P0001', message='RELEASE_RESET_REQUIRED';
  end if;

  if v_campaign.progress_reset_at is null then
    raise exception using errcode='P0001', message='RELEASE_PROGRESS_EPOCH_REQUIRED';
  end if;

  select maintenance_enabled into v_maintenance
  from public.app_runtime_status where id=1;

  if not coalesce(v_maintenance,false) then
    raise exception using errcode='P0001', message='RELEASE_MAINTENANCE_REQUIRED';
  end if;

  if nullif(btrim(coalesce(v_campaign.download_url,'')),'') is null then
    raise exception using errcode='P0001', message='RELEASE_DOWNLOAD_NOT_READY';
  end if;

  select id into v_used_snapshot
  from private.release_reset_snapshots
  where campaign_id=v_campaign.id and status='used'
  order by used_at desc nulls last, created_at desc
  limit 1;

  if v_used_snapshot is null then
    raise exception using errcode='P0001', message='RELEASE_USED_SNAPSHOT_REQUIRED';
  end if;

  select count(*) into v_bad_players
  from public.players p
  where p.coins is distinct from v_campaign.reward_coins
     or p.diamonds is distinct from v_campaign.reward_diamonds
     or p.level is distinct from 1
     or p.xp is distinct from 0
     or p.battle_rating is distinct from 1000
     or p.battle_wins is distinct from 0
     or p.battle_losses is distinct from 0
     or p.battle_streak is distinct from 0
     or p.best_battle_streak is distinct from 0;

  if v_bad_players > 0 then
    raise exception using errcode='P0001', message='RELEASE_PLAYER_RESET_INVARIANT_FAILED';
  end if;

  select count(*) into v_bad_cards
  from public.player_cards pc
  where pc.quantity <> 1;

  if v_bad_cards > 0 then
    raise exception using errcode='P0001', message='RELEASE_CARD_QUANTITY_INVARIANT_FAILED';
  end if;

  select count(*) into v_unpreserved_cards
  from public.player_cards pc
  where not exists (
    select 1
    from public.release_campaign_legacy_selections s
    where s.campaign_id=v_campaign.id
      and s.player_id=pc.player_id
      and s.card_id=pc.card_id
  );

  if v_unpreserved_cards > 0 then
    raise exception using errcode='P0001', message='RELEASE_UNPRESERVED_CARD_FOUND';
  end if;

  select count(*) into v_pity_rows from private.player_pack_pity;
  if v_pity_rows > 0 then
    raise exception using errcode='P0001', message='RELEASE_PACK_PITY_NOT_RESET';
  end if;

  update public.seasons
  set
    ends_at=v_launch_at + (ends_at-starts_at),
    starts_at=v_launch_at
  where active=true and ends_at>starts_at;

  update public.battle_pass_seasons
  set
    ends_at=v_launch_at + (ends_at-starts_at),
    starts_at=v_launch_at
  where active=true and ends_at>starts_at;

  update private.collection_weekly_config
  set activated_at=v_campaign.progress_reset_at,updated_at=now()
  where id=1;

  update public.release_campaigns
  set
    phase='completed',
    legacy_selection_enabled=false,
    economy_frozen=false,
    force_update=true,
    updated_at=now()
  where id=v_campaign.id;

  update public.app_runtime_status
  set
    maintenance_enabled=false,
    maintenance_message='Trainer Collection 1.0 está online.',
    enabled_at=null,
    enabled_by=null,
    updated_at=now()
  where id=1;

  return jsonb_build_object(
    'ok',true,
    'phase','completed',
    'targetVersion',v_campaign.target_version,
    'progressResetAt',v_campaign.progress_reset_at,
    'seasonLaunchAt',v_launch_at,
    'forceUpdate',true,
    'economyFrozen',false,
    'maintenanceEnabled',false,
    'usedSnapshotId',v_used_snapshot,
    'playersVerified',(select count(*) from public.players),
    'legacyCardRowsVerified',(select count(*) from public.player_cards),
    'packPityRows',v_pity_rows
  );
end;
$$;

revoke all on function public.server_complete_release(uuid) from public, anon, authenticated;
grant execute on function public.server_complete_release(uuid) to service_role;
