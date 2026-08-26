import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { registerPushNotifications } from '@/services/notifications';
import { playBattleSound } from '@/services/battleEffects';
import { completeOAuthFromUrl, isOAuthCallbackUrl } from '@/services/auth';
import { supabase } from '@/lib/supabase';

function AppStack() {
  const { isLight, colors, settings } = useAppTheme();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;

    const handleOAuthUrl = async (url?: string | null) => {
      if (disposed || !url || !isOAuthCallbackUrl(url)) return;
      try {
        const session = await completeOAuthFromUrl(url);
        if (!disposed && session?.user) router.replace('/(tabs)');
      } catch (error) {
        console.warn('Google OAuth callback failed:', error);
        if (!disposed) router.replace('/');
      }
    };

    Linking.getInitialURL().then(handleOAuthUrl).catch(() => null);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleOAuthUrl(url).catch(() => null);
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let notificationSubscription: { remove: () => void } | null = null;

    const registerPush = () => {
      if (disposed) return;
      registerPushNotifications().catch(() => null);
    };

    // Try immediately for an already-restored session, and retry whenever Auth
    // establishes a session after login. This prevents a first-launch race where
    // push registration happens before the user is authenticated.
    registerPush();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) registerPush();
    });

    import('expo-notifications').then((Notifications) => {
      if (disposed) return;
      notificationSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, any>;
        if (data?.battleId) router.push(`/battle/${data.battleId}`);
        else if (data?.senderId) router.push(`/chat/${data.senderId}`);
        else router.push('/inbox');
      });
    }).catch(() => null);

    return () => {
      disposed = true;
      notificationSubscription?.remove();
      authListener.subscription.unsubscribe();
    };
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
      <UpdatePrompt />
    </>
  );
}

export default function RootLayout() {
  return <ThemeProvider><AppStack /></ThemeProvider>;
}
