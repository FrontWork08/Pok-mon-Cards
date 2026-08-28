import { supabase } from '@/lib/supabase';

export type SeasonStanding = {
  rank: number;
  playerId: string;
  username: string;
  points: number;
  wins: number;
  matches: number;
};

export type SeasonInfo = {
  id: string;
  name: string;
  subtitle: string;
  themeColor: string;
  startsAt: string;
  endsAt: string;
  rewardConfig: Record<string, { points: number; coins: number; diamonds: number }>;
  my: {
    points: number;
    wins: number;
    losses: number;
    matches: number;
    bestStreak: number;
    rewardClaimed: boolean;
  };
  top: SeasonStanding[];
};

export type RetentionHub = {
  season: SeasonInfo | null;
  login: {
    currentStreak: number;
    bestStreak: number;
    totalClaims: number;
    lastClaimDate: string | null;
    claimedToday: boolean;
  };
  wishlistCount: number;
  milestoneClaims: Array<{ kind: string; key: string; claimedAt: string }>;
  guild: { id: string; name: string; level: number; xp: number; color: string } | null;
  activeEvents: Array<{ id: string; type: string; startsAt: string; endsAt: string; payload: Record<string, unknown> }>;
};

export function seasonDivision(points = 0) {
  if (points >= 2600) return { id: 'grand', label: 'Grand', icon: '♛', min: 2600, next: null as number | null };
  if (points >= 1800) return { id: 'master', label: 'Master', icon: '★', min: 1800, next: 2600 };
  if (points >= 1200) return { id: 'platinum', label: 'Platinum', icon: '✧', min: 1200, next: 1800 };
  if (points >= 700) return { id: 'gold', label: 'Gold', icon: '◆', min: 700, next: 1200 };
  if (points >= 300) return { id: 'silver', label: 'Silver', icon: '◇', min: 300, next: 700 };
  return { id: 'bronze', label: 'Bronze', icon: '●', min: 0, next: 300 };
}

export async function getRetentionHub(): Promise<RetentionHub> {
  const { data, error } = await supabase.rpc('get_retention_hub');
  if (error) throw error;
  const raw = data ?? {};
  return {
    season: raw.season ?? null,
    login: {
      currentStreak: Number(raw.login?.currentStreak ?? 0),
      bestStreak: Number(raw.login?.bestStreak ?? 0),
      totalClaims: Number(raw.login?.totalClaims ?? 0),
      lastClaimDate: raw.login?.lastClaimDate ?? null,
      claimedToday: Boolean(raw.login?.claimedToday),
    },
    wishlistCount: Number(raw.wishlistCount ?? 0),
    milestoneClaims: Array.isArray(raw.milestoneClaims) ? raw.milestoneClaims : [],
    guild: raw.guild ? {
      ...raw.guild,
      level: Number(raw.guild.level ?? 1),
      xp: Number(raw.guild.xp ?? 0),
    } : null,
    activeEvents: Array.isArray(raw.activeEvents) ? raw.activeEvents : [],
  };
}

export async function claimDailyLogin() {
  const { data, error } = await supabase.rpc('claim_daily_login');
  if (error) throw error;
  return data as {
    claimed: boolean;
    streak: number;
    bestStreak: number;
    cycleDay?: number;
    coins: number;
    diamonds: number;
    nextClaimDate?: string;
  };
}

export async function claimCollectionMilestone(kind: 'pokedex_total'|'pokedex_gen'|'set_complete', key: string) {
  const { data, error } = await supabase.rpc('claim_collection_milestone', { p_kind: kind, p_key: key });
  if (error) throw error;
  return data as { kind: string; key: string; progress: number; target: number; coins: number; diamonds: number };
}

export async function claimSeasonReward() {
  const { data, error } = await supabase.rpc('claim_season_reward');
  if (error) throw error;
  return data as { seasonId: string; tier: string; coins: number; diamonds: number };
}

export type WishlistCard = {
  cardId: string;
  priority: number;
  notifyMarket: boolean;
  createdAt: string;
  card: {
    id: string;
    name: string;
    setId: string;
    setName: string;
    rarity: string | null;
    image: string | null;
    marketPriceUsd: number | null;
  };
};

export async function getWishlist(): Promise<WishlistCard[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('card_wishlist')
    .select('card_id,priority,notify_market,created_at,cards(id,pokemon_name,set_id,set_name,rarity,image_small,market_price_usd)')
    .eq('player_id', userId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const rel = Array.isArray(row.cards) ? row.cards[0] : row.cards;
    return {
      cardId: row.card_id,
      priority: Number(row.priority ?? 1),
      notifyMarket: Boolean(row.notify_market),
      createdAt: row.created_at,
      card: {
        id: rel?.id ?? row.card_id,
        name: rel?.pokemon_name ?? 'Carta',
        setId: rel?.set_id ?? '',
        setName: rel?.set_name ?? '',
        rarity: rel?.rarity ?? null,
        image: rel?.image_small ?? null,
        marketPriceUsd: rel?.market_price_usd == null ? null : Number(rel.market_price_usd),
      },
    };
  });
}

export async function isCardWishlisted(cardId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return false;
  const { data, error } = await supabase
    .from('card_wishlist')
    .select('card_id')
    .eq('player_id', userId)
    .eq('card_id', cardId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function setCardWishlist(cardId: string, wanted: boolean, priority = 2) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sessão não encontrada.');
  if (wanted) {
    const { error } = await supabase.from('card_wishlist').upsert({
      player_id: userId,
      card_id: cardId,
      priority,
      notify_market: true,
    }, { onConflict: 'player_id,card_id' });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('card_wishlist')
    .delete().eq('player_id', userId).eq('card_id', cardId);
  if (error) throw error;
}

export async function searchWishlistCards(term: string) {
  const q = term.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('cards')
    .select('id,pokemon_name,set_id,set_name,rarity,image_small,market_price_usd')
    .ilike('pokemon_name', `%${q}%`)
    .order('market_price_usd', { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

export async function getMyShowcase() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('profile_showcase')
    .select('slot,card_id,cards(id,pokemon_name,rarity,image_small,market_price_usd)')
    .eq('player_id', userId)
    .order('slot');
  if (error) throw error;
  return data ?? [];
}

export async function setShowcaseCard(slot: number, cardId: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sessão não encontrada.');
  if (!cardId) {
    const { error } = await supabase.from('profile_showcase').delete().eq('player_id', userId).eq('slot', slot);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('profile_showcase').upsert({
    player_id: userId, slot, card_id: cardId, updated_at: new Date().toISOString(),
  }, { onConflict: 'player_id,slot' });
  if (error) throw error;
}
