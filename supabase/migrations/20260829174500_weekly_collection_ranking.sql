-- Weekly collection competition layered on top of the permanent global ranking.
-- The global leaderboard is unchanged. Weekly scoring uses card value at acquisition time.
-- The first partial week starts at feature activation; historical openings are not retroactively scored.

alter table public.pack_openings
  add column if not exists collection_value_usd_at_open numeric(14,2);

create index if not exists pack_openings_weekly_collection_idx
  on public.pack_openings(opened_at,player_id)
  include(collection_value_usd_at_open);

create index if not exists diamond_pack_openings_weekly_collection_idx
  on public.diamond_pack_openings(created_at,player_id)
  include(market_value_usd_at_open);

create table if not exists private.collection_weekly_config (
  id smallint primary key check(id=1),
  activated_at timestamptz not null,
  first_reward_coins bigint not null default 15000,
  second_reward_coins bigint not null default 10000,
  third_reward_coins bigint not null default 5000,
  updated_at timestamptz not null default now()
);
alter table private.collection_weekly_config enable row level security;
revoke all on private.collection_weekly_config from public,anon,authenticated;
grant select,insert,update on private.collection_weekly_config to service_role;

insert into private.collection_weekly_config(
  id,activated_at,first_reward_coins,second_reward_coins,third_reward_coins
)
values(1,now(),15000,10000,5000)
on conflict(id) do nothing;

create table if not exists private.collection_weekly_rewards (
  week_start timestamptz not null,
  week_end timestamptz not null,
  rank smallint not null check(rank between 1 and 3),
  player_id uuid not null references public.players(id) on delete restrict,
  username text not null,
  weekly_value_usd numeric(14,2) not null check(weekly_value_usd>=0),
  cards_gained bigint not null default 0,
  packs_opened bigint not null default 0,
  reward_coins bigint not null check(reward_coins>=0),
  awarded_at timestamptz not null default now(),
  primary key(week_start,rank),
  unique(week_start,player_id)
);
create index if not exists collection_weekly_rewards_player_idx
  on private.collection_weekly_rewards(player_id,week_start desc);
alter table private.collection_weekly_rewards enable row level security;
revoke all on private.collection_weekly_rewards from public,anon,authenticated;
grant select,insert on private.collection_weekly_rewards to service_role;

