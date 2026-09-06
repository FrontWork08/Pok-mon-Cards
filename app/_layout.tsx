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
import { clearPendingPasswordRecovery, completeOAuthFromUrl, isOAuthCallbackUrl, isPasswordRecoveryUrl, isPendingPasswordRecoveryFor } from '@/services/auth';
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
import { DeviceSecurityGate } from '@/components/DeviceSecurityGate';
import { NativeQuickActionsBootstrap } from '@/components/NativeQuickActionsBootstrap';

function AppStack() {
  const { isLight, colors, settings } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { userId, loading: walletLoading } = useWallet();
  const [liveNotification, setLiveNotification] = useState<any>(null);
  const [accountRestriction, setAccountRestriction] = useState<PlayerProfile | null>(null);
  const [matchmaking, setMatchmaking] = useState<MatchmakingState | null>(null);
  const [bottomNavHeight, setBottomNavHeight] = useState(0);
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
      const recoveryMarkerInUrl = isPasswordRecoveryUrl(url);
      let passwordRecovery = recoveryMarkerInUrl;
      try {
        const session = await completeOAuthFromUrl(url);
        if (disposed || !session?.user) return;

        const pendingRecoveryForUser = await isPendingPasswordRecoveryFor(session.user.email);
        passwordRecovery = recoveryMarkerInUrl || pendingRecoveryForUser;

        if (passwordRecovery) {
          await clearPendingPasswordRecovery();
          router.replace('/reset-password');
        } else {
          router.replace('/(tabs)');
        }
      } catch (error) {
        console.warn(passwordRecovery ? 'Password recovery callback failed:' : 'Google OAuth callback failed:', error);
        if (!disposed) router.replace('/login');
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

    registerPush();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
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
    if (!userId) {
      setLiveNotification(null);
      return;
    }

    let disposed = false;
    const showNotification = (notification: any) => {
      if (disposed) return;
      setLiveNotification(notification);
      if (liveNotificationTimer.current) clearTimeout(liveNotificationTimer.current);
      liveNotificationTimer.current = setTimeout(() => {
        if (!disposed) setLiveNotification(null);
      }, notification?.type === 'store_gift' ? 11000 : 6000);
    };

    const unsubscribeRealtime = subscribeToMyNotifications(userId, showNotification);
    return () => {
      disposed = true;
      unsubscribeRealtime();
      if (liveNotificationTimer.current) clearTimeout(liveNotificationTimer.current);
    };
  }, [userId]);

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
    if (!userId) return;
    let disposed = false;

    void (async () => {
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
    })();

    return () => { disposed = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setMatchmaking(null);
      lastOpenedMatch.current = null;
      return;
    }

    let disposed = false;
    const handleState = (state: MatchmakingState | null) => {
      if (disposed) return;
      setMatchmaking(state);
      if (
        state?.status === 'matched' &&
        state.matched_battle_id &&
        lastOpenedMatch.current !== state.matched_battle_id
      ) {
        lastOpenedMatch.current = state.matched_battle_id;
        router.push((state.mode_choice === 'team3' ? `/team-battle/${state.matched_battle_id}` : `/battle/${state.matched_battle_id}`) as never);
      }
    };

    void getMyMatchmakingState().then(handleState).catch(() => null);
    const unsubscribe = subscribeMyMatchmaking(userId, handleState);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [router, userId]);

  async function cancelGlobalMatchmaking() {
    try {
      await cancelMatchmaking();
      setMatchmaking((current) => current ? { ...current, status: 'cancelled', matched_battle_id: null } : null);
    } catch {
      // Keep the search indicator if cancellation was not acknowledged.
    }
  }

  useEffect(() => {
    if (!userId) {
      setAccountRestriction(null);
      return;
    }

    let disposed = false;
    const refreshAccount = async () => {
      try {
        const profile = await getMyProfile();
        if (!disposed) setAccountRestriction(profile.account_status === 'active' ? null : profile);
      } catch {
        if (!disposed) setAccountRestriction(null);
      }
    };

    void refreshAccount();
    const channel = supabase
      .channel(`account-status-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${userId}` },
        () => { void refreshAccount(); },
      )
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !(settings?.battle_sounds ?? true)) return;
    const channel = supabase
      .channel(`battle-sounds:${userId}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battle_events' }, (change) => {
        const event = change.new as any;
        const payload = event?.payload ?? {};
        if (event?.event_type === 'card_locked' && payload.playerId === userId) playBattleSound('lock');
        else if (event?.event_type === 'round_resolved') playBattleSound('reveal');
        else if (event?.event_type === 'completed') playBattleSound(payload.winnerId === userId ? 'win' : 'loss');
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [settings?.battle_sounds, userId]);

  useEffect(() => {
    if (!userId) {
      setMaintenanceStatus(null);
      setMaintenanceAdmin(false);
      return;
    }

    let disposed = false;
    const refreshRuntime = async () => {
      const runtime = await getMaintenanceStatus();
      if (!disposed) setMaintenanceStatus(runtime);
    };
    const refreshAll = async () => {
      const [runtime, admin] = await Promise.all([
        getMaintenanceStatus(),
        isCurrentUserAdmin().catch(() => false),
      ]);
      if (!disposed) {
        setMaintenanceStatus(runtime);
        setMaintenanceAdmin(admin);
      }
    };

    void refreshAll().catch(() => null);
    const channel = supabase
      .channel('maintenance-runtime-' + userId + '-' + Date.now())
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_runtime_status', filter: 'id=eq.1' },
        () => { void refreshRuntime().catch(() => null); },
      )
      .subscribe();

    const fallbackTimer = setInterval(() => {
      void refreshRuntime().catch(() => null);
    }, 60000);

    return () => {
      disposed = true;
      clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, maintenanceRefreshVersion]);

  const maintenanceBlocked = Boolean(
    userId && maintenanceStatus?.maintenance_enabled && !maintenanceAdmin,
  );

  // Auth callbacks must mount before a session exists so verified HTTPS App Links
  // can finish OAuth/password recovery instead of being redirected to login first.
  const publicAuthRoute = pathname === '/login' || pathname === '/reset-password' || pathname === '/auth/callback';
  if (!walletLoading && !userId && !publicAuthRoute) {
    return <Redirect href="/login" />;
  }

  const showChrome = Boolean(userId) && !accountRestriction && !maintenanceBlocked && !pathname.startsWith('/battle/') && !pathname.startsWith('/team-battle/') && !pathname.startsWith('/auth/') && pathname !== '/reset-password';
  const matchmakingBottom = showChrome
    ? Math.max(bottomNavHeight + 10, Math.max(insets.bottom, 5) + 77)
    : Math.max(insets.bottom + 12, 18);
  return (
    <View style={[styles.appShell,{backgroundColor:colors.bg}]}>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      {showChrome ? <View style={[styles.appChrome,{backgroundColor:colors.bg,borderBottomColor:colors.border,paddingTop:Math.max(insets.top,6)}]}><TrainerNavigation /></View> : null}
      <View style={styles.stackHost}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} /></View>
      {showChrome ? (
        <View
          collapsable={false}
          onLayout={(event) => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            if (height > 0) setBottomNavHeight((current) => current === height ? current : height);
          }}
        >
          <GlobalBottomNavigation />
        </View>
      ) : null}
      <UpdatePrompt />
      <GlobalAnnouncementOverlay />
      <ReleaseCampaignNotice />
      <NativeQuickActionsBootstrap userId={userId} />
      <DeviceSecurityGate enabled={Boolean(userId) && !publicAuthRoute} />
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
              <Text style={styles.accountBlockerEmoji}>{accountRestriction.account_status === 'banned' ? '⛔' : '⏸️'}</Text>
            </View>
            <Text style={[styles.accountBlockerTitle, { color: colors.text }]}>
              {accountRestriction.account_status === 'banned' ? 'Conta banida' : 'Conta suspensa'}
            </Text>
            <Text style={[styles.accountBlockerBody, { color: colors.muted }]}>
              {accountRestriction.moderation_reason || 'Esta conta está temporariamente indisponível.'}
            </Text>
            {accountRestriction.account_status === 'suspended' && accountRestriction.suspended_until ? (
              <Text style={[styles.accountBlockerMeta, { color: colors.yellow }]}>Até {new Date(accountRestriction.suspended_until).toLocaleString('pt-BR')}</Text>
            ) : null}
            <Pressable onPress={() => { void supabase.auth.signOut(); }} style={[styles.accountBlockerButton, { borderColor: colors.border }]}>
              <Text style={[styles.accountBlockerButtonText, { color: colors.text }]}>SAIR DA CONTA</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {liveNotification && !maintenanceBlocked ? (
        <Pressable onPress={openLiveNotification} style={[styles.notificationToast,{top:Math.max(insets.top,8)+64,backgroundColor:colors.surface,borderColor:colors.yellow}]}>
          <View style={[styles.notificationIcon,{backgroundColor:colors.yellow}]}><Text style={styles.notificationIconText}>!</Text></View>
          <View style={styles.notificationCopy}><Text style={[styles.notificationTitle,{color:colors.text}]} numberOfLines={1}>{liveNotification.title}</Text><Text style={[styles.notificationBody,{color:colors.muted}]} numberOfLines={2}>{liveNotification.body}</Text></View>
        </Pressable>
      ) : null}
      {matchmaking?.status === 'waiting' && !maintenanceBlocked ? (
        <View pointerEvents="box-none" style={[styles.matchmakingHost, { bottom: matchmakingBottom }]}>
          <View style={[styles.matchmakingBanner,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
            <View style={[styles.matchmakingPulse,{backgroundColor:colors.yellow}]} />
            <View style={styles.matchmakingCopy}><Text style={[styles.matchmakingTitle,{color:colors.text}]}>Buscando partida ranqueada...</Text><Text style={[styles.matchmakingBody,{color:colors.muted}]}>Você pode continuar usando o app. Abriremos a batalha automaticamente.</Text></View>
            <Pressable onPress={()=>{void cancelGlobalMatchmaking();}} style={[styles.matchmakingCancel,{borderColor:colors.border}]}><Text style={[styles.matchmakingCancelText,{color:colors.muted}]}>CANCELAR</Text></Pressable>
          </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(4,9,17,0.94)',
  },
  maintenanceCard: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
  },
  maintenanceIcon: { width: 78, height: 78, borderRadius: 24, backgroundColor: '#162235', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  maintenanceEmoji: { fontSize: 38 },
  maintenanceTitle: { fontSize: 23, fontWeight: '900', textAlign: 'center' },
  maintenanceText: { marginTop: 10, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  maintenanceNotice: { marginTop: 18, width: '100%', borderWidth: 1, borderRadius: 16, padding: 14 },
  maintenanceNoticeText: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontWeight: '700' },
  maintenanceRefresh: { marginTop: 18, minHeight: 48, paddingHorizontal: 20, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  maintenanceRefreshText: { color: '#07111F', fontSize: 11, fontWeight: '900' },
  maintenanceSignOut: { marginTop: 10, minHeight: 42, paddingHorizontal: 22, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  maintenanceSignOutText: { fontSize: 10, fontWeight: '800' },
  accountBlocker:{...StyleSheet.absoluteFillObject,zIndex:6000,alignItems:'center',justifyContent:'center',padding:22,backgroundColor:'rgba(4,9,17,0.93)'},
  accountBlockerCard:{width:'100%',maxWidth:460,borderWidth:1,borderRadius:26,padding:24,alignItems:'center'},
  accountBlockerIcon:{width:76,height:76,borderRadius:24,alignItems:'center',justifyContent:'center',marginBottom:14},
  accountBlockerEmoji:{fontSize:38},
  accountBlockerTitle:{fontSize:24,fontWeight:'900',textAlign:'center'},
  accountBlockerBody:{fontSize:13,lineHeight:20,textAlign:'center',marginTop:10},
  accountBlockerMeta:{fontSize:11,fontWeight:'900',marginTop:12},
  accountBlockerButton:{marginTop:20,minHeight:46,paddingHorizontal:26,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  accountBlockerButtonText:{fontSize:11,fontWeight:'900'},
  notificationToast:{position:'absolute',zIndex:5000,left:12,right:12,maxWidth:560,alignSelf:'center',borderWidth:1,borderRadius:18,padding:12,flexDirection:'row',alignItems:'center',gap:10,shadowColor:'#000',shadowOpacity:.35,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:12},
  notificationIcon:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
  notificationIconText:{color:'#07111F',fontSize:16,fontWeight:'900'},
  notificationCopy:{flex:1,minWidth:0},
  notificationTitle:{fontSize:12,fontWeight:'900'},
  notificationBody:{fontSize:10,lineHeight:14,marginTop:2},
  matchmakingHost:{position:'absolute',zIndex:4850,left:10,right:10,alignItems:'center'},
  matchmakingBanner:{width:'100%',maxWidth:620,minHeight:62,borderWidth:1,borderRadius:18,paddingHorizontal:12,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10,shadowColor:'#000',shadowOpacity:.30,shadowRadius:16,shadowOffset:{width:0,height:7},elevation:11},
  matchmakingPulse:{width:12,height:12,borderRadius:6},
  matchmakingCopy:{flex:1,minWidth:0},
  matchmakingTitle:{fontSize:11,fontWeight:'900'},
  matchmakingBody:{fontSize:9,lineHeight:13,marginTop:2},
  matchmakingCancel:{minHeight:34,paddingHorizontal:10,borderRadius:10,borderWidth:1,alignItems:'center',justifyContent:'center'},
  matchmakingCancelText:{fontSize:8,fontWeight:'900'},
});
