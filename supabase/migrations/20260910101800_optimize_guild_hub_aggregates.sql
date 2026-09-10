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

  with member_rollup as materialized (
    select
      gm.guild_id,
      count(*)::integer as member_count,
      jsonb_agg(
        jsonb_build_object(
          'id',p.id,'username',p.username,'level',p.level,'role',gm.role,'joinedAt',gm.joined_at
        )
        order by case gm.role when 'leader' then 0 when 'officer' then 1 else 2 end,p.username
      ) as members
    from public.guild_members gm
    join public.players p on p.id=gm.player_id
    group by gm.guild_id
  ), collection_rollup as materialized (
    select
      gm.guild_id,
      coalesce(sum(coalesce(c.market_price_usd,0)),0)::numeric(14,2) as collection_value_usd
    from public.guild_members gm
    join public.player_cards pc on pc.player_id=gm.player_id and pc.quantity>0
    join public.cards c on c.id=pc.card_id
    group by gm.guild_id
  ), weekly_pack_rollup as materialized (
    select gm.guild_id,count(*)::integer as openings
    from public.guild_members gm
    join public.pack_openings po on po.player_id=gm.player_id
    where po.opened_at>=v_score_start
    group by gm.guild_id
  ), weekly_win_rollup as materialized (
    select gm.guild_id,count(*)::integer as wins
    from public.guild_members gm
    join public.battles b on b.winner_id=gm.player_id
    where b.status='completed'
      and coalesce(b.reward_eligible,true)
      and b.completed_at>=v_score_start
    group by gm.guild_id
  ), guild_totals as materialized (
    select
      g.id,g.name,g.color,g.motto,g.leader_id,g.xp,g.level,
      leader.username as leader_username,
      coalesce(m.member_count,0)::integer as member_count,
      coalesce(c.collection_value_usd,0)::numeric(14,2) as collection_value_usd,
      coalesce(wp.openings,0)::integer as weekly_openings,
      coalesce(ww.wins,0)::integer as weekly_wins,
      coalesce(m.members,'[]'::jsonb) as members
    from public.guilds g
    left join public.players leader on leader.id=g.leader_id
    left join member_rollup m on m.guild_id=g.id
    left join collection_rollup c on c.guild_id=g.id
    left join weekly_pack_rollup wp on wp.guild_id=g.id
    left join weekly_win_rollup ww on ww.guild_id=g.id
  ), ranked as (
    select *,dense_rank() over(order by collection_value_usd desc,member_count desc,name) as guild_rank
    from guild_totals
  )
  select jsonb_build_object(
    'guilds',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'name',r.name,'color',r.color,'motto',r.motto,
        'leaderId',r.leader_id,'leaderUsername',r.leader_username,
        'memberCount',r.member_count,'collectionValueUsd',r.collection_value_usd,'rank',r.guild_rank,
        'xp',r.xp,'level',r.level,
        'members',r.members,
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
            'progress',r.weekly_openings,
            'target',25,
            'completed',r.weekly_openings>=25
          ),
          jsonb_build_object(
            'id','weekly_wins','icon','trophy','title','Domínio da Arena',
            'description','Conquistar 10 vitórias válidas em batalha nesta semana.',
            'progress',r.weekly_wins,
            'target',10,
            'completed',r.weekly_wins>=10
          )
        )
      ) order by r.guild_rank,r.name)
      from ranked r
    ),'[]'::jsonb),
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
