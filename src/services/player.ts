import { supabase } from '../lib/supabase';

export type PlayerProfile = {
  id: string;
  username: string;
  coins: number;
  diamonds: number;
  profile_icon: string;
  avatar_path: string | null;
  avatar_updated_at: string | null;
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
  inventory_quantity?: number;
  marketplace_quantity?: number;
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
    battle_damage?: number;
    battle_profile?: {
      hp: number;
      maxDamage: number;
      minEnergy: number;
      bestEnergy: number;
      retreatCost: number;
      attackCount: number;
      abilityCount: number;
      effectAttackCount: number;
      damagePerEnergy: number;
      efficiencyScore: number;
      speedScore: number;
      techniqueScore: number;
      battleRating: number;
    };
    market_price_usd: number | null;
    market_price_low_usd: number | null;
    market_price_high_usd: number | null;
    market_price_variant: string | null;
    market_price_source: string | null;
    market_price_updated_at: string | null;
    tcg_data?: Record<string, unknown>;
  } | null;
};


export type CardDetailEntry = {
  owned: boolean;
  quantity: number;
  favorite: boolean;
  first_obtained_at: string | null;
  cards: NonNullable<OwnedCardEntry['cards']>;
};

export async function getMyProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('players')
    .select('id, username, coins, diamonds, profile_icon, avatar_path, avatar_updated_at, level, xp, battle_rating, battle_wins, battle_losses, battle_streak, best_battle_streak, equipped_title_id, equipped_title:achievement_definitions!players_equipped_title_id_fkey(id,title,icon), equipped_frame_id, equipped_background_id, equipped_frame:cosmetic_definitions!players_equipped_frame_id_fkey(id,name,primary_color,secondary_color), equipped_background:cosmetic_definitions!players_equipped_background_id_fkey(id,name,primary_color,secondary_color), show_battle_rating, created_at, last_daily_claim_at, account_status, suspended_until, moderation_reason, warning_count')
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

const PROFILE_MEDIA_BUCKET = 'profile-media';
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export function getProfileAvatarUrl(avatarPath?: string | null, updatedAt?: string | null) {
  if (!avatarPath) return null;
  const { data } = supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(avatarPath);
  const publicUrl = data?.publicUrl ?? null;
  if (!publicUrl) return null;
  if (!updatedAt) return publicUrl;
  const separator = publicUrl.includes('?') ? '&' : '?';
  return `${publicUrl}${separator}v=${encodeURIComponent(updatedAt)}`;
}

function base64ToArrayBuffer(value: string) {
  const clean = value
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s+/g, '');

  if (!clean || clean.length % 4 !== 0) {
    throw new Error('A imagem selecionada está em um formato inválido.');
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding);
  let offset = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index]);
    const b = alphabet.indexOf(clean[index + 1]);
    const c = clean[index + 2] === '=' ? 0 : alphabet.indexOf(clean[index + 2]);
    const d = clean[index + 3] === '=' ? 0 : alphabet.indexOf(clean[index + 3]);

    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throw new Error('A imagem selecionada está em um formato inválido.');
    }

    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < bytes.length) bytes[offset++] = (chunk >> 16) & 0xff;
    if (offset < bytes.length) bytes[offset++] = (chunk >> 8) & 0xff;
    if (offset < bytes.length) bytes[offset++] = chunk & 0xff;
  }

  return bytes.buffer;
}

export async function uploadMyProfileAvatar(input: {
  base64: string;
  mimeType?: string | null;
  previousPath?: string | null;
}) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const playerId = auth.user?.id;
  if (!playerId) throw new Error('Usuário não autenticado.');

  const body = base64ToArrayBuffer(input.base64);
  if (body.byteLength <= 0) throw new Error('A imagem selecionada está vazia.');
  if (body.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error('A foto precisa ter no máximo 5 MB.');
  }

  const normalizedMime = String(input.mimeType ?? 'image/jpeg').toLowerCase();
  const mimeMap: Record<string, { mime: string; ext: string }> = {
    'image/jpeg': { mime: 'image/jpeg', ext: 'jpg' },
    'image/jpg': { mime: 'image/jpeg', ext: 'jpg' },
    'image/png': { mime: 'image/png', ext: 'png' },
    'image/webp': { mime: 'image/webp', ext: 'webp' },
  };
  const selectedType = mimeMap[normalizedMime] ?? mimeMap['image/jpeg'];
  const path = `${playerId}/avatar-${Date.now()}.${selectedType.ext}`;
  const storage = supabase.storage.from(PROFILE_MEDIA_BUCKET);
  const { error: uploadError } = await storage.upload(path, body, {
    contentType: selectedType.mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: avatarError } = await supabase.rpc('set_my_profile_avatar', {
    p_avatar_path: path,
  });

  if (avatarError) {
    await storage.remove([path]).catch(() => null);
    throw avatarError;
  }

  if (input.previousPath && input.previousPath !== path) {
    await storage.remove([input.previousPath]).catch(() => null);
  }

  const updatedAt = new Date().toISOString();
  return {
    path,
    updatedAt,
    publicUrl: getProfileAvatarUrl(path, updatedAt),
  };
}

