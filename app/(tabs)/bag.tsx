import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getMyBagOverview,
  getMyBagPage,
  type BagOverview,
  type BagQuickFilter,
  type BagSortMode,
} from '@/services/bag';
import type { OwnedCardEntry } from '@/services/player';
import { formatUsd } from '@/services/market';
import { getBattleCardPreview } from '@/services/battleStats';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE = 48;

export default function BagScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [setQuery, setSetQuery] = useState('');
  const [cards, setCards] = useState<OwnedCardEntry[]>([]);
  const [overview, setOverview] = useState<BagOverview | null>(null);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [quickFilter, setQuickFilter] = useState<BagQuickFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<BagSortMode>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);

  const filters = useMemo(() => ({
    search,
    setQuery,
    quickFilter,
    typeFilter,
    rarityFilter,
    generation,
    sortMode,
  }), [generation, quickFilter, rarityFilter, search, setQuery, sortMode, typeFilter]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getMyBagOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o resumo da Bag.');
    }
  }, []);

  const loadFirstPage = useCallback(async (manual = false) => {
    const currentRequest = ++requestId.current;
    try {
      setError(null);
      if (manual) setRefreshing(true);
      else setLoading(true);
      const page = await getMyBagPage(0, PAGE_SIZE, filters);
      if (currentRequest !== requestId.current) return;
      setCards(page.items);
      setTotalFiltered(page.totalFiltered);
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setCards([]);
      setTotalFiltered(0);
      setError(e instanceof Error ? e.message : 'Não foi possível carregar suas cartas.');
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filters]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loading || cards.length >= totalFiltered) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const currentRequest = requestId.current;
    try {
      const page = await getMyBagPage(cards.length, PAGE_SIZE, filters);
      if (currentRequest !== requestId.current) return;
      setCards((current) => {
        const known = new Set(current.map((item) => item.cards?.id));
        return [...current, ...page.items.filter((item) => !known.has(item.cards?.id))];
      });
      setTotalFiltered(page.totalFiltered);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar mais cartas.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cards.length, filters, loading, totalFiltered]);

  useFocusEffect(useCallback(() => {
    void loadOverview();
    setReloadTick((value) => value + 1);
  }, [loadOverview]));

  useEffect(() => {
    const timer = setTimeout(() => { void loadFirstPage(false); }, search.trim() ? 280 : 20);
    return () => clearTimeout(timer);
  }, [loadFirstPage, reloadTick, search]);

  const refresh = useCallback(async () => {
    await Promise.all([loadOverview(), loadFirstPage(true)]);
  }, [loadFirstPage, loadOverview]);

  const columns = width >= 1200 ? 4 : width >= 850 ? 3 : 2;
  const horizontalPadding = width >= 800 ? 20 : 12;
  const cardWidth = Math.max(142, (Math.min(width, 1280) - horizontalPadding * 2 - (columns - 1) * 10) / columns);

  function clearAdvanced() {
    setTypeFilter(null);
    setRarityFilter(null);
    setGeneration(null);
    setSetQuery('');
    setSortMode('recent');
  }

  const header = (
    <View style={styles.headerContent}>
<View style={styles.pageHeaderRow}>
        <View style={styles.pageHeader}>
          <Text style={[styles.eyebrow, { color: colors.yellow }]}>TRAINER HUB</Text>
          <Text style={[styles.title, { color: colors.text }]}>Pokémon Bag</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Coleção rápida, paginada e com carregamento sob demanda.</Text>
        </View>
      </View>

      <View style={[styles.summary, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View style={styles.summaryMain}>
          <Text style={[styles.summaryKicker, { color: colors.yellow }]}>VALOR DE MERCADO DA COLEÇÃO</Text>
          <Text style={[styles.summaryValue, { color: colors.yellow }]}>{formatUsd(overview?.collectionValueUsd)}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{Number(overview?.totalCards ?? 0).toLocaleString('pt-BR')} cards • {Number(overview?.uniqueCards ?? 0).toLocaleString('pt-BR')} diferentes</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summarySide}>
          <Text style={[styles.sideLabel, { color: colors.muted }]}>MAIS RARA/VALIOSA</Text>
          <Text numberOfLines={1} style={[styles.sideName, { color: colors.text }]}>{overview?.mostValuable?.pokemon_name ?? '—'}</Text>
          <Text style={[styles.sideValue, { color: colors.yellow }]}>{overview?.mostValuable?.market_price_usd != null ? formatUsd(overview.mostValuable.market_price_usd) : '—'}</Text>
        </View>
      </View>

      <View style={styles.collectionActions}>
        <Pressable style={[styles.actionButton, { backgroundColor: colors.accent }]} onPress={() => router.push('/decks')}><Ionicons name="albums" size={17} color="#fff" /><Text style={styles.actionText}>MEUS DECKS</Text></Pressable>
        <Pressable style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => router.push('/sets')}><Ionicons name="layers" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.text }]}>SETS</Text></Pressable>
        <Pressable style={[styles.actionButton, { backgroundColor: sortMode === 'value' ? colors.yellow : colors.surface, borderColor: sortMode === 'value' ? colors.yellow : colors.border, borderWidth: 1 }]} onPress={() => setSortMode('value')}><Ionicons name="cash" size={17} color={sortMode === 'value' ? '#07111F' : colors.yellow} /><Text style={[styles.actionText, { color: sortMode === 'value' ? '#07111F' : colors.text }]}>MAIS CARAS</Text></Pressable>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon, set ou número..." placeholderTextColor={colors.muted} style={[styles.search, { color: colors.text }]} />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable> : null}
      </View>

      <View style={styles.filters}>
        <FilterChip active={quickFilter === 'all'} label="Todos" icon="grid" onPress={() => setQuickFilter('all')} />
        <FilterChip active={quickFilter === 'favorites'} label="Favoritos" icon="heart" onPress={() => setQuickFilter('favorites')} />
        <FilterChip active={quickFilter === 'duplicates'} label="Duplicatas" icon="copy" onPress={() => setQuickFilter('duplicates')} />
        <FilterChip active={showAdvanced} label="Filtros" icon="options" onPress={() => setShowAdvanced((value) => !value)} />
      </View>

      {showAdvanced ? <View style={[styles.advancedPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <FilterGroup title="TIPO"><SmallChip label="Todos" active={typeFilter === null} onPress={() => setTypeFilter(null)} />{(overview?.types ?? []).map((type) => <SmallChip key={type} label={type} active={typeFilter === type} onPress={() => setTypeFilter(type)} />)}</FilterGroup>
        <FilterGroup title="RARIDADE"><SmallChip label="Todas" active={rarityFilter === null} onPress={() => setRarityFilter(null)} />{(overview?.rarities ?? []).map((rarity) => <SmallChip key={rarity} label={rarity} active={rarityFilter === rarity} onPress={() => setRarityFilter(rarity)} />)}</FilterGroup>
        <FilterGroup title="GERAÇÃO"><SmallChip label="Todas" active={generation === null} onPress={() => setGeneration(null)} />{[1,2,3,4,5,6,7,8,9].map((gen) => <SmallChip key={gen} label={`Gen ${gen}`} active={generation === gen} onPress={() => setGeneration(gen)} />)}</FilterGroup>
        <View style={styles.filterGroup}><Text style={[styles.filterTitle, { color: colors.muted }]}>SET</Text><TextInput value={setQuery} onChangeText={setSetQuery} placeholder="Ex.: Journey Together" placeholderTextColor={colors.muted} style={[styles.setInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /></View>
        <FilterGroup title="ORDENAR"><SmallChip label="Mais caras" active={sortMode === 'value'} onPress={() => setSortMode('value')} /><SmallChip label="Mais recentes" active={sortMode === 'recent'} onPress={() => setSortMode('recent')} /><SmallChip label="A–Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} /><SmallChip label="Quantidade" active={sortMode === 'quantity'} onPress={() => setSortMode('quantity')} /></FilterGroup>
        <Pressable style={[styles.clearButton, { backgroundColor: colors.surfaceAlt }]} onPress={clearAdvanced}><Ionicons name="refresh" size={16} color={colors.muted} /><Text style={[styles.clearText, { color: colors.muted }]}>LIMPAR FILTROS</Text></Pressable>
      </View> : null}

      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Meus cards</Text>
        <Text style={[styles.count, { color: colors.muted }]}>{totalFiltered.toLocaleString('pt-BR')} encontrados</Text>
      </View>
      {error ? <Pressable onPress={() => void refresh()} style={styles.error}><Ionicons name="alert-circle" size={18} color="#FF9FAF" /><Text style={styles.errorText}>{error} Toque para tentar novamente.</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <FlatList
        key={`bag-${columns}`}
        data={cards}
        numColumns={columns}
        keyExtractor={(entry) => entry.cards?.id ?? entry.first_obtained_at}
        renderItem={({ item }) => <CardTile entry={item} width={cardWidth} onOpen={(id) => router.push(`/card/${id}`)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={!loading ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="albums-outline" size={30} color={colors.accent} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{Number(overview?.totalCards ?? 0) === 0 ? 'Sua Bag está vazia' : 'Nada neste filtro'}</Text></View> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerLoader} size="small" color={colors.yellow} /> : <View style={styles.footerSpace} />}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.55}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const CardTile = memo(function CardTile({ entry, width, onOpen }: { entry: OwnedCardEntry; width: number; onOpen: (id: string) => void }) {
  const { colors, isLight } = useAppTheme();
  const card = entry.cards;
  if (!card) return null;
  const combat = getBattleCardPreview(card);
  return (
    <Pressable onPress={() => onOpen(card.id)} style={[styles.card, { width, backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.imageWrap, { backgroundColor: isLight ? '#E6EDF6' : colors.surfaceAlt }]}>
        {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.cardImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0} /> : <View style={styles.cardPlaceholder}><Ionicons name="image-outline" size={28} color={colors.muted} /></View>}
        <View style={styles.valueBadge}><Text style={[styles.valueBadgeText, { color: colors.yellow }]}>{card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}</Text></View>
        <View style={styles.damageBadge}>
          <Ionicons name="flash" size={11} color="#FFB06A" />
          <Text style={styles.damageBadgeText}>{combat.maxDamage.toLocaleString('pt-BR')} DANO</Text>
        </View>
        {entry.favorite ? <View style={styles.favoriteBadge}><Ionicons name="heart" size={13} color="#fff" /></View> : null}
        {Number(entry.quantity ?? 0) > 1 ? <View style={[styles.quantityBadge, { backgroundColor: colors.yellow }]}><Text style={styles.quantityText}>×{entry.quantity}</Text></View> : null}
      </View>
      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{card.pokemon_name}</Text>
      <Text style={[styles.setName, { color: colors.muted }]} numberOfLines={1}>{card.set_name}</Text>
      <View style={styles.combatLine}>
        <Text style={[styles.combatPwr,{color:colors.yellow}]}>⚔ PWR {combat.battleRating}</Text>
        <Text style={[styles.combatMeta,{color:colors.muted}]}>HP {combat.hp} • ⚡ {combat.bestEnergy} • VEL {combat.speedScore}</Text>
      </View>
      <View style={styles.cardFooter}><Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>{card.rarity ?? 'Sem raridade'}</Text><Text style={[styles.totalValue, { color: colors.yellow }]}>{card.market_price_usd != null ? `Σ ${formatUsd(Number(card.market_price_usd) * Number(entry.quantity ?? 0))}` : 'Sem preço'}</Text></View>
    </Pressable>
  );
});

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { const { colors } = useAppTheme(); return <View style={styles.filterGroup}><Text style={[styles.filterTitle, { color: colors.muted }]}>{title}</Text><View style={styles.smallChips}>{children}</View></View>; }
function SmallChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { const { colors } = useAppTheme(); return <Pressable onPress={onPress} style={[styles.smallChip, { backgroundColor: active ? colors.accentSoft : colors.surfaceAlt, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.smallChipText, { color: active ? colors.text : colors.muted }]}>{label}</Text></Pressable>; }
function FilterChip({ active, label, icon, onPress }: { active: boolean; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) { const { colors } = useAppTheme(); return <Pressable onPress={onPress} style={[styles.filterChip, { backgroundColor: active ? colors.yellow : colors.surface, borderColor: active ? colors.yellow : colors.border }]}><Ionicons name={icon} size={14} color={active ? '#07111F' : colors.muted} /><Text style={[styles.filterText, { color: active ? '#07111F' : colors.muted }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', paddingTop: 12, paddingBottom: 36 },
  headerContent: { gap: 16, marginBottom: 12 },
  pageHeaderRow: { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', alignItems:'flex-start', gap:10 },
  pageHeader: { flex:1, minWidth:230, gap: 5, marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  summary: { flexDirection: 'row', borderRadius: 24, padding: 18, borderWidth: 1, alignItems: 'stretch' },
  summaryMain: { flex: 1, justifyContent: 'center' },
  summaryKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  summaryValue: { fontSize: 29, fontWeight: '900', marginTop: 4 },
  summaryLabel: { fontSize: 10, marginTop: 2 },
  summaryDivider: { width: 1, marginHorizontal: 15 },
  summarySide: { width: 120, justifyContent: 'center' },
  sideLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  sideName: { fontSize: 13, fontWeight: '900', marginTop: 4 },
  sideValue: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  collectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 },
  actionText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14 },
  search: { flex: 1, height: '100%', fontSize: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  filterText: { fontWeight: '800', fontSize: 11 },
  advancedPanel: { gap: 14, padding: 15, borderRadius: 19, borderWidth: 1 },
  filterGroup: { gap: 8 },
  filterTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  smallChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  smallChipText: { fontSize: 9, fontWeight: '800' },
  setInput: { minHeight: 43, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1 },
  clearButton: { flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 },
  clearText: { fontSize: 9, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  count: { fontSize: 12, fontWeight: '700' },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 11, borderRadius: 14, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 10, fontWeight: '700' },
  column: { gap: 10 },
  card: { borderRadius: 18, padding: 8, borderWidth: 1, marginBottom: 10 },
  imageWrap: { width: '100%', aspectRatio: .72, borderRadius: 13, overflow: 'hidden', position: 'relative' },
  cardImage: { width: '100%', height: '100%' },
  cardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontWeight: '900', marginTop: 9, fontSize: 14 },
  setName: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  combatLine: { marginTop: 6, gap: 2 },
  combatPwr: { fontSize: 9, fontWeight: '900' },
  combatMeta: { fontSize: 7, fontWeight: '800' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 7 },
  cardMeta: { fontSize: 9, flex: 1 },
  totalValue: { fontSize: 8, fontWeight: '900' },
  valueBadge: { position: 'absolute', left: 7, bottom: 7, backgroundColor: '#050505E6', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  valueBadgeText: { fontSize: 9, fontWeight: '900' },
  damageBadge: { position: 'absolute', right: 7, bottom: 7, backgroundColor: '#2D160FEF', borderRadius: 999, borderWidth: 1, borderColor: '#8A4027', paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  damageBadgeText: { color: '#FFD2AE', fontSize: 8, fontWeight: '900' },
  quantityBadge: { position: 'absolute', right: 7, top: 7, borderRadius: 999, minWidth: 30, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' },
  quantityText: { color: '#07111F', fontWeight: '900', fontSize: 11 },
  favoriteBadge: { position: 'absolute', left: 7, top: 7, width: 27, height: 27, borderRadius: 999, backgroundColor: '#E34D65', alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 20, padding: 26, alignItems: 'center', gap: 8, borderWidth: 1, marginBottom: 12 },
  emptyTitle: { fontWeight: '900', fontSize: 18 },
  footerLoader: { paddingVertical: 20 },
  footerSpace: { height: 24 },
});
