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
    avatarPath: string | null;
    level: number;
    battleWins: number;
    battleLosses: number;
    battleStreak: number;
    battleRating: number | null;
    showBattleRating: boolean;
    equippedTitle: { id: string; title: string; icon: string } | null;
    economyTitle: { id:string; title:string; icon:string; rarity:string } | null;
    prestige: { level:number; stars:number; totalSpentCoins:number };
    guild: { id: string; name: string; color: string; role: 'leader' | 'officer' | 'member'; level: number; xp: number } | null;
    frame: { id:string; name:string; primaryColor:string; secondaryColor:string; icon:string } | null;
    background: { id:string; name:string; primaryColor:string; secondaryColor:string; icon:string } | null;
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
    museum: {
      level:number;
      slots:number;
      cards:Array<{
        slot:number;
        id:string;
        name:string;
        setName:string;
        rarity:string|null;
        imageSmall:string|null;
        imageLarge:string|null;
        marketPriceUsd:number|null;
        style:{id:string;name:string;icon:string;rarity:string}|null;
      }>;
    };
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
      avatarPath: value.player?.avatarPath ?? null,
      level: Number(value.player?.level ?? 1),
      battleWins: Number(value.player?.battleWins ?? 0),
      battleLosses: Number(value.player?.battleLosses ?? 0),
      battleStreak: Number(value.player?.battleStreak ?? 0),
      battleRating: value.player?.battleRating == null ? null : Number(value.player.battleRating),
      economyTitle: value.player?.economyTitle ?? null,
      prestige: {
        level:Number(value.player?.prestige?.level??0),
        stars:Number(value.player?.prestige?.stars??0),
        totalSpentCoins:Number(value.player?.prestige?.totalSpentCoins??0),
      },
      guild: value.player?.guild ? {
        ...value.player.guild,
        level: Number(value.player.guild.level ?? 1),
        xp: Number(value.player.guild.xp ?? 0),
      } : null,
      frame: value.player?.frame ?? null,
      background: value.player?.background ?? null,
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
      museum: {
        level:Number(value.collection?.museum?.level??0),
        slots:Number(value.collection?.museum?.slots??3),
        cards:Array.isArray(value.collection?.museum?.cards)
          ? value.collection.museum.cards.map((card:any)=>({
            ...card,
            slot:Number(card.slot??0),
            marketPriceUsd:card.marketPriceUsd==null?null:Number(card.marketPriceUsd),
            style:card.style??null,
          }))
          : [],
      },
    },
  };
}
