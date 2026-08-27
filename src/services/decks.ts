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
    .select('id,name,is_default,created_at,updated_at,deck_cards(card_id,quantity,cards(id,pokemon_name,rarity,types,image_small,image_large,set_name,game_value,market_price_usd,market_price_variant))')
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
