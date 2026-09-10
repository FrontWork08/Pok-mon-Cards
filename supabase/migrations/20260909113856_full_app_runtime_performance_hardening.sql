create table if not exists private.background_job_state (
  job_name text primary key,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_source_change_at timestamptz,
  last_result jsonb not null default '{}'::jsonb
);

revoke all on table private.background_job_state from public, anon, authenticated;
grant select, insert, update on table private.background_job_state to service_role;

insert into private.background_job_state(job_name,last_attempt_at,last_success_at,last_source_change_at,last_result)
values(
  'pack_economy',
  now(),
  now(),
  (select max(c.market_price_updated_at) from public.cards c),
  jsonb_build_object('status','initialized','reason','full_app_performance_hardening')
)
on conflict (job_name) do nothing;

create or replace view public.set_catalog as
with card_sets as (
  select
    c.set_id,
    max(c.set_name) as set_name,
    count(*)::integer as total_cards
  from public.cards c
  group by c.set_id
),
pack_images as (
  select
    p.set_id,
    max(p.image_url) filter (where p.image_url is not null) as representative_image
  from public.packs p
  group by p.set_id
)
select
  cs.set_id,
  cs.set_name,
  cs.total_cards,
  pi.representative_image
from card_sets cs
left join pack_images pi on pi.set_id=cs.set_id;

create index if not exists battles_guild_weekly_wins_idx
  on public.battles(winner_id,completed_at desc)
  where status='completed' and reward_eligible is distinct from false;

create or replace function private.get_guild_hub()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
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
  ), weekly_boosters as (
    select gm.guild_id,count(*)::integer as opened
    from public.guild_members gm
    join public.pack_openings po on po.player_id=gm.player_id and po.opened_at>=v_score_start
    group by gm.guild_id
  ), weekly_wins as (
    select gm.guild_id,count(*)::integer as wins
    from public.guild_members gm
    join public.battles b on b.winner_id=gm.player_id
      and b.status='completed'
      and b.reward_eligible is distinct from false
      and b.completed_at>=v_score_start
    group by gm.guild_id
  ), ranked as (
    select gt.*,
      coalesce(wb.opened,0) as weekly_boosters,
      coalesce(ww.wins,0) as weekly_wins,
      dense_rank() over(order by gt.collection_value_usd desc,gt.member_count desc,gt.name) as guild_rank
    from guild_totals gt
    left join weekly_boosters wb on wb.guild_id=gt.id
    left join weekly_wins ww on ww.guild_id=gt.id
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
          'progress',r.weekly_boosters,
          'target',25,
          'completed',r.weekly_boosters>=25
        ),
        jsonb_build_object(
          'id','weekly_wins','icon','trophy','title','Domínio da Arena',
          'description','Conquistar 10 vitórias válidas em batalha nesta semana.',
          'progress',r.weekly_wins,
          'target',10,
          'completed',r.weekly_wins>=10
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
$function$;

create or replace function public.server_background_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_battles integer;
  v_push integer;
  v_catalog jsonb;
  v_market_pending integer;
  v_restored_suspensions integer;
  v_season text;
  v_legacy jsonb;
  v_tick_started timestamptz:=clock_timestamp();
  v_latest_price_change timestamptz;
  v_last_pack_success timestamptz;
  v_last_pack_source timestamptz;
  v_pack_due boolean:=false;
  v_pack_rows integer:=0;
  v_pack_economy jsonb:=jsonb_build_object('status','deferred');
begin
  if not pg_try_advisory_xact_lock(hashtextextended('trainer_collection:server_background_tick',0)) then
    return jsonb_build_object('status','skipped','reason','tick_already_running','at',now());
  end if;

  update public.players
  set account_status='active',suspended_until=null,moderation_reason=null
  where account_status='suspended'
    and suspended_until is not null and suspended_until<=now();
  get diagnostics v_restored_suspensions=row_count;

  v_season:=private.ensure_active_season();
  v_legacy:=private.auto_lock_due_legacy_selections();

  perform private.ensure_weekly_guild_wars();
  perform private.ensure_active_tournament();

  update public.market_offers
  set status='expired',updated_at=now()
  where status='pending' and expires_at<=now();

  v_battles:=public.server_process_expired_battles();
  v_push:=public.server_dispatch_push_notifications();

  if exists(select 1 from public.catalog_refresh_state where job_name='full_tcg_refresh' and status='running') then
    begin
      v_catalog:=public.server_refresh_catalog_batch(2);
    exception when others then
      v_catalog:=jsonb_build_object('error',sqlerrm);
    end;
  else
    v_catalog:=jsonb_build_object('status','idle');
  end if;

  select max(c.market_price_updated_at) into v_latest_price_change from public.cards c;
  select s.last_success_at,s.last_source_change_at
    into v_last_pack_success,v_last_pack_source
  from private.background_job_state s
  where s.job_name='pack_economy';

  v_pack_due := v_last_pack_success is null
    or (
      now()>=v_last_pack_success+interval '2 hours'
      and (
        v_last_pack_source is null
        or coalesce(v_latest_price_change,'epoch'::timestamptz)>v_last_pack_source
        or now()>=v_last_pack_success+interval '24 hours'
      )
    );

  if v_pack_due then
    insert into private.background_job_state(job_name,last_attempt_at,last_result)
    values('pack_economy',now(),jsonb_build_object('status','running'))
    on conflict(job_name) do update set last_attempt_at=excluded.last_attempt_at,last_result=excluded.last_result;
    begin
      v_pack_rows:=private.refresh_pack_economy();
      update private.background_job_state
      set last_success_at=now(),
          last_source_change_at=v_latest_price_change,
          last_result=jsonb_build_object('status','completed','rowsChanged',v_pack_rows)
      where job_name='pack_economy';
      v_pack_economy:=jsonb_build_object('status','completed','rowsChanged',v_pack_rows,'sourceChangedAt',v_latest_price_change);
    exception when others then
      update private.background_job_state
      set last_result=jsonb_build_object('status','error','message',sqlerrm)
      where job_name='pack_economy';
      v_pack_economy:=jsonb_build_object('status','error','message',sqlerrm);
    end;
  else
    v_pack_economy:=jsonb_build_object(
      'status','deferred',
      'lastSuccessAt',v_last_pack_success,
      'sourceChangedAt',v_latest_price_change,
      'minIntervalMinutes',120
    );
  end if;

  select count(*)::integer into v_market_pending
  from private.market_price_sync_sets
  where status in ('pending','running','retry');

  return jsonb_build_object(
    'battles',v_battles,'pushes',v_push,'catalog',v_catalog,
    'season',v_season,
    'legacySelection',v_legacy,
    'guildWars','checked',
    'tournaments','checked',
    'packEconomy',v_pack_economy,
    'moderation',jsonb_build_object('restoredSuspensions',v_restored_suspensions),
    'marketPrices',jsonb_build_object(
      'status',case when v_market_pending>0 then 'syncing' else 'ready' end,
      'pendingSets',v_market_pending,'source','pokemontcg:tcgplayer_market_v3'
    ),
    'durationMs',round((extract(epoch from(clock_timestamp()-v_tick_started))*1000)::numeric,1),
    'at',now()
  );
end;
$function$;

revoke all on function public.server_background_tick() from public, anon, authenticated;
grant execute on function public.server_background_tick() to service_role;
