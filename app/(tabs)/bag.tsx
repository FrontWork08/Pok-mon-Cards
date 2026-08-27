import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { formatUsd, refreshOwnedMarketPrices, type MarketPriceUpdate } from '@/services/market';
import { generationForNumber } from '@/services/pokedex';
import { useAppTheme } from '@/theme/ThemeProvider';

type QuickFilter = 'all' | 'favorites' | 'duplicates';
type SortMode = 'recent' | 'value' | 'name' | 'quantity';

export default function BagScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const [search, setSearch] = useState('');
  const [setQuery, setSetQuery] = useState('');
  const [cards, setCards] = useState<OwnedCardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [generation, setGeneration] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const mergePriceUpdates = useCallback((updates: MarketPriceUpdate[]) => {
    if (!updates.length) return;
    const byId = new Map(updates.map((update) => [update.id, update]));
    setCards((currentCards) => currentCards.map((entry) => {
      const card = entry.cards;
      if (!card) return entry;
      const update = byId.get(card.id);
      if (!update) return entry;
      return {
        ...entry,
        cards: {
          ...card,
          market_price_usd: update.market_price_usd,
          market_price_low_usd: update.market_price_low_usd,
          market_price_high_usd: update.market_price_high_usd,
          market_price_variant: update.market_price_variant,
          market_price_source: update.market_price_source,
          market_price_updated_at: update.market_price_updated_at,
        },
      };
    }));
  }, []);

  const refreshPrices = useCallback(async (entries: OwnedCardEntry[], force = false) => {
    const ids = entries
      .map((entry) => entry.cards?.id)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) return;

    try {
      setPriceUpdating(true);
      const updates = await refreshOwnedMarketPrices(ids, force);
      mergePriceUpdates(updates);
    } catch {
      // Market metadata must never block access to the collection.
    } finally {
      setPriceUpdating(false);
    }
  }, [mergePriceUpdates]);

  const loadBag = useCallback(async () => {
    try {
      setLoading(true);
      const entries = await getMyBag();
      setCards(entries);
      const missingPrices = entries.filter((entry) => entry.cards?.market_price_usd == null);
      if (missingPrices.length) {
        refreshPrices(missingPrices, false);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [refreshPrices]);
  useFocusEffect(useCallback(() => { loadBag(); }, [loadBag]));

  const types = useMemo(() => Array.from(new Set(cards.flatMap((entry) => entry.cards?.types ?? []))).sort(), [cards]);
  const rarities = useMemo(() => Array.from(new Set(cards.map((entry) => entry.cards?.rarity).filter((value): value is string => Boolean(value)))).sort(), [cards]);
  const totalCards = useMemo(() => cards.reduce((sum, entry) => sum + Number(entry.quantity ?? 0), 0), [cards]);
  const collectionMarketValueUsd = useMemo(() => cards.reduce((sum, entry) => sum + Number(entry.cards?.market_price_usd ?? 0) * Number(entry.quantity ?? 0), 0), [cards]);
  const pricedCopies = useMemo(() => cards.reduce((sum, entry) => entry.cards?.market_price_usd == null ? sum : sum + Number(entry.quantity ?? 0), 0), [cards]);
  const priceCoverage = totalCards > 0 ? (pricedCopies / totalCards) * 100 : 0;
  const mostValuable = useMemo(() => [...cards].filter((entry) => entry.cards?.market_price_usd != null).sort((a, b) => Number(b.cards?.market_price_usd ?? 0) - Number(a.cards?.market_price_usd ?? 0))[0] ?? null, [cards]);

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
      if (sortMode === 'value') return Number(b.cards?.market_price_usd ?? -1) - Number(a.cards?.market_price_usd ?? -1);
      if (sortMode === 'name') return (a.cards?.pokemon_name ?? '').localeCompare(b.cards?.pokemon_name ?? '');
      if (sortMode === 'quantity') return Number(b.quantity ?? 0) - Number(a.quantity ?? 0);
      return new Date(b.first_obtained_at).getTime() - new Date(a.first_obtained_at).getTime();
    });
  }, [cards, generation, quickFilter, rarityFilter, search, setQuery, sortMode, typeFilter]);

  const columns = width >= 1200 ? 4 : width >= 850 ? 3 : 2;
  const cardWidth = columns === 4 ? '23.8%' : columns === 3 ? '32%' : '48.5%';
  function clearAdvanced() { setTypeFilter(null); setRarityFilter(null); setGeneration(null); setSetQuery(''); setSortMode('recent'); }

  return <Screen title="Pokémon Bag" subtitle="Sua coleção com preço de mercado em dólar e filtros por valor.">
    <View style={[styles.summary, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <View style={styles.summaryMain}><Text style={[styles.summaryKicker, { color: colors.yellow }]}>VALOR DE MERCADO DA COLEÇÃO</Text><Text style={[styles.summaryValue, { color: colors.yellow }]}>{formatUsd(collectionMarketValueUsd)}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>{totalCards.toLocaleString('pt-BR')} cards • {priceCoverage.toFixed(0)}% precificados</Text></View>
      <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
      <View style={styles.summarySide}><Text style={[styles.sideLabel, { color: colors.muted }]}>MAIS CARA</Text><Text numberOfLines={1} style={[styles.sideName, { color: colors.text }]}>{mostValuable?.cards?.pokemon_name ?? '—'}</Text><Text style={[styles.sideValue, { color: colors.yellow }]}>{mostValuable?.cards?.market_price_usd != null ? formatUsd(Number(mostValuable.cards.market_price_usd)) : '—'}</Text></View>
    </View>

    <View style={styles.collectionActions}><Pressable style={[styles.actionButton, { backgroundColor: colors.accent }]} onPress={() => router.push('/decks')}><Ionicons name="albums" size={17} color="#fff" /><Text style={styles.actionText}>MEUS DECKS</Text></Pressable><Pressable style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => router.push('/sets')}><Ionicons name="layers" size={17} color={colors.accent} /><Text style={[styles.actionText, { color: colors.text }]}>SETS</Text></Pressable><Pressable style={[styles.actionButton, { backgroundColor: sortMode === 'value' ? colors.yellow : colors.surface, borderColor: sortMode === 'value' ? colors.yellow : colors.border, borderWidth: 1 }]} onPress={() => setSortMode('value')}><Ionicons name="cash" size={17} color={sortMode === 'value' ? '#07111F' : colors.yellow} /><Text style={[styles.actionText, { color: sortMode === 'value' ? '#07111F' : colors.text }]}>MAIS CARAS</Text></Pressable><Pressable disabled={priceUpdating} style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => refreshPrices(cards, true)}>{priceUpdating ? <ActivityIndicator size="small" color={colors.yellow} /> : <Ionicons name="refresh" size={17} color={colors.yellow} />}<Text style={[styles.actionText, { color: colors.text }]}>{priceUpdating ? 'PREÇOS...' : 'ATUALIZAR USD'}</Text></Pressable></View>

    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon, set ou número..." placeholderTextColor={colors.muted} style={[styles.search, { color: colors.text }]} />{search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable> : null}</View>
    <View style={styles.filters}><FilterChip active={quickFilter === 'all'} label="Todos" icon="grid" onPress={() => setQuickFilter('all')} /><FilterChip active={quickFilter === 'favorites'} label="Favoritos" icon="heart" onPress={() => setQuickFilter('favorites')} /><FilterChip active={quickFilter === 'duplicates'} label="Duplicatas" icon="copy" onPress={() => setQuickFilter('duplicates')} /><FilterChip active={showAdvanced} label="Filtros" icon="options" onPress={() => setShowAdvanced((value) => !value)} /></View>

    {showAdvanced ? <View style={[styles.advancedPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <FilterGroup title="TIPO"><SmallChip label="Todos" active={typeFilter === null} onPress={() => setTypeFilter(null)} />{types.map((type) => <SmallChip key={type} label={type} active={typeFilter === type} onPress={() => setTypeFilter(type)} />)}</FilterGroup>
      <FilterGroup title="RARIDADE"><SmallChip label="Todas" active={rarityFilter === null} onPress={() => setRarityFilter(null)} />{rarities.map((rarity) => <SmallChip key={rarity} label={rarity} active={rarityFilter === rarity} onPress={() => setRarityFilter(rarity)} />)}</FilterGroup>
      <FilterGroup title="GERAÇÃO"><SmallChip label="Todas" active={generation === null} onPress={() => setGeneration(null)} />{[1,2,3,4,5,6,7,8,9].map((gen) => <SmallChip key={gen} label={`Gen ${gen}`} active={generation === gen} onPress={() => setGeneration(gen)} />)}</FilterGroup>
      <View style={styles.filterGroup}><Text style={[styles.filterTitle, { color: colors.muted }]}>SET</Text><TextInput value={setQuery} onChangeText={setSetQuery} placeholder="Ex.: Journey Together" placeholderTextColor={colors.muted} style={[styles.setInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} /></View>
      <FilterGroup title="ORDENAR"><SmallChip label="Mais caras" active={sortMode === 'value'} onPress={() => setSortMode('value')} /><SmallChip label="Mais recentes" active={sortMode === 'recent'} onPress={() => setSortMode('recent')} /><SmallChip label="A–Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} /><SmallChip label="Quantidade" active={sortMode === 'quantity'} onPress={() => setSortMode('quantity')} /></FilterGroup>
      <Pressable style={[styles.clearButton, { backgroundColor: colors.surfaceAlt }]} onPress={clearAdvanced}><Ionicons name="refresh" size={16} color={colors.muted} /><Text style={[styles.clearText, { color: colors.muted }]}>LIMPAR FILTROS</Text></Pressable>
    </View> : null}

    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.text }]}>Meus cards</Text><Text style={[styles.count, { color: colors.muted }]}>{visibleCards.length} exibidos</Text></View>
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
    {!loading && visibleCards.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="albums-outline" size={30} color={colors.accent} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{cards.length === 0 ? 'Sua Bag está vazia' : 'Nada neste filtro'}</Text></View> : null}

    <View style={styles.grid}>{visibleCards.map((entry) => { const card = entry.cards; if (!card) return null; return <Pressable key={card.id} onPress={() => router.push(`/card/${card.id}`)} style={[styles.card, { width: cardWidth as any, backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.imageWrap, { backgroundColor: isLight ? '#E6EDF6' : colors.surfaceAlt }]}>{card.image_small ? <Image source={{ uri: card.image_small }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardPlaceholder}><Ionicons name="image-outline" size={28} color={colors.muted} /></View>}<View style={styles.valueBadge}><Text style={[styles.valueBadgeText, { color: colors.yellow }]}>{card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}</Text></View>{entry.favorite ? <View style={styles.favoriteBadge}><Ionicons name="heart" size={13} color="#fff" /></View> : null}{Number(entry.quantity ?? 0) > 1 ? <View style={[styles.quantityBadge, { backgroundColor: colors.yellow }]}><Text style={styles.quantityText}>×{entry.quantity}</Text></View> : null}</View><Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>{card.pokemon_name}</Text><Text style={[styles.setName, { color: colors.muted }]} numberOfLines={1}>{card.set_name}</Text><View style={styles.cardFooter}><Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>{card.rarity ?? 'Sem raridade'}</Text><Text style={[styles.totalValue, { color: colors.yellow }]}>{card.market_price_usd != null ? `Σ ${formatUsd(Number(card.market_price_usd) * Number(entry.quantity ?? 0))}` : 'Sem preço'}</Text></View></Pressable>; })}</View>
  </Screen>;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) { const { colors } = useAppTheme(); return <View style={styles.filterGroup}><Text style={[styles.filterTitle, { color: colors.muted }]}>{title}</Text><View style={styles.smallChips}>{children}</View></View>; }
function SmallChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { const { colors } = useAppTheme(); return <Pressable onPress={onPress} style={[styles.smallChip, { backgroundColor: active ? colors.accentSoft : colors.surfaceAlt, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.smallChipText, { color: active ? colors.text : colors.muted }]}>{label}</Text></Pressable>; }
function FilterChip({ active, label, icon, onPress }: { active: boolean; label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) { const { colors } = useAppTheme(); return <Pressable onPress={onPress} style={[styles.filterChip, { backgroundColor: active ? colors.yellow : colors.surface, borderColor: active ? colors.yellow : colors.border }]}><Ionicons name={icon} size={14} color={active ? '#07111F' : colors.muted} /><Text style={[styles.filterText, { color: active ? '#07111F' : colors.muted }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', borderRadius: 24, padding: 18, borderWidth: 1, alignItems: 'stretch' }, summaryMain: { flex: 1, justifyContent: 'center' }, summaryKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, summaryValue: { fontSize: 29, fontWeight: '900', marginTop: 4 }, summaryLabel: { fontSize: 10, marginTop: 2 }, summaryDivider: { width: 1, marginHorizontal: 15 }, summarySide: { width: 120, justifyContent: 'center' }, sideLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, sideName: { fontSize: 13, fontWeight: '900', marginTop: 4 }, sideValue: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  collectionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, actionButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12 }, actionText: { color: '#fff', fontSize: 9, fontWeight: '900' }, searchBox: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14 }, search: { flex: 1, height: '100%', fontSize: 14 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }, filterText: { fontWeight: '800', fontSize: 11 },
  advancedPanel: { gap: 14, padding: 15, borderRadius: 19, borderWidth: 1 }, filterGroup: { gap: 8 }, filterTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, smallChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, smallChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, borderWidth: 1 }, smallChipText: { fontSize: 9, fontWeight: '800' }, setInput: { minHeight: 43, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1 }, clearButton: { flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 }, clearText: { fontSize: 9, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }, sectionTitle: { fontSize: 21, fontWeight: '900' }, count: { fontSize: 12, fontWeight: '700' }, empty: { borderRadius: 20, padding: 26, alignItems: 'center', gap: 8, borderWidth: 1 }, emptyTitle: { fontWeight: '900', fontSize: 18 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, card: { borderRadius: 18, padding: 8, borderWidth: 1 }, imageWrap: { width: '100%', aspectRatio: .72, borderRadius: 13, overflow: 'hidden', position: 'relative' }, cardImage: { width: '100%', height: '100%' }, cardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' }, cardName: { fontWeight: '900', marginTop: 9, fontSize: 14 }, setName: { fontSize: 10, fontWeight: '700', marginTop: 2 }, cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 7 }, cardMeta: { fontSize: 9, flex: 1 }, totalValue: { fontSize: 8, fontWeight: '900' }, valueBadge: { position: 'absolute', left: 7, bottom: 7, backgroundColor: '#050505E6', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 }, valueBadgeText: { fontSize: 9, fontWeight: '900' }, quantityBadge: { position: 'absolute', right: 7, top: 7, borderRadius: 999, minWidth: 30, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' }, quantityText: { color: '#07111F', fontWeight: '900', fontSize: 11 }, favoriteBadge: { position: 'absolute', left: 7, top: 7, width: 27, height: 27, borderRadius: 999, backgroundColor: '#E34D65', alignItems: 'center', justifyContent: 'center' },
});
