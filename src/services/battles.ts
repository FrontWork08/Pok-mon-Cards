import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type BattleStakeType = 'none' | 'coins' | 'card';
export type BattleMode = 'quick' | 'mystery' | 'draft3';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('battle-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível concluir a ação da batalha.');
  if (data?.error) throw await normalizeFunctionError(new Error(String(data.error)), 'Não foi possível concluir a ação da batalha.');
  return data?.data;
}

export async function createBattle(opponentId: string, mode: BattleMode = 'quick', stakeType: BattleStakeType = 'none', wagerCoins = 0, stakeCardId?: string | null, rematchOf?: string | null) {
  const data = await invoke({ action: 'create', opponentId, mode, stakeType, wagerCoins, stakeCardId: stakeCardId ?? null, rematchOf: rematchOf ?? null });
  return data.battleId as string;
}

export async function respondToBattle(battleId: string, accept: boolean, stakeCardId?: string | null) {
  return invoke({ action: 'respond', battleId, accept, stakeCardId: stakeCardId ?? null });
}

export async function rematchBattle(battleId: string) {
  const data = await invoke({ action: 'rematch', battleId });
  return data.battleId as string;
}

export async function pickBattleDraftCard(battleId: string, cardId: string) {
  return invoke({ action: 'draft_pick', battleId, cardId });
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
    .select('id,challenger_id,opponent_id,mode,stake_type,wager_coins,status,rounds_to_win,active_round,selection_seconds,selection_deadline,draft_turn_id,draft_pick_count,draft_seconds,challenger_score,opponent_score,winner_id,reward_eligible,rematch_of,challenger_rating_before,challenger_rating_after,opponent_rating_before,opponent_rating_after,created_at,updated_at,completed_at')
    .eq('id', battleId)
    .single();
  if (error) throw error;
  return data;
}

export async function getBattleDraftCards(battleId: string) {
  const { data, error } = await supabase
    .from('battle_draft_cards')
    .select('battle_id,player_id,card_id,pick_no,global_pick_no,picked_at,cards(id,pokemon_name,image_small,image_large,rarity,types,game_value,market_price_usd,market_price_variant,tcg_data)')
    .eq('battle_id', battleId)
    .order('global_pick_no', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getBattleCardStakes(battleId: string) {
  const { data, error } = await supabase
    .from('battle_card_stakes')
    .select('battle_id,player_id,card_id,quantity,status,cards(id,pokemon_name,image_small,image_large,rarity,types,game_value,market_price_usd,market_price_variant,tcg_data)')
    .eq('battle_id', battleId);
  if (error) throw error;
  return data ?? [];
}

export async function getBattleRounds(battleId: string) {
  const { data, error } = await supabase
    .from('battle_rounds')
    .select('battle_id,round_no,challenger_card_id,opponent_card_id,challenger_power,opponent_power,challenger_roll,opponent_roll,winner_id,resolved_at,c1:cards!battle_rounds_challenger_card_id_fkey(id,pokemon_name,image_small,image_large,rarity,types,game_value,market_price_usd,market_price_variant,tcg_data),c2:cards!battle_rounds_opponent_card_id_fkey(id,pokemon_name,image_small,image_large,rarity,types,game_value,market_price_usd,market_price_variant,tcg_data)')
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

export async function getMyBattleHistory(limit = 50) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const id = auth.user?.id;
  if (!id) throw new Error('Usuário não autenticado.');
  const { data, error } = await supabase
    .from('battles')
    .select('id,challenger_id,opponent_id,mode,stake_type,wager_coins,status,challenger_score,opponent_score,winner_id,reward_eligible,challenger_rating_before,challenger_rating_after,opponent_rating_before,opponent_rating_after,created_at,completed_at,challenger:players!battles_challenger_id_fkey(id,username,battle_rating,show_battle_rating,equipped_title_id),opponent:players!battles_opponent_id_fkey(id,username,battle_rating,show_battle_rating,equipped_title_id)')
    .or(`challenger_id.eq.${id},opponent_id.eq.${id}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getBattleLeaderboard(limit = 50) {
  const { data, error } = await supabase
    .from('players')
    .select('id,username,level,battle_rating,battle_wins,battle_losses,battle_streak,best_battle_streak,show_battle_rating,equipped_title_id')
    .order('battle_rating', { ascending: false })
    .order('battle_wins', { ascending: false })
    .limit(limit);
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
