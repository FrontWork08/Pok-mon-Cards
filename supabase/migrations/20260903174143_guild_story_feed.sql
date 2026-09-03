
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

  with stories as (
    select
      'battle_win'::text as type,
      p.username as actor,
      case when coalesce(b.is_ranked,false) then 'venceu uma batalha ranqueada' else 'venceu uma batalha' end as text,
      coalesce(b.completed_at,b.updated_at,b.created_at) as created_at,
      jsonb_build_object('battleId',b.id,'ranked',coalesce(b.is_ranked,false),'engineVersion',b.engine_version) as metadata,
      3 as priority
    from public.battles b
    join public.guild_members gm on gm.player_id=b.winner_id and gm.guild_id=v_guild
    join public.players p on p.id=b.winner_id
    where b.status='completed'
      and coalesce(b.completed_at,b.updated_at,b.created_at)>=now()-interval '14 days'

    union all

    select
      'pack_open'::text,
      p.username,
      'abriu '||coalesce(pk.name,'um booster'),
      po.opened_at,
      jsonb_build_object('packId',po.pack_id,'packName',pk.name,'pricePaid',po.price_paid,'currency',po.currency_at_open),
      2
    from public.pack_openings po
    join public.guild_members gm on gm.player_id=po.player_id and gm.guild_id=v_guild
    join public.players p on p.id=po.player_id
    left join public.packs pk on pk.id=po.pack_id
    where po.opened_at>=now()-interval '14 days'

    union all

    select
      'member_join'::text,
      p.username,
      'entrou para a guilda',
      gm.joined_at,
      jsonb_build_object('playerId',p.id,'role',gm.role),
      1
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

revoke all on function public.get_my_guild_story_feed(integer) from public;
grant execute on function public.get_my_guild_story_feed(integer) to authenticated;

comment on function public.get_my_guild_story_feed(integer) is
  'Recent real events from the authenticated player guild, used to create a social story feed.';
