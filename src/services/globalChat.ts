import { supabase } from '@/lib/supabase';
import { getPlayerAvatarMap, type PlayerAvatarMeta } from '@/services/player';

export type GlobalChatMessage = {
  id: string;
  playerId: string;
  username: string;
  profileIcon: string;
  avatarPath: string | null;
  avatarUpdatedAt: string | null;
  frameId: string | null;
  backgroundId: string | null;
  titleId: string | null;
  title: string | null;
  titleIcon: string | null;
  body: string;
  createdAt: string;
};

function mapRow(row: any, identity?: PlayerAvatarMeta | null): GlobalChatMessage {
  return {
    id: String(row.id),
    playerId: String(row.player_id ?? row.playerId),
    username: String(row.sender_username ?? row.username ?? 'Trainer'),
    profileIcon: String(identity?.profileIcon ?? row.sender_profile_icon ?? row.profileIcon ?? 'pokeball'),
    avatarPath: identity?.avatarPath ?? null,
    avatarUpdatedAt: identity?.avatarUpdatedAt ?? null,
    frameId: identity?.frameId ?? null,
    backgroundId: identity?.backgroundId ?? null,
    titleId: row.sender_title_id == null && row.titleId == null ? null : String(row.sender_title_id ?? row.titleId),
    title: row.sender_title == null && row.title == null ? null : String(row.sender_title ?? row.title),
    titleIcon: row.sender_title_icon == null && row.titleIcon == null ? null : String(row.sender_title_icon ?? row.titleIcon),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

async function hydrateRows(rows: any[]): Promise<GlobalChatMessage[]> {
  if (!rows.length) return [];
  const identityMap: Record<string, PlayerAvatarMeta> = await getPlayerAvatarMap(
    rows.map((row) => String(row.player_id ?? row.playerId ?? '')),
  ).catch(() => ({} as Record<string, PlayerAvatarMeta>));
  return rows.map((row) => mapRow(row, identityMap[String(row.player_id ?? row.playerId ?? '')]));
}

export async function getGlobalChatMessages(limit = 8): Promise<GlobalChatMessage[]> {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const { data, error } = await supabase
    .from('global_chat_messages')
    .select('id,player_id,body,sender_username,sender_profile_icon,sender_title_id,sender_title,sender_title_icon,created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  const hydrated = await hydrateRows(data ?? []);
  return hydrated.reverse();
}

export async function sendGlobalChatMessage(body: string): Promise<GlobalChatMessage> {
  const text = body.trim();
  if (!text) throw new Error('Digite uma mensagem.');
  if (text.length > 280) throw new Error('A mensagem pode ter no máximo 280 caracteres.');

  const { data, error } = await supabase.rpc('send_global_chat_message', { p_body: text });
  if (error) {
    if (error.message?.includes('CHAT_RATE_LIMIT')) {
      throw new Error('Aguarde alguns segundos antes de enviar outra mensagem.');
    }
    throw error;
  }
  const [message] = await hydrateRows([data as any]);
  return message;
}

export function subscribeGlobalChat(onMessage: (message: GlobalChatMessage) => void) {
  const channel = supabase
    .channel(`global-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'global_chat_messages' },
      (payload) => {
        const row = payload.new as any;
        if (row?.deleted_at) return;
        void hydrateRows([row]).then(([message]) => {
          if (message) onMessage(message);
        }).catch(() => onMessage(mapRow(row)));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
