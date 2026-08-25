import { supabase } from '@/lib/supabase';

export type AppearanceMode = 'system' | 'dark' | 'light';
export type ThemeName = 'trainer' | 'midnight' | 'poke_red' | 'electric' | 'ghost' | 'fire' | 'water';

export type PlayerSettings = {
  player_id: string;
  appearance: AppearanceMode;
  theme: ThemeName;
  chat_notifications: boolean;
  battle_invites: boolean;
  updated_at: string;
};

export async function getMySettings(): Promise<PlayerSettings> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('player_settings')
    .select('player_id,appearance,theme,chat_notifications,battle_invites,updated_at')
    .eq('player_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as PlayerSettings;

  const defaults = { player_id: auth.user.id, appearance: 'dark' as AppearanceMode, theme: 'trainer' as ThemeName, chat_notifications: true, battle_invites: true };
  const { data: created, error: createError } = await supabase.from('player_settings').insert(defaults).select().single();
  if (createError) throw createError;
  return created as PlayerSettings;
}

export async function updateMySettings(patch: Partial<Pick<PlayerSettings, 'appearance' | 'theme' | 'chat_notifications' | 'battle_invites'>>) {
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