export async function removeMyProfileAvatar(previousPath?: string | null) {
  const { error } = await supabase.rpc('set_my_profile_avatar', {
    p_avatar_path: null,
  });
  if (error) throw error;

  if (previousPath) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET).remove([previousPath]).catch(() => null);
  }

  return { path: null as string | null, updatedAt: new Date().toISOString() };
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

export async function getMyLegacyCardPool(): Promise<OwnedCardEntry[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const [bag, listingResult] = await Promise.all([
    getMyBag(),
    supabase
      .from('market_listings')
      .select('quantity,created_at,cards(id,pokemon_name,pokedex_numbers,set_id,set_name,card_number,rarity,types,image_small,image_large,game_value,market_price_usd,market_price_low_usd,market_price_high_usd,market_price_variant,market_price_source,market_price_updated_at,tcg_data)')
      .eq('seller_id', userId)
      .eq('status', 'active'),
  ]);

  if (listingResult.error) throw listingResult.error;

  const merged = new Map<string, OwnedCardEntry>();

  for (const entry of bag) {
    const cardId = entry.cards?.id;
    if (!cardId) continue;
    merged.set(cardId, {
      ...entry,
      quantity: Number(entry.quantity ?? 0),
      inventory_quantity: Number(entry.quantity ?? 0),
      marketplace_quantity: 0,
    });
  }

  for (const row of (listingResult.data ?? []) as any[]) {
    const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
    const cardId = card?.id ? String(card.id) : '';
    const listedQuantity = Math.max(0, Number(row.quantity ?? 0));
    if (!cardId || !listedQuantity) continue;

    const existing = merged.get(cardId);
    if (existing) {
      existing.quantity += listedQuantity;
      existing.marketplace_quantity = Number(existing.marketplace_quantity ?? 0) + listedQuantity;
      continue;
    }

    merged.set(cardId, {
      quantity: listedQuantity,
      inventory_quantity: 0,
      marketplace_quantity: listedQuantity,
      favorite: false,
      first_obtained_at: String(row.created_at ?? new Date(0).toISOString()),
      cards: card as OwnedCardEntry['cards'],
    });
  }

  return [...merged.values()].sort(
    (a, b) => new Date(b.first_obtained_at).getTime() - new Date(a.first_obtained_at).getTime(),
  );
}

export async function getCardDetail(cardId: string): Promise<CardDetailEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const [cardResult, ownershipResult] = await Promise.all([
    supabase
      .from('cards')
      .select('id, pokemon_name, pokedex_numbers, set_id, set_name, card_number, rarity, types, image_small, image_large, game_value, market_price_usd, market_price_low_usd, market_price_high_usd, market_price_variant, market_price_source, market_price_updated_at, tcg_data')
      .eq('id', cardId)
      .single(),
    supabase
      .from('player_cards')
      .select('quantity,favorite,first_obtained_at')
      .eq('player_id', userId)
      .eq('card_id', cardId)
      .gt('quantity', 0)
      .maybeSingle(),
  ]);

  if (cardResult.error) throw cardResult.error;
  if (ownershipResult.error) throw ownershipResult.error;

  const ownership = ownershipResult.data;
  return {
    owned: Boolean(ownership),
    quantity: Number(ownership?.quantity ?? 0),
    favorite: Boolean(ownership?.favorite ?? false),
    first_obtained_at: ownership?.first_obtained_at ?? null,
    cards: cardResult.data as CardDetailEntry['cards'],
  };
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

