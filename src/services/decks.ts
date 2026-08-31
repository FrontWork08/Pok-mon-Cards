import { supabase } from '@/lib/supabase';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('deck-action', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}

export async function getMyDecks() {
  const { data, error } = await supabase
    .from('decks')
    .select('id,name,is_default,style_item_id,created_at,updated_at,economy_store_items(name,icon,rarity),deck_cards(card_id,quantity,cards(id,pokemon_name,rarity,types,image_small,image_large,set_name,game_value,market_price_usd,market_price_variant))')
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createDeck(name: string) {
  const data = await invoke({ action: 'create', name });
  return data.deckId as string;
}

export async function setDeckCards(deckId: string, cards: Array<{ card_id: string; quantity: number }>) {
  return invoke({ action: 'set_cards', deckId, cards });
}

export async function setDefaultDeck(deckId: string) {
  return invoke({ action: 'set_default', deckId });
}

export async function renameDeck(deckId: string, name: string) {
  return invoke({ action: 'rename', deckId, name });
}

export async function deleteDeck(deckId: string) {
  return invoke({ action: 'delete', deckId });
}


export type DeckBuilderCardEntry = {
  quantity: number;
  cards: {
    id: string;
    pokemon_name: string;
    rarity: string | null;
    set_name: string;
    image_small: string | null;
    market_price_usd: number | null;
    types: string[];
    battle_profile?: {
      hp: number;
      maxDamage: number;
      minEnergy: number;
      bestEnergy: number;
      retreatCost: number;
      attackCount: number;
      abilityCount: number;
      effectAttackCount: number;
      damagePerEnergy: number;
      efficiencyScore: number;
      speedScore: number;
      techniqueScore: number;
      battleRating: number;
    };
  };
};

export type DeckBuilderSortMode = 'name' | 'value' | 'damage' | 'hp' | 'quantity';

export type DeckBuilderFilters = {
  search?: string;
  typeFilter?: string | null;
  rarityFilter?: string | null;
  sortMode?: DeckBuilderSortMode;
};

export type DeckBuilderPage = {
  items: DeckBuilderCardEntry[];
  total: number;
  availableTypes: string[];
  availableRarities: string[];
};

export async function getMyDeck(deckId: string) {
  const { data, error } = await supabase
    .from('decks')
    .select('id,name,is_default,style_item_id,created_at,updated_at,economy_store_items(name,icon,rarity),deck_cards(card_id,quantity,cards(id,pokemon_name,rarity,image_small,market_price_usd))')
    .eq('id', deckId)
    .single();
  if (error) throw error;
  return data;
}

export async function getDeckBuilderPage(
  offset: number,
  limit: number,
  filters: DeckBuilderFilters = {},
): Promise<DeckBuilderPage> {
  const { data, error } = await supabase.rpc('get_my_deck_builder_page_v2', {
    p_offset: Math.max(0, Math.floor(offset)),
    p_limit: Math.max(1, Math.min(60, Math.floor(limit))),
    p_search: filters.search?.trim() || null,
    p_type_filter: filters.typeFilter ?? null,
    p_rarity_filter: filters.rarityFilter ?? null,
    p_sort_mode: filters.sortMode ?? 'name',
  });
  if (error) throw error;
  const value = (data ?? {}) as any;
  return {
    items: Array.isArray(value.items) ? value.items as DeckBuilderCardEntry[] : [],
    total: Number(value.total ?? 0),
    availableTypes: Array.isArray(value.availableTypes) ? value.availableTypes.map(String) : [],
    availableRarities: Array.isArray(value.availableRarities) ? value.availableRarities.map(String) : [],
  };
}
