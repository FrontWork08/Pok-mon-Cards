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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import {
  generationForNumber,
  getMyOwnedPokedexNumbers,
  getPokedexCatalog,
  type PokedexEntry,
} from '@/services/pokedex';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function PokedexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const [catalog, setCatalog] = useState<PokedexEntry[]>([]);
  const [discovered, setDiscovered] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [generation, setGeneration] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [entries, ownedNumbers] = await Promise.all([
        getPokedexCatalog(),
        getMyOwnedPokedexNumbers(),
      ]);
      setCatalog(entries);
      setDiscovered(new Set(ownedNumbers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a Pokédex.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      const matchesText =
        !term ||
        entry.pokemon_name.toLowerCase().includes(term) ||
        String(entry.pokedex_number).includes(term);
      const matchesGeneration =
        generation === null || generationForNumber(entry.pokedex_number) === generation;
      return matchesText && matchesGeneration;
    });
  }, [catalog, generation, search]);

  const columns = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const listWidth = Math.max(280, Math.min(width, 1280) - 32);
  const gap = 10;
  const tileWidth = Math.floor((listWidth - gap * (columns - 1)) / columns);
  const completion = catalog.length ? Math.round((discovered.size / catalog.length) * 100) : 0;

  const renderItem = useCallback(({ item: entry }: { item: PokedexEntry }) => {
    const owned = discovered.has(entry.pokedex_number);
    return (
      <Pressable
        disabled={!owned}
        onPress={() => router.push(`/pokemon/${entry.pokedex_number}`)}
        style={[
          styles.tile,
          {
            width: tileWidth,
            backgroundColor: owned ? colors.surface : colors.surfaceAlt,
            borderColor: owned ? colors.border : colors.border,
            opacity: owned ? 1 : .68,
          },
        ]}
      >
        <View style={styles.numberRow}>
          <Text style={[styles.number, { color: colors.muted }]}>#{String(entry.pokedex_number).padStart(4, '0')}</Text>
          {owned ? (
            <Ionicons name="chevron-forward-circle" size={17} color={colors.green} />
          ) : (
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
          )}
        </View>

        <View style={[styles.imageWrap, { backgroundColor: isLight ? '#E8EEF5' : colors.bg }]}>
          {owned && entry.image_small ? (
            <Image
              source={{ uri: entry.image_small }}
              resizeMode="contain"
              resizeMethod={Platform.OS === 'android' ? 'resize' : 'auto'}
              fadeDuration={0}
              style={styles.image}
            />
          ) : (
            <View style={[styles.unknown, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.question, { color: colors.border }]}>?</Text>
            </View>
          )}
        </View>

        <Text
          numberOfLines={1}
          style={[styles.name, { color: owned ? colors.text : colors.muted }]}
        >
          {owned ? entry.pokemon_name : 'Não descoberto'}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>
          {owned
            ? `Toque para ver os cards • Gen ${generationForNumber(entry.pokedex_number)}`
            : `Gen ${generationForNumber(entry.pokedex_number)}`}
        </Text>
      </Pressable>
    );
  }, [colors.bg, colors.border, colors.green, colors.muted, colors.surface, colors.surfaceAlt, colors.text, discovered, isLight, router, tileWidth]);

  const header = (
    <View style={styles.headerContent}>
      <TrainerPageHeader
        title="Pokédex"
        subtitle="Descubra espécies abrindo boosters e acompanhe tudo o que ainda falta."
        icon="book"
      />

      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View>
          <Text style={[styles.heroKicker, { color: colors.yellow }]}>PROGRESSO GLOBAL</Text>
          <Text style={[styles.heroValue, { color: colors.text }]}>{discovered.size} / {catalog.length || '—'}</Text>
          <Text style={[styles.heroText, { color: colors.muted }]}>espécies descobertas</Text>
        </View>
        <View style={[styles.percentCircle, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
          <Text style={[styles.percentText, { color: colors.text }]}>{completion}%</Text>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar Pokémon ou número..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={[styles.search, { color: colors.text }]}
        />
      </View>

      <View style={styles.gens}>
        <Chip label="Todas" active={generation === null} onPress={() => setGeneration(null)} />
        {[1,2,3,4,5,6,7,8,9].map((gen) => (
          <Chip
            key={gen}
            label={`Gen ${gen}`}
            active={generation === gen}
            onPress={() => setGeneration(gen)}
          />
        ))}
      </View>

      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Espécies</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{filtered.length} exibidas</Text>
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
        key={`pokedex-grid-${columns}`}
        data={loading ? [] : filtered}
        keyExtractor={(entry) => String(entry.pokedex_number)}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={colors.yellow} />
          ) : !error ? (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={28} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma espécie encontrada.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 12 : Math.max(insets.top, 10) },
        ]}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={60}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.yellow : colors.surface,
          borderColor: active ? colors.yellow : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? '#07111F' : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  headerContent: { gap: 16, marginBottom: 10 },
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { fontWeight: '800', fontSize: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 24, padding: 18, borderWidth: 1, overflow: 'hidden' },
  heroKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  heroValue: { fontSize: 32, fontWeight: '900', marginTop: 3 },
  heroText: { fontSize: 12 },
  percentCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 5 },
  percentText: { fontWeight: '900', fontSize: 18 },
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1 },
  search: { flex: 1, height: '100%', fontSize: 14 },
  gens: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 10, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  count: { fontSize: 12, fontWeight: '700' },
  row: { gap: 10 },
  tile: { marginBottom: 10, borderRadius: 18, padding: 9, borderWidth: 1 },
  numberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 7 },
  number: { fontSize: 10, fontWeight: '900' },
  imageWrap: { width: '100%', aspectRatio: .72, borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  unknown: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  question: { fontSize: 54, fontWeight: '900' },
  name: { fontSize: 13, fontWeight: '900', marginTop: 8 },
  meta: { fontSize: 8, fontWeight: '700', marginTop: 3 },
  loader: { marginVertical: 38 },
  empty: { padding: 28, alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 18 },
  emptyText: { fontSize: 12, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 12 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 11, fontWeight: '700' },
});
