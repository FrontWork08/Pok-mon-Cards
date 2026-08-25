import { supabase } from '@/lib/supabase';

export type Pack = {
  id: string;
  name: string;
  set_id: string;
  price: number;
  cards_per_pack: number;
  image_url: string | null;
  active: boolean;
};

export async function listPacks(): Promise<Pack[]> {
  const { data, error } = await supabase
    .from('packs')
    .select('id,name,set_id,price,cards_per_pack,image_url,active')
    .eq('active', true)
    .order('price', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function openPack(packId: string) {
  const { data, error } = await supabase.functions.invoke('open-pack', {
    body: { packId },
  });

  if (error) throw error;
  return data as { openingId: string; cards: Array<{ id: string; name: string; rarity: string | null; image: string | null }> };
}
