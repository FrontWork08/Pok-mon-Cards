-- Rebalance mini-set boosters and make high-market-value cards rarer inside their rarity.
-- Existing openings are preserved; only future openings use this logic.

CREATE OR REPLACE FUNCTION private.card_market_pull_factor(p_price numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_price is null or p_price<=5 then 1.00
    when p_price<=10 then 0.90
    when p_price<=25 then 0.75
    when p_price<=50 then 0.55
    when p_price<=100 then 0.35
    when p_price<=200 then 0.20
    when p_price<=400 then 0.10
    when p_price<=800 then 0.04
    when p_price<=1500 then 0.02
    else 0.01
  end::numeric;
$function$;

CREATE OR REPLACE FUNCTION private.pack_expected_value_usd(p_set_id text, p_cards_per_pack integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with stats as (
    select
      count(*)::numeric as total_cards,
      count(*) filter(where public.rarity_tier(c.rarity)=1)::numeric as common_count,
      count(*) filter(where public.rarity_tier(c.rarity)=2)::numeric as uncommon_count,
      count(*) filter(where public.rarity_tier(c.rarity)>=3)::numeric as rare_count,
      avg(c.market_price_usd)
        filter(where public.rarity_tier(c.rarity)=1 and c.market_price_usd>0) as avg_common,
      avg(c.market_price_usd)
        filter(where public.rarity_tier(c.rarity)=2 and c.market_price_usd>0) as avg_uncommon,
      sum(
        c.market_price_usd
        * public.rarity_pull_weight(c.rarity)
        * private.card_market_pull_factor(c.market_price_usd)
      ) filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0)
      / nullif(
          sum(
            public.rarity_pull_weight(c.rarity)
            * private.card_market_pull_factor(c.market_price_usd)
          ) filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0),
          0
        ) as weighted_rare,
      sum(
        c.market_price_usd
        * public.rarity_pull_weight(c.rarity)
        * private.card_market_pull_factor(c.market_price_usd)
      ) filter(where c.market_price_usd>0)
      / nullif(
          sum(
            public.rarity_pull_weight(c.rarity)
            * private.card_market_pull_factor(c.market_price_usd)
          ) filter(where c.market_price_usd>0),
          0
        ) as weighted_all
    from public.cards c
    where c.set_id=p_set_id
  ),
  slots as (
    select *,
      case
        when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
        else least(common_count,greatest(coalesce(p_cards_per_pack,0)-3,0))::numeric
      end as common_slots,
      case
        when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
        else least(
          uncommon_count,
          least(2,greatest(coalesce(p_cards_per_pack,0)-1,0))
        )::numeric
      end as uncommon_slots
    from stats
  ),
  calc as (
    select *,
      case
        when coalesce(p_cards_per_pack,0)<=4 then 0::numeric
        when rare_count>0 and coalesce(p_cards_per_pack,0)>0 then 1::numeric
        else 0::numeric
      end as rare_slots
    from slots
  )
  select round(greatest(0,
    case
      when coalesce(p_cards_per_pack,0)<=4
        then coalesce(p_cards_per_pack,0)*coalesce(weighted_all,0)
      else
        coalesce(common_slots*avg_common,0)
        + coalesce(uncommon_slots*avg_uncommon,0)
        + coalesce(rare_slots*weighted_rare,0)
        + coalesce(
            greatest(
              coalesce(p_cards_per_pack,0)-common_slots-uncommon_slots-rare_slots,
              0
            )*weighted_all,
            0
          )
    end
  ),2)
  from calc;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_pack_economy()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows integer;
