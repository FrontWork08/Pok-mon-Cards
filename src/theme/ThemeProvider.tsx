import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';
import { AppearanceMode, getMySettings, PlayerSettings, SettingsPatch, ThemeName, updateMySettings } from '@/services/settings';

export type AppColors = {
  bg: string; surface: string; surfaceAlt: string; border: string; text: string; muted: string;
  blue: string; blueDeep: string; yellow: string; red: string; green: string; accent: string; accentSoft: string;
};

const accents: Record<ThemeName, { accent: string; secondary: string; soft: string }> = {
  trainer: { accent: '#4D8DFF', secondary: '#FFD54A', soft: '#151515' },
  midnight: { accent: '#9B7BFF', secondary: '#5EDCFF', soft: '#241B4C' },
  poke_red: { accent: '#FF5264', secondary: '#FFD54A', soft: '#451923' },
  electric: { accent: '#FFD83D', secondary: '#4F9BFF', soft: '#3B3413' },
  ghost: { accent: '#A970FF', secondary: '#E778D2', soft: '#2C1745' },
  fire: { accent: '#FF7A3D', secondary: '#FFD04A', soft: '#452014' },
  water: { accent: '#42B9FF', secondary: '#5EE4D2', soft: '#123448' },
};

function colorsFor(light: boolean, theme: ThemeName): AppColors {
  const a = accents[theme];
  if (light) return {
    bg: '#F4F4F4', surface: '#FFFFFF', surfaceAlt: '#ECECEC', border: '#D2D2D2', text: '#111111', muted: '#686868',
    blue: a.accent, blueDeep: a.accent, yellow: a.secondary, red: '#D84454', green: '#249B68', accent: a.accent, accentSoft: `${a.accent}18`,
  };
  return {
    bg: '#050505', surface: '#0D0D0D', surfaceAlt: '#171717', border: '#2A2A2A', text: '#F7F7F7', muted: '#9A9A9A',
    blue: a.accent, blueDeep: a.accent, yellow: a.secondary, red: '#FF5C68', green: '#53D69A', accent: a.accent, accentSoft: theme === 'trainer' ? '#151515' : a.soft,
  };
}

type ThemeContextValue = {
  colors: AppColors;
  appearance: AppearanceMode;
  themeName: ThemeName;
  isLight: boolean;
  settings: PlayerSettings | null;
  updatePreferences: (patch: SettingsPatch) => Promise<void>;
  refresh: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<PlayerSettings | null>(null);
  const appearance = settings?.appearance ?? 'dark';
  const themeName = settings?.theme ?? 'trainer';
  const isLight = appearance === 'light' || (appearance === 'system' && systemScheme === 'light');
  const colors = useMemo(() => colorsFor(isLight, themeName), [isLight, themeName]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSettings(null); return; }
    try { setSettings(await getMySettings()); } catch { setSettings(null); }
  }, []);

  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => refresh(), 0); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const updatePreferences = useCallback(async (patch: SettingsPatch) => {
    const updated = await updateMySettings(patch);
    setSettings(updated);
  }, []);

  return <ThemeContext.Provider value={{ colors, appearance, themeName, isLight, settings, updatePreferences, refresh }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
