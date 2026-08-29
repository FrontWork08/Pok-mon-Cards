import { supabase } from '@/lib/supabase';

export type DuplicateSaleCard = {
  quantity: number;
  cards: {
    id: string;
    pokemon_name: string;
    set_name: string;
    rarity: string | null;
    image_small: string | null;
    market_price_usd: number | null;
    market_price_source: string | null;
  } | null;
};

export type DuplicateSaleResult = {
  ok: boolean;
  cardId: string;
  quantitySold: number;
  remainingQuantity: number;
  marketPriceUsd: number;
  unitCoins: number;
  coinsEarned: number;
  coins: number;
};

export function coinsForDuplicateMarketPrice(priceUsd?: number | null) {
  const value = Number(priceUsd ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(10, Math.round((value * 200) / 10) * 10);
}

export async function getDuplicateCardsForSale(): Promise<DuplicateSaleCard[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = auth.user?.id;
  if (!userId) throw new Error('Sessão não encontrada.');

  const { data, error } = await supabase
    .from('player_cards')
    .select('quantity,cards(id,pokemon_name,set_name,rarity,image_small,market_price_usd,market_price_source)')
    .eq('player_id', userId)
    .gt('quantity', 1)
    .order('quantity', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const relation = Array.isArray(row.cards) ? row.cards[0] : row.cards;
    return {
      quantity: Number(row.quantity ?? 0),
      cards: relation ? {
        id: String(relation.id),
        pokemon_name: String(relation.pokemon_name ?? 'Carta'),
        set_name: String(relation.set_name ?? ''),
        rarity: relation.rarity ?? null,
        image_small: relation.image_small ?? null,
        market_price_usd: relation.market_price_usd == null ? null : Number(relation.market_price_usd),
        market_price_source: relation.market_price_source ?? null,
      } : null,
    };
  }).filter((row) => row.cards && row.quantity > 1);
}

function duplicateSaleError(message: string) {
  const known: Array<[string, string]> = [
    ['APP_MAINTENANCE', 'As vendas estão pausadas enquanto o jogo está em manutenção.'],
    ['NO_DUPLICATES', 'Você não possui uma cópia repetida desta carta.'],
    ['KEEP_ONE_COPY', 'A primeira cópia é protegida. Só é possível vender as repetidas.'],
    ['CARD_WITHOUT_MARKET_PRICE', 'Esta carta ainda não possui preço de mercado e não pode ser vendida agora.'],
    ['CARD_NOT_OWNED', 'Esta carta não está mais na sua Bag.'],
    ['PLAYER_NOT_AVAILABLE', 'Sua conta não está disponível para esta operação.'],
    ['INVALID_SALE', 'Quantidade inválida para venda.'],
  ];
  return new Error(known.find(([key]) => message.includes(key))?.[1] ?? message);
}

export async function sellDuplicateCards(cardId: string, quantity: number): Promise<DuplicateSaleResult> {
  const { data, error } = await supabase.rpc('sell_duplicate_cards', {
    p_card_id: cardId,
    p_quantity: quantity,
  });
  if (error) throw duplicateSaleError(error.message);
  return data as DuplicateSaleResult;
}
