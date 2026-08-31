alter table public.economy_policy
  add column if not exists soft_cap_enabled boolean not null default false,
  add column if not exists soft_cap_daily_coins bigint not null default 100000,
  add column if not exists soft_cap_multiplier numeric not null default 0.35;

create or replace function public.get_economy_sink_hub()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_live boolean;
  v_admin boolean;
  v_guild text;
  v_project_id uuid;
  v_auction_id uuid;
  v_week date:=date_trunc('week',now())::date;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;

  v_live:=private.economy_v2_live_for_players();
  v_admin:=exists(select 1 from public.admin_members a where a.player_id=v_player);

  insert into public.player_prestige(player_id) values(v_player) on conflict(player_id) do nothing;
  insert into public.player_museum_progress(player_id) values(v_player) on conflict(player_id) do nothing;
  insert into public.player_luxury_rotation(player_id,week_start,reroll_count)
  values(v_player,v_week,0)
  on conflict(player_id) do update
  set week_start=case when public.player_luxury_rotation.week_start<>v_week then v_week else public.player_luxury_rotation.week_start end,
      reroll_count=case when public.player_luxury_rotation.week_start<>v_week then 0 else public.player_luxury_rotation.reroll_count end,
      updated_at=now();

  select guild_id into v_guild from public.guild_members where player_id=v_player limit 1;
  if v_guild is not null then v_project_id:=private.ensure_active_guild_project(v_guild); end if;
  if private.economy_v2_actor_allowed(v_player) then v_auction_id:=private.ensure_luxury_auction(); end if;

  return jsonb_build_object(
    'live',v_live,
    'adminPreview',v_admin and not v_live,
    'softCap',jsonb_build_object(
      'enabled',(select soft_cap_enabled from public.economy_policy where id=1),
      'dailyCoins',(select soft_cap_daily_coins from public.economy_policy where id=1),
      'multiplier',(select soft_cap_multiplier from public.economy_policy where id=1)
    ),
    'wallet',(select jsonb_build_object('coins',coins,'diamonds',diamonds,'level',level) from public.players where id=v_player),
    'equipped',(
      select jsonb_build_object(
        'frameId',equipped_frame_id,'backgroundId',equipped_background_id,
        'boosterFxId',equipped_booster_fx_id,'economyTitleId',equipped_economy_title_id
      ) from public.players where id=v_player
    ),
    'prestige',(
      select jsonb_build_object(
        'level',prestige_level,'stars',greatest(0,prestige_level-5),
        'totalSpentCoins',total_spent_coins,'nextCost',private.prestige_next_cost(prestige_level)
      ) from public.player_prestige where player_id=v_player
    ),
    'museum',jsonb_build_object(
      'progress',(select jsonb_build_object(
        'level',level,'slots',3+level*3,'totalSpentCoins',total_spent_coins,
        'nextCost',case level when 0 then 50000 when 1 then 150000 when 2 then 350000 when 3 then 750000 when 4 then 1500000 else null end
      ) from public.player_museum_progress where player_id=v_player),
      'cards',coalesce((
        select jsonb_agg(jsonb_build_object(
          'slot',m.slot,'id',c.id,'name',c.pokemon_name,'rarity',c.rarity,'image',c.image_small,'marketPriceUsd',c.market_price_usd
        ) order by m.slot)
        from public.player_museum_cards m join public.cards c on c.id=m.card_id
        where m.player_id=v_player
      ),'[]'::jsonb)
    ),
    'storeItems',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'category',i.category,'name',i.name,'description',i.description,'icon',i.icon,
        'priceCoins',i.price_coins,'rarity',i.rarity,'metadata',i.metadata,
        'owned',coalesce(pi.quantity,0)>0,'quantity',coalesce(pi.quantity,0)
      ) order by i.sort_order,i.price_coins)
      from public.economy_store_items i
      left join public.player_economy_items pi on pi.player_id=v_player and pi.item_id=i.id
      where i.active=true
        and coalesce((i.metadata->>'luxuryOnly')::boolean,false)=false
        and coalesce((i.metadata->>'notForDirectSale')::boolean,false)=false
        and (i.limited_starts_at is null or i.limited_starts_at<=now())
        and (i.limited_ends_at is null or i.limited_ends_at>now())
    ),'[]'::jsonb),
    'luxury',jsonb_build_object(
      'weekStart',v_week,
      'rerollCount',(select reroll_count from public.player_luxury_rotation where player_id=v_player),
      'nextRerollCost',(select 15000+least(reroll_count,10)*5000 from public.player_luxury_rotation where player_id=v_player),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',i.id,'category',i.category,'name',i.name,'description',i.description,'icon',i.icon,
          'priceCoins',i.price_coins,'rarity',i.rarity,'metadata',i.metadata,
          'owned',coalesce(pi.quantity,0)>0
        ) order by i.price_coins)
        from private.current_luxury_rotation_ids(v_player) rid
        join public.economy_store_items i on i.id=rid
        left join public.player_economy_items pi on pi.player_id=v_player and pi.item_id=i.id
      ),'[]'::jsonb)
    ),
    'ownedItems',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'category',i.category,'name',i.name,'icon',i.icon,'rarity',i.rarity,'metadata',i.metadata,'quantity',pi.quantity
      ) order by i.category,i.name)
      from public.player_economy_items pi join public.economy_store_items i on i.id=pi.item_id
      where pi.player_id=v_player and pi.quantity>0
    ),'[]'::jsonb),
    'cardCustomizations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'cardId',x.card_id,'cardName',c.pokemon_name,'image',c.image_small,
        'styleItemId',x.style_item_id,'styleName',i.name,'appliedAt',x.applied_at
      ) order by x.applied_at desc)
      from public.player_card_customizations x
      join public.cards c on c.id=x.card_id
      join public.economy_store_items i on i.id=x.style_item_id
      where x.player_id=v_player
    ),'[]'::jsonb),
    'decks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'name',d.name,'isDefault',d.is_default,'styleItemId',d.style_item_id,'styleName',i.name
      ) order by d.is_default desc,d.updated_at desc)
      from public.decks d left join public.economy_store_items i on i.id=d.style_item_id
      where d.player_id=v_player
    ),'[]'::jsonb),
    'market',jsonb_build_object(
      'shop',(select jsonb_build_object('name',name,'themeStyle',theme_style,'highlightUntil',highlight_until)
        from public.player_shops where player_id=v_player),
      'listings',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',ml.id,'cardId',ml.card_id,'cardName',c.pokemon_name,'priceCoins',ml.unit_price_coins,
          'boostedUntil',ml.boosted_until,'boostTier',ml.boost_tier
        ) order by ml.boosted_until desc nulls last,ml.created_at desc)
        from public.market_listings ml join public.cards c on c.id=ml.card_id
        where ml.seller_id=v_player and ml.status='active'
      ),'[]'::jsonb)
    ),
    'guild',case when v_guild is null then null else jsonb_build_object(
      'guildId',v_guild,
      'project',(select jsonb_build_object(
        'id',gp.id,'projectNo',gp.project_no,'name',gp.name,'description',gp.description,
        'targetCoins',gp.target_coins,'contributedCoins',gp.contributed_coins,
        'myContribution',coalesce((select sum(gc.amount_coins) from public.guild_project_contributions gc where gc.project_id=gp.id and gc.player_id=v_player),0),
        'topContributors',coalesce((
          select jsonb_agg(z.obj order by z.total desc) from (
            select sum(gc.amount_coins) total,
              jsonb_build_object('playerId',gc.player_id,'username',p.username,'coins',sum(gc.amount_coins)) obj
            from public.guild_project_contributions gc join public.players p on p.id=gc.player_id
            where gc.project_id=gp.id
            group by gc.player_id,p.username
            order by sum(gc.amount_coins) desc limit 5
          ) z
        ),'[]'::jsonb)
      ) from public.guild_projects gp where gp.id=v_project_id),
      'upgrades',coalesce((select jsonb_object_agg(upgrade_key,level) from public.guild_upgrades where guild_id=v_guild),'{}'::jsonb)
    ) end,
    'globalProject',(
      select jsonb_build_object(
        'id',g.id,'code',g.code,'name',g.name,'description',g.description,'targetCoins',g.target_coins,
        'contributedCoins',g.contributed_coins,'completedAt',g.completed_at,
        'myContribution',coalesce((select c.amount_coins from public.economy_global_project_contributions c where c.project_id=g.id and c.player_id=v_player),0),
        'contributors',(select count(*) from public.economy_global_project_contributions c where c.project_id=g.id and c.amount_coins>0),
        'rewardItemId',g.reward_item_id
      )
      from public.economy_global_projects g
      order by (g.completed_at is null) desc,g.created_at desc limit 1
    ),
    'auction',(
      select jsonb_build_object(
        'id',a.id,'itemId',a.item_id,'itemName',i.name,'itemIcon',i.icon,'minBidCoins',a.min_bid_coins,
        'bidIncrementCoins',a.bid_increment_coins,'highestBidCoins',a.highest_bid_coins,
        'highestBidderId',a.highest_bidder_id,'highestBidderName',p.username,
        'startsAt',a.starts_at,'endsAt',a.ends_at,'status',a.status,
        'minimumNextBid',case when a.highest_bid_coins is null then a.min_bid_coins else a.highest_bid_coins+a.bid_increment_coins end,
        'amIHighest',a.highest_bidder_id=v_player
      )
      from public.economy_auctions a
      join public.economy_store_items i on i.id=a.item_id
      left join public.players p on p.id=a.highest_bidder_id
      where a.id=v_auction_id
    ),
    'mySinks',jsonb_build_object(
      'last30Days',coalesce((select sum(amount_coins) from private.economy_sink_ledger where player_id=v_player and created_at>=now()-interval '30 days'),0),
      'lifetime',coalesce((select sum(amount_coins) from private.economy_sink_ledger where player_id=v_player),0),
      'byType',coalesce((
        select jsonb_object_agg(sink_type,total) from (
          select sink_type,sum(amount_coins) total
          from private.economy_sink_ledger where player_id=v_player
          group by sink_type
        ) q
      ),'{}'::jsonb)
    )
  );
