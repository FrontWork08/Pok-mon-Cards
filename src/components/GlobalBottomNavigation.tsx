import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';

type NavItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  matches: (pathname: string) => boolean;
};

const ITEMS: NavItem[] = [
  {
    label: 'Início',
    href: '/(tabs)',
    icon: 'home-outline',
    activeIcon: 'home',
    matches: (pathname) => pathname === '/' || pathname === '/(tabs)' || pathname === '/index',
  },
  {
    label: 'Packs',
    href: '/(tabs)/packs',
    icon: 'cube-outline',
    activeIcon: 'cube',
    matches: (pathname) => pathname.includes('/packs'),
  },
  {
    label: 'Bag',
    href: '/(tabs)/bag',
    icon: 'albums-outline',
    activeIcon: 'albums',
    matches: (pathname) => pathname.includes('/bag'),
  },
  {
    label: 'Trocas',
    href: '/(tabs)/trade',
    icon: 'swap-horizontal-outline',
    activeIcon: 'swap-horizontal',
    matches: (pathname) => pathname.includes('/trade'),
  },
  {
    label: 'Batalha',
    href: '/(tabs)/battles',
    icon: 'game-controller-outline',
    activeIcon: 'game-controller',
    matches: (pathname) => pathname.includes('/battles'),
  },
];

export function GlobalBottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, isLight } = useAppTheme();

  return (
    <View
      style={[
        styles.host,
        {
          backgroundColor: colors.bg,
          paddingBottom: Math.max(insets.bottom, 7),
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowOpacity: isLight ? 0.12 : 0.28,
          },
        ]}
      >
        {ITEMS.map((item) => {
          const active = item.matches(pathname);
          return (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(item.href as never)}
              style={({ pressed }) => [
                styles.item,
                active && { backgroundColor: colors.accentSoft },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={21}
                color={active ? colors.yellow : colors.muted}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: active ? colors.yellow : colors.muted },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  bar: {
    width: '100%',
    minHeight: 64,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 14,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.7,
  },
});
