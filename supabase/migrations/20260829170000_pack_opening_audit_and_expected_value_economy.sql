-- Record immutable pricing snapshots for pack openings and price Coin packs by expected pull value.
-- Historical openings are intentionally marked legacy instead of guessing what they paid.
-- Existing rare-dense pack floors are preserved; expected-value pricing is an additional floor.

alter table public.pack_openings
  add column if not exists price_paid bigint,
  add column if not exists base_price_at_open bigint,
  add column if not exists currency_at_open text,
  add column if not exists expected_value_usd_at_open numeric(12,2),
  add column if not exists pricing_context jsonb not null default '{}'::jsonb;

alter table public.pack_openings drop constraint if exists pack_openings_currency_at_open_check;
alter table public.pack_openings
  add constraint pack_openings_currency_at_open_check
  check (currency_at_open is null or currency_at_open in ('coins','diamonds'));

update public.pack_openings
set pricing_context=jsonb_build_object(
  'legacy',true,
  'priceSnapshotAvailable',false,
  'note','Abertura anterior ao registro de preço/moeda por snapshot'
)
where price_paid is null and pricing_context='{}'::jsonb;

create index if not exists pack_openings_player_opened_price_idx
  on public.pack_openings(player_id,opened_at desc)
  include(price_paid,base_price_at_open,currency_at_open);

alter table public.diamond_pack_openings
  add column if not exists base_cost_diamonds integer,
  add column if not exists market_value_usd_at_open numeric(12,2),
  add column if not exists pricing_context jsonb not null default '{}'::jsonb;

