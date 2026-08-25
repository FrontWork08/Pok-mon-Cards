import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { registerPushNotifications } from '@/services/notifications';

function AppStack() {
  const { isLight, colors } = useAppTheme();
  const router = useRouter();

  useEffect(() => {
    registerPushNotifications().catch(() => null);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any>;
      if (data?.battleId) router.push(`/battle/${data.battleId}`);
      else if (data?.senderId) router.push(`/chat/${data.senderId}`);
      else router.push('/inbox');
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}

export default function RootLayout() {
  return <ThemeProvider><AppStack /></ThemeProvider>;
}
