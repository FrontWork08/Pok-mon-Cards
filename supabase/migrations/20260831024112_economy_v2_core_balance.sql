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
