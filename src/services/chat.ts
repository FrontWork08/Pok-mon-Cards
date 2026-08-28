import { supabase } from '@/lib/supabase';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('chat-action', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}

export async function getOrCreateConversation(friendId: string) {
  const data = await invoke({ action: 'conversation', friendId });
  return data.conversationId as string;
}

export async function sendMessage(conversationId: string, message: string, kind = 'text', metadata: Record<string, unknown> = {}) {
  return invoke({ action: 'send', conversationId, message, kind, metadata });
}

export async function markConversationRead(conversationId: string) {
  return invoke({ action: 'read', conversationId });
}

export async function getMessages(conversationId: string, limit = 100) {
  const { data, error } = await supabase
    .from('messages')
    .select('id,conversation_id,sender_id,body,kind,metadata,created_at,read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export function subscribeToMessages(conversationId: string, onMessage: (message: any) => void) {
  const channel = supabase
    .channel(`chat:${conversationId}:${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => onMessage(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
