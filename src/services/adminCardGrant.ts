import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

const OWNER_CARD_GRANT_MIN = 1;
const OWNER_CARD_GRANT_MAX = 100;

async function invokeOwnerCard(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível concluir a ação de carta do Criador.');
  if (data?.error) throw new Error(String(data.error));
  return data?.data;
}

export type OwnerCardCatalogItem = {
  id: string;
  name: string;
  setId: string;
  setName: string | null;
  number: string | null;
  rarity: string | null;
  image: string | null;
  imageSmall: string | null;
  marketPriceUsd: number | null;
};

export type OwnerCardCatalogPage = {
  items: OwnerCardCatalogItem[];
  total: number;
  offset: number;
  limit: number;
};

export type OwnerCardGrantResult = {
  grantId: number;
  targetId: string;
  username: string;
  card: OwnerCardCatalogItem;
  quantityAdded: number;
  quantityBefore: number;
  quantityAfter: number;
};

export async function searchOwnerCards(search = '', offset = 0, limit = 80): Promise<OwnerCardCatalogPage> {
  return invokeOwnerCard({ action: 'owner_search_cards', search, offset, limit }) as Promise<OwnerCardCatalogPage>;
}

export async function grantOwnerCard(
  targetId: string,
  cardId: string,
  quantity = 1,
  note = '',
): Promise<OwnerCardGrantResult> {
  const target = targetId.trim();
  const card = cardId.trim();
  if (!target) throw new Error('Escolha a conta que vai receber a carta.');
  if (!card) throw new Error('Escolha a carta que será adicionada.');
  if (!Number.isSafeInteger(quantity) || quantity < OWNER_CARD_GRANT_MIN || quantity > OWNER_CARD_GRANT_MAX) {
    throw new Error(`Escolha uma quantidade entre ${OWNER_CARD_GRANT_MIN} e ${OWNER_CARD_GRANT_MAX}.`);
  }
  return invokeOwnerCard({ action: 'owner_grant_card', targetId: target, cardId: card, quantity, note: note.trim() }) as Promise<OwnerCardGrantResult>;
}
