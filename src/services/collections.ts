import { supabase } from '@/lib/supabase';

export type SetCatalogEntry = {
  set_id: string;
  set_name: string;
  total_cards: number;
  representative_image: string | null;
};

export async function getSetCatalog(): Promise<SetCatalogEntry[]> {
  const { data, error } = await supabase
    .from('set_catalog')
    .select('set_id,set_name,total_cards,representative_image')
    .order('set_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SetCatalogEntry[];
}

export async function getSetCards(setId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select('id,pokemon_name,pokedex_numbers,set_id,set_name,card_number,rarity,types,image_small,image_large')
    .eq('set_id', setId)
    .order('card_number', { ascending: true })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
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
