import { supabase } from '@/lib/supabase';

export type CollectionRankEntry = {
  global_rank: number;
  player_id: string;
  username: string;
  collection_value_usd: number;
  priced_card_copies: number;
  total_card_copies: number;
  price_coverage_pct: number;
};

export type WeeklyCollectionRankEntry = {
  weekly_rank: number;
  player_id: string;
  username: string;
  weekly_value_usd: number;
  cards_gained: number;
  packs_opened: number;
  reward_coins: number;
  week_start: string;
  score_start: string;
  week_end: string;
};

export function formatUsd(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `US$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function getCollectionWeeklyLeaderboard(limit = 100) {
  const { data, error } = await supabase.rpc('get_collection_weekly_leaderboard', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((entry: any) => ({
    ...entry,
    weekly_rank: Number(entry.weekly_rank ?? 0),
    weekly_value_usd: Number(entry.weekly_value_usd ?? 0),
    cards_gained: Number(entry.cards_gained ?? 0),
    packs_opened: Number(entry.packs_opened ?? 0),
    reward_coins: Number(entry.reward_coins ?? 0),
    week_start: String(entry.week_start ?? ''),
    score_start: String(entry.score_start ?? ''),
    week_end: String(entry.week_end ?? ''),
  })) as WeeklyCollectionRankEntry[];
}

export async function getCollectionValueLeaderboard(limit = 100) {
  const { data, error } = await supabase.rpc('get_collection_value_leaderboard', {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((entry: any) => ({
    ...entry,
    global_rank: Number(entry.global_rank ?? 0),
    collection_value_usd: Number(entry.collection_value_usd ?? 0),
    priced_card_copies: Number(entry.priced_card_copies ?? 0),
    total_card_copies: Number(entry.total_card_copies ?? 0),
    price_coverage_pct: Number(entry.price_coverage_pct ?? 0),
  })) as CollectionRankEntry[];
}

export async function isCurrentUserAdmin() {
  const { data, error } = await supabase.rpc('is_current_user_admin');
  if (error) throw error;
  return data === true;
}


export async function refreshOwnedMarketPrices(cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))].slice(0, 120);
  if (!ids.length) return { refreshed: 0, priced: 0 };
  const { data, error } = await supabase.functions.invoke('market-prices', {
    body: { scope: 'owned', cardIds: ids },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return {
    refreshed: Number(data?.data?.refreshed ?? 0),
    priced: Number(data?.data?.priced ?? 0),
  };
}
