import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type MarketPriceUpdate = {
  id: string;
  market_price_usd: number | null;
  market_price_low_usd: number | null;
  market_price_high_usd: number | null;
  market_price_variant: string | null;
  market_price_source: string | null;
  market_price_updated_at: string | null;
};

export type CollectionRankEntry = {
  global_rank: number;
  player_id: string;
  username: string;
  collection_value_usd: number;
  priced_card_copies: number;
  total_card_copies: number;
  price_coverage_pct: number;
};

export function formatUsd(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `US$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function refreshOwnedMarketPrices(cardIds: string[], force = false) {
  const unique = [...new Set(cardIds.filter(Boolean))];
  if (!unique.length) return [] as MarketPriceUpdate[];

  const results: MarketPriceUpdate[] = [];
  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80);
    const { data, error } = await supabase.functions.invoke('market-prices', {
      body: { scope: 'owned', cardIds: chunk, force },
    });

    if (error) {
      throw await normalizeFunctionError(error, 'Não foi possível atualizar os preços de mercado.');
    }
    if (data?.error) throw new Error(String(data.error));
    results.push(...((data?.data?.results ?? []) as MarketPriceUpdate[]));
  }
  return results;
}

export async function refreshGlobalOwnedMarketPrices(force = false) {
  const { data, error } = await supabase.functions.invoke('market-prices', {
    body: { scope: 'global', force },
  });

  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível atualizar os preços globais.');
  }
  if (data?.error) throw new Error(String(data.error));
  return data?.data as {
    results: MarketPriceUpdate[];
    refreshed: number;
    requested: number;
    remainingStale: number;
  };
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
