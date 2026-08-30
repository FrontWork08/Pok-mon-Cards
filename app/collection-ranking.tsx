import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { getMyProfile, getPlayerAvatarMap, getProfileAvatarUrl, type PlayerAvatarMeta } from '@/services/player';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import {
  formatUsd,
  getCollectionValueLeaderboard,
  getCollectionWeeklyLeaderboard,
  type CollectionRankEntry,
  type WeeklyCollectionRankEntry,
} from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

type RankingMode = 'weekly' | 'global';

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
}

function medalFor(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
}

export default function CollectionRankingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const [mode, setMode] = useState<RankingMode>('weekly');
  const [weeklyRows, setWeeklyRows] = useState<WeeklyCollectionRankEntry[]>([]);
  const [globalRows, setGlobalRows] = useState<CollectionRankEntry[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<Record<string, PlayerAvatarMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    try {
      setError(null);
      if (manual) setRefreshing(true);
      else setLoading(true);

      const [profile, weekly, global] = await Promise.all([
        getMyProfile(),
        getCollectionWeeklyLeaderboard(100),
        getCollectionValueLeaderboard(100),
      ]);

      setMyId(profile.id);
      setWeeklyRows(weekly);
      setGlobalRows(global);
      const ids = [...weekly.map((row) => row.player_id), ...global.map((row) => row.player_id)];
      setAvatars(await getPlayerAvatarMap(ids));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o ranking.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setMode('weekly');
    void load(false);
  }, [load]));

  const weeklyMeta = weeklyRows[0] ?? null;
  const firstWeekPartial = Boolean(
    weeklyMeta?.week_start
    && weeklyMeta?.score_start
    && new Date(weeklyMeta.score_start).getTime() > new Date(weeklyMeta.week_start).getTime() + 60_000,
  );

  const rowsCount = mode === 'weekly' ? weeklyRows.length : globalRows.length;

  const rewardSummary = useMemo(() => [
    { place: '🥇 1º', reward: '🪙 15.000 + 💎 5' },
    { place: '🥈 2º', reward: '🪙 10.000 + 💎 3' },
    { place: '🥉 3º', reward: '🪙 5.000 + 💎 1' },
  ], []);

  return (
    <Screen
      title="Ranking de Coleções"
      subtitle="O Semanal mede apenas cartas novas únicas. Duplicatas não pontuam; o Global continua permanente."
    >
      <View style={styles.topRow}>
        <Pressable
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => goBackOrHome(router)}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Perfil</Text>
        </Pressable>

        <Pressable
          style={[styles.refresh, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={() => { void load(true); }}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={colors.yellow} />
            : <Ionicons name="refresh" size={17} color={colors.yellow} />}
          <Text style={[styles.refreshText, { color: colors.yellow }]}>
            {refreshing ? 'ATUALIZANDO' : 'ATUALIZAR'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.modeSwitch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'weekly' }}
          onPress={() => setMode('weekly')}
          style={[
            styles.modeButton,
            mode === 'weekly' && { backgroundColor: colors.yellow, borderColor: colors.yellow },
          ]}
        >
          <Ionicons name="calendar" size={18} color={mode === 'weekly' ? '#07111F' : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.modeTitle, { color: mode === 'weekly' ? '#07111F' : colors.text }]}>
              SEMANAL
            </Text>
            <Text style={[styles.modeSub, { color: mode === 'weekly' ? '#273041' : colors.muted }]}>
              RESETA SÓ O PLACAR
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'global' }}
          onPress={() => setMode('global')}
          style={[
            styles.modeButton,
            mode === 'global' && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
          ]}
        >
          <Ionicons name="earth" size={18} color={mode === 'global' ? colors.yellow : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.modeTitle, { color: colors.text }]}>GLOBAL</Text>
            <Text style={[styles.modeSub, { color: colors.muted }]}>NUNCA RESETA</Text>
          </View>
        </Pressable>
      </View>

      {mode === 'weekly' ? (
        <>
          <View style={[styles.important, { backgroundColor: '#332A12', borderColor: '#D5A73E' }]}>
            <Ionicons name="information-circle" size={24} color="#FFD447" />
            <View style={{ flex: 1 }}>
              <Text style={styles.importantTitle}>SUA COLEÇÃO NÃO É RESETADA</Text>
              <Text style={styles.importantText}>
                Toda segunda-feira às 00:00 zera apenas a pontuação do ranking semanal. Suas cartas, valor global e progresso continuam intactos.
              </Text>
            </View>
          </View>

          <View style={[styles.info, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="trending-up" size={23} color={colors.yellow} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoTitle, { color: colors.text }]}>Valor conquistado na semana</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                Conta somente a primeira obtenção de cada carta diferente por abertura oficial. Duplicatas valem 0 no semanal. O valor é congelado no momento em que a carta entra na coleção.
              </Text>
              {weeklyMeta ? (
                <Text style={[styles.periodText, { color: colors.yellow }]}>
                  {firstWeekPartial ? 'Primeira semana parcial • ' : ''}
                  Pontuando desde {dateLabel(weeklyMeta.score_start)} • fecha {dateLabel(weeklyMeta.week_end)}
                </Text>
              ) : (
                <Text style={[styles.periodText, { color: colors.yellow }]}>
                  O ranking começou agora. Abra boosters para registrar os primeiros pontos.
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.rewards, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rewardHeader}>
              <Ionicons name="gift" size={20} color={colors.yellow} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: colors.text }]}>Recompensas do Top 3 semanal</Text>
                <Text style={[styles.infoText, { color: colors.muted }]}>
                  Pagas automaticamente no fechamento. O ranking Global não dá recompensa.
                </Text>
              </View>
            </View>
            <View style={styles.rewardRow}>
              {rewardSummary.map((item) => (
                <View key={item.place} style={[styles.rewardChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  <Text style={[styles.rewardPlace, { color: colors.text }]}>{item.place}</Text>
                  <Text style={[styles.rewardValue, { color: colors.yellow }]}>{item.reward}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <View style={[styles.important, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Ionicons name="lock-closed" size={22} color={colors.yellow} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.globalTitle, { color: colors.text }]}>RANKING GLOBAL PERMANENTE</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              Este é o ranking antigo de valor total da coleção. Ele continua exatamente como antes, não reseta e não possui premiação semanal.
            </Text>
          </View>
        </View>
      )}

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {!loading && rowsCount === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name={mode === 'weekly' ? 'calendar-outline' : 'diamond-outline'} size={30} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {mode === 'weekly' ? 'A semana acabou de começar' : 'Nenhum jogador no ranking'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {mode === 'weekly'
              ? 'Os primeiros pontos aparecem quando jogadores abrirem boosters após a ativação do ranking.'
              : 'O ranking global aparecerá assim que houver coleções registradas.'}
          </Text>
        </View>
      ) : null}

      {!loading && mode === 'weekly' ? (
        <View style={styles.list}>
          {weeklyRows.map((row) => {
            const mine = row.player_id === myId;
            const medal = medalFor(row.weekly_rank);
            return (
              <Pressable
                key={row.player_id}
                accessibilityRole="button"
                accessibilityLabel={'Abrir perfil de @' + row.username}
                onPress={() => router.push('/player/' + row.player_id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: mine ? colors.accentSoft : colors.surface,
                    borderColor: mine ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={[styles.rankBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.rank, { color: colors.text }]}>{medal ?? '#' + row.weekly_rank}</Text>
                </View>

                <TrainerAvatar
                  icon={avatars[row.player_id]?.profileIcon}
                  avatarUrl={getProfileAvatarUrl(avatars[row.player_id]?.avatarPath, avatars[row.player_id]?.avatarUpdatedAt)}
                  color={colors.accent}
                  backgroundColor={colors.accentSoft}
                  size={46}
                />
                <View style={styles.identity}>
                  <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>
                    @{row.username}{mine ? ' • VOCÊ' : ''}
                  </Text>
                  <Text style={[styles.coverage, { color: colors.muted }]}>
                    +{row.cards_gained.toLocaleString('pt-BR')} cartas únicas • {row.packs_opened.toLocaleString('pt-BR')} packs c/ novidade
                  </Text>
                  {row.reward_coins > 0 || row.reward_diamonds > 0 ? (
                    <Text style={[styles.projectedReward, { color: colors.yellow }]}>
                      prêmio atual: 🪙 {row.reward_coins.toLocaleString('pt-BR')} + 💎 {row.reward_diamonds.toLocaleString('pt-BR')}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.valueWrap}>
                  <Text style={[styles.valueLabel, { color: colors.muted }]}>GANHO SEMANAL ÚNICO</Text>
                  <Text style={[styles.value, { color: colors.yellow }]}>{formatUsd(row.weekly_value_usd)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!loading && mode === 'global' ? (
        <View style={styles.list}>
          {globalRows.map((row) => {
            const mine = row.player_id === myId;
            const medal = medalFor(row.global_rank);
            return (
              <Pressable
                key={row.player_id}
                accessibilityRole="button"
                accessibilityLabel={'Abrir perfil de @' + row.username}
                onPress={() => router.push('/player/' + row.player_id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: mine ? colors.accentSoft : colors.surface,
                    borderColor: mine ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={[styles.rankBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.rank, { color: colors.text }]}>{medal ?? '#' + row.global_rank}</Text>
                </View>

                <View style={styles.identity}>
                  <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>
                    @{row.username}{mine ? ' • VOCÊ' : ''}
                  </Text>
                  <Text style={[styles.coverage, { color: colors.muted }]}>
                    {row.total_card_copies.toLocaleString('pt-BR')} cartas na coleção • mercado TCGplayer
                  </Text>
                </View>

                <View style={styles.valueWrap}>
                  <Text style={[styles.valueLabel, { color: colors.muted }]}>VALOR GLOBAL</Text>
                  <Text style={[styles.value, { color: colors.yellow }]}>{formatUsd(row.collection_value_usd)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' },
  back: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 11, fontWeight: '900' },
  refresh: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshText: { fontSize: 9, fontWeight: '900', letterSpacing: .5 },
  modeSwitch: { borderRadius: 18, borderWidth: 1, padding: 6, flexDirection: 'row', gap: 6 },
  modeButton: { flex: 1, minHeight: 58, borderRadius: 13, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeTitle: { fontSize: 12, fontWeight: '900', letterSpacing: .5 },
  modeSub: { fontSize: 7, fontWeight: '900', marginTop: 2, letterSpacing: .5 },
  important: { borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  importantTitle: { color: '#FFE08A', fontSize: 11, fontWeight: '900' },
  importantText: { color: '#E3D8B0', fontSize: 9, lineHeight: 14, marginTop: 3 },
  globalTitle: { fontSize: 11, fontWeight: '900' },
  info: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  infoTitle: { fontSize: 14, fontWeight: '900' },
  infoText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  periodText: { fontSize: 9, fontWeight: '900', lineHeight: 14, marginTop: 7 },
  rewards: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 10 },
  rewardHeader: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  rewardRow: { flexDirection: 'row', gap: 7 },
  rewardChip: { flex: 1, borderRadius: 13, borderWidth: 1, padding: 9, alignItems: 'center' },
  rewardPlace: { fontSize: 9, fontWeight: '900' },
  rewardValue: { fontSize: 10, fontWeight: '900', marginTop: 4 },
  error: { backgroundColor: '#351A24', borderRadius: 14, borderWidth: 1, borderColor: '#683243', padding: 12 },
  errorText: { color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
  empty: { borderRadius: 18, borderWidth: 1, padding: 24, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 15, fontWeight: '900', textAlign: 'center' },
  emptyText: { fontSize: 10, lineHeight: 15, textAlign: 'center' },
  list: { gap: 8 },
  row: { minHeight: 82, borderRadius: 18, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBox: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rank: { fontSize: 15, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0 },
  username: { fontSize: 14, fontWeight: '900' },
  coverage: { fontSize: 9, marginTop: 4 },
  projectedReward: { fontSize: 8, fontWeight: '900', marginTop: 4 },
  valueWrap: { alignItems: 'flex-end' },
  valueLabel: { fontSize: 6, fontWeight: '900', letterSpacing: .5, marginBottom: 2 },
  value: { fontSize: 14, fontWeight: '900' },
});
