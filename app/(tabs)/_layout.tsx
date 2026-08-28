import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="packs" options={{ title: 'Packs' }} />
      <Tabs.Screen name="bag" options={{ title: 'Bag' }} />
      <Tabs.Screen name="trade" options={{ title: 'Trocas' }} />
      <Tabs.Screen name="battles" options={{ title: 'Batalha' }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
