import { supabase } from '@/lib/supabase';

export type PublicRareCard = {
  id: string;
  name: string;
  setName: string;
  rarity: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  marketPriceUsd: number | null;
  quantity: number;
  rarity_tier: number;
};

export type PublicPlayerProfile = {
  player: {
    id: string;
    username: string;
    profileIcon: string;
    level: number;
    battleWins: number;
    battleLosses: number;
    battleStreak: number;
    battleRating: number | null;
    showBattleRating: boolean;
    equippedTitle: { id: string; title: string; icon: string } | null;
    guild: { id: string; name: string; color: string; role: 'leader' | 'officer' | 'member'; level: number; xp: number } | null;
  };
  collection: {
    uniqueCards: number;
    totalCopies: number;
    totalValueUsd: number;
    rarestCards: PublicRareCard[];
    showcase: Array<{
      slot: number;
      id: string;
      name: string;
      setName: string;
      rarity: string | null;
      imageSmall: string | null;
      imageLarge: string | null;
      marketPriceUsd: number | null;
    }>;
  };
};

export async function getPublicPlayerProfile(playerId: string): Promise<PublicPlayerProfile> {
  const { data, error } = await supabase.rpc('get_public_player_profile', {
    p_player_id: playerId,
  });
  if (error) throw error;
  const value = data as any;
  return {
    player: {
      ...value.player,
      level: Number(value.player?.level ?? 1),
      battleWins: Number(value.player?.battleWins ?? 0),
      battleLosses: Number(value.player?.battleLosses ?? 0),
      battleStreak: Number(value.player?.battleStreak ?? 0),
      battleRating: value.player?.battleRating == null ? null : Number(value.player.battleRating),
      guild: value.player?.guild ? {
        ...value.player.guild,
        level: Number(value.player.guild.level ?? 1),
        xp: Number(value.player.guild.xp ?? 0),
      } : null,
    },
    collection: {
      uniqueCards: Number(value.collection?.uniqueCards ?? 0),
      totalCopies: Number(value.collection?.totalCopies ?? 0),
      totalValueUsd: Number(value.collection?.totalValueUsd ?? 0),
      rarestCards: Array.isArray(value.collection?.rarestCards)
        ? value.collection.rarestCards.map((card: any) => ({
          ...card,
          marketPriceUsd: card.marketPriceUsd == null ? null : Number(card.marketPriceUsd),
          quantity: Number(card.quantity ?? 0),
          rarity_tier: Number(card.rarity_tier ?? 0),
        }))
        : [],
      showcase: Array.isArray(value.collection?.showcase)
        ? value.collection.showcase.map((card: any) => ({
          ...card,
          slot: Number(card.slot ?? 0),
          marketPriceUsd: card.marketPriceUsd == null ? null : Number(card.marketPriceUsd),
        }))
        : [],
    },
  };
}
