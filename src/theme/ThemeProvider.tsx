import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';
import { AppearanceMode, getMySettings, PlayerSettings, SettingsPatch, ThemeName, updateMySettings } from '@/services/settings';

export type AppColors = {
  bg: string; surface: string; surfaceAlt: string; border: string; text: string; muted: string;
  blue: string; blueDeep: string; yellow: string; red: string; green: string; accent: string; accentSoft: string;
};

const accents: Record<ThemeName, { accent: string; secondary: string; soft: string; bg: string; surface: string; surfaceAlt: string; lightBg: string }> = {
  trainer: { accent:'#4D8DFF',secondary:'#FFD54A',soft:'#172A48',bg:'#091423',surface:'#101F32',surfaceAlt:'#182B42',lightBg:'#EDF5FF' },
  midnight: { accent:'#9B7BFF',secondary:'#5EDCFF',soft:'#2D2358',bg:'#100D24',surface:'#1B1635',surfaceAlt:'#282047',lightBg:'#F1EEFF' },
  poke_red: { accent:'#FF5264',secondary:'#FFD54A',soft:'#4A2029',bg:'#1F0C12',surface:'#30131B',surfaceAlt:'#45202A',lightBg:'#FFF0F2' },
  electric: { accent:'#FFD83D',secondary:'#4F9BFF',soft:'#4A4019',bg:'#191707',surface:'#29250B',surfaceAlt:'#3B3512',lightBg:'#FFFBE5' },
  ghost: { accent:'#A970FF',secondary:'#E778D2',soft:'#352050',bg:'#160D22',surface:'#251438',surfaceAlt:'#35204B',lightBg:'#F7EEFF' },
  fire: { accent:'#FF7A3D',secondary:'#FFD04A',soft:'#512513',bg:'#210D07',surface:'#33150C',surfaceAlt:'#492114',lightBg:'#FFF2E9' },
  water: { accent:'#42B9FF',secondary:'#5EE4D2',soft:'#153E58',bg:'#061A29',surface:'#0D2A3D',surfaceAlt:'#143B52',lightBg:'#EAF8FF' },
  kanto: { accent:'#F0525F',secondary:'#F5D34B',soft:'#44242A',bg:'#171116',surface:'#27191D',surfaceAlt:'#382428',lightBg:'#FFF1F0' },
  johto: { accent:'#D4A62A',secondary:'#67C18A',soft:'#3E351D',bg:'#15160D',surface:'#252518',surfaceAlt:'#383621',lightBg:'#FFF9E7' },
  hoenn: { accent:'#38A7D8',secondary:'#EF6A56',soft:'#173E51',bg:'#071924',surface:'#0F2936',surfaceAlt:'#163D4C',lightBg:'#EAF8FA' },
  sinnoh: { accent:'#8C87E8',secondary:'#9EDDEA',soft:'#302E55',bg:'#111326',surface:'#1C2038',surfaceAlt:'#292E4B',lightBg:'#F1F3FF' },
};

function colorsFor(light: boolean, theme: ThemeName): AppColors {
  const a = accents[theme];
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
