-- Economy 2.0 release guard. Applied to production as Supabase migration 20260831025059.

create or replace function private.close_beta_economy_on_release_reset()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.code='trainer_collection_1_0_beta_transition'
     and old.phase='freeze'
     and new.phase='update_required' then
    update public.redeem_codes set active=false where active=true;
    update public.admin_game_events set active=false where active=true;
  end if;
  return new;
end;
$$;

drop trigger if exists close_beta_economy_on_release_reset on public.release_campaigns;
create trigger close_beta_economy_on_release_reset
after update of phase on public.release_campaigns
for each row execute function private.close_beta_economy_on_release_reset();

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
  v_known_mint bigint:=0; v_known_burn bigint:=0; v_status text:='healthy';
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

  v_known_mint:=v_mission_mint+v_bp_mint+v_guild_mint+v_duplicate_mint+v_code_mint+v_milestone_mint;
  v_known_burn:=v_pack_burn+v_exchange_burn+v_market_fee_burn+v_gym_burn;

  v_status:=case
    when v_known_mint=0 then 'healthy'
    when v_known_burn::numeric/v_known_mint>=.75 then 'healthy'
    when v_known_burn::numeric/v_known_mint>=.55 then 'watch'
    else 'critical'
  end;

  return jsonb_build_object(
    'version',(select version from public.economy_policy where id=1),
    'windowDays',7,'windowStart',v_since,'releaseEpoch',v_epoch,
    'status',v_status,'activePlayers',v_active_players,
    'balances',jsonb_build_object('coins',v_total_coins,'diamonds',v_total_diamonds),
    'knownMint',jsonb_build_object(
      'missions',v_mission_mint,'battlePass',v_bp_mint,'guild',v_guild_mint,
      'duplicates',v_duplicate_mint,'codes',v_code_mint,'milestones',v_milestone_mint,'total',v_known_mint
    ),
    'knownBurn',jsonb_build_object(
      'packs',v_pack_burn,'diamondExchange',v_exchange_burn,'marketFees',v_market_fee_burn,
      'gymHealing',v_gym_burn,'total',v_known_burn
    ),
    'burnToMintRatio',case when v_known_mint=0 then null else round(v_known_burn::numeric/v_known_mint,3) end,
    'packPrices',(select jsonb_build_object(
      'coinMin',min(price) filter(where currency='coins'),
      'coinMedian',percentile_cont(.5) within group(order by price) filter(where currency='coins'),
      'coinMax',max(price) filter(where currency='coins'),
      'diamondMin',min(price) filter(where currency='diamonds'),
      'diamondMedian',percentile_cont(.5) within group(order by price) filter(where currency='diamonds'),
      'diamondMax',max(price) filter(where currency='diamonds')
    ) from public.packs where active),
    'coverageNote','Known ledger excludes daily-login history, season payouts, tournament payouts and explicit admin grants.'
  );
end;
$$;
