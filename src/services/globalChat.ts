import { supabase } from '@/lib/supabase';

export type GlobalChatMessage = {
  id: string;
  playerId: string;
  username: string;
  profileIcon: string;
  titleId: string | null;
  title: string | null;
  titleIcon: string | null;
  body: string;
  createdAt: string;
};

function mapRow(row: any): GlobalChatMessage {
  return {
    id: String(row.id),
    playerId: String(row.player_id),
    username: String(row.sender_username ?? 'Trainer'),
    profileIcon: String(row.sender_profile_icon ?? 'pokeball'),
    titleId: row.sender_title_id == null ? null : String(row.sender_title_id),
    title: row.sender_title == null ? null : String(row.sender_title),
    titleIcon: row.sender_title_icon == null ? null : String(row.sender_title_icon),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at),
  };
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
  return (data ?? []).map(mapRow).reverse();
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
  const row = data as any;
  return {
    id: String(row.id),
    playerId: String(row.playerId),
    username: String(row.username ?? 'Trainer'),
    profileIcon: String(row.profileIcon ?? 'pokeball'),
    titleId: row.titleId == null ? null : String(row.titleId),
    title: row.title == null ? null : String(row.title),
    titleIcon: row.titleIcon == null ? null : String(row.titleIcon),
    body: String(row.body ?? ''),
    createdAt: String(row.createdAt),
  };
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
        onMessage(mapRow(row));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
