import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import {
  getMyPackHistoryPage,
  type PackHistoryEntry,
} from '@/services/collections';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE = 25;

function rarityScore(rarity?: string | null) {
  const value = (rarity ?? '').toLowerCase();
  if (value.includes('hyper') || value.includes('secret') || value.includes('special illustration')) return 5;
  if (value.includes('ultra') || value.includes('illustration') || value.includes('double rare')) return 4;
  if (value.includes('rare') || value.includes('holo')) return 3;
  if (value.includes('uncommon')) return 2;
  return 1;
}

function cardValue(card: any) {
  const value = Number(card?.marketPriceUsd ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function openingBestCard(opening: PackHistoryEntry) {
  const cards = Array.isArray(opening.cards_received) ? opening.cards_received : [];
  if (!cards.length) return null;
  let best = cards[0];
  let bestValue = cardValue(best);
  for (let index = 1; index < cards.length; index += 1) {
    const card = cards[index];
    const value = cardValue(card);
    if (value > bestValue || (value === bestValue && rarityScore(card?.rarity) > rarityScore(best?.rarity))) {
      best = card;
      bestValue = value;
    }
  }
  return best;
}

const HistoryRow = memo(function HistoryRow({ opening }: { opening: PackHistoryEntry }) {
  const { colors, isLight } = useAppTheme();
  const pack = Array.isArray(opening.packs) ? opening.packs[0] : opening.packs;
  const cards = Array.isArray(opening.cards_received) ? opening.cards_received : [];
  const best = openingBestCard(opening);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.packIcon, { backgroundColor: isLight ? '#EDF2F7' : colors.bg }]}>
        {pack?.image_url ? (
          <Image
            source={{ uri: pack.image_url }}
            style={styles.packImage}
            resizeMode="contain"
            fadeDuration={Platform.OS === 'android' ? 0 : undefined}
          />
        ) : (
          <Ionicons name="cube" size={24} color={colors.accent} />
        )}
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.packName, { color: colors.text }]}>{pack?.name ?? 'Booster'}</Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {new Date(opening.opened_at).toLocaleString('pt-BR')} • {cards.length} cards
        </Text>
        {best ? (
          <Text numberOfLines={1} style={[styles.pull, { color: colors.muted }]}>
            Melhor pull: {best.name ?? 'Carta'} • {best.rarity ?? 'Comum'}
          </Text>
        ) : null}
      </View>
      <View style={styles.cardsPreview}>
        {cards.slice(0, 3).map((card: any, index: number) => card?.image ? (
          <Image
            key={`${card.id ?? 'card'}-${index}`}
            source={{ uri: card.image }}
            style={[styles.miniCard, { marginLeft: index ? -13 : 0, borderColor: colors.border }]}
            resizeMode="cover"
            fadeDuration={Platform.OS === 'android' ? 0 : undefined}
          />
        ) : null)}
      </View>
    </View>
  );
});

