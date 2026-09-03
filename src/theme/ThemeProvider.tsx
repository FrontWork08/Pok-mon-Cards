import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { supabase } from '@/lib/supabase';
import { AppearanceMode, getMySettings, PlayerSettings, SettingsPatch, ThemeName, updateMySettings } from '@/services/settings';
import { getThemeVisual } from '@/theme/themeCatalog';

export type AppColors = {
  bg: string; surface: string; surfaceAlt: string; border: string; text: string; muted: string;
  blue: string; blueDeep: string; yellow: string; red: string; green: string; accent: string; accentSoft: string;
};

function colorsFor(light: boolean, theme: ThemeName, highContrast=false): AppColors {
  const a = getThemeVisual(theme);
  if (light) return highContrast ? {
    bg:'#FFFFFF',surface:'#FFFFFF',surfaceAlt:'#F2F4F7',border:'#18202A',text:'#05070A',muted:'#343B45',
    blue:a.accent,blueDeep:a.accent,yellow:'#B88600',red:'#B51F32',green:'#087A4D',accent:a.accent,accentSoft:`${a.accent}24`,
  } : {
    bg: a.lightBg, surface: '#FFFFFF', surfaceAlt: `${a.accent}12`, border: `${a.accent}35`, text: '#161A20', muted: '#626B76',
    blue: a.accent, blueDeep: a.accent, yellow: a.secondary, red: '#D84454', green: '#249B68', accent: a.accent, accentSoft: `${a.accent}18`,
  };
  return highContrast ? {
    bg:'#05070A',surface:'#0A0D12',surfaceAlt:'#11161D',border:'#D7DEE8',text:'#FFFFFF',muted:'#D2D9E2',
    blue:a.accent,blueDeep:a.accent,yellow:'#FFE35D',red:'#FF667A',green:'#65E0A3',accent:a.accent,accentSoft:`${a.accent}28`,
  } : {
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
  effectsReduced: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<PlayerSettings | null>(null);
  const appearance = settings?.appearance ?? 'dark';
  const themeName = settings?.theme ?? 'trainer';
  const isLight = appearance === 'light' || (appearance === 'system' && systemScheme === 'light');
  const highContrast=Boolean(settings?.high_contrast);
  const reduceMotion=Boolean(settings?.reduce_motion);
  const effectsReduced=settings?.performance_mode==='reduced'||reduceMotion;
  const largeText=Boolean(settings?.large_text);
  const colors = useMemo(() => colorsFor(isLight, themeName, highContrast), [isLight, themeName, highContrast]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSettings(null); return; }
    try { setSettings(await getMySettings()); } catch { setSettings(null); }
  }, []);

  useEffect(() => {
    let disposed = false;
    let settingsChannel: ReturnType<typeof supabase.channel> | null = null;

    const clearSettingsChannel = () => {
      if (!settingsChannel) return;
      void supabase.removeChannel(settingsChannel);
      settingsChannel = null;
    };

    const attachSettingsRealtime = async (userId?: string | null) => {
      clearSettingsChannel();
      if (!userId || disposed) return;
      settingsChannel = supabase
        .channel(`player-settings-${userId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'player_settings', filter: `player_id=eq.${userId}` },
          () => { void refresh(); },
        )
        .subscribe();
    };

    void refresh();
    supabase.auth.getSession().then(({ data }) => {
      void attachSettingsRealtime(data.session?.user?.id ?? null);
    }).catch(() => null);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void refresh();
        void attachSettingsRealtime(session?.user?.id ?? null);
      }, 0);
    });

    return () => {
      disposed = true;
      clearSettingsChannel();
      data.subscription.unsubscribe();
    };
  }, [refresh]);

  const updatePreferences = useCallback(async (patch: SettingsPatch) => {
    const updated = await updateMySettings(patch);
    setSettings(updated);
  }, []);

  return <ThemeContext.Provider value={{ colors, appearance, themeName, isLight, settings, updatePreferences, refresh, effectsReduced, reduceMotion, highContrast, largeText }}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
