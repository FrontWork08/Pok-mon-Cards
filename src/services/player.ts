import { supabase } from '../lib/supabase';

export type PlayerProfile = {
  id: string;
  username: string;
  coins: number;
  level: number;
  xp: number;
  created_at: string;
  last_daily_claim_at: string | null;
};

export type OwnedCardEntry = {
  quantity: number;
  favorite: boolean;
  first_obtained_at: string;
  cards: {
    id: string;
    pokemon_name: string;
    pokedex_numbers: number[];
    set_id: string;
    set_name: string;
    card_number: string | null;
    rarity: string | null;
    types: string[];
    image_small: string | null;
    image_large: string | null;
    tcg_data?: Record<string, unknown>;
  } | null;
};

export async function getMyProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('players')
    .select('id, username, coins, level, xp, created_at, last_daily_claim_at')
    .eq('id', userData.user.id)
    .single();

  if (error) throw error;
  return data as PlayerProfile;
}

export async function getMyBag(search?: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  let query = supabase
    .from('player_cards')
    .select('quantity, favorite, first_obtained_at, cards(id, pokemon_name, pokedex_numbers, set_id, set_name, card_number, rarity, types, image_small, image_large)')
    .eq('player_id', userData.user.id)
    .gt('quantity', 0)
    .order('first_obtained_at', { ascending: false });

  if (search?.trim()) {
    query = query.ilike('cards.pokemon_name', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as OwnedCardEntry[];
}

export async function getOwnedCard(cardId: string): Promise<OwnedCardEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('player_cards')
    .select('quantity, favorite, first_obtained_at, cards(id, pokemon_name, pokedex_numbers, set_id, set_name, card_number, rarity, types, image_small, image_large, tcg_data)')
    .eq('player_id', userData.user.id)
    .eq('card_id', cardId)
    .gt('quantity', 0)
    .single();

  if (error) throw error;
  return data as unknown as OwnedCardEntry;
}

export async function findPlayers(username: string) {
  const term = username.trim();
  if (term.length < 2) return [];

  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;

  let query = supabase
    .from('players')
    .select('id, username, level')
    .ilike('username', `%${term}%`)
    .limit(20);

  if (myId) query = query.neq('id', myId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getMyProfileStats() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error('Usuário não autenticado.');

  const [bag, openings, trades] = await Promise.all([
    getMyBag(),
    supabase.from('pack_openings').select('id', { count: 'exact', head: true }).eq('player_id', user.id),
    supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'completed').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
  ]);

  const totalCards = bag.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const uniqueCards = bag.length;
  const favorites = bag.filter((item) => item.favorite).length;
  const species = new Set(
    bag.map((item) => item.cards?.pokedex_numbers?.[0]).filter((value): value is number => typeof value === 'number')
  ).size;

  return {
    totalCards,
    uniqueCards,
    favorites,
    species,
    packsOpened: openings.count ?? 0,
    completedTrades: trades.count ?? 0,
  };
}
