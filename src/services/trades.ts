import { supabase } from '../lib/supabase';

export type TradeCardInput = {
  card_id: string;
  quantity: number;
};

async function invokeTradeAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('trade-action', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}

export async function getMyTrades() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const userId = userData.user.id;

  const { data, error } = await supabase
    .from('trades')
    .select(`
      id,
      status,
      sender_id,
      receiver_id,
      sender_confirmed,
      receiver_confirmed,
      created_at,
      updated_at,
      trade_cards(owner_id, card_id, quantity, cards(pokemon_name, image_small, rarity))
    `)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getTrade(tradeId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select(`
      id,
      status,
      sender_id,
      receiver_id,
      sender_confirmed,
      receiver_confirmed,
      created_at,
      updated_at,
      trade_cards(owner_id, card_id, quantity, cards(id, pokemon_name, image_small, image_large, rarity, set_name))
    `)
    .eq('id', tradeId)
    .single();

  if (error) throw error;
  return data;
}

export async function createTrade(receiverId: string) {
  return invokeTradeAction({ action: 'create', receiverId });
}

export async function setTradeCards(tradeId: string, cards: TradeCardInput[]) {
  return invokeTradeAction({ action: 'set_cards', tradeId, cards });
}

export async function confirmTrade(tradeId: string) {
  return invokeTradeAction({ action: 'confirm', tradeId });
}

export async function cancelTrade(tradeId: string) {
  return invokeTradeAction({ action: 'cancel', tradeId });
}