begin
  with pack_values as (
    select
      p.id,
      p.cards_per_pack,
      coalesce(max(c.market_price_usd),0)::numeric as max_card_usd,
      private.pack_expected_value_usd(p.set_id,p.cards_per_pack) as expected_value_usd,
      coalesce(avg(c.market_price_usd) filter(where c.market_price_usd>0),0)::numeric as avg_card_usd,
      count(c.*)::numeric as total_cards,
      count(*) filter(
        where public.rarity_tier(c.rarity)>=3
           or lower(coalesce(c.rarity,'')) like '%classic collection%'
      )::numeric as rare_like_cards
    from public.packs p
    left join public.cards c on c.set_id=p.set_id
    where p.active
    group by p.id,p.set_id,p.cards_per_pack
  ),
  standard as (
    select
      *,
      case when max_card_usd>=980 then 'diamonds' else 'coins' end as currency,
      case
        when max_card_usd>=5000 then 100
        when max_card_usd>=4000 then 90
        when max_card_usd>=3000 then 75
        when max_card_usd>=2000 then 60
        when max_card_usd>=1500 then 45
        when max_card_usd>=1250 then 35
        when max_card_usd>=1000 then 25
        when max_card_usd>=980 then 15
        when max_card_usd>=800 then 4000
        when max_card_usd>=700 then 3500
        when max_card_usd>=600 then 2500
        when max_card_usd>=500 then 2000
        when max_card_usd>=400 then 1500
        when max_card_usd>=200 then 1000
        else 500
      end::bigint as standard_price
    from pack_values
  ),
  priced as (
    select
      id,
      currency,
      case
        when currency='diamonds' then standard_price
        else least(
          100000::bigint,
          greatest(
            standard_price,
            (ceil((coalesce(expected_value_usd,0)*25)/500.0)*500)::bigint,
            case
              when total_cards>0 and rare_like_cards/nullif(total_cards,0)>=0.80
              then (ceil((avg_card_usd*cards_per_pack*0.75*25)/500.0)*500)::bigint
              else 0::bigint
            end
          )
        )
      end::bigint as price
    from standard
  )
  update public.packs p
  set currency=x.currency,
      price=x.price
  from priced x
  where p.id=x.id
    and (
      p.currency is distinct from x.currency
      or p.price is distinct from x.price
    );

  get diagnostics v_rows=row_count;
  return v_rows;
end;
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
    limit case when v_pack.cards_per_pack<=4 then 0 else greatest(v_pack.cards_per_pack-3,0) end
  ), uncommon_pick as (
    select id,pokemon_name,rarity,image_small,image_large,set_id,card_number
    from public.cards
    where set_id=v_pack.set_id and public.rarity_tier(rarity)=2
      and id not in(select id from common_pick)
    order by random()
    limit case
      when v_pack.cards_per_pack<=4 then 0
      else least(2,greatest(v_pack.cards_per_pack-1,0))
    end
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
        * private.card_market_pull_factor(market_price_usd)
        * case when public.rarity_tier(rarity)>=4
            then (1 + least(v_pity_misses,15)*0.12) * v_rare_multiplier
            else 1 end
      )
    )
    limit case
      when v_pack.cards_per_pack<=4 then 0
      when v_pack.cards_per_pack>0 then 1
      else 0
    end
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
        * private.card_market_pull_factor(market_price_usd)
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

revoke all on function private.card_market_pull_factor(numeric)
from public,anon,authenticated;
grant execute on function private.card_market_pull_factor(numeric) to service_role;

revoke all on function private.pack_expected_value_usd(text,integer)
from public,anon,authenticated;
grant execute on function private.pack_expected_value_usd(text,integer) to service_role;

revoke all on function private.refresh_pack_economy()
from public,anon,authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

revoke all on function public.server_open_pack(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.server_open_pack(uuid,uuid) to service_role;

with set_sizes as (
  select set_id,count(*)::integer as total_cards
  from public.cards
  group by set_id
),
recommended as (
  select
    p.id,
    p.cards_per_pack as old_cards,
    case
      when p.name like 'POP Series % Booster' then 2
      when p.name like 'McDonald''s Collection % Booster' then 4
      when p.name like '% Trainer Gallery Booster' then 4
      when p.name in (
        'Celebrations Booster',
        'Celebrations: Classic Collection Booster',
        'Detective Pikachu Booster'
      ) then 4
      when p.name='Dragon Vault Booster' then 5
      when p.name='Southern Islands Booster' then 3
      when p.name='Pokémon Rumble Booster' then 4
      when p.name='Pokémon Futsal Collection Booster' then 2
      when p.name like '%Trainer Kit% Booster' then 4
      when p.name='Best of Game Booster' then 2
      when s.total_cards<=10 then least(p.cards_per_pack,2)
      when s.total_cards<=17 then least(p.cards_per_pack,4)
      when s.total_cards<=25 then least(p.cards_per_pack,5)
      else p.cards_per_pack
    end::integer as new_cards
  from public.packs p
  join set_sizes s on s.set_id=p.set_id
  where p.active
)
update public.packs p
set cards_per_pack=r.new_cards
from recommended r
where p.id=r.id
  and r.new_cards<>r.old_cards;

select private.refresh_pack_economy();

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Mini-sets deixaram de entregar quase a coleção inteira por booster: POP Series agora entrega 2 cartas e outros sets pequenos usam tamanhos reduzidos',
    'Cartas de valor muito alto agora recebem chance adicionalmente reduzida dentro da própria raridade, preservando pulls raros sem quebrar a economia',
    'O preço e o valor esperado dos boosters foram recalculados depois do novo tamanho dos mini-packs'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
