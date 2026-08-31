-- Economy 2.0 core balance. Applied to production as Supabase migration 20260831024112.

create table if not exists public.economy_policy (
  id smallint primary key check (id = 1),
  version text not null,
  target_regular_daily_coins bigint not null,
  coin_pack_floor bigint not null,
  coin_pack_ceiling bigint not null,
  market_fee_bps integer not null,
  duplicate_pack_cap_bps integer not null,
  notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.economy_policy(
  id,version,target_regular_daily_coins,coin_pack_floor,coin_pack_ceiling,
  market_fee_bps,duplicate_pack_cap_bps,notes
)
values(
  1,'economy_v2',35000,5000,100000,800,15000,
  '{"simulationPlayers":1000,"simulationDays":180,"veteranResetCoins":100000,"veteranResetDiamonds":15,"intent":"stable post-reset economy"}'::jsonb
)
on conflict (id) do update
set version=excluded.version,
    target_regular_daily_coins=excluded.target_regular_daily_coins,
    coin_pack_floor=excluded.coin_pack_floor,
    coin_pack_ceiling=excluded.coin_pack_ceiling,
    market_fee_bps=excluded.market_fee_bps,
    duplicate_pack_cap_bps=excluded.duplicate_pack_cap_bps,
    notes=excluded.notes,
    updated_at=now();

alter table public.economy_policy enable row level security;
drop policy if exists "economy policy readable" on public.economy_policy;
create policy "economy policy readable" on public.economy_policy
for select to authenticated using (true);
grant select on public.economy_policy to authenticated;

update public.mission_definitions_v2
set reward_coins = case id
  when 'd_open_1' then 900 when 'd_open_3' then 2300 when 'd_battle_2' then 2000
  when 'd_ranked_1' then 1700 when 'd_win_1' then 2700 when 'd_trade_1' then 2000
  when 'd_list_1' then 1400 when 'w_open_15' then 16000 when 'w_battle_10' then 12500
  when 'w_ranked_5' then 14000 when 'w_ranked_win_3' then 19000 when 'w_win_5' then 19500
  when 'w_trade_3' then 14000 when 'w_sales_2' then 12000 when 'w_collect_20' then 17000
  else reward_coins end,
  reward_diamonds = case id
  when 'w_open_15' then 1 when 'w_battle_10' then 0 when 'w_ranked_5' then 1
  when 'w_ranked_win_3' then 1 when 'w_win_5' then 1 when 'w_trade_3' then 1
  when 'w_sales_2' then 1 when 'w_collect_20' then 1 else reward_diamonds end,
  updated_at=now()
where id in (
  'd_open_1','d_open_3','d_battle_2','d_ranked_1','d_win_1','d_trade_1','d_list_1',
  'w_open_15','w_battle_10','w_ranked_5','w_ranked_win_3','w_win_5','w_trade_3','w_sales_2','w_collect_20'
);


-- Battle Pass coins are supplementary rewards, not a second full salary.
with adjusted as (
  select season_id,level,track,
         greatest(50,round(((reward->>'coins')::numeric * 0.5) / 50.0) * 50)::bigint as new_coins
  from public.battle_pass_reward_definitions
  where reward ? 'coins'
)
update public.battle_pass_reward_definitions d
set reward=jsonb_set(d.reward,'{coins}',to_jsonb(a.new_coins),true),
    label=regexp_replace(d.label,'🪙[[:space:]]*[0-9]+','🪙 '||a.new_coins::text,'g')
from adjusted a
where d.season_id=a.season_id and d.level=a.level and d.track=a.track;

create or replace function private.get_guild_weekly_reward_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_player uuid:=auth.uid();
  v_guild text;
  v_week timestamptz:=date_trunc('week',now());
  v_score_start timestamptz:=greatest(date_trunc('week',now()),private.release_progress_epoch());
  v_collection numeric:=0; v_packs integer:=0; v_wins integer:=0;
  v_completed integer:=0; v_claimed boolean:=false;
  v_coins bigint:=0; v_diamonds integer:=0;
begin
  if v_player is null then raise exception 'UNAUTHORIZED'; end if;
  select gm.guild_id into v_guild from public.guild_members gm where gm.player_id=v_player limit 1;
  if v_guild is null then
    return jsonb_build_object('guildId',null,'weekStart',v_week::date,'completedMissions',0,
      'claimed',false,'claimable',false,'coins',0,'diamonds',0,'collectionValueUsd',0,'packs',0,'wins',0);
  end if;

  select coalesce(sum(coalesce(c.market_price_usd,0)),0) into v_collection
  from public.guild_members gm
  join public.player_cards pc on pc.player_id=gm.player_id and pc.quantity>0
  join public.cards c on c.id=pc.card_id
  where gm.guild_id=v_guild;

  select count(*) into v_packs
  from public.pack_openings po join public.guild_members gm on gm.player_id=po.player_id
  where gm.guild_id=v_guild and po.opened_at>=v_score_start;

  select count(*) into v_wins
  from public.battles b join public.guild_members gm on gm.player_id=b.winner_id
  where gm.guild_id=v_guild and b.status='completed' and coalesce(b.reward_eligible,true)
    and b.completed_at>=v_score_start;

  v_completed:=(case when v_collection>=10000 then 1 else 0 end)
    +(case when v_packs>=25 then 1 else 0 end)
    +(case when v_wins>=10 then 1 else 0 end);

  select exists(select 1 from public.guild_weekly_reward_claims x
    where x.player_id=v_player and x.guild_id=v_guild and x.week_start=v_week::date) into v_claimed;

  v_coins:=case v_completed when 1 then 5000 when 2 then 12500 when 3 then 25000 else 0 end;
  v_diamonds:=case v_completed when 2 then 1 when 3 then 2 else 0 end;

  return jsonb_build_object('guildId',v_guild,'weekStart',v_week::date,'completedMissions',v_completed,
    'claimed',v_claimed,'claimable',v_completed>0 and not v_claimed,'coins',v_coins,'diamonds',v_diamonds,
    'collectionValueUsd',v_collection,'packs',v_packs,'wins',v_wins);
end;
$$;

update public.tournaments set reward_coins=50000,reward_diamonds=3
where status in ('registration','active');

create or replace function private.ensure_active_tournament()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid; v_number integer;
begin
  update public.tournaments set status='cancelled'
  where status='registration' and registration_ends_at<=now()
    and (select count(*) from public.tournament_entries e where e.tournament_id=tournaments.id)<8;

  select id into v_id from public.tournaments where status in ('registration','active')
  order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  select count(*)+1 into v_number from public.tournaments;
  insert into public.tournaments(name,status,registration_ends_at,starts_at,ends_at,reward_coins,reward_diamonds)
  values('Copa Trainer #'||v_number,'registration',now()+interval '24 hours',null,now()+interval '7 days',50000,3)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.refresh_pack_economy()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_size_rows integer:=0; v_price_rows integer:=0;
begin
  update public.packs p
  set cards_per_pack=private.recommended_pack_card_count(p.set_id,p.cards_per_pack)
  where p.active and private.recommended_pack_card_count(p.set_id,p.cards_per_pack)<p.cards_per_pack;
  get diagnostics v_size_rows=row_count;

  with pack_values as (
    select p.id,p.cards_per_pack,coalesce(max(c.market_price_usd),0)::numeric as max_card_usd,
      private.pack_expected_value_usd(p.set_id,p.cards_per_pack) as expected_value_usd
    from public.packs p left join public.cards c on c.set_id=p.set_id
    where p.active group by p.id,p.set_id,p.cards_per_pack
  ), standard as (
    select *,
      case when max_card_usd>=980 then 'diamonds' else 'coins' end as currency,
      case
        when max_card_usd>=5000 then 100 when max_card_usd>=4000 then 90
        when max_card_usd>=3000 then 75 when max_card_usd>=2000 then 60
        when max_card_usd>=1500 then 45 when max_card_usd>=1250 then 35
        when max_card_usd>=1000 then 25 when max_card_usd>=980 then 15
        when max_card_usd>=800 then 50000 when max_card_usd>=700 then 40000
        when max_card_usd>=600 then 30000 when max_card_usd>=500 then 25000
        when max_card_usd>=400 then 20000 when max_card_usd>=300 then 16000
        when max_card_usd>=200 then 12000 when max_card_usd>=100 then 8000
        else 5000 end::bigint as standard_price
    from pack_values
  ), priced as (
    select id,currency,
      case when currency='diamonds' then standard_price
        else least(100000::bigint,greatest(5000::bigint,standard_price,
          (ceil((coalesce(expected_value_usd,0)*500)/1000.0)*1000)::bigint))
      end::bigint as price
    from standard
  )
  update public.packs p set currency=x.currency,price=x.price
  from priced x where p.id=x.id
    and (p.currency is distinct from x.currency or p.price is distinct from x.price);

  get diagnostics v_price_rows=row_count;
  return v_size_rows+v_price_rows;
end;
$$;

select private.refresh_pack_economy();
