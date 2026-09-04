import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import {
  getMyOwnedSetCounts,
  getSetCatalog,
  type SetCatalogEntry,
} from '@/services/collections';
import { useAppTheme } from '@/theme/ThemeProvider';

function SetThumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  const { colors } = useAppTheme();
  if (!uri || failed) return <Ionicons name="albums-outline" size={38} color={colors.muted} />;
  return (
    <Image
      source={{ uri }}
      style={styles.setImage}
      resizeMode="contain"
      resizeMethod={Platform.OS === 'android' ? 'resize' : 'auto'}
      fadeDuration={0}
      onError={() => setFailed(true)}
    />
  );
}

export default function SetsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const [sets, setSets] = useState<SetCatalogEntry[]>([]);
  const [ownedBySet, setOwnedBySet] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [catalog, counts] = await Promise.all([
        getSetCatalog(),
        getMyOwnedSetCounts(),
      ]);
      setSets(catalog);
      setOwnedBySet(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as coleções.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sets.filter((set) =>
      !term ||
      set.set_name.toLowerCase().includes(term) ||
      set.set_id.toLowerCase().includes(term)
    );
  }, [search, sets]);

  const columns = width >= 1100 ? 3 : width >= 650 ? 2 : 1;
  const listWidth = Math.max(280, Math.min(width, 1280) - 32);
  const gap = 10;
  const cardWidth = Math.floor((listWidth - gap * (columns - 1)) / columns);
  const completed = useMemo(
    () => sets.filter((set) => (ownedBySet.get(set.set_id) ?? 0) >= set.total_cards).length,
    [ownedBySet, sets],
  );

  const renderItem = useCallback(({ item: set }: { item: SetCatalogEntry }) => {
    const owned = ownedBySet.get(set.set_id) ?? 0;
    const percent = set.total_cards
      ? Math.min(100, Math.round((owned / set.total_cards) * 100))
      : 0;

    return (
      <Pressable
        style={[styles.setCard, { width: cardWidth, backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/set/${set.set_id}`)}
      >
        <View style={[styles.setImageWrap, { backgroundColor: isLight ? '#EDF2F7' : colors.bg }]}>
          <SetThumb uri={set.representative_image} />
        </View>
        <View style={styles.setBody}>
          <View style={styles.setTitleRow}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.setName, { color: colors.text }]}>{set.set_name}</Text>
              <Text style={[styles.setId, { color: colors.muted }]}>{set.set_id.toUpperCase()}</Text>
            </View>
            <Text style={[styles.percent, { color: colors.yellow }]}>{percent}%</Text>
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>{owned} / {set.total_cards} cards</Text>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: percent === 100 ? colors.green : colors.yellow }]} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }, [cardWidth, colors.bg, colors.border, colors.green, colors.muted, colors.surface, colors.surfaceAlt, colors.text, colors.yellow, isLight, ownedBySet, router]);

  const header = (
    <View style={styles.headerContent}>
      <TrainerPageHeader
        title="Coleções por Set"
        subtitle="Acompanhe quantos cards você já conseguiu em cada coleção."
        icon="layers"
      />

      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View>
          <Text style={[styles.heroKicker, { color: colors.yellow }]}>COLEÇÕES</Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>{sets.length}</Text>
          <Text style={[styles.heroText, { color: colors.muted }]}>sets no catálogo</Text>
        </View>
        <View style={styles.heroRight}>
          <Text style={[styles.completeValue, { color: colors.green }]}>{completed}</Text>
          <Text style={[styles.completeLabel, { color: colors.muted }]}>100% completos</Text>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={19} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar set..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={[styles.search, { color: colors.text }]}
        />
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Todos os sets</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
          <Text style={[styles.count, { color: colors.muted }]}>{filtered.length}</Text>
        </View>
      </View>

      {error ? (
        <Pressable style={styles.error} onPress={() => setError(null)}>
          <Ionicons name="alert-circle" size={18} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <FlatList
        {...VIRTUAL_LIST_PERF_PROPS}
        key={`set-grid-${columns}`}
        data={loading ? [] : filtered}
        keyExtractor={(set) => set.set_id}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={colors.yellow} />
          ) : !error ? (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="layers-outline" size={28} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum set encontrado.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.content, { paddingTop: 12 }]}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={70}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  headerContent: { gap: 16, marginBottom: 10 },
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 12, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 23, borderWidth: 1 },
  heroKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { fontSize: 32, fontWeight: '900', marginTop: 2 },
  heroText: { fontSize: 10 },
  heroRight: { alignItems: 'flex-end' },
  completeValue: { fontSize: 27, fontWeight: '900' },
  completeLabel: { fontSize: 9 },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1 },
  search: { flex: 1, height: '100%', fontSize: 13 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  countBadge: { minWidth: 34, height: 30, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 10, fontWeight: '900' },
  row: { gap: 10 },
  setCard: { minHeight: 120, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 18, borderWidth: 1 },
  setImageWrap: { width: 86, height: 82, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 8 },
  setImage: { width: '100%', height: '100%' },
  setBody: { flex: 1 },
  setTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  setName: { fontSize: 13, fontWeight: '900' },
  setId: { fontSize: 8, fontWeight: '800', marginTop: 2 },
  percent: { fontSize: 13, fontWeight: '900' },
  progressText: { fontSize: 9, marginTop: 9 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 5 },
  fill: { height: '100%', borderRadius: 999 },
  loader: { marginVertical: 38 },
  empty: { padding: 28, alignItems: 'center', gap: 7, borderRadius: 18, borderWidth: 1 },
  emptyText: { fontSize: 12, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 12 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
});
