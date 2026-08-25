import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { registerPushNotifications } from '@/services/notifications';
import { playBattleSound } from '@/services/battleEffects';
import { supabase } from '@/lib/supabase';

function AppStack() {
  const { isLight, colors, settings } = useAppTheme();
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

  useEffect(() => {
    if (!(settings?.battle_sounds ?? true)) return;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || disposed) return;
      channel = supabase
        .channel(`battle-sounds:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battle_events' }, (change) => {
          const event = change.new as any;
          const payload = event?.payload ?? {};
          if (event?.event_type === 'card_locked' && payload.playerId === userId) playBattleSound('lock');
          else if (event?.event_type === 'round_resolved') playBattleSound('reveal');
          else if (event?.event_type === 'completed') playBattleSound(payload.winnerId === userId ? 'win' : 'loss');
        })
        .subscribe();
    }).catch(() => null);
    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [settings?.battle_sounds]);

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
