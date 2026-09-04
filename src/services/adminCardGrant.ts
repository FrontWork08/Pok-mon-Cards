import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

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
  return invokeOwnerCard({ action: 'owner_grant_card', targetId, cardId, quantity, note }) as Promise<OwnerCardGrantResult>;
}
