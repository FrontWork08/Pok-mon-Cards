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

  const round10 = (amount: number) => Math.round(amount / 10) * 10;
  const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) =>
    y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);

  if (value <= 0.5) return Math.max(10, round10((value / 0.5) * 50));
  if (value <= 1) return round10(lerp(value, 0.5, 50, 1, 100));
  if (value <= 2) return round10(lerp(value, 1, 100, 2, 150));
  if (value <= 5) return round10(lerp(value, 2, 150, 5, 300));
  if (value <= 10) return round10(lerp(value, 5, 300, 10, 500));
  if (value <= 20) return round10(lerp(value, 10, 500, 20, 750));
  if (value <= 50) return round10(lerp(value, 20, 750, 50, 1250));
  if (value <= 100) return round10(lerp(value, 50, 1250, 100, 2000));
  if (value <= 200) return round10(lerp(value, 100, 2000, 200, 3000));
  if (value <= 500) return round10(lerp(value, 200, 3000, 500, 5000));

  return Math.round((5000 + 1500 * Math.log2(value / 500)) / 50) * 50;
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
