create index if not exists battles_reward_pair_forward_recent_idx
  on public.battles(challenger_id,opponent_id,completed_at desc)
  where status='completed' and reward_eligible=true;

create index if not exists battles_reward_pair_reverse_recent_idx
  on public.battles(opponent_id,challenger_id,completed_at desc)
  where status='completed' and reward_eligible=true;

create index if not exists battles_bot_challenger_daily_idx
  on public.battles(challenger_id,completed_at desc)
  where status='completed' and is_bot_match=true;

create index if not exists battles_bot_opponent_daily_idx
  on public.battles(opponent_id,completed_at desc)
  where status='completed' and is_bot_match=true;
