
-- Career/Journey/Guild story RPCs are authenticated-only. Supabase role grants can
-- remain explicit even after revoking PUBLIC, so remove anon directly as well.
revoke all on function public.get_trainer_career() from public,anon;
grant execute on function public.get_trainer_career() to authenticated,service_role;

revoke all on function public.claim_trainer_journey_step(text) from public,anon;
grant execute on function public.claim_trainer_journey_step(text) to authenticated,service_role;

revoke all on function public.get_trainer_journey_summary() from public,anon;
grant execute on function public.get_trainer_journey_summary() to authenticated,service_role;

revoke all on function public.claim_all_trainer_journey_rewards() from public,anon;
grant execute on function public.claim_all_trainer_journey_rewards() to authenticated,service_role;

revoke all on function public.get_my_guild_story_feed(integer) from public,anon;
grant execute on function public.get_my_guild_story_feed(integer) to authenticated,service_role;

revoke all on function public.get_public_trainer_identity(uuid) from public,anon;
grant execute on function public.get_public_trainer_identity(uuid) to authenticated,service_role;

create or replace function public.get_my_guild_story_feed(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_player uuid:=auth.uid();
  v_guild text;
  v_limit integer:=greatest(1,least(coalesce(p_limit,12),30));
  v_result jsonb;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  select guild_id into v_guild
  from public.guild_members
  where player_id=v_player
  limit 1;

  if v_guild is null then return '[]'::jsonb; end if;

  with pack_batches as (
    select
      po.player_id,
      po.pack_id,
      date_trunc('hour',po.opened_at) as batch_hour,
      max(po.opened_at) as created_at,
      count(*)::integer as opening_count,
      max(coalesce(pk.name,'um booster')) as pack_name,
      max(po.currency_at_open) as currency,
      sum(coalesce(po.price_paid,0))::bigint as total_paid
    from public.pack_openings po
    join public.guild_members gm on gm.player_id=po.player_id and gm.guild_id=v_guild
    left join public.packs pk on pk.id=po.pack_id
    where po.opened_at>=now()-interval '14 days'
    group by po.player_id,po.pack_id,date_trunc('hour',po.opened_at)
  ),
  pack_ranked as (
    select b.*,row_number() over(order by b.created_at desc) as story_rank
    from pack_batches b
  ),
  stories as (
    select
      'battle_win'::text as type,
      p.username as actor,
      case when coalesce(b.is_ranked,false)
        then 'venceu uma batalha ranqueada'
        else 'venceu uma batalha'
      end as text,
      coalesce(b.completed_at,b.updated_at,b.created_at) as created_at,
      jsonb_build_object(
        'battleId',b.id,
        'ranked',coalesce(b.is_ranked,false),
        'engineVersion',b.engine_version
      ) as metadata,
      5 as priority
    from public.battles b
    join public.guild_members gm on gm.player_id=b.winner_id and gm.guild_id=v_guild
    join public.players p on p.id=b.winner_id
    where b.status='completed'
      and coalesce(b.completed_at,b.updated_at,b.created_at)>=now()-interval '14 days'

    union all

    select
      'gym_capture'::text,
      coalesce(p.username,'Guilda'),
      'ajudou a conquistar '||coalesce(g.gym_name,'um ginásio'),
      e.created_at,
      jsonb_build_object(
        'eventId',e.id,
        'warId',e.war_id,
        'gymId',e.gym_id,
        'gymName',g.gym_name,
        'message',e.message
      ),
      6
    from public.guild_war_gym_events e
    left join public.players p on p.id=e.actor_id
    left join public.guild_war_gyms g on g.id=e.gym_id
    where e.guild_id=v_guild
      and e.event_type='capture'
      and e.created_at>=now()-interval '30 days'

    union all

    select
      'pack_open'::text,
      p.username,
      case
        when batch.opening_count>1 then 'abriu '||batch.opening_count||'× '||batch.pack_name
        else 'abriu '||batch.pack_name
      end,
      batch.created_at,
      jsonb_build_object(
        'packId',batch.pack_id,
        'packName',batch.pack_name,
        'openingCount',batch.opening_count,
        'currency',batch.currency,
        'totalPaid',batch.total_paid
      ),
      2
    from pack_ranked batch
    join public.players p on p.id=batch.player_id
    where batch.story_rank<=5

    union all

    select
      'member_join'::text,
      p.username,
      'entrou para a guilda',
      gm.joined_at,
      jsonb_build_object('playerId',p.id,'role',gm.role),
      4
    from public.guild_members gm
    join public.players p on p.id=gm.player_id
    where gm.guild_id=v_guild
      and gm.joined_at>=now()-interval '30 days'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'type',x.type,
    'actor',x.actor,
    'text',x.text,
    'createdAt',x.created_at,
    'metadata',x.metadata
  ) order by x.created_at desc,x.priority desc),'[]'::jsonb)
  into v_result
  from (
    select * from stories
    order by created_at desc,priority desc
    limit v_limit
  ) x;

  return v_result;
end;
$function$;

revoke all on function public.get_my_guild_story_feed(integer) from public,anon;
grant execute on function public.get_my_guild_story_feed(integer) to authenticated,service_role;
