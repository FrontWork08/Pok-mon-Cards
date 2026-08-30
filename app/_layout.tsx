import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { Redirect, Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { GlobalAnnouncementOverlay } from '@/components/GlobalAnnouncement';
import { ReleaseCampaignNotice } from '@/components/ReleaseCampaignNotice';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';
import { registerPushNotifications, resolveNotificationRoute, subscribeToMyNotifications } from '@/services/notifications';
import { playBattleSound } from '@/services/battleEffects';
import { completeOAuthFromUrl, isOAuthCallbackUrl } from '@/services/auth';
import { getMyProfile, type PlayerProfile } from '@/services/player';
import { supabase } from '@/lib/supabase';
import { WalletProvider } from '@/wallet/WalletProvider';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelMatchmaking, getMyMatchmakingState, subscribeMyMatchmaking, type MatchmakingState } from '@/services/matchmaking';
import { claimDailyLogin } from '@/services/retention';
import { TrainerNavigation } from '@/components/TrainerNavigation';
import { GlobalBottomNavigation } from '@/components/GlobalBottomNavigation';
import { useWallet } from '@/wallet/WalletProvider';
import { isCurrentUserAdmin } from '@/services/market';
import { getMaintenanceStatus, type AppRuntimeStatus } from '@/services/maintenance';
import { publishMyOnlinePresence } from '@/services/presence';
import { WebPwaBootstrap } from '@/components/WebPwaBootstrap';