CREATE OR REPLACE FUNCTION private.collection_week_start(p_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select (
    date_trunc('week',p_at at time zone 'America/Sao_Paulo')
    at time zone 'America/Sao_Paulo'
  );
$function$;

CREATE OR REPLACE FUNCTION private.collection_weekly_scores(p_week_start timestamp with time zone, p_week_end timestamp with time zone)
 RETURNS TABLE(player_id uuid, username text, weekly_value_usd numeric, cards_gained bigint, packs_opened bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with config as (
    select greatest(p_week_start,activated_at) as score_start
    from private.collection_weekly_config
    where id=1
  ),
  regular as (
    select
      po.player_id,
      coalesce(sum(po.collection_value_usd_at_open),0)::numeric as value_usd,
      coalesce(sum(jsonb_array_length(coalesce(po.cards_received,'[]'::jsonb))),0)::bigint as cards_gained,
      count(*)::bigint as packs_opened
    from public.pack_openings po
    cross join config cfg
    where po.opened_at>=cfg.score_start and po.opened_at<p_week_end
      and po.collection_value_usd_at_open is not null
    group by po.player_id
  ),
  legendary as (
    select
      d.player_id,
      coalesce(sum(d.market_value_usd_at_open),0)::numeric as value_usd,
      count(*)::bigint as cards_gained,
      count(*)::bigint as packs_opened
    from public.diamond_pack_openings d
    cross join config cfg
    where d.created_at>=cfg.score_start and d.created_at<p_week_end
      and d.market_value_usd_at_open is not null
    group by d.player_id
  ),
  combined as (
    select player_id,sum(value_usd)::numeric as weekly_value_usd,
           sum(cards_gained)::bigint as cards_gained,
           sum(packs_opened)::bigint as packs_opened
    from (
      select * from regular
      union all
      select * from legendary
    ) s
    group by player_id
  )
  select
    p.id,
    p.username,
    round(c.weekly_value_usd,2),
    c.cards_gained,
    c.packs_opened
  from combined c
  join public.players p on p.id=c.player_id
  where p.account_status='active'
    and c.weekly_value_usd>0;
$function$;

CREATE OR REPLACE FUNCTION private.finalize_collection_week(p_week_start timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_awards jsonb := '[]'::jsonb;
begin
  v_start := coalesce(
    p_week_start,
    private.collection_week_start(now()-interval '7 days')
  );
  v_end := v_start+interval '7 days';

  if v_end>now() then
    raise exception 'WEEK_NOT_FINISHED';
  end if;

  with rewards as (
    select first_reward_coins,second_reward_coins,third_reward_coins
    from private.collection_weekly_config where id=1
  ),
  ranked as (
    select
      row_number() over(
        order by s.weekly_value_usd desc,s.cards_gained desc,s.packs_opened desc,s.username asc
      )::smallint as rank,
      s.*
    from private.collection_weekly_scores(v_start,v_end) s
  ),
  winners as (
    select
      v_start as week_start,
      v_end as week_end,
      r.rank,
      r.player_id,
      r.username,
      r.weekly_value_usd,
      r.cards_gained,
      r.packs_opened,
      case r.rank
        when 1 then rw.first_reward_coins
        when 2 then rw.second_reward_coins
        when 3 then rw.third_reward_coins
      end::bigint as reward_coins
    from ranked r
    cross join rewards rw
    where r.rank<=3
  ),
  inserted as (
    insert into private.collection_weekly_rewards(
      week_start,week_end,rank,player_id,username,weekly_value_usd,
      cards_gained,packs_opened,reward_coins
    )
    select
      week_start,week_end,rank,player_id,username,weekly_value_usd,
      cards_gained,packs_opened,reward_coins
    from winners
    on conflict do nothing
    returning *
  ),
  credited as (
    update public.players p
    set coins=p.coins+i.reward_coins
    from inserted i
    where p.id=i.player_id
    returning
      i.player_id,i.username,i.rank,i.weekly_value_usd,
      i.cards_gained,i.packs_opened,i.reward_coins,p.coins as new_balance
  ),
  notified as (
    insert into public.notifications(player_id,type,title,body,metadata)
    select
      c.player_id,
      'collection_weekly_reward',
      case c.rank
        when 1 then '🥇 Campeão da Coleção Semanal'
        when 2 then '🥈 2º lugar na Coleção Semanal'
        else '🥉 3º lugar na Coleção Semanal'
      end,
      'Você terminou a semana em #'||c.rank||
      ' com US$ '||to_char(c.weekly_value_usd,'FM999999990.00')||
      ' em valor conquistado e recebeu '||to_char(c.reward_coins,'FM999G999G990')||' Coins.',
      jsonb_build_object(
        'weekStart',v_start,
        'weekEnd',v_end,
        'rank',c.rank,
        'weeklyValueUsd',c.weekly_value_usd,
        'cardsGained',c.cards_gained,
        'packsOpened',c.packs_opened,
        'rewardCoins',c.reward_coins,
        'newCoinBalance',c.new_balance
      )
    from credited c
    returning player_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId',c.player_id,
    'username',c.username,
    'rank',c.rank,
    'weeklyValueUsd',c.weekly_value_usd,
    'rewardCoins',c.reward_coins,
    'newCoinBalance',c.new_balance
  ) order by c.rank),'[]'::jsonb)
  into v_awards
  from credited c;

  return jsonb_build_object(
    'weekStart',v_start,
    'weekEnd',v_end,
    'awards',v_awards
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_collection_weekly_leaderboard(p_limit integer DEFAULT 100)
 RETURNS TABLE(weekly_rank bigint, player_id uuid, username text, weekly_value_usd numeric, cards_gained bigint, packs_opened bigint, reward_coins bigint, week_start timestamp with time zone, score_start timestamp with time zone, week_end timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select
      private.collection_week_start(now()) as week_start,
      greatest(
        private.collection_week_start(now()),
        (select activated_at from private.collection_weekly_config where id=1)
      ) as score_start,
      private.collection_week_start(now())+interval '7 days' as week_end
  ),
  ranked as (
    select
      row_number() over(
        order by s.weekly_value_usd desc,s.cards_gained desc,s.packs_opened desc,s.username asc
      ) as weekly_rank,
      s.*
    from bounds b
    cross join lateral private.collection_weekly_scores(b.week_start,b.week_end) s
  ),
  rewards as (
    select first_reward_coins,second_reward_coins,third_reward_coins
    from private.collection_weekly_config where id=1
  )
  select
    r.weekly_rank,
    r.player_id,
    r.username,
    r.weekly_value_usd::numeric(14,2),
    r.cards_gained,
    r.packs_opened,
    case r.weekly_rank
      when 1 then rw.first_reward_coins
      when 2 then rw.second_reward_coins
      when 3 then rw.third_reward_coins
      else 0
    end::bigint,
    b.week_start,
    b.score_start,
    b.week_end
  from ranked r
  cross join bounds b
  cross join rewards rw
  where auth.uid() is not null
  order by r.weekly_rank,r.username
  limit greatest(1,least(coalesce(p_limit,100),200));
$function$;

CREATE OR REPLACE FUNCTION public.server_open_pack(p_player_id uuid, p_pack_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pack public.packs%rowtype;
  v_coins bigint;
  v_diamonds integer;
  v_currency text;
  v_status text;
  v_until timestamptz;
  v_cards jsonb;
  v_opening_id uuid;
  v_count integer;
  v_new_coins bigint;
  v_new_diamonds integer;
  v_new_xp bigint;
  v_new_level integer;
  v_effective_price bigint;
  v_free_until timestamptz;
  v_pity_misses integer := 0;
  v_highest_tier integer := 1;
  v_new_cards integer := 0;
  v_wishlist_hits integer := 0;
  v_rare_multiplier numeric := 1;
  v_xp_gain integer := 20;
  v_active_events jsonb := '[]'::jsonb;
  v_expected_value_usd numeric := 0;
  v_discount_kind text := 'none';
  v_collection_value_usd numeric := 0;
begin
  select * into v_pack from public.packs
  where id = p_pack_id and active = true for share;
  if not found then raise exception 'PACK_NOT_FOUND'; end if;

  select max(ends_at)
  into v_free_until
  from public.admin_game_events
  where event_type = 'free_boosters'
    and active = true and starts_at <= now() and ends_at > now();

  v_currency := coalesce(v_pack.currency,'coins');
  v_effective_price := case
    when v_free_until is null then v_pack.price
    when v_currency = 'diamonds' then (v_pack.price + 1) / 2
    else 0
  end;

  v_expected_value_usd := private.pack_expected_value_usd(v_pack.set_id,v_pack.cards_per_pack);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'type',e.event_type,
    'title',e.title,
    'startsAt',e.starts_at,
    'endsAt',e.ends_at,
    'payload',e.payload
  ) order by e.starts_at,e.id),'[]'::jsonb)
  into v_active_events
  from public.admin_game_events e
  where e.active=true and e.starts_at<=now() and e.ends_at>now();

  v_discount_kind := case
    when v_free_until is null then 'none'
    when v_currency='diamonds' then 'admin_abuse_diamond_half'
    else 'admin_abuse_coin_free'
  end;

  select greatest(1,coalesce(max(
    case
      when event_type='rare_boost'
        then greatest(1,least(3,coalesce(nullif(payload->>'multiplier','')::numeric,1.5)))
      when event_type='featured_set' and payload->>'setId'=v_pack.set_id
        then greatest(1,least(3,coalesce(nullif(payload->>'multiplier','')::numeric,1.5)))
      else 1
    end
  ),1))
  into v_rare_multiplier
  from public.admin_game_events
  where active and starts_at<=now() and ends_at>now()
    and event_type in ('rare_boost','featured_set');

  select case when exists(
    select 1 from public.admin_game_events
    where event_type='double_xp' and active and starts_at<=now() and ends_at>now()
  ) then 40 else 20 end
  into v_xp_gain;

  select coins, diamonds, account_status, suspended_until
  into v_coins, v_diamonds, v_status, v_until
  from public.players where id = p_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  if v_status = 'banned' then raise exception 'ACCOUNT_BANNED'; end if;
  if v_status = 'suspended' and v_until is not null and v_until > now()
    then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if v_status = 'suspended' and (v_until is null or v_until <= now()) then
    update public.players set account_status='active',suspended_until=null,moderation_reason=null
    where id=p_player_id;
  end if;
  if v_currency='diamonds' and v_diamonds < v_effective_price then
    raise exception 'NOT_ENOUGH_DIAMONDS';
  elsif v_currency='coins' and v_coins < v_effective_price then
    raise exception 'NOT_ENOUGH_COINS';
  end if;

  select count(*) into v_count from public.cards where set_id = v_pack.set_id;
  if v_count < 1 then raise exception 'EMPTY_PACK_POOL'; end if;

  insert into private.player_pack_pity(player_id,set_id,misses)
  values(p_player_id,v_pack.set_id,0)
  on conflict(player_id,set_id) do nothing;
  select misses into v_pity_misses
  from private.player_pack_pity
  where player_id=p_player_id and set_id=v_pack.set_id
  for update;

  with common_pick as (
    select id,pokemon_name,rarity,image_small,image_large,set_id,card_number
    from public.cards
    where set_id=v_pack.set_id and public.rarity_tier(rarity)=1
    order by random()
    limit greatest(v_pack.cards_per_pack-3,0)
  ), uncommon_pick as (
    select id,pokemon_name,rarity,image_small,image_large,set_id,card_number
    from public.cards
    where set_id=v_pack.set_id and public.rarity_tier(rarity)=2
      and id not in(select id from common_pick)
    order by random()
    limit least(2,greatest(v_pack.cards_per_pack-1,0))
  ), rare_pick as (
    select id,pokemon_name,rarity,image_small,image_large,set_id,card_number
    from public.cards
    where set_id=v_pack.set_id
      and public.rarity_tier(rarity)>=3
      and id not in(select id from common_pick)
      and id not in(select id from uncommon_pick)
      and (
        v_pity_misses<15
        or not exists(select 1 from public.cards c2 where c2.set_id=v_pack.set_id and public.rarity_tier(c2.rarity)>=4)
        or public.rarity_tier(rarity)>=4
      )
    order by (
      -ln(greatest(random(),0.0000001))
      /
      greatest(
        0.000001,
        public.rarity_pull_weight(rarity)
        * case when public.rarity_tier(rarity)>=4
            then (1 + least(v_pity_misses,15)*0.12) * v_rare_multiplier
            else 1 end
      )
    )
    limit case when v_pack.cards_per_pack>0 then 1 else 0 end
  ), preset as (
    select * from common_pick union all
    select * from uncommon_pick union all
    select * from rare_pick
  ), filler as (
    select id,pokemon_name,rarity,image_small,image_large,set_id,card_number
    from public.cards
    where set_id=v_pack.set_id and id not in(select id from preset)
    order by (
      -ln(greatest(random(),0.0000001))
      /
      greatest(
        0.000001,
        public.rarity_pull_weight(rarity)
        * case when public.rarity_tier(rarity)>=4
            then (1 + least(v_pity_misses,15)*0.06) * v_rare_multiplier
            else 1 end
      )
    )
    limit greatest(v_pack.cards_per_pack-(select count(*) from preset),0)
  ), picked as (
    select * from preset union all select * from filler
  ), annotated as (
    select p.*,
      coalesce(pc.quantity,0)>0 as already_owned,
      exists(select 1 from public.card_wishlist w where w.player_id=p_player_id and w.card_id=p.id) as wishlist_hit
    from picked p
    left join public.player_cards pc on pc.player_id=p_player_id and pc.card_id=p.id
  ), upserted as (
    insert into public.player_cards(player_id,card_id,quantity)
    select p_player_id,id,1 from annotated
    on conflict(player_id,card_id)
    do update set quantity=public.player_cards.quantity+1
    returning card_id
  )
  select jsonb_agg(jsonb_build_object(
      'id',a.id,'name',a.pokemon_name,'rarity',a.rarity,
      'image',coalesce(nullif(a.image_large,''),nullif(a.image_small,''),concat('https://images.pokemontcg.io/',a.set_id,'/',a.card_number,'.png')),
      'imageLarge',nullif(a.image_large,''),'imageSmall',nullif(a.image_small,''),
      'imageFallback',concat('https://images.pokemontcg.io/',a.set_id,'/',a.card_number,'.png'),
      'imageFallbackLarge',concat('https://images.pokemontcg.io/',a.set_id,'/',a.card_number,'_hires.png'),
      'isNew',not a.already_owned,'wishlistHit',a.wishlist_hit
    )),
    coalesce(max(public.rarity_tier(a.rarity)),1),
    count(*) filter(where not a.already_owned),
    count(*) filter(where a.wishlist_hit)
  into v_cards,v_highest_tier,v_new_cards,v_wishlist_hits
  from annotated a;

  select
    coalesce(
      jsonb_agg(
        elem || jsonb_build_object('marketPriceUsd',c.market_price_usd)
        order by ord
      ),
      '[]'::jsonb
    ),
    coalesce(sum(coalesce(c.market_price_usd,0)),0)
  into v_cards,v_collection_value_usd
  from jsonb_array_elements(coalesce(v_cards,'[]'::jsonb)) with ordinality as e(elem,ord)
  left join public.cards c on c.id=elem->>'id';

  delete from public.card_wishlist w
  where w.player_id=p_player_id and w.card_id in(
    select elem->>'id' from jsonb_array_elements(coalesce(v_cards,'[]'::jsonb)) elem
    where coalesce((elem->>'wishlistHit')::boolean,false)
  );

  update private.player_pack_pity
  set misses=case when v_highest_tier>=4 then 0 else least(misses+1,30) end,updated_at=now()
  where player_id=p_player_id and set_id=v_pack.set_id;

  update public.players
  set coins=coins-case when v_currency='coins' then v_effective_price else 0 end,
      diamonds=diamonds-case when v_currency='diamonds' then v_effective_price::integer else 0 end,
      xp=xp+v_xp_gain,
      level=greatest(level,1+floor((xp+v_xp_gain)/250.0)::integer)
  where id=p_player_id
  returning coins,diamonds,xp,level into v_new_coins,v_new_diamonds,v_new_xp,v_new_level;

  insert into public.pack_openings(
    player_id,pack_id,cards_received,
    price_paid,base_price_at_open,currency_at_open,expected_value_usd_at_open,
    collection_value_usd_at_open,pricing_context
  )
  values(
    p_player_id,p_pack_id,coalesce(v_cards,'[]'::jsonb),
    v_effective_price,v_pack.price,v_currency,v_expected_value_usd,
    v_collection_value_usd,
    jsonb_build_object(
      'legacy',false,
      'priceSnapshotAvailable',true,
      'discountKind',v_discount_kind,
      'discountAmount',greatest(v_pack.price-v_effective_price,0),
      'discountPercent',case
        when v_pack.price>0
        then round((1-(v_effective_price::numeric/v_pack.price::numeric))*100,2)
        else 0
      end,
      'freeBoostersUntil',v_free_until,
      'events',v_active_events,
      'expectedValueUsd',v_expected_value_usd,
      'recordedAt',now()
    )
  )
  returning id into v_opening_id;

  insert into public.player_daily_missions(player_id,mission_date,mission_id,progress)
  values(p_player_id,current_date,'open_2_packs',1)
  on conflict(player_id,mission_date,mission_id)
  do update set progress=public.player_daily_missions.progress+1,updated_at=now();

  perform public.server_refresh_player_achievements(p_player_id);

  return jsonb_build_object(
    'openingId',v_opening_id,'cards',coalesce(v_cards,'[]'::jsonb),
    'coins',v_new_coins,'diamonds',v_new_diamonds,'xp',v_new_xp,'level',v_new_level,'xpGained',v_xp_gain,
    'pricePaid',v_effective_price,'basePrice',v_pack.price,'currency',v_currency,
    'expectedValueUsd',v_expected_value_usd,'collectionValueUsd',v_collection_value_usd,'discountKind',v_discount_kind,
    'freeBoostersUntil',v_free_until,'events',v_active_events,
    'newCards',v_new_cards,'wishlistHits',v_wishlist_hits,
    'rareMultiplier',v_rare_multiplier
  );
