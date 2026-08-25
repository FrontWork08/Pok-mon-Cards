import { supabase } from '@/lib/supabase';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('battle-action', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}

export async function createBattle(opponentId: string, mode: 'quick' | 'mystery' = 'quick', stakeType: 'none' | 'coins' = 'none', wagerCoins = 0) {
  const data = await invoke({ action: 'create', opponentId, mode, stakeType, wagerCoins });
  return data.battleId as string;
}

export async function respondToBattle(battleId: string, accept: boolean) {
  return invoke({ action: 'respond', battleId, accept });
}

export async function lockBattleCard(battleId: string, cardId: string) {
  return invoke({ action: 'lock', battleId, cardId });
}

export async function resolveBattleTimeout(battleId: string) {
  return invoke({ action: 'timeout', battleId });
}

export async function cancelBattle(battleId: string) {
  return invoke({ action: 'cancel', battleId });
}

export async function getBattle(battleId: string) {
  const { data, error } = await supabase
    .from('battles')
    .select('id,challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,active_round,selection_seconds,selection_deadline,challenger_score,opponent_score,winner_id,created_at,updated_at,completed_at')
    .eq('id', battleId)
    .single();
  if (error) throw error;
  return data;
}

export async function getBattleRounds(battleId: string) {
  const { data, error } = await supabase
    .from('battle_rounds')
    .select('battle_id,round_no,challenger_card_id,opponent_card_id,challenger_power,opponent_power,challenger_roll,opponent_roll,winner_id,resolved_at,c1:cards!battle_rounds_challenger_card_id_fkey(id,pokemon_name,image_small,image_large,rarity,types),c2:cards!battle_rounds_opponent_card_id_fkey(id,pokemon_name,image_small,image_large,rarity,types)')
    .eq('battle_id', battleId)
    .order('round_no', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBattleEvents(battleId: string) {
  const { data, error } = await supabase
    .from('battle_events')
    .select('id,event_type,payload,created_at')
    .eq('battle_id', battleId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function subscribeToBattle(battleId: string, onChange: () => void) {
  const channel = supabase
    .channel(`battle:${battleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battle_events', filter: `battle_id=eq.${battleId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