function AppStack() {
  const { isLight, colors, settings } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { userId, loading: walletLoading } = useWallet();
  const [liveNotification, setLiveNotification] = useState<any>(null);
  const [accountRestriction, setAccountRestriction] = useState<PlayerProfile | null>(null);
  const [matchmaking, setMatchmaking] = useState<MatchmakingState | null>(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState<AppRuntimeStatus | null>(null);
  const [maintenanceAdmin, setMaintenanceAdmin] = useState(false);
  const [maintenanceRefreshVersion, setMaintenanceRefreshVersion] = useState(0);
  const liveNotificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOpenedMatch = useRef<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(() => router.replace('/reset-password'), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    const publisher = publishMyOnlinePresence(userId, settings?.show_online_status ?? true);
    return () => publisher.stop();
  }, [userId, settings?.show_online_status]);

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
      if (!session?.user) return;
      // supabase-js can deadlock if another Supabase call starts inside
      // onAuthStateChange. Always defer follow-up work to the next tick.
      setTimeout(registerPush, 0);
    });

    import('expo-notifications').then(async (Notifications) => {
      if (disposed) return;

      const openResponse = (response: any) => {
        const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
        router.push(resolveNotificationRoute(data) as never);
      };

      notificationSubscription = Notifications.addNotificationResponseReceivedListener(openResponse);

      const lastResponse = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      const responseDate = Number(lastResponse?.notification?.date ?? 0);
      const recentEnough = responseDate > 0 && Date.now() - responseDate < 2 * 60 * 1000;
      if (!disposed && lastResponse && recentEnough) openResponse(lastResponse);
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
      if (session?.user?.id) {
        const nextUserId = session.user.id;
        setTimeout(() => { void attachRealtime(nextUserId); }, 0);
      } else {
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
    const data = {
      ...((liveNotification.metadata ?? {}) as Record<string, any>),
      type: liveNotification.type,
    };
    setLiveNotification(null);
    router.push(resolveNotificationRoute(data) as never);
  }

  useEffect(() => {
    let disposed = false;
    let lastUserId: string | null = null;

    const claimFor = async (userId?: string | null) => {
      if (!userId || disposed || lastUserId === userId) return;
      lastUserId = userId;
      try {
        const result = await claimDailyLogin();
        if (disposed || !result.claimed) return;
        setLiveNotification({
          title: `Sequência diária 🔥 ${result.streak}`,
          body: `+🪙 ${result.coins.toLocaleString('pt-BR')}${result.diamonds ? ` +💎 ${result.diamonds}` : ''}`,
          metadata: { route: '/season' },
        });
        if (liveNotificationTimer.current) clearTimeout(liveNotificationTimer.current);
        liveNotificationTimer.current = setTimeout(() => {
          if (!disposed) setLiveNotification(null);
        }, 7000);
      } catch {
        // Daily login is a bonus; it must never block app startup.
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      void claimFor(data.user?.id ?? null);
    }).catch(() => null);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.id) {
        lastUserId = null;
      } else {
        const nextUserId = session.user.id;
        setTimeout(() => { void claimFor(nextUserId); }, 0);
      }
    });

    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const clear = () => {
      unsubscribe?.();
      unsubscribe = null;
    };

    const handleState = (state: MatchmakingState | null) => {
      if (disposed) return;
      setMatchmaking(state);
      if (
        state?.status === 'matched' &&
        state.matched_battle_id &&
        lastOpenedMatch.current !== state.matched_battle_id
      ) {
        lastOpenedMatch.current = state.matched_battle_id;
        router.push(`/battle/${state.matched_battle_id}`);
      }
    };

    const attach = async (userId?: string | null) => {
      clear();
      if (!userId || disposed) {
        setMatchmaking(null);
        lastOpenedMatch.current = null;
        return;
      }
      const initial = await getMyMatchmakingState().catch(() => null);
      if (disposed) return;
      handleState(initial);
      unsubscribe = subscribeMyMatchmaking(userId, (next) => handleState(next));
    };

    supabase.auth.getUser().then(({ data }) => {
      void attach(data.user?.id ?? null);
    }).catch(() => null);

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      setTimeout(() => { void attach(nextUserId); }, 0);
    });

    return () => {
      disposed = true;
      clear();
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  async function cancelGlobalMatchmaking() {
    try {
      await cancelMatchmaking();
      setMatchmaking((current) => current ? { ...current, status: 'cancelled', matched_battle_id: null } : null);
    } catch {
      // Keep the search indicator if cancellation was not acknowledged.
    }
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
      const nextUserId = session?.user?.id ?? null;
      setTimeout(() => { void attach(nextUserId); }, 0);
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

  useEffect(() => {
    if (!userId) {
      setMaintenanceStatus(null);
      setMaintenanceAdmin(false);
      return;
    }

    let disposed = false;
    const refresh = async () => {
      const [runtime, admin] = await Promise.all([
        getMaintenanceStatus(),
        isCurrentUserAdmin().catch(() => false),
      ]);
      if (!disposed) {
        setMaintenanceStatus(runtime);
        setMaintenanceAdmin(admin);
      }
    };

    void refresh().catch(() => null);
    const channel = supabase
      .channel('maintenance-runtime-' + userId + '-' + Date.now())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_runtime_status', filter: 'id=eq.1' },
        () => { void refresh().catch(() => null); },
      )
      .subscribe();
    const fallbackTimer = setInterval(() => {
      void refresh().catch(() => null);
    }, 15000);

    return () => {
      disposed = true;
      clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, maintenanceRefreshVersion]);

  const maintenanceBlocked = Boolean(
    userId && maintenanceStatus?.maintenance_enabled && !maintenanceAdmin,
  );

  // Global auth boundary: once WalletProvider confirms there is no session,
  // private routes cannot stay mounted. This also covers logout from profile,
  // maintenance screens, deep links and any future sign-out entry point.
  const publicAuthRoute = pathname === '/' || pathname === '/reset-password';
  if (!walletLoading && !userId && !publicAuthRoute) {
    return <Redirect href="/" />;
  }

  const showChrome = Boolean(userId) && !accountRestriction && !maintenanceBlocked && !pathname.startsWith('/battle/') && pathname !== '/reset-password';
  return (
    <View style={[styles.appShell,{backgroundColor:colors.bg}]}>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      {showChrome ? <View style={[styles.appChrome,{backgroundColor:colors.bg,borderBottomColor:colors.border,paddingTop:Math.max(insets.top,6)}]}><TrainerNavigation /></View> : null}
      <View style={styles.stackHost}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} /></View>
      {showChrome ? <GlobalBottomNavigation /> : null}
      <UpdatePrompt />
      <GlobalAnnouncementOverlay />
      <ReleaseCampaignNotice />
      {maintenanceBlocked ? (
        <View style={styles.maintenanceBlocker}>
          <View style={[styles.maintenanceCard, { backgroundColor: colors.surface, borderColor: '#FF6475' }]}>
            <View style={styles.maintenanceIcon}>
              <Text style={styles.maintenanceEmoji}>🛠️</Text>
            </View>
            <Text style={[styles.maintenanceTitle, { color: colors.text }]}>Atualização em andamento</Text>
            <Text style={[styles.maintenanceText, { color: colors.muted }]}>
              {maintenanceStatus?.maintenance_message}
            </Text>
            <View style={[styles.maintenanceNotice, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={[styles.maintenanceNoticeText, { color: colors.text }]}>
                Packs, batalhas, trocas, chat e mercado estão temporariamente pausados para proteger sua conta.
              </Text>
            </View>
            <Pressable
              onPress={() => setMaintenanceRefreshVersion((value) => value + 1)}
              style={[styles.maintenanceRefresh, { backgroundColor: colors.yellow }]}
            >
              <Text style={styles.maintenanceRefreshText}>VERIFICAR SE JÁ VOLTOU</Text>
            </Pressable>
            <Pressable
              onPress={() => { void supabase.auth.signOut(); }}
              style={[styles.maintenanceSignOut, { borderColor: colors.border }]}
            >
              <Text style={[styles.maintenanceSignOutText, { color: colors.muted }]}>SAIR DA CONTA</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
      {matchmaking?.status === 'waiting' && !accountRestriction ? (
        <View pointerEvents="box-none" style={[styles.matchmakingHost, { bottom: Math.max(insets.bottom + 12, 18) }]}>
          <View style={[styles.matchmakingBanner, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
            <View style={[styles.matchmakingPulse, { backgroundColor: colors.yellow }]}>
              <Text style={styles.matchmakingPulseText}>⚡</Text>
            </View>
            <Pressable style={styles.matchmakingBody} onPress={() => router.push('/(tabs)/battles')}>
              <Text style={[styles.matchmakingTitle, { color: colors.text }]}>Buscando partida ranqueada...</Text>
              <Text style={[styles.matchmakingText, { color: colors.muted }]}>
                {matchmaking.mode_choice === 'draft3' ? 'Draft 3' : matchmaking.mode_choice === 'mystery' ? 'Mystery BO3' : 'Quick'} • continue navegando normalmente
              </Text>
            </Pressable>
            <Pressable accessibilityLabel="Cancelar busca de partida" onPress={() => { void cancelGlobalMatchmaking(); }} style={[styles.matchmakingCancel, { borderColor: colors.border }]}>
              <Text style={styles.matchmakingCancelText}>✕</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {liveNotification && !accountRestriction ? (
        <View pointerEvents="box-none" style={[styles.liveNotificationHost, { top: showChrome ? Math.max(insets.top + 92, 98) : Math.max(insets.top + 8, 14) }]}>
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
    </View>
  );
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><WalletProvider><WebPwaBootstrap /><AppStack /></WalletProvider></ThemeProvider></SafeAreaProvider>;
}


const styles = StyleSheet.create({
  appShell:{flex:1},
  stackHost:{flex:1,minHeight:0},
  appChrome:{zIndex:1500,paddingHorizontal:12,paddingBottom:7,borderBottomWidth:1},
  maintenanceBlocker: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7000,
    backgroundColor: 'rgba(3,7,14,.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  maintenanceCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 26,
    borderWidth: 1,
    padding: 23,
    alignItems: 'center',
  },
  maintenanceIcon: {
    width: 72,
    height: 72,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#351A24',
    marginBottom: 15,
  },
  maintenanceEmoji: { fontSize: 34 },
  maintenanceTitle: { fontSize: 25, fontWeight: '900', textAlign: 'center' },
  maintenanceText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  maintenanceNotice: { width: '100%', borderRadius: 15, borderWidth: 1, padding: 13, marginTop: 17 },
  maintenanceNoticeText: { fontSize: 10, lineHeight: 15, textAlign: 'center', fontWeight: '700' },
  maintenanceRefresh: { minHeight: 50, width: '100%', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  maintenanceRefreshText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .45 },
  maintenanceSignOut: { minHeight: 44, minWidth: 160, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 9, paddingHorizontal: 14 },
  maintenanceSignOutText: { fontSize: 9, fontWeight: '900' },
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
  matchmakingHost: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1300,
    alignItems: 'center',
  },
  matchmakingBanner: {
    width: '100%',
    maxWidth: 600,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    shadowColor: '#000',
    shadowOpacity: .3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
  },
  matchmakingPulse: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchmakingPulseText: { fontSize: 18 },
  matchmakingBody: { flex: 1, minWidth: 0 },
  matchmakingTitle: { fontSize: 12, fontWeight: '900' },
  matchmakingText: { fontSize: 8, lineHeight: 12, marginTop: 3 },
  matchmakingCancel: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchmakingCancelText: { color: '#FF8290', fontSize: 18, fontWeight: '900' },
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
