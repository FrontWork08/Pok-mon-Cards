import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import {
  getAdminOverview,
  getCoinGrantHistory,
  grantCoins,
  type AdminOverview,
  type CoinGrantHistory,
} from '@/services/admin';
import { formatUsd } from '@/services/market';
import { getMySocial, type SocialPlayer } from '@/services/social';
import { getMyProfile } from '@/services/player';
import { useAppTheme } from '@/theme/ThemeProvider';

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000, 100000];

export default function AdminScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [selfId, setSelfId] = useState('');
  const [history, setHistory] = useState<CoinGrantHistory[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<SocialPlayer | null>(null);
  const [amount, setAmount] = useState('10000');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [status, social, grants, self] = await Promise.all([
        getAdminOverview(),
        getMySocial(),
        getCoinGrantHistory(),
        getMyProfile(),
      ]);
      const recipients: SocialPlayer[] = [{ id: self.id, username: self.username, level: self.level }, ...social.friends];
      setOverview(status);
      setFriends(recipients);
      setSelfId(self.id);
      setHistory(grants);
      setSelectedFriend((current) => current && recipients.some((player) => player.id === current.id) ? current : recipients[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Acesso administrativo indisponível.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const amountNumber = useMemo(() => {
    const parsed = Number(amount.replace(/[^0-9]/g, ''));
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }, [amount]);

  async function sendCoins() {
    if (!selectedFriend || amountNumber < 1 || working) return;
    try {
      setWorking(true);
      setError(null);
      const result = await grantCoins(selectedFriend.id, amountNumber, note);
      setNotice(
        `Adicionado 🪙 ${result.amount.toLocaleString('pt-BR')} para @${result.username}. Novo saldo: 🪙 ${result.balanceAfter.toLocaleString('pt-BR')}.`,
      );
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar moedas.');
    } finally {
      setWorking(false);
    }
  }

  function confirmSendCoins() {
    if (!selectedFriend || amountNumber < 1 || working) return;
    Alert.alert(
      'Confirmar crédito',
      `Adicionar 🪙 ${amountNumber.toLocaleString('pt-BR')} para @${selectedFriend.username}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Adicionar', onPress: () => { sendCoins(); } },
      ],
    );
  }



  return (
    <Screen title="Admin Center" subtitle="Painel privado de economia, usuários, mercado e saúde do jogo.">
      <View style={styles.topRow}>
        <Pressable
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Perfil</Text>
        </Pressable>

        <Pressable
          style={[styles.refreshButton, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={load}
        >
          <Ionicons name="refresh" size={17} color={colors.yellow} />
          <Text style={[styles.refreshText, { color: colors.yellow }]}>ATUALIZAR STATUS</Text>
        </Pressable>
      </View>

      {notice ? (
        <View style={[styles.notice, { backgroundColor: '#142C23', borderColor: '#4A9B70' }]}>
          <Ionicons name="checkmark-circle" size={20} color="#65D894" />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color={colors.muted} /></Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.error}>
          <Ionicons name="shield-outline" size={20} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {!loading && overview ? (
        <>
          <View style={[styles.adminHero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <View style={[styles.adminIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="shield-checkmark" size={27} color={colors.yellow} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroKicker, { color: colors.yellow }]}>ACESSO ADMINISTRATIVO</Text>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Controle privado ativado</Text>
              <Text style={[styles.heroText, { color: colors.muted }]}>
                Toda alteração de moedas é feita no servidor e registrada no histórico administrativo.
              </Text>
            </View>
          </View>

          <SectionTitle title="Visão geral" />
          <View style={styles.metricGrid}>
            <Metric icon="people" label="USUÁRIOS" value={overview.users.total} hint={`+${overview.users.created24h} em 24h`} />
            <Metric icon="wallet" label="MOEDAS EM CIRCULAÇÃO" value={overview.users.coinsInCirculation} coin />
            <Metric icon="albums" label="CARDS NO CATÁLOGO" value={overview.catalog.cards} />
            <Metric icon="cash" label="CARDS COM PREÇO USD" value={overview.catalog.cardsWithUsdPrice} hint={`${overview.catalog.ownedCardsWithUsdPrice}/${overview.catalog.ownedUniqueCards} cards possuídos • ${Number(overview.catalog.ownedPriceCoveragePct ?? 0).toFixed(0)}%`} />
            <Metric icon="layers" label="CÓPIAS EM CONTAS" value={overview.catalog.ownedCardCopies} />
            <Metric icon="diamond" label="VALOR GLOBAL DAS COLEÇÕES" valueText={formatUsd(overview.catalog.ownedMarketValueUsd)} />
          </View>

          <SectionTitle title="Packs e atividade" />
          <View style={styles.metricGrid}>
            <Metric icon="cube" label="PACKS ATIVOS" value={overview.packs.active} hint={`${overview.packs.withPhysicalArt} com packshot`} />
            <Metric icon="gift" label="PACKS ABERTOS" value={overview.packs.openings} hint={`${overview.packs.openings24h} em 24h`} />
            <Metric icon="chatbubble-ellipses" label="MENSAGENS" value={overview.social.messages} hint={`${overview.social.messages24h} em 24h`} />
            <Metric icon="people-circle" label="AMIZADES" value={overview.social.friendshipsAccepted} hint={`${overview.social.friendRequestsPending} pendentes`} />
            <Metric icon="swap-horizontal" label="TROCAS" value={overview.trades.total} hint={`${overview.trades.completed} concluídas`} />
            <Metric icon="game-controller" label="BATALHAS" value={overview.battles.total} hint={`${overview.battles.active} ativas • ${overview.battles.completed} concluídas`} />
          </View>

          <SectionTitle title="Sistema" />
          <View style={styles.metricGrid}>
            <Metric icon="albums-outline" label="DECKS" value={overview.progression.decks} />
            <Metric icon="today" label="MISSÕES DIÁRIAS" value={overview.progression.dailyMissions} />
            <Metric icon="notifications" label="NOTIFICAÇÕES" value={overview.progression.notifications} hint={`${overview.progression.pendingPush} push pendentes`} />
            <Metric icon="phone-portrait" label="PUSH TOKENS" value={overview.progression.pushTokensEnabled} />
            <Metric icon="document-text" label="EVENTOS DE BATALHA" value={overview.battles.events} />
            <Metric icon="construct" label="AÇÕES ADMIN" value={overview.admin.coinGrants} hint={`🪙 ${overview.admin.coinsGrantedTotal.toLocaleString('pt-BR')} concedidas`} />
          </View>

          <View style={[styles.marketPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.marketHeader}>
              <View style={[styles.marketIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="lock-closed" size={22} color={colors.yellow} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.marketTitle, { color: colors.text }]}>Tabela de valores fixa</Text>
                <Text style={[styles.marketText, { color: colors.muted }]}>
                  {overview.catalog.cardsWithUsdPrice.toLocaleString('pt-BR')} de {overview.catalog.cards.toLocaleString('pt-BR')} cards possuem valor em USD. Não existe atualização online de preço durante o jogo.
                </Text>
              </View>
            </View>
          </View>

          <SectionTitle title="Adicionar moedas" />
          <View style={[styles.grantPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>ESCOLHA O JOGADOR</Text>
            <View style={styles.friendChips}>
              {friends.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum jogador disponível.</Text>
              ) : friends.map((friend) => {
                const active = selectedFriend?.id === friend.id;
                return (
                  <Pressable
                    key={friend.id}
                    onPress={() => setSelectedFriend(friend)}
                    style={[
                      styles.friendChip,
                      {
                        backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.friendChipText, { color: colors.text }]}>@{friend.username}{friend.id === selfId ? ' (você)' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>VALOR</Text>
            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((quick) => (
                <Pressable
                  key={quick}
                  onPress={() => setAmount(String(quick))}
                  style={[
                    styles.quickChip,
                    {
                      backgroundColor: amountNumber === quick ? colors.yellow : colors.surfaceAlt,
                      borderColor: amountNumber === quick ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.quickText, { color: amountNumber === quick ? '#07111F' : colors.text }]}>
                    {quick >= 1000 ? `${quick / 1000}K` : quick}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Quantidade de moedas"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Observação opcional"
              placeholderTextColor={colors.muted}
              maxLength={180}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            />

            <Pressable
              disabled={!selectedFriend || amountNumber < 1 || working}
              onPress={confirmSendCoins}
              style={[
                styles.grantButton,
                {
                  backgroundColor: selectedFriend && amountNumber > 0 ? colors.yellow : colors.surfaceAlt,
                  opacity: working ? .75 : 1,
                },
              ]}
            >
              {working ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="add-circle" size={20} color="#07111F" />}
              <Text style={styles.grantButtonText}>
                {working ? 'ADICIONANDO...' : `ADICIONAR 🪙 ${amountNumber.toLocaleString('pt-BR')}`}
              </Text>
            </Pressable>
          </View>

          <SectionTitle title="Histórico administrativo" />
          <View style={styles.historyList}>
            {history.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma concessão de moedas ainda.</Text>
              </View>
            ) : history.map((item) => (
              <View key={item.id} style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyUser, { color: colors.text }]}>
                    @{item.players?.username ?? 'Treinador'}
                  </Text>
                  <Text style={[styles.historyMeta, { color: colors.muted }]}>
                    {new Date(item.created_at).toLocaleString('pt-BR')}
                    {item.note ? ` • ${item.note}` : ''}
                  </Text>
                </View>
                <View style={styles.historyValueWrap}>
                  <Text style={[styles.historyValue, { color: colors.yellow }]}>+🪙 {Number(item.amount).toLocaleString('pt-BR')}</Text>
                  <Text style={[styles.historyBalance, { color: colors.muted }]}>
                    saldo {Number(item.balance_after).toLocaleString('pt-BR')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function SectionTitle({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>;
}

function Metric({
  icon,
  label,
  value,
  valueText,
  hint,
  coin,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: number;
  valueText?: string;
  hint?: string;
  coin?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metricValue, { color: colors.text }]}>
        {valueText ?? `${coin ? '🪙 ' : ''}${Number(value ?? 0).toLocaleString('pt-BR')}`}
      </Text>
      {hint ? <Text style={[styles.metricHint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  backButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 11, fontWeight: '900' },
  refreshButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshText: { fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  notice: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText: { flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  error: { borderRadius: 15, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
  adminHero: { borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  adminIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  heroText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { fontSize: 19, fontWeight: '900', marginTop: 3 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: 155, minWidth: 145, borderRadius: 17, borderWidth: 1, padding: 12 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  metricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  metricValue: { fontSize: 17, fontWeight: '900', marginTop: 3 },
  metricHint: { fontSize: 8, marginTop: 4 },
  marketPanel: { borderRadius: 19, borderWidth: 1, padding: 14 },
  marketHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  marketIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  marketTitle: { fontSize: 15, fontWeight: '900' },
  marketText: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  marketButton: { minHeight: 48, borderRadius: 14, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  marketButtonText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  grantPanel: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  fieldLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  friendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  friendChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  friendChipText: { fontSize: 10, fontWeight: '900' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  quickChip: { minWidth: 49, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  quickText: { fontSize: 9, fontWeight: '900' },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, fontSize: 13 },
  grantButton: { minHeight: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  grantButtonText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .3 },
  historyList: { gap: 7 },
  historyRow: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyUser: { fontSize: 13, fontWeight: '900' },
  historyMeta: { fontSize: 8, marginTop: 3 },
  historyValueWrap: { alignItems: 'flex-end' },
  historyValue: { fontSize: 11, fontWeight: '900' },
  historyBalance: { fontSize: 8, marginTop: 2 },
  emptyHistory: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 10, lineHeight: 15 },
});
