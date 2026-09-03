import { supabase } from '@/lib/supabase';
import { findPlayers } from '@/services/player';
import { getGuildHub } from '@/services/guilds';
import { getSetCatalog } from '@/services/collections';
import { getMyDecks } from '@/services/decks';
import { getTournamentHub } from '@/services/tournaments';

export type GlobalCardResult = {
  id: string;
  name: string;
  setName: string;
  rarity: string | null;
  imageSmall: string | null;
  gameTypes: string[];
  marketPriceUsd: number | null;
};

export type GlobalPlayerResult = {
  id: string;
  username: string;
  level: number;
  battleRating: number;
  profileIcon: string | null;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
};

export type GlobalGuildResult = {
  id: string;
  name: string;
  motto: string;
  color: string;
  memberCount: number;
  rank: number;
};

export type GlobalSetResult = {
  id:string;
  name:string;
  totalCards:number;
  image:string|null;
};

export type GlobalDeckResult = {
  id:string;
  name:string;
  cardCount:number;
  isDefault:boolean;
};

export type GlobalTournamentResult = {
  id:string;
  name:string;
  status:string;
  joined:boolean;
  entries:number;
  maxPlayers:number;
  prizePoolCoins:number;
};

export async function globalSearch(query: string) {
  const term = query.trim();
  if (term.length < 2) {
    return {
      cards: [] as GlobalCardResult[],
      players: [] as GlobalPlayerResult[],
      guilds: [] as GlobalGuildResult[],
      sets: [] as GlobalSetResult[],
      decks: [] as GlobalDeckResult[],
      tournaments: [] as GlobalTournamentResult[],
    };
  }

  const [cardResult, playersResult, guildResult, setResult, deckResult, tournamentResult] = await Promise.all([
    supabase
      .from('cards')
      .select('id,pokemon_name,set_name,rarity,image_small,game_types,market_price_usd')
      .ilike('pokemon_name', `%${term}%`)
      .order('market_price_usd', { ascending: false, nullsFirst: false })
      .limit(20),
    findPlayers(term).catch(() => []),
    getGuildHub().catch(() => null),
    getSetCatalog().catch(() => []),
    getMyDecks().catch(() => []),
    getTournamentHub().catch(() => null),
  ]);

  if (cardResult.error) throw cardResult.error;

  const cards = (cardResult.data ?? []).map((row: any): GlobalCardResult => ({
    id: String(row.id),
    name: String(row.pokemon_name ?? 'Pokémon'),
    setName: String(row.set_name ?? ''),
    rarity: row.rarity ? String(row.rarity) : null,
    imageSmall: row.image_small ? String(row.image_small) : null,
    gameTypes: Array.isArray(row.game_types) ? row.game_types.map(String) : [],
    marketPriceUsd: row.market_price_usd == null ? null : Number(row.market_price_usd),
  }));

  const players = (playersResult ?? []).map((row: any): GlobalPlayerResult => ({
    id: String(row.id),
    username: String(row.username ?? 'Treinador'),
    level: Number(row.level ?? 1),
    battleRating: Number(row.battle_rating ?? 1000),
    profileIcon: row.profile_icon ? String(row.profile_icon) : null,
    avatarPath: row.avatar_path ? String(row.avatar_path) : null,
    avatarUpdatedAt: row.avatar_updated_at ? String(row.avatar_updated_at) : null,
  }));

  const lower = term.toLocaleLowerCase('pt-BR');
  const guilds = (guildResult?.guilds ?? [])
    .filter((guild) => guild.name.toLocaleLowerCase('pt-BR').includes(lower) || guild.motto.toLocaleLowerCase('pt-BR').includes(lower))
    .slice(0, 8)
    .map((guild): GlobalGuildResult => ({
      id: guild.id,
      name: guild.name,
      motto: guild.motto,
      color: guild.color,
      memberCount: guild.memberCount,
      rank: guild.rank,
    }));

  const sets = (setResult ?? [])
    .filter((set) => set.set_name.toLocaleLowerCase('pt-BR').includes(lower) || set.set_id.toLocaleLowerCase('pt-BR').includes(lower))
    .slice(0, 12)
    .map((set):GlobalSetResult => ({
      id:set.set_id,
      name:set.set_name,
      totalCards:Number(set.total_cards??0),
      image:set.representative_image??null,
    }));

  const decks = (deckResult ?? [])
    .filter((deck:any) => String(deck.name??'').toLocaleLowerCase('pt-BR').includes(lower))
    .slice(0, 10)
    .map((deck:any):GlobalDeckResult => ({
      id:String(deck.id),
      name:String(deck.name??'Deck'),
      cardCount:Array.isArray(deck.deck_cards)?deck.deck_cards.reduce((sum:number,row:any)=>sum+Number(row.quantity??0),0):0,
      isDefault:Boolean(deck.is_default),
    }));

  const tournaments = tournamentResult && (
    tournamentResult.name.toLocaleLowerCase('pt-BR').includes(lower)
    || 'copa trainer torneio tournament campeonato'.includes(lower)
    || lower.includes('copa')
    || lower.includes('torneio')
  ) ? [{
    id:tournamentResult.id,
    name:tournamentResult.name,
    status:tournamentResult.status,
    joined:tournamentResult.joined,
    entries:tournamentResult.entries.length,
    maxPlayers:tournamentResult.maxPlayers,
    prizePoolCoins:tournamentResult.prizePoolCoins,
  } as GlobalTournamentResult] : [];

  return { cards, players, guilds, sets, decks, tournaments };
}
