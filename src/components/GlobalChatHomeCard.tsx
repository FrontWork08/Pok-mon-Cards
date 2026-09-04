import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getGlobalChatMessages, sendGlobalChatMessage, subscribeGlobalChat, type GlobalChatMessage } from '@/services/globalChat';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { getProfileAvatarUrl } from '@/services/player';

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function GlobalChatHomeCard() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { userId } = useWallet();
  const [messages, setMessages] = useState<GlobalChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    getGlobalChatMessages(12)
      .then((rows) => { if (!disposed) setMessages(rows); })
      .catch(() => { if (!disposed) setError('Não foi possível carregar o chat global.'); })
      .finally(() => { if (!disposed) setLoading(false); });

    const unsubscribe = subscribeGlobalChat((message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message].slice(-12);
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const visibleMessages = useMemo(
    () => expanded ? messages.slice(-8) : messages.slice(-2),
    [expanded, messages],
  );

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    try {
      setSending(true);
      setError(null);
      const sent = await sendGlobalChatMessage(body);
      setDraft('');
      setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent].slice(-12));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="chatbubbles" size={22} color={colors.accent} />
        </View>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>COMUNIDADE</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>AO VIVO</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Chat global</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Converse com os treinadores sem sair da página inicial.
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.muted} />
      </Pressable>

      {loading ? (
        <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.accent} /><Text style={[styles.loadingText, { color: colors.muted }]}>Conectando ao chat...</Text></View>
      ) : visibleMessages.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.emptyText, { color: colors.muted }]}>Ainda não há mensagens. Seja o primeiro a falar.</Text>
        </View>
      ) : (
        <View style={styles.messages}>
          {visibleMessages.map((message) => {
            const mine = message.playerId === userId;
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.messageMine]}>
                <Pressable onPress={() => router.push(`/player/${message.playerId}`)} style={styles.avatarPress}>
                  <TrainerAvatar
                    icon={message.profileIcon}
                    avatarUrl={getProfileAvatarUrl(message.avatarPath, message.avatarUpdatedAt)}
                    frameId={message.frameId}
                    backgroundId={message.backgroundId}
                    size={31}
                    color={mine ? colors.yellow : colors.accent}
                    backgroundColor={colors.surfaceAlt}
                  />
                </Pressable>
                <View style={[styles.bubble, { backgroundColor: mine ? colors.accentSoft : colors.surfaceAlt, borderColor: mine ? colors.accent : colors.border }]}>
                  <View style={styles.metaRow}>
                    <Pressable onPress={() => router.push(`/player/${message.playerId}`)} style={styles.identityPress}>
                      <Text numberOfLines={1} style={[styles.username, { color: mine ? colors.yellow : colors.text }]}>@{message.username}</Text>
                      {message.title ? (
                        <View style={[styles.titleBadge,{borderColor:mine?colors.yellow:colors.accent,backgroundColor:colors.surface}]}>
                          <Text style={styles.titleIcon}>{message.titleIcon ?? '🏷️'}</Text>
                          <Text numberOfLines={1} style={[styles.titleBadgeText,{color:mine?colors.yellow:colors.accent}]}>{message.title}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    <Text style={[styles.time, { color: colors.muted }]}>{timeLabel(message.createdAt)}</Text>
                  </View>
                  <Text style={[styles.body, { color: colors.text }]}>{message.body}</Text>
                  <Pressable onPress={() => router.push(`/player/${message.playerId}`)} style={styles.profileHint}>
                    <Ionicons name="person-circle-outline" size={12} color={colors.muted}/>
                    <Text style={[styles.profileHintText,{color:colors.muted}]}>VER PERFIL</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {error ? (
        <Pressable onPress={() => setError(null)} style={styles.error}>
          <Ionicons name="alert-circle" size={15} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={[styles.composer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { void send(); }}
          maxLength={280}
          returnKeyType="send"
          placeholder="Mensagem para todos..."
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.text }]}
        />
        {expanded ? <Text style={[styles.counter, { color: colors.muted }]}>{draft.length}/280</Text> : null}
        <Pressable
          disabled={!draft.trim() || sending}
          onPress={() => { void send(); }}
          style={[styles.send, { backgroundColor: draft.trim() ? colors.yellow : colors.border, opacity: sending ? .65 : 1 }]}
        >
          {sending ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="send" size={17} color="#07111F" />}
        </Pressable>
      </View>

      {!expanded && messages.length > 2 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.more}>
          <Text style={[styles.moreText, { color: colors.accent }]}>VER MAIS MENSAGENS</Text>
          <Ionicons name="chevron-down" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles=StyleSheet.create({
  card:{borderRadius:22,borderWidth:1,padding:14,gap:11},
  header:{flexDirection:'row',alignItems:'center',gap:10},
  icon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},
  headerCopy:{flex:1,minWidth:0},
  titleRow:{flexDirection:'row',alignItems:'center',gap:7},
  kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},
  liveBadge:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:999,paddingHorizontal:7,paddingVertical:3,backgroundColor:'#153426'},
  liveDot:{width:6,height:6,borderRadius:3,backgroundColor:'#5BDB9F'},
  liveText:{color:'#9CEFC1',fontSize:6,fontWeight:'900',letterSpacing:.5},
  title:{fontSize:16,fontWeight:'900',marginTop:1},
  subtitle:{fontSize:9,lineHeight:13,marginTop:2},
  loadingRow:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  loadingText:{fontSize:9,fontWeight:'700'},
  empty:{borderRadius:14,padding:12},
  emptyText:{fontSize:9,textAlign:'center'},
  messages:{gap:7},
  messageRow:{flexDirection:'row',alignItems:'flex-end',gap:7},
  messageMine:{paddingLeft:18},
  avatarPress:{borderRadius:999},
  bubble:{flex:1,borderRadius:14,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  metaRow:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:8},
  identityPress:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  username:{fontSize:9,fontWeight:'900'},
  titleBadge:{maxWidth:160,borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:2,flexDirection:'row',alignItems:'center',gap:3},
  titleIcon:{fontSize:8},
  titleBadgeText:{flexShrink:1,fontSize:7,fontWeight:'900'},
  time:{fontSize:7,fontWeight:'700'},
  body:{fontSize:11,lineHeight:15,marginTop:3},
  profileHint:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:4,marginTop:6},
  profileHintText:{fontSize:6,fontWeight:'900',letterSpacing:.5},
  error:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:10,padding:8,backgroundColor:'#351A24'},
  errorText:{flex:1,color:'#FFD7DD',fontSize:8,fontWeight:'700'},
  composer:{minHeight:48,borderRadius:14,borderWidth:1,paddingLeft:11,paddingRight:6,flexDirection:'row',alignItems:'center',gap:6},
  input:{flex:1,minHeight:46,fontSize:11},
  counter:{fontSize:7,fontWeight:'700'},
  send:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  more:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:4,paddingVertical:2},
  moreText:{fontSize:7,fontWeight:'900',letterSpacing:.5},
});
