import { supabase } from '../lib/supabase';

export type PlayerProfile = {
  id: string;
  username: string;
  coins: number;
  diamonds: number;
  profile_icon: string;
  level: number;
  xp: number;
  battle_rating: number;
  battle_wins: number;
  battle_losses: number;
  battle_streak: number;
  best_battle_streak: number;
  equipped_title_id: string | null;
  equipped_title: { id: string; title: string; icon: string } | Array<{ id: string; title: string; icon: string }> | null;
  equipped_frame_id: string | null;
  equipped_background_id: string | null;
  equipped_frame: { id:string; name:string; primary_color:string; secondary_color:string } | Array<{ id:string; name:string; primary_color:string; secondary_color:string }> | null;
  equipped_background: { id:string; name:string; primary_color:string; secondary_color:string } | Array<{ id:string; name:string; primary_color:string; secondary_color:string }> | null;
  show_battle_rating: boolean;
  created_at: string;
  last_daily_claim_at: string | null;
  account_status: 'active' | 'suspended' | 'banned';
  suspended_until: string | null;
  moderation_reason: string | null;
  warning_count: number;
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
    game_value: number;
    market_price_usd: number | null;
    market_price_low_usd: number | null;
    market_price_high_usd: number | null;
    market_price_variant: string | null;
    market_price_source: string | null;
    market_price_updated_at: string | null;
    tcg_data?: Record<string, unknown>;
  } | null;
};

export async function getMyProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('players')
    .select('id, username, coins, diamonds, profile_icon, level, xp, battle_rating, battle_wins, battle_losses, battle_streak, best_battle_streak, equipped_title_id, equipped_title:achievement_definitions!players_equipped_title_id_fkey(id,title,icon), show_battle_rating, created_at, last_daily_claim_at, account_status, suspended_until, moderation_reason, warning_count')
    .eq('id', userData.user.id)
    .single();

  if (error) throw error;
  return data as PlayerProfile;
}

export async function setMyProfileIcon(profileIcon: string) {
  const { data, error } = await supabase.rpc('set_profile_icon', { p_icon: profileIcon });
  if (error) throw error;
  return String(data);
}

export async function getMyBag(search?: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  let query = supabase
    .from('player_cards')
    .select('quantity, favorite, first_obtained_at, cards(id, pokemon_name, pokedex_numbers, set_id, set_name, card_number, rarity, types, image_small, image_large, game_value, market_price_usd, market_price_low_usd, market_price_high_usd, market_price_variant, market_price_source, market_price_updated_at, tcg_data)')
    .eq('player_id', userData.user.id)
    .gt('quantity', 0)
    .order('first_obtained_at', { ascending: false });

  if (search?.trim()) query = query.ilike('cards.pokemon_name', `%${search.trim()}%`);
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
    .select('quantity, favorite, first_obtained_at, cards(id, pokemon_name, pokedex_numbers, set_id, set_name, card_number, rarity, types, image_small, image_large, game_value, market_price_usd, market_price_low_usd, market_price_high_usd, market_price_variant, market_price_source, market_price_updated_at, tcg_data)')
    .eq('player_id', userData.user.id).eq('card_id', cardId).gt('quantity', 0).single();
  if (error) throw error;
  return data as unknown as OwnedCardEntry;
}

export async function findPlayers(username: string) {
  const term = username.trim();
  if (term.length < 2) return [];
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;
  let query = supabase.from('players').select('id, username, level, battle_rating, show_battle_rating, equipped_title_id').ilike('username', `%${term}%`).limit(20);
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
  const species = new Set(bag.map((item) => item.cards?.pokedex_numbers?.[0]).filter((value): value is number => typeof value === 'number')).size;
  const collectionValue = bag.reduce((sum, item) => sum + Number(item.cards?.game_value ?? 0) * Number(item.quantity ?? 0), 0);
  const collectionMarketValueUsd = bag.reduce((sum, item) => sum + Number(item.cards?.market_price_usd ?? 0) * Number(item.quantity ?? 0), 0);
  const totalCardCopies = bag.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const pricedCardCopies = bag.reduce((sum, item) => item.cards?.market_price_usd == null ? sum : sum + Number(item.quantity ?? 0), 0);
  const priceCoveragePct = totalCardCopies > 0 ? (pricedCardCopies / totalCardCopies) * 100 : 0;
  const mostValuable = bag.reduce<OwnedCardEntry | null>((best, item) => {
    if (!item.cards) return best;
    if (!best?.cards || Number(item.cards.game_value ?? 0) > Number(best.cards.game_value ?? 0)) return item;
    return best;
  }, null);
  const mostValuableMarket = bag.reduce<OwnedCardEntry | null>((best, item) => {
    if (!item.cards?.market_price_usd) return best;
    if (!best?.cards || Number(item.cards.market_price_usd ?? 0) > Number(best.cards.market_price_usd ?? 0)) return item;
    return best;
  }, null);
  return {
    totalCards,
    uniqueCards,
    favorites,
    species,
    collectionValue,
    collectionMarketValueUsd,
    pricedCardCopies,
    totalCardCopies,
    priceCoveragePct,
    mostValuableCard: mostValuable?.cards ?? null,
    mostValuableMarketCard: mostValuableMarket?.cards ?? null,
    packsOpened: openings.count ?? 0,
    completedTrades: trades.count ?? 0,
  };
}
