import { supabase } from '@/lib/supabase';

export type PokedexEntry = {
  pokedex_number: number;
  pokemon_name: string;
  types: string[];
  image_small: string | null;
  representative_card_id: string;
};

export type PokemonCardVersion = {
  id: string;
  pokemon_name: string;
  set_id: string;
  set_name: string;
  card_number: string | null;
  rarity: string | null;
  types: string[];
  image_small: string | null;
  image_large: string | null;
};

let pokedexCatalogCache: PokedexEntry[] | null = null;
let pokedexCatalogRequest: Promise<PokedexEntry[]> | null = null;

export async function getPokedexCatalog(force = false): Promise<PokedexEntry[]> {
  if (!force && pokedexCatalogCache) return pokedexCatalogCache;
  if (!force && pokedexCatalogRequest) return pokedexCatalogRequest;

  pokedexCatalogRequest = (async () => {
    const { data, error } = await supabase
      .from('pokedex_catalog')
      .select('pokedex_number,pokemon_name,types,image_small,representative_card_id')
      .order('pokedex_number', { ascending: true })
      .limit(2000);

    if (error) throw error;
    const rows = (data ?? []) as PokedexEntry[];
    pokedexCatalogCache = rows;
    return rows;
  })();

  try {
    return await pokedexCatalogRequest;
  } finally {
    pokedexCatalogRequest = null;
  }
}

export async function getMyOwnedPokedexNumbers(): Promise<number[]> {
  const { data, error } = await supabase.rpc('get_my_owned_pokedex_numbers');
  if (error) throw error;
  return Array.isArray(data)
    ? data.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
}

export async function getPokemonCardVersions(pokedexNumber: number): Promise<PokemonCardVersion[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('id,pokemon_name,set_id,set_name,card_number,rarity,types,image_small,image_large')
    .contains('pokedex_numbers', [pokedexNumber])
    .order('set_name', { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as PokemonCardVersion[];
}

export function generationForNumber(number: number) {
  if (number <= 151) return 1;
  if (number <= 251) return 2;
  if (number <= 386) return 3;
  if (number <= 493) return 4;
  if (number <= 649) return 5;
  if (number <= 721) return 6;
  if (number <= 809) return 7;
  if (number <= 905) return 8;
  return 9;
}
