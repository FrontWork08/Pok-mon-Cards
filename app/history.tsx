import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { getMyPackHistory } from '@/services/collections';
import { gameTheme } from '@/theme/gameTheme';

function rarityScore(rarity?: string | null) {
  const value = (rarity ?? '').toLowerCase();
  if (value.includes('hyper') || value.includes('secret') || value.includes('special illustration')) return 5;
  if (value.includes('ultra') || value.includes('illustration') || value.includes('double rare')) return 4;
  if (value.includes('rare') || value.includes('holo')) return 3;
  if (value.includes('uncommon')) return 2;
  return 1;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setHistory(await getMyPackHistory());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bestPulls = useMemo(() => history.flatMap((opening) => Array.isArray(opening.cards_received) ? opening.cards_received : []).sort((a, b) => rarityScore(b.rarity) - rarityScore(a.rarity)).slice(0, 3), [history]);

  return (
    <Screen title="Histórico de Packs" subtitle="Reveja boosters abertos e seus melhores pulls.">
      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color="#A9BDD7" /><Text style={styles.backText}>Voltar</Text></Pressable>

      <View style={styles.hero}><View><Text style={styles.heroKicker}>TOTAL ABERTO</Text><Text style={styles.heroValue}>{history.length}</Text><Text style={styles.heroText}>boosters registrados</Text></View><View style={styles.heroIcon}><Ionicons name="time" size={28} color={gameTheme.colors.yellow} /></View></View>

      {bestPulls.length > 0 ? (
        <View style={styles.bestSection}><Text style={styles.sectionTitle}>Melhores pulls recentes</Text><View style={styles.bestGrid}>{bestPulls.map((card, index) => <View key={`${card.id}-${index}`} style={styles.bestCard}>{card.image ? <Image source={{ uri: card.image }} style={styles.bestImage} resizeMode="contain" /> : <View style={styles.bestImage} />}<Text numberOfLines={1} style={styles.bestName}>{card.name}</Text><Text numberOfLines={1} style={styles.bestRarity}>{card.rarity ?? 'Comum'}</Text></View>)}</View></View>
      ) : null}

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Aberturas</Text><Text style={styles.count}>{history.length}</Text></View>
      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}
      {!loading && history.length === 0 ? <View style={styles.empty}><Ionicons name="cube-outline" size={34} color="#627C9D" /><Text style={styles.emptyTitle}>Nenhum pack aberto</Text><Text style={styles.emptyText}>Suas próximas aberturas aparecerão aqui.</Text></View> : null}

      <View style={styles.list}>
        {history.map((opening) => {
          const pack = Array.isArray(opening.packs) ? opening.packs[0] : opening.packs;
          const cards = Array.isArray(opening.cards_received) ? opening.cards_received : [];
          const best = [...cards].sort((a, b) => rarityScore(b.rarity) - rarityScore(a.rarity))[0];
          return (
            <View key={opening.id} style={styles.row}>
              <View style={styles.packIcon}>{pack?.image_url ? <Image source={{ uri: pack.image_url }} style={styles.packImage} resizeMode="contain" /> : <Ionicons name="cube" size={24} color="#7594BD" />}</View>
              <View style={styles.rowBody}><Text numberOfLines={1} style={styles.packName}>{pack?.name ?? 'Booster'}</Text><Text style={styles.meta}>{new Date(opening.opened_at).toLocaleString('pt-BR')} • {cards.length} cards</Text>{best ? <Text numberOfLines={1} style={styles.pull}>Melhor pull: {best.name} • {best.rarity ?? 'Comum'}</Text> : null}</View>
              <View style={styles.cardsPreview}>{cards.slice(0, 3).map((card: any, index: number) => card.image ? <Image key={`${card.id}-${index}`} source={{ uri: card.image }} style={[styles.miniCard, { marginLeft: index ? -13 : 0 }]} resizeMode="cover" /> : null)}</View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: '#A9BDD7', fontSize: 12, fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 22, backgroundColor: '#10284B', borderWidth: 1, borderColor: '#285A9A' },
  heroKicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 2 },
  heroText: { color: '#9FB4CF', fontSize: 10 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C291B' },
  bestSection: { gap: 9 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '900' },
  count: { color: '#8195AF', fontSize: 10, fontWeight: '800' },
  bestGrid: { flexDirection: 'row', gap: 9 },
  bestCard: { flex: 1, minWidth: 0, padding: 7, borderRadius: 15, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  bestImage: { width: '100%', aspectRatio: 0.72, borderRadius: 9, backgroundColor: '#091524' },
  bestName: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 5 },
  bestRarity: { color: gameTheme.colors.yellow, fontSize: 8, marginTop: 2 },
  empty: { alignItems: 'center', padding: 26, gap: 7, borderRadius: 18, backgroundColor: '#0E1A2B', borderWidth: 1, borderColor: '#203650' },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  emptyText: { color: '#7E92AD', fontSize: 10 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  packIcon: { width: 55, height: 68, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091524', overflow: 'hidden' },
  packImage: { width: '90%', height: '90%' },
  rowBody: { flex: 1, minWidth: 0 },
  packName: { color: '#fff', fontSize: 12, fontWeight: '900' },
  meta: { color: '#778CA8', fontSize: 8, marginTop: 3 },
  pull: { color: '#AFC2DA', fontSize: 9, marginTop: 5, fontWeight: '700' },
  cardsPreview: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6 },
  miniCard: { width: 34, height: 47, borderRadius: 4, borderWidth: 1, borderColor: '#263E5C' },
});
