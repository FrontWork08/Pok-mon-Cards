import { supabase } from '@/lib/supabase';

export type CardGameMove = {
  id: number;
  identifier: string;
  type: string;
  category: 'physical' | 'special' | 'status' | string;
  power: number | null;
  pp: number;
  accuracy: number | null;
  priority: number;
  ailment: string | null;
  ailmentChance: number;
  flinchChance: number;
  healing: number;
  drain: number;
  critRate: number;
  statChanges: Array<{ statId?: number; change?: number }>;
};

export type CardGameProfile = {
  identifier: string;
  pokemonId: number;
  speciesId: number;
  types: string[];
  ability: string | null;
  stats: {
    hp: number;
    level: number;
    speed: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
  };
  moves: CardGameMove[];
  sourceVersionGroup: number;
};

export async function getCardGameProfile(cardId: string): Promise<CardGameProfile | null> {
  const { data, error } = await supabase.rpc('get_card_game_profile', { p_card_id: cardId });
  if (error) throw error;
  return (data ?? null) as CardGameProfile | null;
}

export function formatGameIdentifier(value: string | null | undefined) {
  return String(value ?? '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
