import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type Pack = {
  id: string;
  name: string;
  set_id: string;
  price: number;
  cards_per_pack: number;
  image_url: string | null;
  art_url: string | null;
  active: boolean;
};

export type OpenedCard = {
  id: string;
  name: string;
  rarity: string | null;
  image: string | null;
};

export async function listPacks(): Promise<Pack[]> {
  const { data, error } = await supabase
    .from('packs')
    .select('id,name,set_id,price,cards_per_pack,image_url,art_url,active')
    .eq('active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function openPack(packId: string) {
  const { data, error } = await supabase.functions.invoke('open-pack', { body: { packId } });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível abrir este booster.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível abrir este booster.');
  return data as { openingId: string; cards: OpenedCard[] };
}
