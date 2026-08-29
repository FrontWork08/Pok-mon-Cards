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
  sale: {
    baseCoins: number;
    rarityTier: number;
    rarityMultiplier: number;
    dropChancePct: number | null;
    dropMultiplier: number;
    coinPackCap: number | null;
    unitCoins: number;
  };
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
  baseCoins: number;
  rarityTier: number;
  rarityMultiplier: number;
  dropChancePct: number | null;
  dropMultiplier: number;
  coinPackCap: number | null;
};

export async function getDuplicateCardsForSale(): Promise<DuplicateSaleCard[]> {
  const { data, error } = await supabase.rpc('get_my_duplicate_sale_cards');
  if (error) throw error;

  return (Array.isArray(data) ? data : []).map((row: any) => ({
    quantity: Number(row.quantity ?? 0),
    cards: row.cards ? {
      id: String(row.cards.id),
      pokemon_name: String(row.cards.pokemon_name ?? 'Carta'),
      set_name: String(row.cards.set_name ?? ''),
      rarity: row.cards.rarity ?? null,
      image_small: row.cards.image_small ?? null,
      market_price_usd: row.cards.market_price_usd == null ? null : Number(row.cards.market_price_usd),
      market_price_source: row.cards.market_price_source ?? null,
    } : null,
    sale: {
      baseCoins: Number(row.sale?.baseCoins ?? 0),
      rarityTier: Number(row.sale?.rarityTier ?? 0),
      rarityMultiplier: Number(row.sale?.rarityMultiplier ?? 1),
      dropChancePct: row.sale?.dropChancePct == null ? null : Number(row.sale.dropChancePct),
      dropMultiplier: Number(row.sale?.dropMultiplier ?? 1),
      coinPackCap: row.sale?.coinPackCap == null ? null : Number(row.sale.coinPackCap),
      unitCoins: Number(row.sale?.unitCoins ?? 0),
    },
  })).filter((row) => row.cards && row.quantity > 1);
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
