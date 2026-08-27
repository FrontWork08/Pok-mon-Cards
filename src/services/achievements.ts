import { supabase } from '@/lib/supabase';
import { normalizeFunctionError } from '@/services/functionErrors';

export type AchievementDefinition = {
  id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  category: 'special' | 'battle' | 'collection' | 'social' | 'rank';
  target: number;
  sort_order: number;
};

export type PlayerAchievement = {
  player_id: string;
  achievement_id: string;
  progress: number;
  unlocked_at: string | null;
  achievement: AchievementDefinition | AchievementDefinition[] | null;
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('player-action', { body });
  if (error) throw await normalizeFunctionError(error, 'Não foi possível atualizar suas conquistas.');
  if (data?.error) throw new Error(String(data.error));
  return data?.data;
}

export async function refreshAchievements() {
  return invoke({ action: 'refresh_achievements' });
}

export async function equipAchievementTitle(achievementId: string | null) {
  return invoke({ action: 'equip_title', achievementId });
}

export async function setRatingVisibility(visible: boolean) {
  return invoke({ action: 'set_rating_visibility', visible });
}

export async function getMyAchievements() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('player_achievements')
    .select('player_id,achievement_id,progress,unlocked_at,achievement:achievement_definitions!player_achievements_achievement_id_fkey(id,name,title,description,icon,category,target,sort_order)')
    .eq('player_id', userData.user.id)
    .order('achievement_id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PlayerAchievement[];
}
