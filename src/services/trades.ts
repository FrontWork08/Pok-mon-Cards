import { supabase } from '../lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type TradeCardInput = {
  card_id: string;
  quantity: number;
};

async function invokeTradeAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('trade-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível concluir a ação da troca.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível concluir a ação da troca.');
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
      trade_cards(owner_id, card_id, quantity, cards(pokemon_name, image_small, rarity, game_value, market_price_usd, market_price_variant))
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
      trade_cards(owner_id, card_id, quantity, cards(id, pokemon_name, image_small, image_large, rarity, set_name, game_value, market_price_usd, market_price_variant))
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


export function subscribeToTrade(
  tradeId: string,
  onChange: () => void,
  onStatus?: (status: 'connecting' | 'live' | 'fallback') => void,
) {
  onStatus?.('connecting');

  const channel = supabase
    .channel(`trade:${tradeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trades', filter: `id=eq.${tradeId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trade_cards', filter: `trade_id=eq.${tradeId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('live');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus?.('fallback');
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
