import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { getMyBag } from '@/services/player';
import { gameTheme } from '@/theme/gameTheme';

type QuickFilter = 'all' | 'favorites' | 'duplicates';

export default function BagScreen() {
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  async function loadBag(term?: string) {
    try {
      setLoading(true);
      const data = await getMyBag(term);
      setCards(data ?? []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBag(); }, []);

  const visibleCards = useMemo(() => cards.filter((entry) => {
    if (quickFilter === 'favorites') return Boolean(entry.favorite);
    if (quickFilter === 'duplicates') return Number(entry.quantity ?? 0) > 1;
    return true;
  }), [cards, quickFilter]);

  const totalCards = useMemo(() => cards.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0), [cards]);

  return (
    <Screen title="Pokémon Bag" subtitle="Sua coleção pessoal. Encontre raridades, duplicatas e favoritos.">
      <View style={styles.summary}>
        <View style={styles.summaryMain}>
          <Text style={styles.summaryKicker}>COLEÇÃO</Text>
          <Text style={styles.summaryNumber}>{totalCards.toLocaleString('pt-BR')}</Text>
          <Text style={styles.summaryLabel}>cards no total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summarySide}>
          <Text style={styles.sideNumber}>{cards.length.toLocaleString('pt-BR')}</Text>
          <Text style={styles.sideLabel}>cards únicos</Text>
          <Text style={styles.sideNumber}>{cards.filter((entry) => Number(entry.quantity ?? 0) > 1).length}</Text>
          <Text style={styles.sideLabel}>duplicatas</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={gameTheme.colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => loadBag(search)}
          placeholder="Buscar Pokémon..."
          placeholderTextColor="#70839F"
          style={styles.search}
          returnKeyType="search"
        />
        <Pressable onPress={() => loadBag(search)} style={styles.searchAction}><Ionicons name="arrow-forward" size={18} color="#fff" /></Pressable>
      </View>

      <View style={styles.filters}>
        <FilterChip active={quickFilter === 'all'} label="Todos" icon="grid" onPress={() => setQuickFilter('all')} />
        <FilterChip active={quickFilter === 'favorites'} label="Favoritos" icon="heart" onPress={() => setQuickFilter('favorites')} />
        <FilterChip active={quickFilter === 'duplicates'} label="Duplicatas" icon="copy" onPress={() => setQuickFilter('duplicates')} />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Meus cards</Text>
        <Text style={styles.count}>{visibleCards.length} exibidos</Text>
      </View>

      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      {!loading && visibleCards.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="albums-outline" size={30} color={gameTheme.colors.blue} /></View>
          <Text style={styles.emptyTitle}>{cards.length === 0 ? 'Sua Bag está vazia' : 'Nada neste filtro'}</Text>
          <Text style={styles.emptyText}>{cards.length === 0 ? 'Abra boosters para começar sua coleção.' : 'Escolha outro filtro ou faça uma nova busca.'}</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {visibleCards.map((entry) => {
          const card = Array.isArray(entry.cards) ? entry.cards[0] : entry.cards;
          if (!card) return null;

          return (
            <View key={card.id} style={styles.card}>
              <View style={styles.imageWrap}>
                {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardPlaceholder}><Ionicons name="image-outline" size={28} color="#526882" /></View>}
                {entry.favorite ? <View style={styles.favoriteBadge}><Ionicons name="heart" size={13} color="#fff" /></View> : null}
                {Number(entry.quantity ?? 0) > 1 ? <View style={styles.quantityBadge}><Text style={styles.quantityText}>×{entry.quantity}</Text></View> : null}
              </View>
              <Text style={styles.cardName} numberOfLines={1}>{card.pokemon_name}</Text>
              <Text style={styles.setName} numberOfLines={1}>{card.set_name}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardMeta} numberOfLines={1}>{card.rarity ?? 'Sem raridade'}</Text>
                <Ionicons name="chevron-forward" size={14} color="#59708D" />
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

function FilterChip({ active, label, icon, onPress }: { active: boolean; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Ionicons name={icon} size={14} color={active ? '#07111F' : '#9CAFC7'} />
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: '#10284B', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#285A9A', alignItems: 'stretch' },
  summaryMain: { flex: 1, justifyContent: 'center' },
  summaryKicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  summaryNumber: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
  summaryLabel: { color: '#AFC1DB', fontSize: 12 },
  summaryDivider: { width: 1, backgroundColor: '#31567F', marginHorizontal: 18 },
  summarySide: { minWidth: 105, justifyContent: 'center' },
  sideNumber: { color: '#fff', fontSize: 17, fontWeight: '900' },
  sideLabel: { color: '#91A6C2', fontSize: 10, marginBottom: 8 },
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: gameTheme.colors.surface, borderRadius: 17, borderWidth: 1, borderColor: gameTheme.colors.border, paddingLeft: 14, paddingRight: 7 },
  search: { flex: 1, color: '#fff', height: '100%', fontSize: 14 },
  searchAction: { width: 38, height: 38, borderRadius: 12, backgroundColor: gameTheme.colors.blue, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: gameTheme.colors.surface, borderWidth: 1, borderColor: gameTheme.colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  filterChipActive: { backgroundColor: gameTheme.colors.yellow, borderColor: gameTheme.colors.yellow },
  filterText: { color: '#9CAFC7', fontWeight: '800', fontSize: 11 },
  filterTextActive: { color: '#07111F' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { color: '#fff', fontSize: 21, fontWeight: '900' },
  count: { color: gameTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  empty: { backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: gameTheme.colors.border },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#102A4E', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  emptyText: { color: gameTheme.colors.muted, marginTop: 6, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48.5%', backgroundColor: gameTheme.colors.surface, borderRadius: 18, padding: 8, borderWidth: 1, borderColor: gameTheme.colors.border },
  imageWrap: { width: '100%', aspectRatio: 0.72, backgroundColor: '#091524', borderRadius: 13, overflow: 'hidden', position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  cardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: '#fff', fontWeight: '900', marginTop: 9, fontSize: 14 },
  setName: { color: '#70839F', fontSize: 10, fontWeight: '700', marginTop: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  cardMeta: { color: '#9FB0C6', fontSize: 10, flex: 1 },
  quantityBadge: { position: 'absolute', right: 7, top: 7, backgroundColor: gameTheme.colors.yellow, borderRadius: 999, minWidth: 30, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' },
  quantityText: { color: '#07111F', fontWeight: '900', fontSize: 11 },
  favoriteBadge: { position: 'absolute', left: 7, top: 7, width: 27, height: 27, borderRadius: 999, backgroundColor: '#E34D65', alignItems: 'center', justifyContent: 'center' },
});