update public.diamond_pack_openings
set pricing_context=jsonb_build_object(
  'legacy',true,
  'priceSnapshotAvailable',true,
  'note','A abertura já registrava diamonds_spent, mas não possuía snapshot completo de evento/preço-base'
)
where pricing_context='{}'::jsonb;

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
      sum(c.market_price_usd*public.rarity_pull_weight(c.rarity))
        filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0)
        / nullif(
            sum(public.rarity_pull_weight(c.rarity))
              filter(where public.rarity_tier(c.rarity)>=3 and c.market_price_usd>0),
            0
          ) as weighted_rare,
      sum(c.market_price_usd*public.rarity_pull_weight(c.rarity))
        filter(where c.market_price_usd>0)
        / nullif(
            sum(public.rarity_pull_weight(c.rarity))
              filter(where c.market_price_usd>0),
            0
          ) as weighted_all
    from public.cards c
    where c.set_id=p_set_id
  ),
  slots as (
    select *,
      least(common_count,greatest(coalesce(p_cards_per_pack,0)-3,0))::numeric as common_slots,
      least(
        uncommon_count,
        least(2,greatest(coalesce(p_cards_per_pack,0)-1,0))
      )::numeric as uncommon_slots
    from stats
  ),
  calc as (
    select *,
      case when rare_count>0 and coalesce(p_cards_per_pack,0)>0 then 1 else 0 end::numeric as rare_slots
    from slots
  )
  select round(greatest(0,
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

CREATE OR REPLACE FUNCTION public.server_admin_account_audit(p_actor_id uuid, p_target_id uuid, p_pack_offset integer DEFAULT 0, p_pack_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offset integer := greatest(0,coalesce(p_pack_offset,0));
  v_limit integer := greatest(10,least(50,coalesce(p_pack_limit,25)));
  v_account jsonb;
  v_collection jsonb;
  v_pack_stats jsonb;
  v_pack_history jsonb;
  v_economy jsonb;
  v_activity jsonb;
  v_moderation jsonb;
  v_progression jsonb;
  v_social jsonb;
  v_flags jsonb := '[]'::jsonb;
  v_total_packs bigint := 0;
  v_max_per_minute integer := 0;
  v_packs_24h bigint := 0;
  v_legacy_special bigint := 0;
  v_admin_event_openings bigint := 0;
  v_legacy_price_unknown bigint := 0;
  v_unexplained_discount bigint := 0;
begin
  if not private.admin_has_permission(p_actor_id,'audit_users') then
    raise exception 'FORBIDDEN_AUDIT_USERS';
  end if;

  if not exists(select 1 from public.players where id=p_target_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'id',p.id,
    'username',p.username,
    'coins',p.coins,
    'diamonds',p.diamonds,
    'level',p.level,
    'xp',p.xp,
    'createdAt',p.created_at,
    'lastDailyClaimAt',p.last_daily_claim_at,
    'battleRating',p.battle_rating,
    'battleWins',p.battle_wins,
    'battleLosses',p.battle_losses,
    'battleStreak',p.battle_streak,
    'bestBattleStreak',p.best_battle_streak,
    'profileIcon',p.profile_icon,
    'equippedTitleId',p.equipped_title_id,
    'equippedFrameId',p.equipped_frame_id,
    'equippedBackgroundId',p.equipped_background_id,
    'accountStatus',p.account_status,
    'suspendedUntil',p.suspended_until,
    'moderationReason',p.moderation_reason,
    'warningCount',p.warning_count,
    'auth',jsonb_build_object(
      'email',u.email,
      'phone',u.phone,
      'createdAt',u.created_at,
      'updatedAt',u.updated_at,
      'lastSignInAt',u.last_sign_in_at,
      'confirmedAt',u.confirmed_at,
      'bannedUntil',u.banned_until,
      'deletedAt',u.deleted_at,
      'providers',coalesce(u.raw_app_meta_data->'providers','[]'::jsonb)
    ),
    'admin',case when am.player_id is null then null else jsonb_build_object(
      'role',am.role,
      'since',am.created_at,
      'permissions',case when am.role='owner'
        then to_jsonb(array[
          'audit_users','moderate_users','economy_grant','economy_remove',
          'battlepass_grant','codes_manage','announcements_manage','events_manage',
          'maintenance_manage','guilds_manage'
        ]::text[])
        else to_jsonb(coalesce(amp.permissions,'{}'::text[])) end
    ) end
  )
  into v_account
  from public.players p
  left join auth.users u on u.id=p.id
  left join public.admin_members am on am.player_id=p.id
  left join private.admin_member_permissions amp on amp.player_id=p.id
  where p.id=p_target_id;

  select jsonb_build_object(
    'uniqueCards',count(*) filter(where pc.quantity>0),
    'totalCopies',coalesce(sum(pc.quantity) filter(where pc.quantity>0),0),
    'duplicateCopies',coalesce(sum(greatest(pc.quantity-1,0)) filter(where pc.quantity>0),0),
    'marketValueUsd',coalesce(round(sum(pc.quantity*coalesce(c.market_price_usd,0)) filter(where pc.quantity>0),2),0),
    'pricedUniqueCards',count(*) filter(where pc.quantity>0 and c.market_price_usd>0),
    'mostValuableCards',(
      select coalesce(jsonb_agg(to_jsonb(top_card)),'[]'::jsonb)
      from (
        select c.id,c.pokemon_name as name,c.set_name,c.rarity,c.market_price_usd as "marketPriceUsd",
               pc2.quantity,c.image_small as image
        from public.player_cards pc2
        join public.cards c on c.id=pc2.card_id
        where pc2.player_id=p_target_id and pc2.quantity>0
        order by c.market_price_usd desc nulls last
        limit 12
      ) top_card
    )
  )
  into v_collection
  from public.player_cards pc
  join public.cards c on c.id=pc.card_id
  where pc.player_id=p_target_id;

  select count(*),
         count(*) filter(where opened_at>=now()-interval '24 hours')
  into v_total_packs,v_packs_24h
  from public.pack_openings
  where player_id=p_target_id;

  select coalesce(max(openings),0)::integer
  into v_max_per_minute
  from (
    select count(*)::integer openings
    from public.pack_openings
    where player_id=p_target_id
    group by date_trunc('minute',opened_at)
  ) per_minute;

  with rare_sets as (
    select c.set_id
    from public.cards c
    group by c.set_id
    having count(*)>0
       and count(*) filter(where public.rarity_tier(c.rarity)>=3)::numeric/count(*)>=0.80
  )
  select count(*)
  into v_legacy_special
  from public.pack_openings po
  join public.packs p on p.id=po.pack_id
  where po.player_id=p_target_id
    and po.opened_at < timestamptz '2026-08-29 15:20:00+00'
    and p.set_id in (select set_id from rare_sets);

  select count(*)
  into v_admin_event_openings
  from public.pack_openings po
  where po.player_id=p_target_id
    and exists (
      select 1
      from public.admin_game_events e
      where e.event_type='free_boosters'
        and po.opened_at>=e.starts_at
        and po.opened_at<=e.ends_at
    );

  select
    count(*) filter(where po.price_paid is null),
    count(*) filter(
      where po.price_paid is not null
        and po.base_price_at_open is not null
        and po.price_paid < po.base_price_at_open
        and coalesce(po.pricing_context->>'discountKind','none')='none'
    )
  into v_legacy_price_unknown,v_unexplained_discount
  from public.pack_openings po
  where po.player_id=p_target_id;

  v_pack_stats := jsonb_build_object(
    'total',v_total_packs,
    'last24h',v_packs_24h,
    'maxPerMinute',v_max_per_minute,
    'legacySpecialPricingOpenings',v_legacy_special,
    'adminAbuseEventOpenings',v_admin_event_openings,
    'legacyPriceUnknownOpenings',v_legacy_price_unknown,
    'unexplainedDiscountOpenings',v_unexplained_discount,
    'offset',v_offset,
    'limit',v_limit,
    'hasMore',v_offset+v_limit<v_total_packs
  );

  select coalesce(jsonb_agg(to_jsonb(opening_row) order by opening_row."openedAt" desc),'[]'::jsonb)
  into v_pack_history
  from (
    select
      po.id,
      po.opened_at as "openedAt",
      p.id as "packId",
      p.name as "packName",
      p.set_id as "setId",
      p.currency as "currentCurrency",
      p.price as "currentPackPrice",
      po.currency_at_open as "currencyAtOpen",
      po.base_price_at_open as "basePriceAtOpen",
      po.price_paid as "pricePaid",
      po.expected_value_usd_at_open as "expectedValueUsdAtOpen",
      po.pricing_context as "pricingContext",
      case when po.price_paid is null then 'legacy_unknown' else 'recorded' end as "priceSnapshotStatus",
      jsonb_array_length(coalesce(po.cards_received,'[]'::jsonb)) as "cardCount",
      coalesce((
        select round(sum(coalesce(c.market_price_usd,0)),2)
        from jsonb_array_elements(coalesce(po.cards_received,'[]'::jsonb)) item
        left join public.cards c on c.id=item->>'id'
      ),0) as "currentValueUsd",
      po.cards_received as cards
    from public.pack_openings po
    left join public.packs p on p.id=po.pack_id
    where po.player_id=p_target_id
    order by po.opened_at desc
    offset v_offset
    limit v_limit
  ) opening_row;

  select jsonb_build_object(
    'adminCurrencyAdjustments',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc),'[]'::jsonb)
      from (
        select 'coins'::text currency,id,amount,"balance_before" as "balanceBefore",
               "balance_after" as "balanceAfter",note,created_at as "createdAt",admin_id as "actorId"
        from public.admin_coin_adjustments where target_id=p_target_id
        union all
        select 'diamonds'::text currency,id,amount,"balance_before","balance_after",note,created_at,admin_id
        from public.admin_diamond_adjustments where target_id=p_target_id
        order by "createdAt" desc
        limit 60
      ) q
    ),
    'duplicateSales',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc),'[]'::jsonb)
      from (
        select s.id,s.card_id as "cardId",c.pokemon_name as "cardName",s.quantity,
               s.unit_market_price_usd as "unitMarketPriceUsd",s.unit_coins as "unitCoins",
               s.total_coins as "totalCoins",s.created_at as "createdAt"
        from private.card_duplicate_sales s
        left join public.cards c on c.id=s.card_id
        where s.player_id=p_target_id
        order by s.created_at desc
        limit 50
      ) q
    ),
    'diamondExchanges',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc),'[]'::jsonb)
      from (
        select id,diamonds,coins_spent as "coinsSpent",created_at as "createdAt"
        from public.diamond_exchange_log
        where player_id=p_target_id
        order by created_at desc
        limit 50
      ) q
    ),
    'codeRedemptions',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."redeemedAt" desc),'[]'::jsonb)
      from (
        select cr.code_id as "codeId",rc.code,cr.reward_snapshot as reward,
               cr.redeemed_at as "redeemedAt"
        from public.code_redemptions cr
        left join public.redeem_codes rc on rc.id=cr.code_id
        where cr.player_id=p_target_id
        order by cr.redeemed_at desc
        limit 50
      ) q
    )
  )
  into v_economy;

  select jsonb_build_object(
    'trades',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."updatedAt" desc),'[]'::jsonb)
      from (
        select t.id,t.status::text,t.sender_id as "senderId",sp.username as "senderUsername",
               t.receiver_id as "receiverId",rp.username as "receiverUsername",
               t.sender_confirmed as "senderConfirmed",t.receiver_confirmed as "receiverConfirmed",
               t.created_at as "createdAt",t.updated_at as "updatedAt"
        from public.trades t
        left join public.players sp on sp.id=t.sender_id
        left join public.players rp on rp.id=t.receiver_id
        where t.sender_id=p_target_id or t.receiver_id=p_target_id
        order by t.updated_at desc
        limit 40
      ) q
    ),
    'battles',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."updatedAt" desc),'[]'::jsonb)
      from (
        select b.id,b.mode,b.status,b.is_ranked as "isRanked",b.wager_coins as "wagerCoins",
               b.challenger_id as "challengerId",cp.username as "challengerUsername",
               b.opponent_id as "opponentId",op.username as "opponentUsername",
               b.winner_id as "winnerId",b.forfeited_by as "forfeitedBy",
               b.forfeit_rating_neutral as "forfeitRatingNeutral",
               b.created_at as "createdAt",b.updated_at as "updatedAt",b.completed_at as "completedAt"
        from public.battles b
        left join public.players cp on cp.id=b.challenger_id
        left join public.players op on op.id=b.opponent_id
        where b.challenger_id=p_target_id or b.opponent_id=p_target_id
        order by b.updated_at desc
        limit 40
      ) q
    )
  )
  into v_activity;

  select coalesce(jsonb_agg(to_jsonb(q) order by q."createdAt" desc),'[]'::jsonb)
  into v_moderation
  from (
    select a.id,a.action,a.reason,a.suspended_until as "suspendedUntil",
           a.created_at as "createdAt",a.admin_id as "actorId",p.username as "actorUsername"
    from public.admin_moderation_actions a
    left join public.players p on p.id=a.admin_id
    where a.target_id=p_target_id
    order by a.created_at desc
    limit 60
  ) q;

  select jsonb_build_object(
    'battlePass',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."updatedAt" desc),'[]'::jsonb)
      from (
        select season_id as "seasonId",xp,level,vip_unlocked as "vipUnlocked",
               vip_unlocked_at as "vipUnlockedAt",updated_at as "updatedAt"
        from public.battle_pass_player_progress
        where player_id=p_target_id
        order by updated_at desc
        limit 10
      ) q
    ),
    'battlePassClaims',(
      select coalesce(jsonb_agg(to_jsonb(q) order by q."claimedAt" desc),'[]'::jsonb)
      from (
        select season_id as "seasonId",level,track,reward,claimed_at as "claimedAt"
        from public.battle_pass_reward_claims
        where player_id=p_target_id
        order by claimed_at desc
        limit 40
      ) q
    ),
    'dailyMissions',(
      select jsonb_build_object(
        'rows',count(*),
        'claimed',count(*) filter(where claimed),
        'latestUpdate',max(updated_at)
      )
      from public.player_daily_missions
      where player_id=p_target_id
    ),
    'missionsV2',(
      select jsonb_build_object(
        'rows',count(*),
        'claimed',count(*) filter(where claimed),
        'latestUpdate',max(updated_at)
      )
      from public.player_missions_v2
      where player_id=p_target_id
    )
  )
  into v_progression;

  select jsonb_build_object(
    'guild',(
      select to_jsonb(q)
      from (
        select gm.guild_id as "guildId",g.name as "guildName",gm.role,gm.joined_at as "joinedAt"
        from public.guild_members gm
        join public.guilds g on g.id=gm.guild_id
        where gm.player_id=p_target_id
        limit 1
      ) q
    ),
    'acceptedFriends',(
      select count(*)
      from public.friendships f
      where f.status='accepted'
        and (f.requester_id=p_target_id or f.addressee_id=p_target_id)
    ),
    'guildBoosterClaims',(
      select count(*) from public.guild_collective_booster_claims where player_id=p_target_id
    ),
    'guildWeeklyRewards',(
      select jsonb_build_object(
        'claims',count(*),
        'coins',coalesce(sum(reward_coins),0),
        'diamonds',coalesce(sum(reward_diamonds),0)
      )
      from public.guild_weekly_reward_claims
      where player_id=p_target_id
    )
  )
  into v_social;

  if v_max_per_minute>=20 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','high','code','PACK_BURST',
      'title','Muitas aberturas no mesmo minuto',
      'detail',v_max_per_minute||' boosters em um único minuto.'
    ));
  elsif v_max_per_minute>=10 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','medium','code','PACK_BURST',
      'title','Ritmo alto de aberturas',
      'detail',v_max_per_minute||' boosters em um único minuto.'
    ));
  end if;

  if v_packs_24h>=250 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','medium','code','PACK_VOLUME_24H',
      'title','Volume muito alto em 24h',
      'detail',v_packs_24h||' boosters nas últimas 24 horas.'
    ));
  end if;

  if v_legacy_special>0 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','info','code','LEGACY_SPECIAL_PRICING',
      'title','Exposição a preços antigos de packs especiais',
      'detail',v_legacy_special||' abertura(s) de packs raros antes do rebalanceamento de 29/08.'
    ));
  end if;

  if v_admin_event_openings>0 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','info','code','ADMIN_EVENT_OPENINGS',
      'title','Aberturas durante Admin Abuse',
      'detail',v_admin_event_openings||' abertura(s) ocorreram dentro de evento oficial de boosters.'
    ));
  end if;

  if v_unexplained_discount>0 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','high','code','UNEXPLAINED_PACK_DISCOUNT',
      'title','Cobrança de booster abaixo do preço sem evento registrado',
      'detail',v_unexplained_discount||' abertura(s) possuem preço pago menor que o preço-base sem desconto/evento no snapshot.'
    ));
  end if;

  if v_legacy_price_unknown>0 then
    v_flags := v_flags || jsonb_build_array(jsonb_build_object(
      'severity','info','code','LEGACY_PRICE_SNAPSHOT_MISSING',
      'title','Aberturas antigas sem snapshot de cobrança',
      'detail',v_legacy_price_unknown||' abertura(s) são anteriores ao novo registro de preço/moeda. Não devem ser tratadas automaticamente como abuso.'
    ));
  end if;

  return jsonb_build_object(
    'generatedAt',now(),
    'account',v_account,
    'collection',v_collection,
    'packs',v_pack_stats,
    'packHistory',v_pack_history,
    'economy',v_economy,
    'activity',v_activity,
    'moderation',v_moderation,
    'progression',v_progression,
    'social',v_social,
    'flags',v_flags
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.server_open_legendary_diamond_pack(p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_config public.diamond_pack_config%rowtype;
  v_diamonds bigint;
  v_card public.cards%rowtype;
  v_snapshot jsonb;
  v_opening_id uuid;
  v_free_until timestamptz;
  v_effective_price integer;
  v_active_events jsonb := '[]'::jsonb;
  v_discount_kind text := 'none';
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into v_config from public.diamond_pack_config where id=1 for share;
  if not found or not v_config.active then raise exception 'PACK_NOT_AVAILABLE'; end if;
  select max(ends_at) into v_free_until
  from public.admin_game_events
  where event_type = 'free_boosters'
    and active = true and starts_at <= now() and ends_at > now();
  v_effective_price := case
    when v_free_until is null then v_config.cost_diamonds
    else (v_config.cost_diamonds + 1) / 2
  end;

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
    else 'admin_abuse_diamond_half'
  end;
  select diamonds into v_diamonds from public.players
  where id=p_player_id and account_status='active' for update;
  if not found then raise exception 'PLAYER_NOT_AVAILABLE'; end if;
  if v_diamonds < v_effective_price then raise exception 'NOT_ENOUGH_DIAMONDS'; end if;

  select * into v_card
  from public.cards
  where market_price_usd > v_config.min_value_usd
    and pokedex_numbers && array[
      144,145,146,150,151,243,244,245,249,250,251,
      377,378,379,380,381,382,383,384,385,386,
      480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,
      638,639,640,641,642,643,644,645,646,647,648,649,
      716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,
      800,801,802,807,808,809,888,889,890,891,892,893,894,895,896,897,
      898,905,1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,1024,1025
    ]::integer[]
  order by random()
  limit 1;
  if not found then raise exception 'NO_ELIGIBLE_LEGENDARY_CARDS'; end if;

  v_snapshot := jsonb_build_object(
    'id',v_card.id,'name',v_card.pokemon_name,'rarity',v_card.rarity,
    'image',coalesce(nullif(v_card.image_large,''),nullif(v_card.image_small,'')),
    'imageLarge',nullif(v_card.image_large,''),'imageSmall',nullif(v_card.image_small,''),
    'marketPriceUsd',v_card.market_price_usd
  );
  update public.players set diamonds=diamonds-v_effective_price
  where id=p_player_id returning diamonds into v_diamonds;
  insert into public.player_cards(player_id,card_id,quantity)
  values(p_player_id,v_card.id,1)
  on conflict(player_id,card_id)
  do update set quantity=public.player_cards.quantity+1;
  insert into public.diamond_pack_openings(
    player_id,card_id,diamonds_spent,card_snapshot,
    base_cost_diamonds,market_value_usd_at_open,pricing_context
  )
  values(
    p_player_id,v_card.id,v_effective_price,v_snapshot,
    v_config.cost_diamonds,v_card.market_price_usd,
    jsonb_build_object(
      'legacy',false,
      'priceSnapshotAvailable',true,
      'discountKind',v_discount_kind,
      'discountAmount',greatest(v_config.cost_diamonds-v_effective_price,0),
      'discountPercent',case
        when v_config.cost_diamonds>0
        then round((1-(v_effective_price::numeric/v_config.cost_diamonds::numeric))*100,2)
        else 0
      end,
      'freeBoostersUntil',v_free_until,
      'events',v_active_events,
      'recordedAt',now()
    )
  )
  returning id into v_opening_id;
  return jsonb_build_object(
    'openingId',v_opening_id,'cards',jsonb_build_array(v_snapshot),
    'diamonds',v_diamonds,'pricePaid',v_effective_price,'freeBoostersUntil',v_free_until
  );
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
    price_paid,base_price_at_open,currency_at_open,expected_value_usd_at_open,pricing_context
  )
  values(
    p_player_id,p_pack_id,coalesce(v_cards,'[]'::jsonb),
    v_effective_price,v_pack.price,v_currency,v_expected_value_usd,
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
    'expectedValueUsd',v_expected_value_usd,'discountKind',v_discount_kind,
    'freeBoostersUntil',v_free_until,'events',v_active_events,
    'newCards',v_new_cards,'wishlistHits',v_wishlist_hits,
    'rareMultiplier',v_rare_multiplier
  );
end;
$function$;

revoke all on function private.pack_expected_value_usd(text,integer) from public,anon,authenticated;
grant execute on function private.pack_expected_value_usd(text,integer) to service_role;

revoke all on function private.refresh_pack_economy() from public,anon,authenticated;
grant execute on function private.refresh_pack_economy() to service_role;

revoke all on function public.server_open_pack(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_open_pack(uuid,uuid) to service_role;

revoke all on function public.server_open_legendary_diamond_pack(uuid) from public,anon,authenticated;
grant execute on function public.server_open_legendary_diamond_pack(uuid) to service_role;

revoke all on function public.server_admin_account_audit(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.server_admin_account_audit(uuid,uuid,integer,integer) to service_role;

select private.refresh_pack_economy();

update public.app_update_logs
set changes=(
  select array_agg(distinct item order by item)
  from unnest(changes || array[
    'Aberturas de boosters agora registram preço-base, preço realmente pago, moeda, valor esperado e snapshot de eventos/descontos',
    'Aberturas antigas sem preço histórico confiável são marcadas como legacy e não contam automaticamente como abuso',
    'Boosters de Coins agora têm piso adicional baseado no valor esperado das cartas entregues pelo algoritmo de pull, sem reduzir os pisos especiais já existentes',
    'Auditoria de conta mostra cobrança histórica do booster e alerta descontos sem evento registrado'
  ]::text[]) item
)
where version='0.1.1 • OTA 28/08';
