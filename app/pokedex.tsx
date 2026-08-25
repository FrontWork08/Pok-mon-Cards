import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag } from '@/services/player';
import { generationForNumber, getPokedexCatalog, type PokedexEntry } from '@/services/pokedex';
import { gameTheme } from '@/theme/gameTheme';

export default function PokedexScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [catalog, setCatalog] = useState<PokedexEntry[]>([]);
  const [discovered, setDiscovered] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [generation, setGeneration] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [entries, bag] = await Promise.all([getPokedexCatalog(), getMyBag()]);
      setCatalog(entries);
      setDiscovered(new Set(
        bag.map((item) => item.cards?.pokedex_numbers?.[0]).filter((value): value is number => typeof value === 'number')
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog.filter((entry) => {
      const matchesText = !term || entry.pokemon_name.toLowerCase().includes(term) || String(entry.pokedex_number).includes(term);
      const matchesGeneration = generation === null || generationForNumber(entry.pokedex_number) === generation;
      return matchesText && matchesGeneration;
    });
  }, [catalog, generation, search]);

  const columns = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const tileWidth = columns === 6 ? '15.5%' : columns === 5 ? '18.8%' : columns === 4 ? '23.5%' : '48.5%';
  const completion = catalog.length ? Math.round((discovered.size / catalog.length) * 100) : 0;

  return (
    <Screen title="Pokédex" subtitle="Descubra espécies abrindo boosters e acompanhe tudo o que ainda falta.">
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color="#A9BDD7" />
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>

      <View style={styles.hero}>
        <View>
          <Text style={styles.heroKicker}>PROGRESSO GLOBAL</Text>
          <Text style={styles.heroValue}>{discovered.size} / {catalog.length || '—'}</Text>
          <Text style={styles.heroText}>espécies descobertas</Text>
        </View>
        <View style={styles.percentCircle}><Text style={styles.percentText}>{completion}%</Text></View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={gameTheme.colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon ou número..." placeholderTextColor="#70839F" style={styles.search} />
      </View>

      <View style={styles.gens}>
        <Chip label="Todas" active={generation === null} onPress={() => setGeneration(null)} />
        {[1,2,3,4,5,6,7,8,9].map((gen) => <Chip key={gen} label={`Gen ${gen}`} active={generation === gen} onPress={() => setGeneration(gen)} />)}
      </View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Espécies</Text><Text style={styles.count}>{filtered.length} exibidas</Text></View>
      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      <View style={styles.grid}>
        {filtered.map((entry) => {
          const owned = discovered.has(entry.pokedex_number);
          return (
            <Pressable
              key={entry.pokedex_number}
              disabled={!owned}
              onPress={() => router.push(`/pokemon/${entry.pokedex_number}`)}
              style={[styles.tile, { width: tileWidth as any }, !owned && styles.lockedTile]}
            >
              <View style={styles.numberRow}>
                <Text style={styles.number}>#{String(entry.pokedex_number).padStart(4, '0')}</Text>
                {owned ? <Ionicons name="chevron-forward-circle" size={17} color="#65D894" /> : <Ionicons name="lock-closed" size={14} color="#5D6E83" />}
              </View>
              <View style={styles.imageWrap}>
                {owned && entry.image_small ? <Image source={{ uri: entry.image_small }} resizeMode="contain" style={styles.image} /> : <View style={styles.unknown}><Text style={styles.question}>?</Text></View>}
              </View>
              <Text numberOfLines={1} style={[styles.name, !owned && styles.hiddenName]}>{owned ? entry.pokemon_name : 'Não descoberto'}</Text>
              <Text numberOfLines={1} style={styles.meta}>{owned ? `Toque para ver todos os cards • Gen ${generationForNumber(entry.pokedex_number)}` : `Gen ${generationForNumber(entry.pokedex_number)}`}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { color: '#A9BDD7', fontWeight: '800', fontSize: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#10284B', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#285A9A' },
  heroKicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 3 },
  heroText: { color: '#AFC1DB', fontSize: 12 },
  percentCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A1930', borderWidth: 5, borderColor: gameTheme.colors.yellow },
  percentText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 17, backgroundColor: gameTheme.colors.surface, borderWidth: 1, borderColor: gameTheme.colors.border },
  search: { flex: 1, height: '100%', color: '#fff', fontSize: 14 },
  gens: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  chipActive: { backgroundColor: gameTheme.colors.yellow, borderColor: gameTheme.colors.yellow },
  chipText: { color: '#9EB0C8', fontSize: 10, fontWeight: '900' },
  chipTextActive: { color: '#07111F' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: '#fff', fontSize: 21, fontWeight: '900' },
  count: { color: gameTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { backgroundColor: '#101D30', borderRadius: 18, padding: 9, borderWidth: 1, borderColor: '#263E5C' },
  lockedTile: { opacity: 0.72, backgroundColor: '#0C1625' },
  numberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, marginBottom: 7 },
  number: { color: '#7489A7', fontSize: 10, fontWeight: '900' },
  imageWrap: { width: '100%', aspectRatio: 0.72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#091524' },
  image: { width: '100%', height: '100%' },
  unknown: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111C2A' },
  question: { color: '#354A65', fontSize: 54, fontWeight: '900' },
  name: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 8 },
  hiddenName: { color: '#6A7C94' },
  meta: { color: '#71849E', fontSize: 8, fontWeight: '700', marginTop: 3 },
});
