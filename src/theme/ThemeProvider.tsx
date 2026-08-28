import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';
import { AppearanceMode, getMySettings, PlayerSettings, SettingsPatch, ThemeName, updateMySettings } from '@/services/settings';
import { getThemeVisual } from '@/theme/themeCatalog';

export type AppColors = {
  bg: string; surface: string; surfaceAlt: string; border: string; text: string; muted: string;
  blue: string; blueDeep: string; yellow: string; red: string; green: string; accent: string; accentSoft: string;
};

function colorsFor(light: boolean, theme: ThemeName): AppColors {
  const a = getThemeVisual(theme);
  if (light) return {
    bg: a.lightBg, surface: '#FFFFFF', surfaceAlt: `${a.accent}12`, border: `${a.accent}35`, text: '#161A20', muted: '#626B76',
    blue: a.accent, blueDeep: a.accent, yellow: a.secondary, red: '#D84454', green: '#249B68', accent: a.accent, accentSoft: `${a.accent}18`,
  };
  return {
    bg: a.bg, surface: a.surface, surfaceAlt: a.surfaceAlt, border: `${a.accent}40`, text: '#F7F8FA', muted: '#A4ADBA',
    blue: a.accent, blueDeep: a.accent, yellow: a.secondary, red: '#FF6978', green: '#5BDB9F', accent: a.accent, accentSoft: a.soft,
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
