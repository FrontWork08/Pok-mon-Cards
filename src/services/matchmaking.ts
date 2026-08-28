import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';
import type { BattleMode } from '@/services/battles';

export type MatchmakingState = {
  player_id: string;
  mode_choice: BattleMode;
  status: 'waiting' | 'matched' | 'cancelled';
  rating_snapshot: number;
  season_id: string | null;
  matched_battle_id: string | null;
  joined_at: string;
  updated_at: string;
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('battle-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível atualizar o matchmaking.');
  if (data?.error) {
    const value = data.error;
    const message = typeof value === 'string'
      ? value
      : typeof value?.message === 'string'
        ? value.message
        : 'Não foi possível atualizar o matchmaking.';
    throw new Error(message);
  }
  return data?.data;
}

export async function joinMatchmaking(mode: BattleMode) {
  return invoke({ action: 'matchmaking_join', mode }) as Promise<{
    status: 'waiting'|'matched';
    battleId?: string;
    mode?: BattleMode;
    seasonId?: string | null;
  }>;
}

export async function cancelMatchmaking() {
  return invoke({ action: 'matchmaking_cancel' }) as Promise<{ status: string }>;
}

export async function getMyMatchmakingState(): Promise<MatchmakingState | null> {
  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) return null;
  const { data, error } = await supabase
    .from('matchmaking_queue')
    .select('player_id,mode_choice,status,rating_snapshot,season_id,matched_battle_id,joined_at,updated_at')
    .eq('player_id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MatchmakingState | null;
}

export function subscribeMyMatchmaking(playerId: string, onChange: (state: MatchmakingState) => void) {
  const channel = supabase
    .channel(`matchmaking:${playerId}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'matchmaking_queue', filter: `player_id=eq.${playerId}` },
      (change) => {
        if (change.new && Object.keys(change.new).length) onChange(change.new as MatchmakingState);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
