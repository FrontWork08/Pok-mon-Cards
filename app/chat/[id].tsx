import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getMessages, getOrCreateConversation, markConversationRead, sendMessage, subscribeToMessages } from '@/services/chat';
import { createBattle } from '@/services/battles';
import { gameTheme } from '@/theme/gameTheme';

export default function ChatScreen() {
  const { id: friendId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [friend, setFriend] = useState<any>(null);
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMessages = useCallback(async (cid: string) => {
    const list = await getMessages(cid);
    setMessages(list);
    await markConversationRead(cid).catch(() => null);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!friendId) return;
      try {
        setLoading(true);
        const [{ data: auth }, { data: player }, cid] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('players').select('id,username,level').eq('id', friendId).single(),
          getOrCreateConversation(friendId),
        ]);
        setUserId(auth.user?.id ?? '');
        setFriend(player);
        setConversationId(cid);
        await loadMessages(cid);
        cleanup = subscribeToMessages(cid, (message) => {
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== auth.user?.id) markConversationRead(cid).catch(() => null);
        });
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Não foi possível abrir a conversa.');
      } finally {
        setLoading(false);
      }
    })();
    return () => cleanup?.();
  }, [friendId, loadMessages]);

  async function submit() {
    const message = text.trim();
    if (!conversationId || !message || sending) return;
    try {
      setSending(true);
      setText('');
      await sendMessage(conversationId, message);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Mensagem não enviada.');
      setText(message);
    } finally {
      setSending(false);
    }
  }

  async function challenge(mode: 'quick' | 'mystery', wagerCoins = 0) {
    if (!friendId) return;
    try {
      setSending(true);
      const battleId = await createBattle(friendId, mode, wagerCoins > 0 ? 'coins' : 'none', wagerCoins);
      router.push(`/battle/${battleId}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível criar a batalha.');
    } finally {
      setSending(false);
    }
  }

  const title = useMemo(() => friend?.username ? `@${friend.username}` : 'Chat', [friend]);

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title, headerStyle: { backgroundColor: '#07111F' }, headerTintColor: '#fff' }} />

      <View style={styles.challengeBar}>
        <Pressable style={styles.challenge} onPress={() => challenge('quick')} disabled={sending}>
          <Ionicons name="flash" size={15} color="#07111F" /><Text style={styles.challengeText}>QUICK</Text>
        </Pressable>
        <Pressable style={styles.challengeMystery} onPress={() => challenge('mystery')} disabled={sending}>
          <Ionicons name="help-circle" size={15} color="#fff" /><Text style={styles.challengeMysteryText}>MYSTERY BO3</Text>
        </Pressable>
        <Pressable style={styles.challengeCoins} onPress={() => challenge('mystery', 500)} disabled={sending}>
          <Text style={styles.challengeCoinsText}>🪙 500</Text>
        </Pressable>
      </View>

      {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={18} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}

      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={gameTheme.colors.yellow} /></View> : (
        <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
          {messages.map((message) => {
            const mine = message.sender_id === userId;
            const battleId = message.kind === 'battle_invite' ? message.metadata?.battleId : null;
            return (
              <Pressable key={message.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirWrap]} onPress={() => battleId && router.push(`/battle/${battleId}`)}>
                <View style={[styles.bubble, mine ? styles.mine : styles.their, message.kind === 'battle_invite' && styles.battleBubble]}>
                  {message.kind === 'battle_invite' ? <View style={styles.battleLabel}><Ionicons name="game-controller" size={14} color={gameTheme.colors.yellow} /><Text style={styles.battleLabelText}>DESAFIO DE BATALHA</Text></View> : null}
                  <Text style={styles.messageText}>{message.body}</Text>
                  {battleId ? <Text style={styles.openBattle}>TOQUE PARA ABRIR O DESAFIO →</Text> : null}
                  <Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="Mensagem..."
          placeholderTextColor="#637895"
          multiline
          style={styles.input}
        />
        <Pressable style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]} onPress={submit} disabled={!text.trim() || sending}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07111F' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  challengeBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0A1627', borderBottomWidth: 1, borderBottomColor: '#1D314C' },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: gameTheme.colors.yellow, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  challengeText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  challengeMystery: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#5936A8', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  challengeMysteryText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  challengeCoins: { backgroundColor: '#302B19', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: '#655922' },
  challengeCoinsText: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900' },
  notice: { margin: 10, flexDirection: 'row', gap: 8, padding: 11, borderRadius: 13, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  noticeText: { flex: 1, color: '#F7EFCB', fontSize: 11, fontWeight: '700' },
  messages: { flex: 1 },
  messagesContent: { padding: 14, gap: 8 },
  bubbleWrap: { width: '100%', flexDirection: 'row' },
  mineWrap: { justifyContent: 'flex-end' },
  theirWrap: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', minWidth: 80, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9 },
  mine: { backgroundColor: '#245EDB', borderBottomRightRadius: 5 },
  their: { backgroundColor: '#14243A', borderBottomLeftRadius: 5 },
  battleBubble: { borderWidth: 1, borderColor: '#6B58A7', backgroundColor: '#241D42' },
  battleLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  battleLabelText: { color: gameTheme.colors.yellow, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  messageText: { color: '#fff', fontSize: 13, lineHeight: 18 },
  openBattle: { color: '#C9BFFF', fontSize: 8, fontWeight: '900', marginTop: 7 },
  time: { color: '#AFC1DA', fontSize: 8, textAlign: 'right', marginTop: 5 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#0A1627', borderTopWidth: 1, borderTopColor: '#1D314C' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: '#fff', backgroundColor: '#101F33', borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: '#263D5A' },
  send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.blue },
  sendDisabled: { opacity: 0.4 },
});
