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

export function TrainerAvatar({
  icon = 'pokeball',
  color,
  backgroundColor,
  size = 66,
  avatarUrl,
}: {
  icon?: ProfileIcon | string | null;
  color: string;
  backgroundColor: string;
  size?: number;
  avatarUrl?: string | null;
}) {
  const safeIcon = icon && icon in ICONS ? icon as ProfileIcon : 'pokeball';
  const innerRadius = Math.max(8, size * .28);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size * .31, borderColor: color, backgroundColor }]}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%', borderRadius: innerRadius }}
        />
      ) : (
        <Ionicons name={ICONS[safeIcon]} size={Math.round(size * .45)} color={color} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
