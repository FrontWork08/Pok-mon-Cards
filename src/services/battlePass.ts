import { supabase } from '@/lib/supabase';

export type BattlePassTrack = 'free' | 'vip';
export type BattlePassPeriod = 'daily' | 'weekly' | 'season';

export type BattlePassReward = {
  level: number;
  track: BattlePassTrack;
  label: string;
  reward: { coins?: number; diamonds?: number; titleId?: string; titleName?: string };
  claimed: boolean;
};

export type BattlePassMission = {
  id: string;
  title: string;
  description: string;
  eventKey: string;
  period: BattlePassPeriod;
  periodKey: string;
  target: number;
  xpReward: number;
  progress: number;
  completed: boolean;
  completedAt: string | null;
};

export type BattlePassState = {
  season: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    maxLevel: number;
    vipPriceDiamonds: number;
    totalXpRequired: number;
  };
  progress: {
    xp: number;
    level: number;
    vipUnlocked: boolean;
    vipUnlockedAt: string | null;
    xpIntoLevel: number;
    xpForNextLevel: number;
  };
  rewards: BattlePassReward[];
  missions: BattlePassMission[];
};

function battlePassError(error: { message?: string } | null) {
  const message = error?.message ?? 'Não foi possível concluir a ação.';
  const known: Array<[string, string]> = [
    ['APP_MAINTENANCE', 'O jogo está em manutenção. Tente novamente quando as atividades forem liberadas.'],
    ['NOT_ENOUGH_DIAMONDS', 'Diamantes insuficientes para liberar o Passe VIP.'],
    ['LEVEL_LOCKED', 'Alcance este nível do passe antes de resgatar a recompensa.'],
    ['VIP_REQUIRED', 'Esta recompensa pertence ao Passe VIP.'],
    ['REWARD_ALREADY_CLAIMED', 'Esta recompensa já foi resgatada.'],
    ['NO_ACTIVE_BATTLE_PASS', 'Não há um Passe de Batalha ativo agora.'],
  ];
  return new Error(known.find(([key]) => message.includes(key))?.[1] ?? message);
}

export async function getBattlePass(): Promise<BattlePassState | null> {
  const { data, error } = await supabase.rpc('get_my_battle_pass');
  if (error) throw battlePassError(error);
  return (data ?? null) as BattlePassState | null;
}

export async function purchaseBattlePassVip() {
  const { data, error } = await supabase.rpc('purchase_battle_pass_vip');
  if (error) throw battlePassError(error);
  return data as { vipUnlocked: boolean; diamonds: number; priceDiamonds?: number; alreadyUnlocked?: boolean };
}

export async function claimBattlePassReward(level: number, track: BattlePassTrack) {
  const { data, error } = await supabase.rpc('claim_battle_pass_reward', {
    p_level: level,
    p_track: track,
  });
  if (error) throw battlePassError(error);
  return data as {
    level: number;
    track: BattlePassTrack;
    reward: { coins?: number; diamonds?: number; titleId?: string; titleName?: string };
    coins: number;
    diamonds: number;
    titleId?: string | null;
    titleName?: string | null;
  };
}
