import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

export type ProfileIcon = 'pokeball' | 'trainer' | 'electric' | 'fire' | 'water' | 'leaf' | 'ghost' | 'dragon' | 'diamond';

const ICONS: Record<ProfileIcon, keyof typeof Ionicons.glyphMap> = {
  pokeball: 'radio-button-on',
  trainer: 'person',
  electric: 'flash',
  fire: 'flame',
  water: 'water',
  leaf: 'leaf',
  ghost: 'skull',
  dragon: 'sparkles',
  diamond: 'diamond',
};

type AvatarThemeVisual = {
  active: boolean;
  primary: string;
  secondary: string;
  background: string | null;
  galaxy: boolean;
};

function avatarThemeVisual(frameId?: string | null, backgroundId?: string | null, fallback = '#6A7CFF'): AvatarThemeVisual {
  const frame = String(frameId ?? '').toLowerCase();
  const background = String(backgroundId ?? '').toLowerCase();
  const key = `${frame} ${background}`;

  if (key.includes('galaxy')) return { active: true, primary: '#8B5CFF', secondary: '#55E6FF', background: '#151027', galaxy: true };
  if (key.includes('master')) return { active: true, primary: '#C493FF', secondary: '#8EE7FF', background: '#191329', galaxy: false };
  if (key.includes('crimson') || key.includes('crown')) return { active: true, primary: '#FF667A', secondary: '#FFB36B', background: '#271419', galaxy: false };
  if (key.includes('champion') || key.includes('gold') || key.includes('royal')) return { active: true, primary: '#FFD447', secondary: '#FFF0A8', background: '#28220E', galaxy: false };
  if (key.includes('celestial')) return { active: true, primary: '#8EE7FF', secondary: '#D6FAFF', background: '#102432', galaxy: false };
  if (key.includes('neon')) return { active: true, primary: '#45F3FF', secondary: '#62FFB9', background: '#09222A', galaxy: false };
  if (key.includes('night') || key.includes('indigo')) return { active: true, primary: '#9B7BFF', secondary: '#C9B7FF', background: '#121A36', galaxy: false };
  if (/^(coin_|lux_)/.test(frame) || /^(coin_|lux_)/.test(background)) {
    return { active: true, primary: fallback, secondary: '#FFD447', background: '#111B2C', galaxy: false };
  }

  return { active: false, primary: fallback, secondary: fallback, background: null, galaxy: false };
}

export function TrainerAvatar({
  icon = 'pokeball',
  color,
  backgroundColor,
  size = 66,
  avatarUrl,
  frameId,
  backgroundId,
}: {
  icon?: ProfileIcon | string | null;
  color: string;
  backgroundColor: string;
  size?: number;
  avatarUrl?: string | null;
  frameId?: string | null;
  backgroundId?: string | null;
}) {
  const safeIcon = icon && icon in ICONS ? icon as ProfileIcon : 'pokeball';
  const innerRadius = Math.max(8, size * .28);
  const theme = avatarThemeVisual(frameId, backgroundId, color);
  const resolvedBackground = theme.background ?? backgroundColor;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size * .31,
          borderColor: theme.active ? theme.primary : color,
          borderWidth: theme.active ? 2 : 1,
          backgroundColor: resolvedBackground,
        },
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%', borderRadius: innerRadius }}
        />
      ) : (
        <Ionicons name={ICONS[safeIcon]} size={Math.round(size * .45)} color={theme.active ? theme.secondary : color} />
      )}

      {theme.active ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.themeInset,
              {
                borderRadius: Math.max(6, size * .24),
                borderColor: `${theme.secondary}C8`,
              },
            ]}
          />
          <View pointerEvents="none" style={[styles.themeGem, styles.themeGemTop, { backgroundColor: theme.secondary }]} />
          <View pointerEvents="none" style={[styles.themeGem, styles.themeGemBottom, { backgroundColor: theme.primary }]} />
          {theme.galaxy ? (
            <View pointerEvents="none" style={[styles.galaxyStar, { backgroundColor: '#FFFFFF' }]} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  themeInset: { ...StyleSheet.absoluteFillObject, margin: 3, borderWidth: 1 },
  themeGem: { position: 'absolute', width: 5, height: 5, borderRadius: 2 },
  themeGemTop: { top: 4, left: 4 },
  themeGemBottom: { right: 4, bottom: 4 },
  galaxyStar: { position: 'absolute', width: 3, height: 3, borderRadius: 2, top: 7, right: 7 },
});
