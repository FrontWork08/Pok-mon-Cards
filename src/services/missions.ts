import { supabase } from '@/lib/supabase';

export type MissionCadence = 'daily' | 'weekly';

export type PlayerMission = {
  id: string;
  title: string;
  description: string;
  cadence: MissionCadence;
  event_type: string;
  target: number;
  reward_coins: number;
  reward_xp: number;
  reward_diamonds: number;
  action_route: string;
  progress: number;
  claimed: boolean;
  period_start: string;
};

export async function getMissions(): Promise<PlayerMission[]> {
  const { data, error } = await supabase.rpc('get_my_missions_v2');
  if (error) throw error;
  return (data ?? []).map((mission: any) => ({
    ...mission,
    target: Number(mission.target ?? 0),
    reward_coins: Number(mission.reward_coins ?? 0),
    reward_xp: Number(mission.reward_xp ?? 0),
    reward_diamonds: Number(mission.reward_diamonds ?? 0),
    progress: Number(mission.progress ?? 0),
    claimed: Boolean(mission.claimed),
  }));
}

export async function claimMission(missionId: string) {
  const { data, error } = await supabase.rpc('claim_mission_v2', { p_mission_id: missionId });
  if (error) {
    if (error.message.includes('MISSION_NOT_COMPLETE')) throw new Error('Esta missão ainda não foi concluída.');
    if (error.message.includes('ALREADY_CLAIMED')) throw new Error('Esta recompensa já foi coletada.');
    throw error;
  }
  return data as { coins: number; xp: number; diamonds: number; cadence: MissionCadence };
}

