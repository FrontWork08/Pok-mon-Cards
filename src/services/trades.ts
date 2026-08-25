import { supabase } from '../lib/supabase';

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

// Criação, confirmação e conclusão de trocas serão feitas por RPC/Edge Function.
// O cliente não altera inventário diretamente.