end;
$$;

create or replace function public.server_get_economy_health(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_epoch timestamptz:=private.release_progress_epoch();
  v_since timestamptz:=greatest(now()-interval '7 days',v_epoch);
  v_active_players bigint:=0; v_total_coins numeric:=0; v_total_diamonds numeric:=0;
  v_mission_mint bigint:=0; v_bp_mint bigint:=0; v_guild_mint bigint:=0;
  v_duplicate_mint bigint:=0; v_code_mint bigint:=0; v_milestone_mint bigint:=0;
  v_pack_burn bigint:=0; v_exchange_burn bigint:=0; v_market_fee_burn bigint:=0; v_gym_burn bigint:=0;
  v_permanent_burn bigint:=0; v_known_mint bigint:=0; v_known_burn bigint:=0; v_status text:='healthy';
  v_per_player numeric:=0;
begin
  if not exists(select 1 from public.admin_members where player_id=p_actor_id) then raise exception 'FORBIDDEN'; end if;

  select count(*),coalesce(sum(coins),0),coalesce(sum(diamonds),0)
  into v_active_players,v_total_coins,v_total_diamonds
  from public.players where account_status='active';

  select coalesce(sum(d.reward_coins),0)::bigint into v_mission_mint
  from public.player_missions_v2 pm join public.mission_definitions_v2 d on d.id=pm.mission_id
  where pm.claimed=true and pm.updated_at>=v_since;

  select coalesce(sum(coalesce((c.reward->>'coins')::bigint,0)),0)::bigint into v_bp_mint
  from public.battle_pass_reward_claims c where c.claimed_at>=v_since;

  select coalesce(sum(c.reward_coins),0)::bigint into v_guild_mint
  from public.guild_weekly_reward_claims c where c.claimed_at>=v_since;

  select coalesce(sum(s.total_coins),0)::bigint into v_duplicate_mint
  from private.card_duplicate_sales s where s.created_at>=v_since;

  select coalesce(sum(coalesce((r.reward_snapshot->>'coins')::bigint,0)),0)::bigint into v_code_mint
  from public.code_redemptions r where r.redeemed_at>=v_since;

  select coalesce(sum(c.reward_coins),0)::bigint into v_milestone_mint
  from public.collection_milestone_claims c where c.claimed_at>=v_since;

  select coalesce(sum(o.price_paid),0)::bigint into v_pack_burn
  from public.pack_openings o where o.currency_at_open='coins' and o.opened_at>=v_since;

  select coalesce(sum(x.coins_spent),0)::bigint into v_exchange_burn
  from public.diamond_exchange_log x where x.created_at>=v_since;

  select coalesce(sum(f.fee_coins),0)::bigint into v_market_fee_burn
  from private.market_fee_log f where f.created_at>=v_since;

  select coalesce(sum(coalesce((e.metadata->>'costCoins')::bigint,0)),0)::bigint into v_gym_burn
  from public.guild_war_gym_events e where e.event_type='heal' and e.created_at>=v_since;

  select coalesce(sum(l.amount_coins),0)::bigint into v_permanent_burn
  from private.economy_sink_ledger l where l.created_at>=v_since;

  v_known_mint:=v_mission_mint+v_bp_mint+v_guild_mint+v_duplicate_mint+v_code_mint+v_milestone_mint;
  v_known_burn:=v_pack_burn+v_exchange_burn+v_market_fee_burn+v_gym_burn+v_permanent_burn;
  v_per_player:=case when v_active_players>0 then v_total_coins/v_active_players else 0 end;

  v_status:=case
    when v_known_mint=0 then case when v_per_player>3000000 then 'watch' else 'healthy' end
    when v_known_burn::numeric/v_known_mint>=.75 and v_per_player<=3000000 then 'healthy'
    when v_known_burn::numeric/v_known_mint>=.55 and v_per_player<=5000000 then 'watch'
    else 'critical'
  end;

  return jsonb_build_object(
    'version',(select version from public.economy_policy where id=1),
    'windowDays',7,'windowStart',v_since,'releaseEpoch',v_epoch,
    'status',v_status,'activePlayers',v_active_players,'coinsPerActivePlayer',round(v_per_player),
    'balances',jsonb_build_object('coins',v_total_coins,'diamonds',v_total_diamonds),
    'knownMint',jsonb_build_object(
      'missions',v_mission_mint,'battlePass',v_bp_mint,'guild',v_guild_mint,
      'duplicates',v_duplicate_mint,'codes',v_code_mint,'milestones',v_milestone_mint,'total',v_known_mint
    ),
    'knownBurn',jsonb_build_object(
      'packs',v_pack_burn,'diamondExchange',v_exchange_burn,'marketFees',v_market_fee_burn,
      'gymHealing',v_gym_burn,'permanentSinks',v_permanent_burn,'total',v_known_burn
    ),
    'burnToMintRatio',case when v_known_mint=0 then null else round(v_known_burn::numeric/v_known_mint,3) end,
    'sinkBreakdown',coalesce((
      select jsonb_object_agg(sink_type,total) from (
        select sink_type,sum(amount_coins) total from private.economy_sink_ledger
        where created_at>=v_since group by sink_type
      ) s
    ),'{}'::jsonb),
    'packPrices',(select jsonb_build_object(
      'coinMin',min(price) filter(where currency='coins'),
      'coinMedian',percentile_cont(.5) within group(order by price) filter(where currency='coins'),
      'coinMax',max(price) filter(where currency='coins'),
      'diamondMin',min(price) filter(where currency='diamonds'),
      'diamondMedian',percentile_cont(.5) within group(order by price) filter(where currency='diamonds'),
      'diamondMax',max(price) filter(where currency='diamonds')
    ) from public.packs where active),
    'softCap',(
      select jsonb_build_object('enabled',soft_cap_enabled,'dailyCoins',soft_cap_daily_coins,'multiplier',soft_cap_multiplier)
      from public.economy_policy where id=1
    ),
    'coverageNote','Known ledger excludes daily-login history, season payouts, tournament payouts and explicit admin grants.'
  );
end;
$$;

grant execute on function public.get_economy_sink_hub() to authenticated;
grant execute on function public.server_get_economy_health(uuid) to authenticated;
