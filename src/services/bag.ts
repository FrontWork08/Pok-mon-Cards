import { supabase } from '@/lib/supabase';
import type { OwnedCardEntry } from '@/services/player';

export type BagQuickFilter = 'all' | 'favorites' | 'duplicates';
export type BagSortMode = 'recent' | 'value' | 'name' | 'quantity' | 'damage' | 'hp';

export type BagOverview = {
  uniqueCards: number;
  totalCards: number;
  collectionValueUsd: number;
  pricedCopies: number;
  mostValuable: {
    id: string;
    pokemon_name: string;
    rarity: string | null;
    image_small: string | null;
    market_price_usd: number | null;
  } | null;
  types: string[];
  rarities: string[];
};

export type BagPageFilters = {
  search: string;
  setQuery: string;
  quickFilter: BagQuickFilter;
  typeFilter: string | null;
  rarityFilter: string | null;
  generation: number | null;
  sortMode: BagSortMode;
};

export type BagPage = {
  items: OwnedCardEntry[];
  totalFiltered: number;
};

let bagOverviewRequest: Promise<BagOverview> | null = null;
const bagPageRequests = new Map<string, Promise<BagPage>>();

async function fetchMyBagOverview(): Promise<BagOverview> {
  const { data, error } = await supabase.rpc('get_my_bag_overview');
  if (error) throw error;
  const value = (data ?? {}) as any;
  return {
    uniqueCards: Number(value.uniqueCards ?? 0),
    totalCards: Number(value.totalCards ?? 0),
    collectionValueUsd: Number(value.collectionValueUsd ?? 0),
    pricedCopies: Number(value.pricedCopies ?? 0),
    mostValuable: value.mostValuable ?? null,
    types: Array.isArray(value.types) ? value.types : [],
    rarities: Array.isArray(value.rarities) ? value.rarities : [],
  };
}

export async function getMyBagOverview(): Promise<BagOverview> {
  // Focus + pull-to-refresh can overlap. Share only the active request; no result
  // is cached, so collection changes are still visible on the next call.
  if (bagOverviewRequest) return bagOverviewRequest;
  bagOverviewRequest = fetchMyBagOverview();
  try {
    return await bagOverviewRequest;
  } finally {
    bagOverviewRequest = null;
  }
}

export async function getMyBagPage(
  offset: number,
  limit: number,
  filters: BagPageFilters,
): Promise<BagPage> {
  const normalizedSearch = filters.search.trim();
  const normalizedSetQuery = filters.setQuery.trim();
  const requestKey = JSON.stringify([
    offset,
    limit,
    normalizedSearch,
    normalizedSetQuery,
    filters.quickFilter,
    filters.typeFilter,
    filters.rarityFilter,
    filters.generation,
    filters.sortMode,
  ]);

  const existing = bagPageRequests.get(requestKey);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase.rpc('get_my_bag_page', {
      p_offset: offset,
      p_limit: limit,
      p_search: normalizedSearch || null,
      p_set_query: normalizedSetQuery || null,
      p_quick_filter: filters.quickFilter,
      p_type_filter: filters.typeFilter,
      p_rarity_filter: filters.rarityFilter,
      p_generation: filters.generation,
      p_sort_mode: filters.sortMode,
    });
    if (error) throw error;
    const value = (data ?? {}) as any;
    return {
      items: Array.isArray(value.items) ? value.items as OwnedCardEntry[] : [],
      totalFiltered: Number(value.totalFiltered ?? 0),
    };
  })();

  bagPageRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (bagPageRequests.get(requestKey) === request) bagPageRequests.delete(requestKey);
  }
}