end;
$function$;

revoke all on function private.collection_week_start(timestamptz)
from public,anon,authenticated;
grant execute on function private.collection_week_start(timestamptz) to service_role;

revoke all on function private.collection_weekly_scores(timestamptz,timestamptz)
from public,anon,authenticated;
grant execute on function private.collection_weekly_scores(timestamptz,timestamptz) to service_role;

revoke all on function public.get_collection_weekly_leaderboard(integer)
from public,anon,authenticated;
grant execute on function public.get_collection_weekly_leaderboard(integer) to authenticated;

revoke all on function private.finalize_collection_week(timestamptz)
from public,anon,authenticated;
grant execute on function private.finalize_collection_week(timestamptz) to service_role;

revoke all on function public.server_open_pack(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.server_open_pack(uuid,uuid) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname='collection-weekly-rewards';

select cron.schedule(
  'collection-weekly-rewards',
  '5 3 * * 1',
  $$select private.finalize_collection_week();$$
);

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Ranking de Coleções agora possui Semanal e Global; a página abre sempre no Semanal e o Global continua permanente',
    'A coleção nunca reseta: somente o placar semanal zera toda segunda-feira às 00:00',
    'Ranking semanal conta o valor das cartas no momento da abertura oficial, sem pontos extras por oscilação posterior de preço ou transferências',
    'Top 3 semanal recebe automaticamente 15.000, 10.000 e 5.000 Coins; o ranking Global não possui recompensa',
    'A primeira semana começou na ativação do sistema para não premiar retroativamente aberturas feitas com economias antigas'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
