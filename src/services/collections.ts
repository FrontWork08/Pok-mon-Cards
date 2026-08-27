import { supabase } from '@/lib/supabase';

export type SetCatalogEntry = {
  set_id: string;
  set_name: string;
  total_cards: number;
  representative_image: string | null;
};

export type SetCardPreview = {
  id: string;
  pokemon_name: string;
  set_id: string;
  set_name: string;
  card_number: string | null;
  rarity: string | null;
  image_small: string | null;
};

let setCatalogCache: SetCatalogEntry[] | null = null;
let setCatalogRequest: Promise<SetCatalogEntry[]> | null = null;
const setCardsCache = new Map<string, SetCardPreview[]>();
const setCardsRequests = new Map<string, Promise<SetCardPreview[]>>();

export async function getSetCatalog(force = false): Promise<SetCatalogEntry[]> {
  if (!force && setCatalogCache) return setCatalogCache;
  if (!force && setCatalogRequest) return setCatalogRequest;

  setCatalogRequest = (async () => {
    const { data, error } = await supabase
      .from('set_catalog')
      .select('set_id,set_name,total_cards,representative_image')
      .order('set_name', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as SetCatalogEntry[];
    setCatalogCache = rows;
    return rows;
  })();

  try {
    return await setCatalogRequest;
  } finally {
    setCatalogRequest = null;
  }
}

export async function getMyOwnedSetCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_my_owned_set_counts');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (row?.set_id) counts.set(String(row.set_id), Number(row.owned_count ?? 0));
  }
  return counts;
}

export async function getMyOwnedCardIdsForSet(setId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_my_owned_card_ids_for_set', {
    p_set_id: setId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data.map(String) : [];
}

export async function getSetCards(setId: string, force = false): Promise<SetCardPreview[]> {
  if (!force && setCardsCache.has(setId)) return setCardsCache.get(setId)!;
  if (!force && setCardsRequests.has(setId)) return setCardsRequests.get(setId)!;

  const request = (async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('id,pokemon_name,set_id,set_name,card_number,rarity,image_small')
      .eq('set_id', setId)
      .order('card_number', { ascending: true })
      .limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as SetCardPreview[];
    setCardsCache.set(setId, rows);
    return rows;
  })();

  setCardsRequests.set(setId, request);
  try {
    return await request;
  } finally {
    setCardsRequests.delete(setId);
  }
}

export async function getMyPackHistory() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('pack_openings')
    .select('id,opened_at,cards_received,packs(id,name,set_id,image_url,price)')
    .eq('player_id', user.id)
    .order('opened_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}
