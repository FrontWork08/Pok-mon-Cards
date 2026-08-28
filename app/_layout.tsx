import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { GlobalAnnouncementOverlay } from '@/components/GlobalAnnouncement';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { registerPushNotifications, subscribeToMyNotifications } from '@/services/notifications';
import { playBattleSound } from '@/services/battleEffects';
import { completeOAuthFromUrl, isOAuthCallbackUrl } from '@/services/auth';
import { getMyProfile, type PlayerProfile } from '@/services/player';
import { supabase } from '@/lib/supabase';
import { WalletProvider } from '@/wallet/WalletProvider';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function AppStack() {
  const { isLight, colors, settings } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [liveNotification, setLiveNotification] = useState<any>(null);
  const [accountRestriction, setAccountRestriction] = useState<PlayerProfile | null>(null);
  const liveNotificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    let disposed = false;
    let unsubscribeRealtime: (() => void) | null = null;

    const clearRealtime = () => {
      unsubscribeRealtime?.();
      unsubscribeRealtime = null;
    };

    const showNotification = (notification: any) => {
      if (disposed) return;
      setLiveNotification(notification);
      if (liveNotificationTimer.current) clearTimeout(liveNotificationTimer.current);
      liveNotificationTimer.current = setTimeout(() => {
        if (!disposed) setLiveNotification(null);
      }, 6000);
    };

    const attachRealtime = async (userId?: string | null) => {
      clearRealtime();
      let id = userId ?? null;
      if (!id) {
        const { data } = await supabase.auth.getUser();
        id = data.user?.id ?? null;
      }
      if (!id || disposed) return;
      unsubscribeRealtime = subscribeToMyNotifications(id, showNotification);
    };

    void attachRealtime();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) void attachRealtime(session.user.id);
      else {
        clearRealtime();
        setLiveNotification(null);
      }
    });

    return () => {
      disposed = true;
      clearRealtime();
      authListener.subscription.unsubscribe();
      if (liveNotificationTimer.current) clearTimeout(liveNotificationTimer.current);
    };
  }, []);

  function openLiveNotification() {
    if (!liveNotification) return;
    const data = (liveNotification.metadata ?? {}) as Record<string, any>;
    setLiveNotification(null);
    if (data?.battleId) router.push(`/battle/${data.battleId}`);
    else if (data?.senderId) router.push(`/chat/${data.senderId}`);
    else router.push('/inbox');
  }

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let sequence = 0;

    const clearChannel = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };

    const refreshAccount = async () => {
      try {
        const profile = await getMyProfile();
        if (disposed) return;
        setAccountRestriction(profile.account_status === 'active' ? null : profile);
      } catch {
        if (!disposed) setAccountRestriction(null);
      }
    };

    const attach = async (userId?: string | null) => {
      clearChannel();
      if (!userId || disposed) {
        setAccountRestriction(null);
        return;
      }

      await refreshAccount();
      if (disposed) return;

      sequence += 1;
      channel = supabase
        .channel(`account-status-${userId}-${sequence}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${userId}` },
          () => { void refreshAccount(); },
        );
      channel.subscribe();
    };

    supabase.auth.getUser().then(({ data }) => {
      void attach(data.user?.id ?? null);
    }).catch(() => null);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void attach(session?.user?.id ?? null);
    });

    return () => {
      disposed = true;
      clearChannel();
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!(settings?.battle_sounds ?? true)) return;
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || disposed) return;
      channel = supabase
        .channel(`battle-sounds:${userId}:${Date.now()}`)
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
      <GlobalAnnouncementOverlay />
      {accountRestriction ? (
        <View style={styles.accountBlocker}>
          <View style={[styles.accountBlockerCard, { backgroundColor: colors.surface, borderColor: accountRestriction.account_status === 'banned' ? '#A84250' : '#D97732' }]}>
            <View style={[styles.accountBlockerIcon, { backgroundColor: accountRestriction.account_status === 'banned' ? '#351A24' : '#3B2313' }]}>
              <Text style={styles.accountBlockerEmoji}>{accountRestriction.account_status === 'banned' ? '⛔' : '⏳'}</Text>
            </View>
            <Text style={[styles.accountBlockerTitle, { color: colors.text }]}>
              {accountRestriction.account_status === 'banned' ? 'Conta banida' : 'Conta suspensa'}
            </Text>
            <Text style={[styles.accountBlockerText, { color: colors.muted }]}>
              {accountRestriction.account_status === 'banned'
                ? 'Seu acesso ao jogo foi bloqueado pela moderação.'
                : 'Seu acesso ao jogo está temporariamente suspenso.'}
            </Text>
            {accountRestriction.moderation_reason ? (
              <View style={[styles.accountReason, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={[styles.accountReasonLabel, { color: colors.muted }]}>MOTIVO</Text>
                <Text style={[styles.accountReasonText, { color: colors.text }]}>{accountRestriction.moderation_reason}</Text>
              </View>
            ) : null}
            {accountRestriction.account_status === 'suspended' && accountRestriction.suspended_until ? (
              <Text style={[styles.accountUntil, { color: '#FFB16A' }]}>
                Até {new Date(accountRestriction.suspended_until).toLocaleString('pt-BR')}
              </Text>
            ) : null}
            <Pressable
              onPress={() => { void supabase.auth.signOut(); }}
              style={[styles.accountSignOut, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
            >
              <Text style={[styles.accountSignOutText, { color: colors.text }]}>SAIR DA CONTA</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {liveNotification && !accountRestriction ? (
        <View pointerEvents="box-none" style={[styles.liveNotificationHost, { top: Math.max(insets.top + 8, 14) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${liveNotification.title ?? 'Notificação'}: ${liveNotification.body ?? ''}`}
            onPress={openLiveNotification}
            style={[styles.liveNotification, { backgroundColor: colors.surface, borderColor: colors.accent }]}
          >
            <View style={[styles.liveNotificationDot, { backgroundColor: colors.yellow }]} />
            <View style={styles.liveNotificationText}>
              <Text numberOfLines={1} style={[styles.liveNotificationTitle, { color: colors.text }]}>
                {liveNotification.title ?? 'Nova notificação'}
              </Text>
              <Text numberOfLines={2} style={[styles.liveNotificationBody, { color: colors.muted }]}>
                {liveNotification.body ?? 'Toque para abrir.'}
              </Text>
            </View>
            <Text style={[styles.liveNotificationOpen, { color: colors.accent }]}>ABRIR</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><WalletProvider><AppStack /></WalletProvider></ThemeProvider></SafeAreaProvider>;
}


const styles = StyleSheet.create({
  accountBlocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    backgroundColor: 'rgba(0,0,0,.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  accountBlockerCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  accountBlockerIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  accountBlockerEmoji: { fontSize: 30 },
  accountBlockerTitle: { fontSize: 25, fontWeight: '900', textAlign: 'center' },
  accountBlockerText: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  accountReason: { width: '100%', borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 15 },
  accountReasonLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  accountReasonText: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  accountUntil: { fontSize: 11, fontWeight: '900', marginTop: 12 },
  accountSignOut: { minHeight: 48, minWidth: 180, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 16 },
  accountSignOutText: { fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  liveNotificationHost: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    alignItems: 'center',
  },
  liveNotification: {
    width: '100%',
    maxWidth: 560,
    minHeight: 70,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: .28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  liveNotificationDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  liveNotificationText: {
    flex: 1,
    minWidth: 0,
  },
  liveNotificationTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  liveNotificationBody: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },
  liveNotificationOpen: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: .6,
  },
});
