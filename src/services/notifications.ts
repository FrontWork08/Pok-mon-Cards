import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

let notificationHandlerConfigured = false;

const ALLOWED_NOTIFICATION_ROUTES = [
  '/inbox',
  '/friends',
  '/guilds',
  '/guild-wars',
  '/marketplace',
  '/market-offers',
  '/tournaments',
  '/battle-pass',
  '/missions',
  '/season',
  '/wishlist',
  '/legacy-selection',
  '/(tabs)',
  '/(tabs)/battles',
  '/(tabs)/trade',
  '/(tabs)/bag',
  '/(tabs)/packs',
  '/(tabs)/profile',
];

const ALLOWED_NOTIFICATION_PREFIXES = [
  '/battle/',
  '/chat/',
  '/trade/',
  '/card/',
  '/player/',
  '/deck/',
  '/set/',
  '/pokemon/',
];

function safeSegment(value: unknown) {
  return encodeURIComponent(String(value ?? '').trim());
}

function safeExplicitRoute(value: unknown) {
  if (typeof value !== 'string') return null;
  const route = value.trim();
  if (!route.startsWith('/') || route.includes('://')) return null;
  if (ALLOWED_NOTIFICATION_ROUTES.includes(route)) return route;
  if (ALLOWED_NOTIFICATION_PREFIXES.some((prefix) => route.startsWith(prefix))) return route;
  return null;
}

export function resolveNotificationRoute(data?: Record<string, any> | null) {
  const value = data ?? {};
  const explicit = safeExplicitRoute(value.route);
  if (explicit) return explicit;

  if (value.battleId) return `/battle/${safeSegment(value.battleId)}`;
  if (value.tradeId) return `/trade/${safeSegment(value.tradeId)}`;
  if (value.senderId) return `/chat/${safeSegment(value.senderId)}`;
  if (value.cardId) return `/card/${safeSegment(value.cardId)}`;
  if (value.playerId) return `/player/${safeSegment(value.playerId)}`;
  if (value.deckId) return `/deck/${safeSegment(value.deckId)}`;

  const type = String(value.type ?? value.notificationType ?? '').toLowerCase();
  if (type.includes('battle') || type.includes('match')) return '/(tabs)/battles';
  if (type.includes('trade')) return '/(tabs)/trade';
  if (type.includes('market') || type.includes('listing') || type.includes('offer')) return '/marketplace';
  if (type.includes('friend') || type.includes('social')) return '/friends';
  if (type.includes('guild')) return '/guilds';
  if (type.includes('mission')) return '/missions';
  if (type.includes('season') || type.includes('streak')) return '/season';
  if (type.includes('wishlist')) return '/wishlist';

  return '/inbox';
}

async function getNativeNotifications() {
  if (Platform.OS === 'web') return null;
  const Notifications = await import('expo-notifications');
  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerConfigured = true;
  }
  return Notifications;
}

export async function getConversationInbox() {
  const { data, error } = await supabase.rpc('get_my_conversation_summaries');
  if (error) throw error;
  return data ?? [];
}

export async function getUnreadConversationCount() {
  const rows = await getConversationInbox();
  return rows.reduce((sum: number, item: any) => sum + Number(item.unread_count ?? 0), 0);
}

export async function getMyNotifications(limit = 100) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,metadata,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function registerPushNotifications() {
  const Notifications = await getNativeNotifications();
  if (!Notifications) return null;

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Promise.all([
      Notifications.setNotificationChannelAsync('default', {
        name: 'Trainer Collection',
        description: 'Avisos gerais da sua conta Trainer Collection.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 90, 180],
        sound: 'default',
      }),
      Notifications.setNotificationChannelAsync('battles', {
        name: 'Batalhas',
        description: 'Desafios, matchmaking e resultados de batalha.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 220, 100, 220],
        sound: 'default',
      }),
      Notifications.setNotificationChannelAsync('social', {
        name: 'Amigos e Guilda',
        description: 'Mensagens, amizades e atividades da guilda.',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 160],
        sound: 'default',
      }),
      Notifications.setNotificationChannelAsync('trades', {
        name: 'Trocas e Mercado',
        description: 'Ofertas, trocas e movimentações do mercado.',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 160],
        sound: 'default',
      }),
    ]);
  }

  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as any)?.eas?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;

  const { error } = await supabase.from('push_tokens').upsert({
    expo_push_token: token,
    player_id: user.id,
    platform: Platform.OS,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
  return token;
}

export async function disableCurrentPushToken() {
  const Notifications = await getNativeNotifications();
  if (!Notifications) return;
  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as any)?.eas?.projectId;
  if (!projectId) return;
  const status = await Notifications.getPermissionsAsync();
  if (status.status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return;
  await supabase.from('push_tokens').update({ enabled: false, updated_at: new Date().toISOString() }).eq('expo_push_token', token);
}

export function subscribeToMyNotifications(playerId: string, onNotification: (notification: any) => void) {
  const channel = supabase
    .channel(`notifications:${playerId}:${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `player_id=eq.${playerId}` }, (payload) => onNotification(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
