import { supabase } from '../lib/supabase';

export type PlayerProfile = {
  id: string;
  username: string;
  coins: number;
  level: number;
  xp: number;
  created_at: string;
};

export async function getMyProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('players')
    .select('id, username, coins, level, xp, created_at')
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
  return data;
}

export async function findPlayers(username: string) {
  const term = username.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase
    .from('players')
    .select('id, username, level')
    .ilike('username', `%${term}%`)
    .limit(20);

  if (error) throw error;
  return data;
}
