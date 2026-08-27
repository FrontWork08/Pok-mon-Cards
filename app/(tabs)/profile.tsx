import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { signOut } from '@/services/auth';
import { getMyProfile, getMyProfileStats, type PlayerProfile } from '@/services/player';
import { getMySocial } from '@/services/social';
import { getUnreadConversationCount } from '@/services/notifications';
import { formatUsd, isCurrentUserAdmin } from '@/services/market';
import { changeUsername } from '@/services/playerActions';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [p, s, social, unreadCount, adminAccess] = await Promise.all([
        getMyProfile(),
        getMyProfileStats(),
        getMySocial(),
        getUnreadConversationCount().catch(() => 0),
        isCurrentUserAdmin().catch(() => false),
      ]);
      setProfile(p);
      setStats(s);
      setFriendCount(social.friends.length);
      setIncomingCount(social.incoming.length);
      setUnread(unreadCount);
      setIsAdmin(adminAccess);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar seu perfil.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  function openNicknameEditor() {
    setNicknameDraft(profile?.username ?? '');
    setNicknameError(null);
    setNicknameOpen(true);
  }

  async function saveNickname() {
    const next = nicknameDraft.trim();
    if (nicknameSaving) return;
    if (next.length < 3 || next.length > 24) {
      setNicknameError('O nickname precisa ter entre 3 e 24 caracteres.');
      return;
    }
    if (next === profile?.username) {
      setNicknameOpen(false);
      return;
    }

    try {
      setNicknameSaving(true);
      setNicknameError(null);
      const result = await changeUsername(next);
      setProfile((current) => current ? { ...current, username: result.username } : current);
      setNicknameOpen(false);
    } catch (e) {
      setNicknameError(e instanceof Error ? e.message : 'Não foi possível alterar o nickname.');
    } finally {
      setNicknameSaving(false);
    }
  }

  async function handleSignOut() { try { await signOut(); router.replace('/'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível sair.'); } }
  const xp = Number(profile?.xp ?? 0);
  const levelXp = xp % 250;
  const collectionMarketValueUsd = Number(stats?.collectionMarketValueUsd ?? 0);
  const coins = Number(profile?.coins ?? 0);
  const topCard = stats?.mostValuableMarketCard ?? stats?.mostValuableCard;

  return <Screen title="Trainer Profile" subtitle="Sua identidade, valor de mercado da coleção, ranking global e progresso.">
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

    <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><View style={[styles.avatar, { borderColor: colors.accent, backgroundColor: colors.surfaceAlt }]}><Text style={[styles.avatarText, { color: colors.text }]}>{profile?.username?.slice(0, 1).toUpperCase() ?? '?'}</Text></View><View style={styles.heroInfo}><Text style={[styles.kicker, { color: colors.yellow }]}>TRAINER ID</Text><View style={styles.usernameRow}><Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>@{profile?.username ?? '---'}</Text><Pressable accessibilityLabel="Alterar nickname" onPress={openNicknameEditor} style={[styles.editNameButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="pencil" size={14} color={colors.yellow} /></Pressable></View><Text style={[styles.meta, { color: colors.muted }]}>Nível {profile?.level ?? 1} • {xp.toLocaleString('pt-BR')} XP • ELO {profile?.battle_rating ?? 1000}</Text></View><View style={[styles.coinBox, { backgroundColor: colors.surface }]}><Text style={[styles.coinLabel, { color: colors.muted }]}>MOEDAS</Text><Text style={[styles.coins, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}</Text></View></View>

    <View style={[styles.worthPanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
      <View style={styles.worthHeader}><View style={{ flex: 1 }}><Text style={[styles.worthKicker, { color: colors.yellow }]}>VALOR FIXO DA COLEÇÃO</Text><Text style={[styles.worthTotal, { color: colors.text }]}>{formatUsd(collectionMarketValueUsd)}</Text><Text style={[styles.worthHint, { color: colors.muted }]}>Tabela fixa em USD • não depende de preço online</Text></View><View style={[styles.worthIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="cash" size={26} color={colors.yellow} /></View></View>
      <View style={[styles.worthDivider, { backgroundColor: colors.border }]} />
      <View style={styles.worthBreakdown}><WorthMetric label="COLEÇÃO EM USD" valueText={formatUsd(collectionMarketValueUsd)} /><WorthMetric label="SALDO DO JOGO" valueText={`🪙 ${coins.toLocaleString('pt-BR')}`} /><WorthMetric label="CARD MAIS CARO" valueText={topCard?.pokemon_name ?? '—'} subtext={topCard?.market_price_usd != null ? formatUsd(Number(topCard.market_price_usd)) : 'Valor fixo indisponível'} /></View>
      {topCard ? <Pressable style={[styles.topCardRow, { backgroundColor: colors.surfaceAlt }]} onPress={() => router.push(`/card/${topCard.id}`)}>{topCard.image_small ? <Image source={{ uri: topCard.image_small }} resizeMode="contain" style={styles.topCardImage} /> : <View style={styles.topCardImage} />}<View style={{ flex: 1 }}><Text style={[styles.topCardLabel, { color: colors.muted }]}>CARD DE MAIOR VALOR FIXO</Text><Text style={[styles.topCardName, { color: colors.text }]}>{topCard.pokemon_name}</Text><Text style={[styles.topCardMeta, { color: colors.muted }]}>{topCard.rarity ?? 'Sem raridade'}</Text></View><Text style={[styles.topCardValue, { color: colors.yellow }]}>{topCard.market_price_usd != null ? formatUsd(Number(topCard.market_price_usd)) : '—'}</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable> : null}
    </View>

    <View style={styles.statsGrid}><Stat icon="albums" value={stats?.totalCards ?? 0} label="Cards" /><Stat icon="paw" value={stats?.species ?? 0} label="Pokédex" /><Stat icon="cube" value={stats?.packsOpened ?? 0} label="Packs" /><Stat icon="swap-horizontal" value={stats?.completedTrades ?? 0} label="Trocas" /><Stat icon="trophy" value={profile?.battle_wins ?? 0} label="Vitórias" /><Stat icon="people" value={friendCount} label="Amigos" /></View>

    <View style={styles.featureGrid}>
      <FeatureLink icon="mail-unread" color={colors.accent} title="Inbox" text={unread ? `${unread} mensagem(ns) não lida(s) • convites e avisos` : 'Mensagens, convites de batalha e notificações.'} onPress={() => router.push('/inbox')} badge={unread || undefined} />
      <FeatureLink icon="game-controller" color="#FF9D4A" title="Battle Center" text={`ELO ${profile?.battle_rating ?? 1000} • ${profile?.battle_wins ?? 0} vitórias • ranking e revanche`} onPress={() => router.push('/battles')} />
      <FeatureLink icon="podium" color={colors.yellow} title="Ranking de Coleções" text="Ranking global das contas pelo valor fixo das cartas em USD." onPress={() => router.push('/collection-ranking')} />
      <FeatureLink icon="people" color={colors.blue} title="Amigos, Chat e Batalhas" text={friendCount + ' amigos' + (incomingCount ? ` • ${incomingCount} solicitação aguardando` : ' • converse e envie desafios')} onPress={() => router.push('/friends')} badge={incomingCount || undefined} />
      <FeatureLink icon="albums" color="#9B7BFF" title="Meus Decks" text="Monte equipes e deixe um deck principal pronto para Mystery Battle." onPress={() => router.push('/decks')} />
      <FeatureLink icon="gift" color="#65D894" title="Missões Diárias" text="Ganhe moedas e XP abrindo packs e participando de batalhas." onPress={() => router.push('/missions')} />
      <FeatureLink icon="book" color={colors.yellow} title="Pokédex" text="Veja as 1.025 espécies e suas versões de cards descobertas." onPress={() => router.push('/pokedex')} />
      <FeatureLink icon="layers" color="#65D894" title="Coleções por Set" text="Acompanhe cards faltantes e porcentagem de cada coleção." onPress={() => router.push('/sets')} />
      <FeatureLink icon="time" color="#B26CFF" title="Histórico de Packs" text={`${stats?.packsOpened ?? 0} boosters abertos • reveja seus melhores pulls.`} onPress={() => router.push('/history')} />
      <FeatureLink icon="color-palette" color={colors.accent} title="Personalização" text="Modo claro/escuro, temas, push, som e vibração." onPress={() => router.push('/settings')} />
      {isAdmin ? <FeatureLink icon="shield-checkmark" color="#FF5CCF" title="Admin Center" text="Economia, amigos, preços, métricas e status privado do sistema." onPress={() => router.push('/admin')} /> : null}
    </View>

    <View style={[styles.progressCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.progressTop}><Text style={[styles.progressTitle, { color: colors.text }]}>Progresso do nível</Text><Text style={[styles.progressValue, { color: colors.muted }]}>{levelXp} / 250 XP</Text></View><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { width: `${Math.min(100, levelXp / 2.5)}%`, backgroundColor: colors.yellow }]} /></View><Text style={[styles.progressHint, { color: colors.muted }]}>Packs dão XP; batalhas dão XP extra e avançam missões.</Text></View>
    <Pressable style={styles.logout} onPress={handleSignOut}><Ionicons name="log-out-outline" size={18} color="#FF8A8A" /><Text style={styles.logoutText}>Sair da conta</Text></Pressable>

    <Modal visible={nicknameOpen} transparent animationType="fade" onRequestClose={() => !nicknameSaving && setNicknameOpen(false)}>
      <View style={styles.nicknameBackdrop}>
        <View style={[styles.nicknameModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.nicknameHeader}>
            <View style={[styles.nicknameIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="person" size={21} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.nicknameTitle, { color: colors.text }]}>Alterar nickname</Text><Text style={[styles.nicknameHint, { color: colors.muted }]}>3 a 24 caracteres. O nome precisa ser único.</Text></View>
            <Pressable disabled={nicknameSaving} onPress={() => setNicknameOpen(false)}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>

          <View style={[styles.nicknameInputWrap, { backgroundColor: colors.surfaceAlt, borderColor: nicknameError ? '#D45A6B' : colors.border }]}>
            <Text style={[styles.nicknameAt, { color: colors.muted }]}>@</Text>
            <TextInput
              value={nicknameDraft}
              onChangeText={(value) => { setNicknameDraft(value); setNicknameError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              placeholder="Seu novo nickname"
              placeholderTextColor={colors.muted}
              style={[styles.nicknameInput, { color: colors.text }]}
              onSubmitEditing={saveNickname}
            />
          </View>

          <View style={styles.nicknameMetaRow}><Text style={[styles.nicknameCount, { color: colors.muted }]}>{nicknameDraft.trim().length}/24</Text></View>
          {nicknameError ? <Text style={styles.nicknameError}>{nicknameError}</Text> : null}

          <Pressable
            disabled={nicknameSaving || nicknameDraft.trim().length < 3}
            onPress={saveNickname}
            style={[styles.nicknameSave, { backgroundColor: colors.yellow }, (nicknameSaving || nicknameDraft.trim().length < 3) && { opacity: .45 }]}
          >
            {nicknameSaving ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="checkmark-circle" size={19} color="#07111F" />}
            <Text style={styles.nicknameSaveText}>{nicknameSaving ? 'SALVANDO...' : 'SALVAR NICKNAME'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </Screen>;
}

function WorthMetric({ label, valueText, subtext }: { label: string; valueText: string; subtext?: string }) { const { colors } = useAppTheme(); return <View style={styles.worthMetric}><Text style={[styles.worthMetricLabel, { color: colors.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.worthMetricText, { color: colors.text }]}>{valueText}</Text>{subtext ? <Text numberOfLines={1} style={[styles.worthMetricValue, { color: colors.yellow }]}>{subtext}</Text> : null}</View>; }
function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) { const { colors } = useAppTheme(); return <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name={icon} size={18} color={colors.accent} /></View><Text style={[styles.statValue, { color: colors.text }]}>{Number(value).toLocaleString('pt-BR')}</Text><Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text></View>; }
function FeatureLink({ icon, color, title, text, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; text: string; onPress: () => void; badge?: number }) { const { colors } = useAppTheme(); return <Pressable style={[styles.feature, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onPress}><View style={[styles.featureIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={23} color={color} /></View><View style={styles.featureBody}><Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.featureText, { color: colors.muted }]}>{text}</Text></View>{badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}</Pressable>; }

const styles = StyleSheet.create({
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 12 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, borderWidth: 1 }, avatar: { width: 70, height: 70, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, avatarText: { fontSize: 30, fontWeight: '900' }, heroInfo: { flex: 1, minWidth: 190 }, usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }, editNameButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, username: { flexShrink: 1, fontSize: 25, fontWeight: '900' }, meta: { fontSize: 12, marginTop: 4 }, coinBox: { minWidth: 130, padding: 12, borderRadius: 16 }, coinLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, coins: { fontSize: 18, fontWeight: '900', marginTop: 3 },
  worthPanel: { padding: 16, borderRadius: 22, borderWidth: 1, gap: 12 }, worthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, worthKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, worthTotal: { fontSize: 30, fontWeight: '900', marginTop: 3 }, worthHint: { fontSize: 9, marginTop: 2 }, worthIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, worthDivider: { height: 1 }, worthBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, worthMetric: { flexGrow: 1, flexBasis: 150, minWidth: 130 }, worthMetricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .9 }, worthMetricText: { fontSize: 14, fontWeight: '900', marginTop: 3 }, worthMetricValue: { fontSize: 9, fontWeight: '900', marginTop: 2 }, topCardRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 8 }, topCardImage: { width: 50, height: 67, borderRadius: 6 }, topCardLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, topCardName: { fontSize: 13, fontWeight: '900', marginTop: 2 }, topCardMeta: { fontSize: 8, marginTop: 1 }, topCardValue: { fontSize: 10, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, stat: { flexGrow: 1, flexBasis: 145, minWidth: 135, padding: 14, borderRadius: 18, borderWidth: 1 }, statIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 }, statValue: { fontSize: 20, fontWeight: '900' }, statLabel: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, feature: { flexGrow: 1, flexBasis: 360, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 }, featureIcon: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, featureBody: { flex: 1 }, featureTitle: { fontSize: 15, fontWeight: '900' }, featureText: { fontSize: 10, lineHeight: 15, marginTop: 3 }, badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D84B64' }, badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  progressCard: { padding: 15, borderRadius: 18, borderWidth: 1 }, progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressTitle: { fontSize: 14, fontWeight: '900' }, progressValue: { fontSize: 10, fontWeight: '800' }, track: { height: 8, borderRadius: 999, marginTop: 11, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999 }, progressHint: { fontSize: 9, marginTop: 7 }, logout: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C64E5A', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, logoutText: { color: '#FF8A8A', fontWeight: '900', fontSize: 11 }, nicknameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.74)', justifyContent: 'flex-end', padding: 12 }, nicknameModal: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, marginBottom: 8 }, nicknameHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, nicknameIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, nicknameTitle: { fontSize: 17, fontWeight: '900' }, nicknameHint: { fontSize: 9, lineHeight: 14, marginTop: 2 }, nicknameInputWrap: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 4 }, nicknameAt: { fontSize: 16, fontWeight: '900' }, nicknameInput: { flex: 1, minHeight: 50, fontSize: 15, fontWeight: '800' }, nicknameMetaRow: { flexDirection: 'row', justifyContent: 'flex-end' }, nicknameCount: { fontSize: 9, fontWeight: '800' }, nicknameError: { color: '#FF8A9A', fontSize: 10, fontWeight: '800' }, nicknameSave: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, nicknameSaveText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
});
