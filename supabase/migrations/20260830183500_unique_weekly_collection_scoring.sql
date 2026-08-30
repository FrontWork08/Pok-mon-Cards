-- Weekly Collection Ranking: unique gains only.
-- Only the first-ever acquisition of each card through an official pack scores.
-- Duplicate copies add neither cards nor USD value to the weekly leaderboard.
-- packs_opened now counts only openings that contributed at least one new unique card.

CREATE OR REPLACE FUNCTION private.collection_weekly_scores(
  p_week_start timestamp with time zone,
  p_week_end timestamp with time zone
)
RETURNS TABLE(
  player_id uuid,
  username text,
  weekly_value_usd numeric,
  cards_gained bigint,
  packs_opened bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  with config as (
    select greatest(p_week_start,activated_at) as score_start
    from private.collection_weekly_config
    where id=1
  ),
  regular_events as (
    select distinct on (po.player_id, elem->>'id')
      po.player_id,
      elem->>'id' as card_id,
      po.id as opening_id,
      po.opened_at as obtained_at,
      case
        when coalesce(elem->>'marketPriceUsd','') ~ '^[0-9]+([.][0-9]+)?$'
          then (elem->>'marketPriceUsd')::numeric
        else 0
      end as value_usd
    from public.pack_openings po
    cross join config cfg
    cross join lateral jsonb_array_elements(coalesce(po.cards_received,'[]'::jsonb)) elem
    where po.opened_at>=cfg.score_start
      and po.opened_at<p_week_end
      and coalesce((elem->>'isNew')::boolean,false)
      and nullif(elem->>'id','') is not null
    order by po.player_id,elem->>'id',po.opened_at,po.id
  ),
  diamond_events as (
    select distinct on (d.player_id,d.card_id)
      d.player_id,
      d.card_id,
      d.id as opening_id,
      d.created_at as obtained_at,
      coalesce(d.market_value_usd_at_open,0)::numeric as value_usd
    from public.diamond_pack_openings d
    join public.player_cards pc
      on pc.player_id=d.player_id
     and pc.card_id=d.card_id
    cross join config cfg
    where d.created_at>=cfg.score_start
      and d.created_at<p_week_end
      and pc.first_obtained_at between d.created_at-interval '10 seconds'
                                   and d.created_at+interval '1 second'
    order by d.player_id,d.card_id,d.created_at,d.id
  ),
  unique_events as (
    select 'regular'::text as source,player_id,card_id,opening_id,obtained_at,value_usd
    from regular_events
    union all
    select 'diamond'::text as source,player_id,card_id,opening_id,obtained_at,value_usd
    from diamond_events
  ),
  combined as (
    select
      e.player_id,
      round(coalesce(sum(e.value_usd),0),2)::numeric as weekly_value_usd,
      count(*)::bigint as cards_gained,
      count(distinct (e.source||':'||e.opening_id::text))::bigint as packs_opened
    from unique_events e
    group by e.player_id
  )
  select
    p.id,
    p.username,
    c.weekly_value_usd,
    c.cards_gained,
    c.packs_opened
  from combined c
  join public.players p on p.id=c.player_id
  where p.account_status='active'
    and c.cards_gained>0;
$function$;

revoke all on function private.collection_weekly_scores(timestamptz,timestamptz)
from public,anon,authenticated;
grant execute on function private.collection_weekly_scores(timestamptz,timestamptz)
to service_role;
