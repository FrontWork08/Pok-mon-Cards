import { supabase } from '@/lib/supabase';

export type AppearanceMode = 'system' | 'dark' | 'light';
export type ThemeName =
  | 'trainer' | 'midnight' | 'poke_red' | 'electric' | 'ghost' | 'fire' | 'water'
  | 'grass' | 'psychic' | 'dragon' | 'fighting' | 'steel' | 'fairy' | 'darkness'
  | 'kanto' | 'johto' | 'hoenn' | 'sinnoh';

export type PlayerSettings = {
  player_id: string;
  appearance: AppearanceMode;
  theme: ThemeName;
  chat_notifications: boolean;
  battle_invites: boolean;
  push_notifications: boolean;
  battle_sounds: boolean;
  battle_vibration: boolean;
  show_online_status: boolean;
  smart_notifications: boolean;
  notify_battles: boolean;
  notify_social: boolean;
  notify_market: boolean;
  notify_progress: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone_offset_minutes: number;
  weekly_summary_notifications: boolean;
  performance_mode: 'auto' | 'full' | 'reduced';
  reduce_motion: boolean;
  high_contrast: boolean;
  large_text: boolean;
  updated_at: string;
};

export type SettingsPatch = Partial<Pick<PlayerSettings, 'appearance' | 'theme' | 'chat_notifications' | 'battle_invites' | 'push_notifications' | 'battle_sounds' | 'battle_vibration' | 'show_online_status' | 'smart_notifications' | 'notify_battles' | 'notify_social' | 'notify_market' | 'notify_progress' | 'quiet_hours_enabled' | 'quiet_hours_start' | 'quiet_hours_end' | 'timezone_offset_minutes' | 'weekly_summary_notifications' | 'performance_mode' | 'reduce_motion' | 'high_contrast' | 'large_text'>>;

export async function getMySettings(): Promise<PlayerSettings> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('player_settings')
    .select('player_id,appearance,theme,chat_notifications,battle_invites,push_notifications,battle_sounds,battle_vibration,show_online_status,smart_notifications,notify_battles,notify_social,notify_market,notify_progress,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,timezone_offset_minutes,weekly_summary_notifications,performance_mode,reduce_motion,high_contrast,large_text,updated_at')
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
    show_online_status: true,
    smart_notifications: true,
    notify_battles: true,
    notify_social: true,
    notify_market: true,
    notify_progress: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    timezone_offset_minutes: new Date().getTimezoneOffset(),
    weekly_summary_notifications: true,
    performance_mode: 'auto' as const,
    reduce_motion: false,
    high_contrast: false,
    large_text: false,
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
