import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getGuildChatMessages,
  sendGuildChatMessage,
  subscribeToGuildChat,
  type GuildChatMessage,
} from '@/services/guilds';
import { useAppTheme } from '@/theme/ThemeProvider';

export function GuildChatPanel({
  guildId,
  guildColor,
  onOpenPlayer,
}: {
  guildId: string;
  guildColor: string;
  onOpenPlayer: (playerId: string) => void;
}) {
  const { colors } = useAppTheme();
  const [messages, setMessages] = useState<GuildChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const rows = await getGuildChatMessages(guildId, 60);
      setMessages(rows);
      setError(null);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o chat da guilda.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToGuildChat(guildId, () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { void load(true); }, 80);
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [guildId, load]);

  async function send() {
    const message = body.trim();
    if (!message || sending) return;
    try {
      setSending(true);
      setError(null);
      const row = await sendGuildChatMessage(guildId, message);
      setMessages((current) => current.some((item) => item.id === row.id) ? current : [...current, row]);
      setBody('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: guildColor }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: guildColor + '24' }]}>
          <Ionicons name="chatbubbles" size={20} color={guildColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Chat da Guilda</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Somente membros desta guilda podem ler e enviar mensagens.</Text>
        </View>
        <View style={[styles.live, { borderColor: '#2D7A53', backgroundColor: '#143123' }]}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
      </View>

      {error ? (
        <Pressable onPress={() => setError(null)} style={styles.error}>
          <Ionicons name="alert-circle" size={16} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={[styles.messagesBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={guildColor} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando mensagens...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>O chat ainda está vazio</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Envie a primeira mensagem para sua guilda.</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            nestedScrollEnabled
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.map((message) => (
              <View key={message.id} style={[styles.message, { borderBottomColor: colors.border }]}>
                <Pressable
                  onPress={() => onOpenPlayer(message.playerId)}
                  style={[styles.avatar, { backgroundColor: guildColor + '24', borderColor: guildColor }]}
                >
                  <Text style={[styles.avatarText, { color: guildColor }]}>{message.username.slice(0, 1).toUpperCase()}</Text>
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.identityRow}>
                    <Pressable onPress={() => onOpenPlayer(message.playerId)}>
                      <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>@{message.username}</Text>
                    </Pressable>
                    {message.title ? (
                      <View style={[styles.titleBadge, { backgroundColor: colors.surface, borderColor: guildColor }]}>
                        <Text style={styles.titleIcon}>{message.titleIcon ?? '🏷️'}</Text>
                        <Text numberOfLines={1} style={[styles.titleText, { color: guildColor }]}>{message.title}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.time, { color: colors.muted }]}>
                      {message.createdAt ? new Date(message.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <Text style={[styles.body, { color: colors.text }]}>{message.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={[styles.composer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Mensagem para a guilda..."
          placeholderTextColor={colors.muted}
          maxLength={280}
          multiline
          onSubmitEditing={() => { if (body.trim()) void send(); }}
          style={[styles.input, { color: colors.text }]}
        />
        <View style={styles.composerSide}>
          <Text style={[styles.counter, { color: colors.muted }]}>{body.length}/280</Text>
          <Pressable
            disabled={!body.trim() || sending}
            onPress={() => void send()}
            style={[styles.send, { backgroundColor: guildColor }, (!body.trim() || sending) && { opacity: .45 }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 20, borderWidth: 1, padding: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '900' },
  subtitle: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  live: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#65D894' },
  liveText: { color: '#9CEFC1', fontSize: 6, fontWeight: '900' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#351A24', borderRadius: 11, padding: 9 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 8, fontWeight: '700' },
  messagesBox: { height: 330, borderRadius: 15, borderWidth: 1, overflow: 'hidden' },
  messagesScroll: { flex: 1 },
  messagesContent: { padding: 9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 20 },
  loadingText: { fontSize: 8 },
  emptyTitle: { fontSize: 11, fontWeight: '900' },
  emptyText: { fontSize: 8, textAlign: 'center' },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '900' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  username: { fontSize: 8, fontWeight: '900' },
  titleBadge: { maxWidth: 150, borderRadius: 999, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 },
  titleIcon: { fontSize: 7 },
  titleText: { flexShrink: 1, fontSize: 6, fontWeight: '900' },
  time: { marginLeft: 'auto', fontSize: 6, fontWeight: '700' },
  body: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  composer: { minHeight: 56, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 36, maxHeight: 90, fontSize: 10, paddingVertical: 7 },
  composerSide: { alignItems: 'center', gap: 3 },
  counter: { fontSize: 6, fontWeight: '700' },
  send: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
