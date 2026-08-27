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
  booster_art_url: string | null;
  booster_art_urls: string[];
  booster_back_url: string | null;
  booster_logo_url: string | null;
  booster_art_source: string | null;
  active: boolean;
};

export type OpenedCard = {
  id: string;
  name: string;
  rarity: string | null;
  image: string | null;
};

type BoosterArtworkResult = {
  set_id: string;
  booster_art_url: string | null;
  booster_art_urls: string[];
  booster_back_url: string | null;
  booster_logo_url: string | null;
  source: string;
};

export async function listPacks(): Promise<Pack[]> {
  const { data, error } = await supabase
    .from('packs')
    .select(
      'id,name,set_id,price,cards_per_pack,image_url,art_url,booster_art_url,booster_art_urls,booster_back_url,booster_logo_url,booster_art_source,active',
    )
    .eq('active', true)
    .order('price', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((pack: any) => ({
    ...pack,
    booster_art_urls: Array.isArray(pack.booster_art_urls) ? pack.booster_art_urls : [],
  }));
}

export async function hydrateBoosterArtwork(packs: Pack[]): Promise<BoosterArtworkResult[]> {
  const missing = packs
    .filter((pack) => !pack.booster_art_url && pack.booster_art_source !== 'tcgdex:no_art' && pack.booster_art_source !== 'tcgdex:no_match')
    .slice(0, 20);

  if (!missing.length) return [];

  const { data, error } = await supabase.functions.invoke('booster-art', {
    body: {
      sets: missing.map((pack) => ({
        setId: pack.set_id,
        setName: pack.name.replace(/\s+Booster$/i, ''),
      })),
    },
  });

  if (error) {
    throw await normalizeFunctionError(error, 'Não foi possível carregar a arte real dos boosters.');
  }

  if (data?.error) {
    throw await normalizeFunctionError(
      new Error(String(data.error)),
      'Não foi possível carregar a arte real dos boosters.',
    );
  }

  return Array.isArray(data?.results) ? data.results : [];
}

export async function openPack(packId: string) {
  const { data, error } = await supabase.functions.invoke('open-pack', { body: { packId } });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível abrir este booster.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível abrir este booster.');
  return data as { openingId: string; cards: OpenedCard[] };
}
