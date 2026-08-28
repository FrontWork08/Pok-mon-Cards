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
import { PremiumBackground } from '@/components/PremiumBackground';
import {
  getMyOwnedSetCounts,
  getSetCatalog,
  type SetCatalogEntry,
} from '@/services/collections';
import { gameTheme } from '@/theme/gameTheme';

function SetThumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <Ionicons name="albums-outline" size={38} color="#707070" />;
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
        style={[styles.setCard, { width: cardWidth }]}
        onPress={() => router.push(`/set/${set.set_id}`)}
      >
        <View style={styles.setImageWrap}><SetThumb uri={set.representative_image} /></View>
        <View style={styles.setBody}>
          <View style={styles.setTitleRow}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.setName}>{set.set_name}</Text>
              <Text style={styles.setId}>{set.set_id.toUpperCase()}</Text>
            </View>
            <Text style={styles.percent}>{percent}%</Text>
          </View>
          <Text style={styles.progressText}>{owned} / {set.total_cards} cards</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#777" />
      </Pressable>
    );
  }, [cardWidth, ownedBySet, router]);

  const header = (
    <View style={styles.headerContent}>
<View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>TRAINER HUB</Text>
        <Text style={styles.pageTitle}>Coleções por Set</Text>
        <Text style={styles.pageSubtitle}>
          Acompanhe quantos cards você já conseguiu em cada coleção.
        </Text>
      </View>

      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color="#B8B8B8" />
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>

      <View style={styles.hero}>
        <View>
          <Text style={styles.heroKicker}>COLEÇÕES</Text>
          <Text style={styles.heroValue}>{sets.length}</Text>
          <Text style={styles.heroText}>sets no catálogo</Text>
        </View>
        <View style={styles.heroRight}>
          <Text style={styles.completeValue}>{completed}</Text>
          <Text style={styles.completeLabel}>100% completos</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color="#8B8B8B" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar set..."
          placeholderTextColor="#777"
          autoCapitalize="none"
          style={styles.search}
        />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Todos os sets</Text>
        <Text style={styles.count}>{filtered.length}</Text>
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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safe}>
      <PremiumBackground />
      <FlatList
        key={`set-grid-${columns}`}
        data={loading ? [] : filtered}
        keyExtractor={(set) => set.set_id}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={gameTheme.colors.yellow} />
          ) : !error ? (
            <View style={styles.empty}><Text style={styles.emptyText}>Nenhum set encontrado.</Text></View>
          ) : null
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: 12 },
        ]}
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
  safe: { flex: 1, overflow: 'hidden', backgroundColor: gameTheme.colors.bg },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  headerContent: { gap: 16, marginBottom: 10 },
  pageHeader: { gap: 5, marginBottom: 4 },
  eyebrow: { color: gameTheme.colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  pageTitle: { color: '#fff', fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  pageSubtitle: { color: '#A5A5A5', fontSize: 15, lineHeight: 21 },
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#B8B8B8', fontSize: 12, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 23, backgroundColor: '#101010', borderWidth: 1, borderColor: '#343434' },
  heroKicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 2 },
  heroText: { color: '#A5A5A5', fontSize: 10 },
  heroRight: { alignItems: 'flex-end' },
  completeValue: { color: '#65D894', fontSize: 27, fontWeight: '900' },
  completeLabel: { color: '#9B9B9B', fontSize: 9 },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 15, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2D2D2D' },
  search: { flex: 1, height: '100%', color: '#fff', fontSize: 13 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  count: { color: '#8D8D8D', fontSize: 11, fontWeight: '800' },
  row: { gap: 10 },
  setCard: { minHeight: 120, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 18, backgroundColor: '#121212', borderWidth: 1, borderColor: '#2D2D2D' },
  setImageWrap: { width: 86, height: 82, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#090909', padding: 8 },
  setImage: { width: '100%', height: '100%' },
  setBody: { flex: 1 },
  setTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  setName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  setId: { color: '#7E7E7E', fontSize: 8, fontWeight: '800', marginTop: 2 },
  percent: { color: gameTheme.colors.yellow, fontSize: 13, fontWeight: '900' },
  progressText: { color: '#9B9B9B', fontSize: 9, marginTop: 9 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: '#242424', marginTop: 5 },
  fill: { height: '100%', borderRadius: 999, backgroundColor: gameTheme.colors.yellow },
  loader: { marginVertical: 38 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#8D8D8D', fontSize: 12, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 12 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
});
