import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type TeamBattleCard = {
  cardId: string;
  name: string;
  cardName?: string | null;
  image?: string | null;
  setName?: string | null;
  rarity?: string | null;
  types?: string[] | null;
  hp?: number | null;
  attack?: number | null;
  defense?: number | null;
  spAttack?: number | null;
  spDefense?: number | null;
  speed?: number | null;
  gameValue?: number | null;
  quantity?: number | null;
};

export type TeamBattleMember = {
  slot: number;
  cardId?: string | null;
  name?: string | null;
  image?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  hp?: number | null;
  fainted?: boolean | null;
  status?: string | null;
  types?: string[] | null;
  [key: string]: unknown;
};

export type TeamBattleAttackOption = {
  identifier?: string | null;
  name?: string | null;
  type?: string | null;
  power?: number | null;
  accuracy?: number | null;
  ppRemaining?: number | null;
  pp?: number | null;
  [key: string]: unknown;
};

export type TeamBattleSwitchOption = {
  slot: number;
  cardId?: string | null;
  name?: string | null;
  image?: string | null;
  currentHp?: number | null;
  maxHp?: number | null;
  disabled?: boolean | null;
  [key: string]: unknown;
};

export type TeamBattleState = {
  battleId: string;
  status: string;
  winnerId?: string | null;
  mode?: 'team3';
  formatId?: string | null;
  rules?: unknown;
  setupDeadline?: string | null;
  selectionDeadline?: string | null;
  myTeamLocked?: boolean;
  opponentTeamLocked?: boolean;
  opponentTeamCount?: number;
  myTeam?: TeamBattleMember[];
  opponentTeam?: TeamBattleMember[];
  myActiveSlot?: number | null;
  opponentActiveSlot?: number | null;
  myActive?: TeamBattleMember | null;
  opponentActive?: TeamBattleMember | null;
  myName?: string | null;
  opponentName?: string | null;
  myCardImage?: string | null;
  opponentCardImage?: string | null;
  myCurrentHp?: number | null;
  myMaxHp?: number | null;
  opponentCurrentHp?: number | null;
  opponentMaxHp?: number | null;
  myTypes?: string[] | null;
  opponentTypes?: string[] | null;
  myStatus?: string | null;
  opponentStatus?: string | null;
  myForcedSwitch?: boolean;
  opponentForcedSwitch?: boolean;
  myActionLocked?: boolean;
  opponentActionLocked?: boolean;
  actionRequired?: string | null;
  attackOptions?: TeamBattleAttackOption[];
  switchOptions?: TeamBattleSwitchOption[];
  roundNumber?: number;
  lastTurn?: Record<string, unknown> | null;
  [key: string]: unknown;
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('team-battle-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível atualizar a batalha 3×3.');
  if (data?.error) {
    const value = data.error;
    const message = typeof value === 'string'
      ? value
      : typeof value?.message === 'string'
        ? value.message
        : 'Não foi possível atualizar a batalha 3×3.';
    throw new Error(message);
  }
  return data?.data;
}

export async function getTeamBattleState(battleId: string) {
  return invoke({ action: 'state', battleId }) as Promise<TeamBattleState>;
}

export async function getEligibleTeamBattleCards(battleId: string, search = '', limit = 120, offset = 0) {
  return invoke({ action: 'eligible_cards', battleId, search, limit, offset }) as Promise<{
    items: TeamBattleCard[];
    total: number;
    limit: number;
    offset: number;
  }>;
}

export async function setTeamBattleTeam(battleId: string, cardIds: string[]) {
  return invoke({ action: 'set_team', battleId, cardIds });
}

export async function chooseTeamBattleAttack(battleId: string, attackName: string) {
  return invoke({ action: 'attack', battleId, attackName });
}

export async function chooseTeamBattleSwitch(battleId: string, slot: number) {
  return invoke({ action: 'switch', battleId, slot });
}

export async function resolveTeamBattleTimeout(battleId: string) {
  return invoke({ action: 'timeout', battleId });
}

export async function forfeitTeamBattle(battleId: string) {
  return invoke({ action: 'forfeit', battleId });
}

export async function cancelTeamBattle(battleId: string) {
  return invoke({ action: 'cancel', battleId });
}

export function subscribeToTeamBattle(battleId: string, onChange: () => void) {
  const channel = supabase
    .channel(`team-battle:${battleId}:${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `id=eq.${battleId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battle_events', filter: `battle_id=eq.${battleId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
