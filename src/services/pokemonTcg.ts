const BASE_URL = 'https://api.pokemontcg.io/v2';

export type PokemonCard = {
  id: string;
  name: string;
  supertype: string;
  types?: string[];
  rarity?: string;
  number: string;
  nationalPokedexNumbers?: number[];
  images: { small: string; large: string };
  set: { id: string; name: string };
};

export async function fetchPokemonCards(page = 1, pageSize = 250) {
  const apiKey = process.env.EXPO_PUBLIC_POKEMON_TCG_API_KEY;
  const query = encodeURIComponent('supertype:Pokémon');
  const response = await fetch(`${BASE_URL}/cards?q=${query}&page=${page}&pageSize=${pageSize}`, {
    headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
  });

  if (!response.ok) throw new Error(`Pokémon TCG API error: ${response.status}`);

  const payload = await response.json();
  return {
    cards: payload.data as PokemonCard[],
    page: payload.page as number,
    pageSize: payload.pageSize as number,
    count: payload.count as number,
    totalCount: payload.totalCount as number,
  };
}
