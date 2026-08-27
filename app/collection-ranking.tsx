import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag, getMyProfile } from '@/services/player';
import {
  formatUsd,
  getCollectionValueLeaderboard,
  refreshOwnedMarketPrices,
  type CollectionRankEntry,
} from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function CollectionRankingScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [rows, setRows] = useState<CollectionRankEntry[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      setError(null);
      if (refresh) setUpdating(true);
      else setLoading(true);

      const [profile, bag] = await Promise.all([getMyProfile(), getMyBag()]);
      setMyId(profile.id);

      if (refresh || bag.some((entry) => !entry.cards?.market_price_updated_at)) {
        await refreshOwnedMarketPrices(
          bag.map((entry) => entry.cards?.id).filter((id): id is string => Boolean(id)),
          refresh,
        ).catch(() => []);
      }

      setRows(await getCollectionValueLeaderboard(100));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o ranking.');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const coverage = useMemo(() => {
    const totals = rows.reduce(
      (acc, row) => ({
        priced: acc.priced + row.priced_card_copies,
        total: acc.total + row.total_card_copies,
      }),
      { priced: 0, total: 0 },
    );
    return totals.total > 0 ? (totals.priced / totals.total) * 100 : 0;
  }, [rows]);

  return (
    <Screen
      title="Ranking de Coleções"
      subtitle="Ranking global pelo valor de mercado conhecido das cartas em dólar."
    >
      <View style={styles.topRow}>
        <Pressable style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Perfil</Text>
        </Pressable>

        <Pressable
          style={[styles.refresh, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
          onPress={() => load(true)}
          disabled={updating}
        >
          {updating ? <ActivityIndicator size="small" color={colors.yellow} /> : <Ionicons name="refresh" size={17} color={colors.yellow} />}
          <Text style={[styles.refreshText, { color: colors.yellow }]}>{updating ? 'ATUALIZANDO' : 'ATUALIZAR PREÇOS'}</Text>
        </Pressable>
      </View>

      <View style={[styles.info, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="cash-outline" size={23} color={colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>Valor de mercado em USD</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            O ranking usa preços de mercado em USD armazenados no servidor. A precificação continua automaticamente em segundo plano e a cobertura aumenta sem precisar manter esta tela aberta.
          </Text>
        </View>
      </View>

      {!loading ? (
        <View style={[styles.progress, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.progressTop}>
            <Text style={[styles.progressTitle, { color: colors.text }]}>Precificação global</Text>
            <Text style={[styles.progressValue, { color: colors.yellow }]}>{coverage.toFixed(0)}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.progressFill, { width: `${Math.min(100, coverage)}%`, backgroundColor: colors.yellow }]} />
          </View>
          <Text style={[styles.progressHint, { color: colors.muted }]}>
            O ranking já funciona com os preços disponíveis; ele fica mais preciso conforme a cobertura se aproxima de 100%.
          </Text>
        </View>
      ) : null}

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {!loading ? (
        <View style={styles.list}>
          {rows.map((row) => {
            const mine = row.player_id === myId;
            const medal = row.global_rank === 1 ? '🥇' : row.global_rank === 2 ? '🥈' : row.global_rank === 3 ? '🥉' : null;
            return (
              <View
                key={row.player_id}
                style={[
                  styles.row,
                  {
                    backgroundColor: mine ? colors.accentSoft : colors.surface,
                    borderColor: mine ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={[styles.rankBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.rank, { color: colors.text }]}>{medal ?? `#${row.global_rank}`}</Text>
                </View>

                <View style={styles.identity}>
                  <Text numberOfLines={1} style={[styles.username, { color: colors.text }]}>
                    @{row.username}{mine ? ' • VOCÊ' : ''}
                  </Text>
                  <Text style={[styles.coverage, { color: colors.muted }]}>
                    {row.total_card_copies.toLocaleString('pt-BR')} cards • {row.price_coverage_pct.toFixed(0)}% precificados
                  </Text>
                </View>

                <Text style={[styles.value, { color: colors.yellow }]}>{formatUsd(row.collection_value_usd)}</Text>
              </View>
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
  info: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  infoTitle: { fontSize: 14, fontWeight: '900' },
  infoText: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  progress: { borderRadius: 18, borderWidth: 1, padding: 14 },
  progressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { fontSize: 12, fontWeight: '900' },
  progressValue: { fontSize: 15, fontWeight: '900' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 9 },
  progressFill: { height: '100%', borderRadius: 999 },
  progressHint: { fontSize: 9, lineHeight: 14, marginTop: 8 },
  error: { backgroundColor: '#351A24', borderRadius: 14, borderWidth: 1, borderColor: '#683243', padding: 12 },
  errorText: { color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
  list: { gap: 8 },
  row: { minHeight: 76, borderRadius: 18, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBox: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rank: { fontSize: 15, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0 },
  username: { fontSize: 14, fontWeight: '900' },
  coverage: { fontSize: 9, marginTop: 4 },
  value: { fontSize: 14, fontWeight: '900' },
});
