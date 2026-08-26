import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { signOut } from '@/services/auth';
import { getMyProfile, getMyProfileStats, type PlayerProfile } from '@/services/player';
import { getMySocial } from '@/services/social';
import { getUnreadConversationCount } from '@/services/notifications';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [p, s, social, unreadCount] = await Promise.all([getMyProfile(), getMyProfileStats(), getMySocial(), getUnreadConversationCount().catch(() => 0)]);
      setProfile(p); setStats(s); setFriendCount(social.friends.length); setIncomingCount(social.incoming.length); setUnread(unreadCount);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar seu perfil.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function handleSignOut() { try { await signOut(); router.replace('/'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível sair.'); } }
  const xp = Number(profile?.xp ?? 0);
  const levelXp = xp % 250;
  const collectionValue = Number(stats?.collectionValue ?? 0);
  const coins = Number(profile?.coins ?? 0);
  const accountValue = collectionValue + coins;
  const topCard = stats?.mostValuableCard;

  return <Screen title="Trainer Profile" subtitle="Sua identidade, valor da coleção, social e progresso no jogo.">
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

    <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.surfaceAlt }]}><Text style={[styles.avatarText, { color: colors.text }]}>{profile?.username?.slice(0, 1).toUpperCase() ?? '?'}</Text></View><View style={styles.heroInfo}><Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER ID</Text><Text style={[styles.username, { color: colors.text }]}>@{profile?.username ?? '---'}</Text><Text style={[styles.meta, { color: colors.muted }]}>Nível {profile?.level ?? 1} • {xp.toLocaleString('pt-BR')} XP • ELO {profile?.battle_rating ?? 1000}</Text></View><View style={[styles.coinBox, { backgroundColor: colors.surface }]}><Text style={[styles.coinLabel, { color: colors.muted }]}>MOEDAS</Text><Text style={[styles.coins, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}</Text></View></View>

    <View style={[styles.worthPanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
      <View style={styles.worthHeader}><View><Text style={[styles.worthKicker, { color: colors.yellow }]}>PATRIMÔNIO DO TREINADOR</Text><Text style={[styles.worthTotal, { color: colors.text }]}>🪙 {accountValue.toLocaleString('pt-BR')}</Text><Text style={[styles.worthHint, { color: colors.muted }]}>moedas disponíveis + valor interno de todas as cartas</Text></View><View style={[styles.worthIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="diamond" size={26} color={colors.yellow} /></View></View>
      <View style={[styles.worthDivider, { backgroundColor: colors.border }]} />
      <View style={styles.worthBreakdown}><WorthMetric label="COLEÇÃO" value={collectionValue} /><WorthMetric label="SALDO" value={coins} /><WorthMetric label="CARD MAIS VALIOSO" value={Number(topCard?.game_value ?? 0)} text={topCard?.pokemon_name ?? '—'} /></View>
      {topCard ? <Pressable style={[styles.topCardRow, { backgroundColor: colors.surfaceAlt }]} onPress={() => router.push(`/card/${topCard.id}`)}>{topCard.image_small ? <Image source={{ uri: topCard.image_small }} resizeMode="contain" style={styles.topCardImage} /> : <View style={styles.topCardImage} />}<View style={{ flex: 1 }}><Text style={[styles.topCardLabel, { color: colors.muted }]}>DESTAQUE DA CONTA</Text><Text style={[styles.topCardName, { color: colors.text }]}>{topCard.pokemon_name}</Text><Text style={[styles.topCardMeta, { color: colors.muted }]}>{topCard.rarity ?? 'Sem raridade'}</Text></View><Text style={[styles.topCardValue, { color: colors.yellow }]}>🪙 {Number(topCard.game_value ?? 0).toLocaleString('pt-BR')}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable> : null}
    </View>

    <View style={styles.statsGrid}><Stat icon="albums" value={stats?.totalCards ?? 0} label="Cards" /><Stat icon="paw" value={stats?.species ?? 0} label="Pokédex" /><Stat icon="cube" value={stats?.packsOpened ?? 0} label="Packs" /><Stat icon="swap-horizontal" value={stats?.completedTrades ?? 0} label="Trocas" /><Stat icon="trophy" value={profile?.battle_wins ?? 0} label="Vitórias" /><Stat icon="people" value={friendCount} label="Amigos" /></View>

    <View style={styles.featureGrid}>
      <FeatureLink icon="mail-unread" color={colors.accent} title="Inbox" text={unread ? `${unread} mensagem(ns) não lida(s) • convites e avisos` : 'Mensagens, convites de batalha e notificações.'} onPress={() => router.push('/inbox')} badge={unread || undefined} />
      <FeatureLink icon="game-controller" color="#FF9D4A" title="Battle Center" text={`ELO ${profile?.battle_rating ?? 1000} • ${profile?.battle_wins ?? 0} vitórias • ranking e revanche`} onPress={() => router.push('/battles')} />
      <FeatureLink icon="people" color={colors.blue} title="Amigos, Chat e Batalhas" text={friendCount + ' amigos' + (incomingCount ? ` • ${incomingCount} solicitação aguardando` : ' • converse e envie desafios')} onPress={() => router.push('/friends')} badge={incomingCount || undefined} />
      <FeatureLink icon="albums" color="#9B7BFF" title="Meus Decks" text="Monte equipes e deixe um deck principal pronto para Mystery Battle." onPress={() => router.push('/decks')} />
      <FeatureLink icon="gift" color="#65D894" title="Missões Diárias" text="Ganhe moedas e XP abrindo packs e participando de batalhas." onPress={() => router.push('/missions')} />
      <FeatureLink icon="book" color={colors.yellow} title="Pokédex" text="Veja as 1.025 espécies e suas versões de cards descobertas." onPress={() => router.push('/pokedex')} />
      <FeatureLink icon="layers" color="#65D894" title="Coleções por Set" text="Acompanhe cards faltantes e porcentagem de cada coleção." onPress={() => router.push('/sets')} />
      <FeatureLink icon="time" color="#B26CFF" title="Histórico de Packs" text={`${stats?.packsOpened ?? 0} boosters abertos • reveja seus melhores pulls.`} onPress={() => router.push('/history')} />
      <FeatureLink icon="color-palette" color={colors.accent} title="Personalização" text="Modo claro/escuro, temas, push, som e vibração." onPress={() => router.push('/settings')} />
    </View>

    <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.progressTop}><Text style={[styles.progressTitle, { color: colors.text }]}>Progresso do nível</Text><Text style={[styles.progressValue, { color: colors.muted }]}>{levelXp} / 250 XP</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { width: `${Math.min(100, levelXp / 2.5)}%`, backgroundColor: colors.yellow }]} /></View><Text style={[styles.progressHint, { color: colors.muted }]}>Packs dão XP; batalhas dão XP extra e avançam missões.</Text></View>
    <Pressable style={styles.logout} onPress={handleSignOut}><Ionicons name="log-out-outline" size={18} color="#FF8A8A" /><Text style={styles.logoutText}>Sair da conta</Text></Pressable>
  </Screen>;
}

function WorthMetric({ label, value, text }: { label: string; value: number; text?: string }) { const { colors } = useAppTheme(); return <View style={styles.worthMetric}><Text style={[styles.worthMetricLabel, { color: colors.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.worthMetricText, { color: colors.text }]}>{text ?? `🪙 ${Number(value).toLocaleString('pt-BR')}`}</Text>{text ? <Text style={[styles.worthMetricValue, { color: colors.yellow }]}>🪙 {Number(value).toLocaleString('pt-BR')}</Text> : null}</View>; }
function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) { const { colors } = useAppTheme(); return <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name={icon} size={18} color={colors.accent} /></View><Text style={[styles.statValue, { color: colors.text }]}>{Number(value).toLocaleString('pt-BR')}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>; }
function FeatureLink({ icon, color, title, text, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; text: string; onPress: () => void; badge?: number }) { const { colors } = useAppTheme(); return <Pressable style={[styles.feature, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress}><View style={[styles.featureIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={23} color={color} /></View><View style={styles.featureBody}><Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.featureText, { color: colors.muted }]}>{text}</Text></View>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}</Pressable>; }

const styles = StyleSheet.create({
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 12 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, borderWidth: 1 }, avatar: { width: 70, height: 70, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, avatarText: { fontSize: 30, fontWeight: '900' }, heroInfo: { flex: 1, minWidth: 190 }, kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, username: { fontSize: 25, fontWeight: '900', marginTop: 3 }, meta: { fontSize: 12, marginTop: 4 }, coinBox: { minWidth: 130, padding: 12, borderRadius: 16 }, coinLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, coins: { fontSize: 18, fontWeight: '900', marginTop: 3 },
  worthPanel: { padding: 16, borderRadius: 22, borderWidth: 1, gap: 12 }, worthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, worthKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, worthTotal: { fontSize: 30, fontWeight: '900', marginTop: 3 }, worthHint: { fontSize: 9, marginTop: 2 }, worthIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, worthDivider: { height: 1 }, worthBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, worthMetric: { flexGrow: 1, flexBasis: 150, minWidth: 130 }, worthMetricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9 }, worthMetricText: { fontSize: 14, fontWeight: '900', marginTop: 3 }, worthMetricValue: { fontSize: 9, fontWeight: '900', marginTop: 2 }, topCardRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 8 }, topCardImage: { width: 50, height: 67, borderRadius: 6 }, topCardLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, topCardName: { fontSize: 13, fontWeight: '900', marginTop: 2 }, topCardMeta: { fontSize: 8, marginTop: 1 }, topCardValue: { fontSize: 10, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { flexGrow: 1, flexBasis: 145, minWidth: 135, padding: 14, borderRadius: 18, borderWidth: 1 }, statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, statValue: { fontSize: 20, fontWeight: '900' }, statLabel: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, feature: { flexGrow: 1, flexBasis: 360, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 }, featureIcon: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, featureBody: { flex: 1 }, featureTitle: { fontSize: 15, fontWeight: '900' }, featureText: { fontSize: 10, lineHeight: 15, marginTop: 3 }, badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D84B64' }, badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  progressCard: { padding: 15, borderRadius: 18, borderWidth: 1 }, progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressTitle: { fontSize: 14, fontWeight: '900' }, progressValue: { fontSize: 10, fontWeight: '800' }, track: { height: 8, borderRadius: 999, marginTop: 11, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999 }, progressHint: { fontSize: 9, marginTop: 7 }, logout: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C64E5A', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, logoutText: { color: '#FF8A8A', fontWeight: '900', fontSize: 11 },
});
