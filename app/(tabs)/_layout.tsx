import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
        tabBarStyle: { backgroundColor: '#10141f', borderTopColor: '#252b3a' },
        tabBarActiveTintColor: '#f6c945',
        tabBarInactiveTintColor: '#8d96aa',
        sceneStyle: { backgroundColor: '#090c12' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name] ?? 'ellipse'} size={size} color={color} />
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
