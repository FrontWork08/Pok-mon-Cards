import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  packs: 'cube',
  bag: 'albums',
  trade: 'swap-horizontal',
  profile: 'person',
};

export default function TabsLayout() {
  const { colors, isLight } = useAppTheme();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const mobileTabBarStyle = {
    height: 66 + Math.max(insets.bottom, 6),
    paddingTop: 7,
    paddingBottom: Math.max(insets.bottom, 7),
    marginHorizontal: 10,
    marginBottom: 8,
    borderTopWidth: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: isLight ? 0.12 : 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
  } as const;

  const webTabBarStyle = {
    position: 'absolute' as const,
    left: 14,
    right: 14,
    bottom: 12,
    height: 72,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 0,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: isLight
      ? '0 8px 22px rgba(22,42,72,0.16)'
      : '0 8px 24px rgba(0,0,0,0.28)',
  } as any;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        // On phones the tab bar stays in normal layout flow. This reserves its
        // own height, so cards/buttons never slide underneath the navigation.
        tabBarStyle: isWeb ? webTabBarStyle : mobileTabBarStyle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        tabBarActiveTintColor: colors.yellow,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              focused
                ? icons[route.name] ?? 'ellipse'
                : (`${icons[route.name] ?? 'ellipse'}-outline` as keyof typeof Ionicons.glyphMap)
            }
            size={focused ? size + 1 : size}
            color={color}
          />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="packs" options={{ title: 'Packs' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="trade" options={{ title: 'Trocas' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
