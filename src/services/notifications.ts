import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
  if (Platform.OS === 'web') return null;
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
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Pokémon Cards',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 90, 180],
      sound: 'default',
    });
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
  if (Platform.OS === 'web') return;
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
    .channel(`notifications:${playerId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `player_id=eq.${playerId}` }, (payload) => onNotification(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
