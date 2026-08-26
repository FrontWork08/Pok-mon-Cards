import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getSetCatalog, type SetCatalogEntry } from '@/services/collections';
import { getMyBag } from '@/services/player';
import { gameTheme } from '@/theme/gameTheme';

function SetThumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <Ionicons name="albums-outline" size={38} color="#707070" />;
  return <Image source={{ uri }} style={styles.setImage} resizeMode="contain" onError={() => setFailed(true)} />;
}

export default function SetsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [sets, setSets] = useState<SetCatalogEntry[]>([]);
  const [ownedBySet, setOwnedBySet] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [catalog, bag] = await Promise.all([getSetCatalog(), getMyBag()]);
      setSets(catalog);
      const map = new Map<string, number>();
      for (const item of bag) {
        const relation = item.cards as any;
        const card = Array.isArray(relation) ? relation[0] : relation;
        const setId = card?.set_id;
        if (setId) map.set(setId, (map.get(setId) ?? 0) + 1);
      }
      setOwnedBySet(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sets.filter((set) => !term || set.set_name.toLowerCase().includes(term) || set.set_id.toLowerCase().includes(term));
  }, [search, sets]);

  const columns = width >= 1100 ? 3 : width >= 650 ? 2 : 1;
  const cardWidth = columns === 3 ? '32.4%' : columns === 2 ? '49%' : '100%';
  const completed = sets.filter((set) => (ownedBySet.get(set.set_id) ?? 0) >= set.total_cards).length;

  return (
    <Screen title="Coleções por Set" subtitle="Acompanhe quantos cards você já conseguiu em cada coleção.">
      <Pressable style={styles.backRow} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color="#B8B8B8" /><Text style={styles.backText}>Voltar</Text></Pressable>

      <View style={styles.hero}><View><Text style={styles.heroKicker}>COLEÇÕES</Text><Text style={styles.heroValue}>{sets.length}</Text><Text style={styles.heroText}>sets no catálogo</Text></View><View style={styles.heroRight}><Text style={styles.completeValue}>{completed}</Text><Text style={styles.completeLabel}>100% completos</Text></View></View>

      <View style={styles.searchBox}><Ionicons name="search" size={19} color="#8B8B8B" /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar set..." placeholderTextColor="#777" style={styles.search} /></View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Todos os sets</Text><Text style={styles.count}>{filtered.length}</Text></View>
      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      <View style={styles.grid}>
        {filtered.map((set) => {
          const owned = ownedBySet.get(set.set_id) ?? 0;
          const percent = set.total_cards ? Math.min(100, Math.round((owned / set.total_cards) * 100)) : 0;
          return (
            <Pressable key={set.set_id} style={[styles.setCard, { width: cardWidth as any }]} onPress={() => router.push(`/set/${set.set_id}`)}>
              <View style={styles.setImageWrap}><SetThumb uri={set.representative_image} /></View>
              <View style={styles.setBody}>
                <View style={styles.setTitleRow}><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.setName}>{set.set_name}</Text><Text style={styles.setId}>{set.set_id.toUpperCase()}</Text></View><Text style={styles.percent}>{percent}%</Text></View>
                <Text style={styles.progressText}>{owned} / {set.total_cards} cards</Text>
                <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#777" />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  setCard: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10, borderRadius: 18, backgroundColor: '#121212', borderWidth: 1, borderColor: '#2D2D2D' },
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
});
