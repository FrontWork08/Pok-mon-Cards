import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { generationForNumber } from '@/services/pokedex';
import { gameTheme } from '@/theme/gameTheme';

type QuickFilter = 'all' | 'favorites' | 'duplicates';
type SortMode = 'recent' | 'name' | 'quantity';

export default function BagScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [setQuery, setSetQuery] = useState('');
  const [cards, setCards] = useState<OwnedCardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadBag = useCallback(async () => {
    try {
      setLoading(true);
      setCards(await getMyBag());
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadBag(); }, [loadBag]));

  const types = useMemo(() => Array.from(new Set(cards.flatMap((entry) => entry.cards?.types ?? []))).sort(), [cards]);
  const rarities = useMemo(() => Array.from(new Set(cards.map((entry) => entry.cards?.rarity).filter((value): value is string => Boolean(value)))).sort(), [cards]);

  const visibleCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    const setTerm = setQuery.trim().toLowerCase();
    const filtered = cards.filter((entry) => {
      const card = entry.cards;
      if (!card) return false;
      if (quickFilter === 'favorites' && !entry.favorite) return false;
      if (quickFilter === 'duplicates' && Number(entry.quantity ?? 0) <= 1) return false;
      if (typeFilter && !(card.types ?? []).includes(typeFilter)) return false;
      if (rarityFilter && card.rarity !== rarityFilter) return false;
      if (generation !== null) {
        const number = card.pokedex_numbers?.[0];
        if (!number || generationForNumber(number) !== generation) return false;
      }
      if (setTerm && !card.set_name.toLowerCase().includes(setTerm) && !card.set_id.toLowerCase().includes(setTerm)) return false;
      if (term && !card.pokemon_name.toLowerCase().includes(term) && !card.set_name.toLowerCase().includes(term) && !String(card.card_number ?? '').toLowerCase().includes(term)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return (a.cards?.pokemon_name ?? '').localeCompare(b.cards?.pokemon_name ?? '');
      if (sortMode === 'quantity') return Number(b.quantity ?? 0) - Number(a.quantity ?? 0);
      return new Date(b.first_obtained_at).getTime() - new Date(a.first_obtained_at).getTime();
    });
  }, [cards, generation, quickFilter, rarityFilter, search, setQuery, sortMode, typeFilter]);

  const totalCards = useMemo(() => cards.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0), [cards]);
  const columns = width >= 1200 ? 4 : width >= 850 ? 3 : 2;
  const cardWidth = columns === 4 ? '23.8%' : columns === 3 ? '32%' : '48.5%';

  function clearAdvanced() {
    setTypeFilter(null);
    setRarityFilter(null);
    setGeneration(null);
    setSetQuery('');
    setSortMode('recent');
  }

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
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon, set ou número..." placeholderTextColor="#70839F" style={styles.search} />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color="#70839F" /></Pressable> : null}
      </View>

      <View style={styles.filters}>
        <FilterChip active={quickFilter === 'all'} label="Todos" icon="grid" onPress={() => setQuickFilter('all')} />
        <FilterChip active={quickFilter === 'favorites'} label="Favoritos" icon="heart" onPress={() => setQuickFilter('favorites')} />
        <FilterChip active={quickFilter === 'duplicates'} label="Duplicatas" icon="copy" onPress={() => setQuickFilter('duplicates')} />
        <FilterChip active={showAdvanced} label="Filtros" icon="options" onPress={() => setShowAdvanced((value) => !value)} />
      </View>

      {showAdvanced ? (
        <View style={styles.advancedPanel}>
          <FilterGroup title="TIPO">
            <SmallChip label="Todos" active={typeFilter === null} onPress={() => setTypeFilter(null)} />
            {types.map((type) => <SmallChip key={type} label={type} active={typeFilter === type} onPress={() => setTypeFilter(type)} />)}
          </FilterGroup>

          <FilterGroup title="RARIDADE">
            <SmallChip label="Todas" active={rarityFilter === null} onPress={() => setRarityFilter(null)} />
            {rarities.map((rarity) => <SmallChip key={rarity} label={rarity} active={rarityFilter === rarity} onPress={() => setRarityFilter(rarity)} />)}
          </FilterGroup>

          <FilterGroup title="GERAÇÃO">
            <SmallChip label="Todas" active={generation === null} onPress={() => setGeneration(null)} />
            {[1,2,3,4,5,6,7,8,9].map((gen) => <SmallChip key={gen} label={`Gen ${gen}`} active={generation === gen} onPress={() => setGeneration(gen)} />)}
          </FilterGroup>

          <View style={styles.filterGroup}>
            <Text style={styles.filterTitle}>SET</Text>
            <TextInput value={setQuery} onChangeText={setSetQuery} placeholder="Ex.: Journey Together" placeholderTextColor="#637792" style={styles.setInput} />
          </View>

          <FilterGroup title="ORDENAR">
            <SmallChip label="Mais recentes" active={sortMode === 'recent'} onPress={() => setSortMode('recent')} />
            <SmallChip label="A–Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} />
            <SmallChip label="Quantidade" active={sortMode === 'quantity'} onPress={() => setSortMode('quantity')} />
          </FilterGroup>

          <Pressable style={styles.clearButton} onPress={clearAdvanced}><Ionicons name="refresh" size={16} color="#B8C8DC" /><Text style={styles.clearText}>LIMPAR FILTROS AVANÇADOS</Text></Pressable>
        </View>
      ) : null}

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
          const card = entry.cards;
          if (!card) return null;
          return (
            <Pressable key={card.id} onPress={() => router.push(`/card/${card.id}`)} style={[styles.card, { width: cardWidth as any }]}>
              <View style={styles.imageWrap}>
                {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardPlaceholder}><Ionicons name="image-outline" size={28} color="#526882" /></View>}
                {entry.favorite ? <View style={styles.favoriteBadge}><Ionicons name="heart" size={13} color="#fff" /></View> : null}
                {Number(entry.quantity ?? 0) > 1 ? <View style={styles.quantityBadge}><Text style={styles.quantityText}>×{entry.quantity}</Text></View> : null}
              </View>
              <Text style={styles.cardName} numberOfLines={1}>{card.pokemon_name}</Text>
              <Text style={styles.setName} numberOfLines={1}>{card.set_name}</Text>
              <View style={styles.cardFooter}><Text style={styles.cardMeta} numberOfLines={1}>{card.rarity ?? 'Sem raridade'}</Text><Ionicons name="chevron-forward" size={14} color="#59708D" /></View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.filterGroup}><Text style={styles.filterTitle}>{title}</Text><View style={styles.smallChips}>{children}</View></View>;
}

function SmallChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.smallChip, active && styles.smallChipActive]}><Text style={[styles.smallChipText, active && styles.smallChipTextActive]}>{label}</Text></Pressable>;
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
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: gameTheme.colors.surface, borderRadius: 17, borderWidth: 1, borderColor: gameTheme.colors.border, paddingHorizontal: 14 },
  search: { flex: 1, color: '#fff', height: '100%', fontSize: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: gameTheme.colors.surface, borderWidth: 1, borderColor: gameTheme.colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  filterChipActive: { backgroundColor: gameTheme.colors.yellow, borderColor: gameTheme.colors.yellow },
  filterText: { color: '#9CAFC7', fontWeight: '800', fontSize: 11 },
  filterTextActive: { color: '#07111F' },
  advancedPanel: { gap: 14, padding: 15, borderRadius: 19, backgroundColor: '#0D1929', borderWidth: 1, borderColor: '#213852' },
  filterGroup: { gap: 8 },
  filterTitle: { color: '#7188A8', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  smallChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, backgroundColor: '#14243A', borderWidth: 1, borderColor: '#283F5D' },
  smallChipActive: { backgroundColor: '#244F88', borderColor: '#3974BC' },
  smallChipText: { color: '#91A5BF', fontSize: 9, fontWeight: '800' },
  smallChipTextActive: { color: '#fff' },
  setInput: { minHeight: 43, borderRadius: 12, paddingHorizontal: 12, color: '#fff', backgroundColor: '#101E31', borderWidth: 1, borderColor: '#263E5C' },
  clearButton: { flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: '#172235' },
  clearText: { color: '#B8C8DC', fontSize: 9, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { color: '#fff', fontSize: 21, fontWeight: '900' },
  count: { color: gameTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  empty: { backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: gameTheme.colors.border },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#102A4E', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  emptyText: { color: gameTheme.colors.muted, marginTop: 6, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { backgroundColor: gameTheme.colors.surface, borderRadius: 18, padding: 8, borderWidth: 1, borderColor: gameTheme.colors.border },
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
