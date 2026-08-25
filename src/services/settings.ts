import { supabase } from '@/lib/supabase';

export type AppearanceMode = 'system' | 'dark' | 'light';
export type ThemeName = 'trainer' | 'midnight' | 'poke_red' | 'electric' | 'ghost' | 'fire' | 'water';

export type PlayerSettings = {
  player_id: string;
  appearance: AppearanceMode;
  theme: ThemeName;
  chat_notifications: boolean;
  battle_invites: boolean;
  push_notifications: boolean;
  battle_sounds: boolean;
  battle_vibration: boolean;
  updated_at: string;
};

export type SettingsPatch = Partial<Pick<PlayerSettings, 'appearance' | 'theme' | 'chat_notifications' | 'battle_invites' | 'push_notifications' | 'battle_sounds' | 'battle_vibration'>>;

export async function getMySettings(): Promise<PlayerSettings> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('player_settings')
    .select('player_id,appearance,theme,chat_notifications,battle_invites,push_notifications,battle_sounds,battle_vibration,updated_at')
    .eq('player_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as PlayerSettings;

  const defaults = {
    player_id: auth.user.id,
    appearance: 'dark' as AppearanceMode,
    theme: 'trainer' as ThemeName,
    chat_notifications: true,
    battle_invites: true,
    push_notifications: true,
    battle_sounds: true,
    battle_vibration: true,
  };
  const { data: created, error: createError } = await supabase.from('player_settings').insert(defaults).select().single();
  if (createError) throw createError;
  return created as PlayerSettings;
}

export async function updateMySettings(patch: SettingsPatch) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Usuário não autenticado.');
  const { data, error } = await supabase
    .from('player_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('player_id', auth.user.id)
    .select()
    .single();
  if (error) throw error;
  return data as PlayerSettings;
}