export default function HistoryScreen() {
  const router = useRouter();
  const { colors, isLight } = useAppTheme();
  const [history, setHistory] = useState<PackHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const loadFirstPage = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getMyPackHistoryPage(0, PAGE_SIZE);
      setHistory(result.rows);
      setTotal(result.total);
      setPage(0);
      setHasMore(result.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]));

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getMyPackHistoryPage(nextPage, PAGE_SIZE);
      setHistory((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...result.rows.filter((item) => !known.has(item.id))];
      });
      setPage(nextPage);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, page]);

  const bestPulls = useMemo(() => {
    const cards = history
      .slice(0, PAGE_SIZE)
      .flatMap((opening) => Array.isArray(opening.cards_received) ? opening.cards_received : []);

    return cards
      .map((card) => ({ card, value: cardValue(card), rarity: rarityScore(card?.rarity) }))
      .sort((a, b) => b.value - a.value || b.rarity - a.rarity)
      .slice(0, 3)
      .map((item) => item.card);
  }, [history]);

  const header = useMemo(() => (
    <View style={styles.headerStack}>
      <TrainerPageHeader
        title="Histórico de Packs"
        subtitle="Reveja boosters abertos e seus melhores pulls."
        icon="time"
      />

      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View>
          <Text style={[styles.heroKicker, { color: colors.yellow }]}>TOTAL ABERTO</Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>{total.toLocaleString('pt-BR')}</Text>
          <Text style={[styles.heroText, { color: colors.muted }]}>boosters registrados</Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="time" size={28} color={colors.yellow} />
        </View>
      </View>

      {bestPulls.length > 0 ? (
        <View style={styles.bestSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Melhores pulls recentes</Text>
          <View style={styles.bestGrid}>
            {bestPulls.map((card: any, index) => (
              <View key={`${card.id ?? 'card'}-${index}`} style={[styles.bestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {card.image ? (
                  <Image
                    source={{ uri: card.image }}
                    style={[styles.bestImage, { backgroundColor: isLight ? '#EDF2F7' : colors.bg }]}
                    resizeMode="contain"
                    fadeDuration={Platform.OS === 'android' ? 0 : undefined}
                  />
                ) : <View style={[styles.bestImage, { backgroundColor: colors.surfaceAlt }]} />}
                <Text numberOfLines={1} style={[styles.bestName, { color: colors.text }]}>{card.name ?? 'Carta'}</Text>
                <Text numberOfLines={1} style={[styles.bestRarity, { color: colors.yellow }]}>{card.rarity ?? 'Comum'}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Aberturas</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
          <Text style={[styles.count, { color: colors.muted }]}>{history.length}/{total}</Text>
        </View>
      </View>
    </View>
  ), [bestPulls, colors.accent, colors.accentSoft, colors.bg, colors.border, colors.muted, colors.surface, colors.surfaceAlt, colors.text, colors.yellow, history.length, isLight, router, total]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PackHistoryEntry>) => <HistoryRow opening={item} />,
    [],
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <FlatList
        {...VIRTUAL_LIST_PERF_PROPS}
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={!loading ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="cube-outline" size={34} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum pack aberto</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Suas próximas aberturas aparecerão aqui.</Text>
          </View>
        ) : null}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator style={styles.footerLoader} color={colors.yellow} />
        ) : null}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.55}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={45}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => { void loadFirstPage(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36 },
  headerStack: { gap: 16, marginBottom: 8 },
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 12, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 22, borderWidth: 1 },
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { fontSize: 32, fontWeight: '900', marginTop: 2 },
  heroText: { fontSize: 10 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bestSection: { gap: 9 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  countBadge: { minWidth: 48, height: 30, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  count: { fontSize: 9, fontWeight: '900' },
  bestGrid: { flexDirection: 'row', gap: 9 },
  bestCard: { flex: 1, minWidth: 0, padding: 7, borderRadius: 15, borderWidth: 1 },
  bestImage: { width: '100%', aspectRatio: .72, borderRadius: 9 },
  bestName: { fontSize: 10, fontWeight: '900', marginTop: 5 },
  bestRarity: { fontSize: 8, marginTop: 2 },
  empty: { alignItems: 'center', padding: 26, gap: 7, borderRadius: 18, borderWidth: 1, marginTop: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyText: { fontSize: 10 },
  separator: { height: 8 },
  row: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, borderWidth: 1 },
  packIcon: { width: 55, height: 68, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  packImage: { width: '90%', height: '90%' },
  rowBody: { flex: 1, minWidth: 0 },
  packName: { fontSize: 12, fontWeight: '900' },
  meta: { fontSize: 8, marginTop: 3 },
  pull: { fontSize: 9, marginTop: 5, fontWeight: '700' },
  cardsPreview: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6 },
  miniCard: { width: 34, height: 47, borderRadius: 4, borderWidth: 1 },
  footerLoader: { marginVertical: 18 },
});
