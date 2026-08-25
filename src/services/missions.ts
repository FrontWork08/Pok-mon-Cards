import { supabase } from '@/lib/supabase';

export async function getDailyMissions() {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: templates, error: templateError }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from('mission_templates').select('id,title,description,event_type,target,reward_coins,reward_xp').eq('active', true),
    supabase.from('player_daily_missions').select('mission_id,progress,claimed,mission_date').eq('mission_date', today),
  ]);
  if (templateError) throw templateError;
  if (progressError) throw progressError;
  const byId = new Map((progress ?? []).map((item: any) => [item.mission_id, item]));
  return (templates ?? []).map((mission: any) => ({ ...mission, progress: Number(byId.get(mission.id)?.progress ?? 0), claimed: Boolean(byId.get(mission.id)?.claimed) }));
}

export async function claimMission(missionId: string) {
  const { data, error } = await supabase.functions.invoke('player-action', { body: { action: 'claim_mission', missionId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}
