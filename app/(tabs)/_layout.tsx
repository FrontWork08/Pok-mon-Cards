import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { gameTheme } from '@/theme/gameTheme';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  packs: 'cube',
  bag: 'albums',
  trade: 'swap-horizontal',
  profile: 'person',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 12,
          height: 72,
          paddingTop: 8,
          paddingBottom: 8,
          borderTopWidth: 0,
          borderRadius: 24,
          backgroundColor: '#0B1728',
          elevation: 12,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        tabBarActiveTintColor: gameTheme.colors.yellow,
        tabBarInactiveTintColor: '#70839F',
        sceneStyle: { backgroundColor: gameTheme.colors.bg },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? icons[route.name] ?? 'ellipse' : (`${icons[route.name] ?? 'ellipse'}-outline` as keyof typeof Ionicons.glyphMap)} size={focused ? size + 1 : size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="packs" options={{ title: 'Packs' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="trade" options={{ title: 'Trade' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
