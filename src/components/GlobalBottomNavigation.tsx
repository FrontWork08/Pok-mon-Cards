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
              <View
                style={[
                  styles.iconShell,
                  active && {
                    backgroundColor: colors.accentSoft,
                    borderColor: colors.yellow,
                  },
                ]}
              >
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={active ? 22 : 20}
                  color={active ? colors.yellow : colors.muted}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: active ? colors.text : colors.muted },
                  active && styles.activeLabel,
                ]}
              >
                {item.label}
              </Text>
              {active ? <View style={[styles.activeDot, { backgroundColor: colors.yellow }]} /> : null}
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
    paddingHorizontal: 12,
    paddingTop: 7,
  },
  bar: {
    width: '100%',
    minHeight: 72,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingTop: 7,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
    elevation: 16,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  activeLabel: {
    fontWeight: '900',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 3,
    borderRadius: 999,
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.97 }],
  },
});
