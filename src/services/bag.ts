import { supabase } from '@/lib/supabase';
import type { OwnedCardEntry } from '@/services/player';

export type BagQuickFilter = 'all' | 'favorites' | 'duplicates';
export type BagSortMode = 'recent' | 'value' | 'name' | 'quantity';

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

export async function getMyBagOverview(): Promise<BagOverview> {
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

export async function getMyBagPage(
  offset: number,
  limit: number,
  filters: BagPageFilters,
): Promise<BagPage> {
  const { data, error } = await supabase.rpc('get_my_bag_page', {
    p_offset: offset,
    p_limit: limit,
    p_search: filters.search.trim() || null,
    p_set_query: filters.setQuery.trim() || null,
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
}
