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
let ownedPokedexRequest: Promise<number[]> | null = null;
const pokemonVersionsCache = new Map<number, PokemonCardVersion[]>();
const pokemonVersionsRequests = new Map<number, Promise<PokemonCardVersion[]>>();
const MAX_VERSION_CACHE_ENTRIES = 24;

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
  // Do not cache the result: newly opened cards must appear immediately. Only
  // coalesce simultaneous focus/render requests to avoid duplicate RPC work.
  if (ownedPokedexRequest) return ownedPokedexRequest;
  ownedPokedexRequest = (async () => {
    const { data, error } = await supabase.rpc('get_my_owned_pokedex_numbers');
    if (error) throw error;
    return Array.isArray(data)
      ? data.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
      : [];
  })();
  try {
    return await ownedPokedexRequest;
  } finally {
    ownedPokedexRequest = null;
  }
}

export async function getPokemonCardVersions(pokedexNumber: number): Promise<PokemonCardVersion[]> {
  const cached = pokemonVersionsCache.get(pokedexNumber);
  if (cached) {
    // Refresh insertion order so the map behaves as a small LRU cache.
    pokemonVersionsCache.delete(pokedexNumber);
    pokemonVersionsCache.set(pokedexNumber, cached);
    return cached;
  }

  const existing = pokemonVersionsRequests.get(pokedexNumber);
  if (existing) return existing;

  const request = (async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('id,pokemon_name,set_id,set_name,card_number,rarity,types,image_small,image_large')
      .contains('pokedex_numbers', [pokedexNumber])
      .order('set_name', { ascending: false })
      .limit(500);

    if (error) throw error;
    const rows = (data ?? []) as PokemonCardVersion[];
    pokemonVersionsCache.set(pokedexNumber, rows);
    while (pokemonVersionsCache.size > MAX_VERSION_CACHE_ENTRIES) {
      const oldestKey = pokemonVersionsCache.keys().next().value as number | undefined;
      if (oldestKey == null) break;
      pokemonVersionsCache.delete(oldestKey);
    }
    return rows;
  })();

  pokemonVersionsRequests.set(pokedexNumber, request);
  try {
    return await request;
  } finally {
    if (pokemonVersionsRequests.get(pokedexNumber) === request) {
      pokemonVersionsRequests.delete(pokedexNumber);
    }
  }
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
