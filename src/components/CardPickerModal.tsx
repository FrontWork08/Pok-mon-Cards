import { memo, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { OwnedCardEntry } from '@/services/player';
import { formatUsd } from '@/services/market';
import { getBattleCardPreview } from '@/services/battleStats';
import { useAppTheme } from '@/theme/ThemeProvider';

type SortMode = 'value' | 'battle' | 'atk_desc' | 'atk_asc' | 'def_desc' | 'def_asc' | 'name' | 'quantity' | 'recent';
type QuantityMap = Record<string, number>;

export { getBattleCardPreview } from '@/services/battleStats';
type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  bag: OwnedCardEntry[];
  mode: 'single' | 'quantity';
  selectedId?: string | null;
  selectedMap?: QuantityMap;
  maxPerCard?: number;
  maxTotal?: number;
  displayMode?: 'market' | 'battle';
  enableCombatSort?: boolean;
  onSelectedIdChange?: (id: string | null) => void;
  onSelectedMapChange?: (value: QuantityMap) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  working?: boolean;
  errorText?: string;
};

export function CardPickerModal({
  visible,
  title,
  subtitle,
  bag,
  mode,
  selectedId = null,
  selectedMap = {},
  maxPerCard,
  maxTotal,
  displayMode = 'market',
  enableCombatSort = false,
  onSelectedIdChange,
  onSelectedMapChange,
  onClose,
  onConfirm,
  confirmLabel = 'CONFIRMAR SELEÇÃO',
  working = false,
  errorText = '',
}: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 4 : width >= 680 ? 3 : 2;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>(displayMode === 'battle' ? 'battle' : 'value');

  const visibleCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = bag.filter((entry) => {
      const card = entry.cards;
      if (!card) return false;
      if (!term) return true;
      return card.pokemon_name.toLowerCase().includes(term)
        || card.set_name.toLowerCase().includes(term)
        || String(card.rarity ?? '').toLowerCase().includes(term)
        || String(card.card_number ?? '').toLowerCase().includes(term);
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'battle') return getBattleCardPreview(b.cards).score - getBattleCardPreview(a.cards).score;
      if (sort === 'atk_desc') return getBattleCardPreview(b.cards).maxDamage - getBattleCardPreview(a.cards).maxDamage;
      if (sort === 'atk_asc') return getBattleCardPreview(a.cards).maxDamage - getBattleCardPreview(b.cards).maxDamage;
      if (sort === 'def_desc') return getBattleCardPreview(b.cards).hp - getBattleCardPreview(a.cards).hp;
      if (sort === 'def_asc') return getBattleCardPreview(a.cards).hp - getBattleCardPreview(b.cards).hp;
      if (sort === 'value') return Number(b.cards?.market_price_usd ?? -1) - Number(a.cards?.market_price_usd ?? -1);
      if (sort === 'name') return String(a.cards?.pokemon_name ?? '').localeCompare(String(b.cards?.pokemon_name ?? ''));
      if (sort === 'quantity') return Number(b.quantity ?? 0) - Number(a.quantity ?? 0);
      return new Date(b.first_obtained_at).getTime() - new Date(a.first_obtained_at).getTime();
    });
  }, [bag, search, sort]);

  const selectedCount = mode === 'single' ? (selectedId ? 1 : 0) : Object.values(selectedMap).reduce((sum, value) => sum + value, 0);
  const selectedValue = useMemo(() => {
    if (displayMode === 'battle') return 0;
    if (mode === 'single') {
      const entry = bag.find((item) => item.cards?.id === selectedId);
      return Number(entry?.cards?.market_price_usd ?? 0);
    }
    return bag.reduce((sum, entry) => sum + Number(entry.cards?.market_price_usd ?? 0) * Number(selectedMap[entry.cards?.id ?? ''] ?? 0), 0);
  }, [bag, displayMode, mode, selectedId, selectedMap]);

  function selectSingle(entry: OwnedCardEntry) {
    const id = entry.cards?.id;
    if (!id) return;
    onSelectedIdChange?.(selectedId === id ? null : id);
  }

  function changeQuantity(entry: OwnedCardEntry, delta: number) {
    const id = entry.cards?.id;
    if (!id) return;
    const owned = Number(entry.quantity ?? 0);
    const cap = Math.min(owned, maxPerCard ?? owned);
    const currentQty = Number(selectedMap[id] ?? 0);
    if (delta > 0 && maxTotal != null && selectedCount >= maxTotal && currentQty === 0) return;
    const nextQty = Math.max(0, Math.min(cap, currentQty + delta));
    if (delta > 0 && maxTotal != null && selectedCount - currentQty + nextQty > maxTotal) return;
    const next = { ...selectedMap };
    if (!nextQty) delete next[id]; else next[id] = nextQty;
    onSelectedMapChange?.(next);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>SELETOR DE CARTAS</Text>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
          </View>
          <Pressable style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.tools}>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={19} color={colors.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar Pokémon, set, raridade ou número…"
              placeholderTextColor={colors.muted}
              style={[styles.search, { color: colors.text }]}
            />
            {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable> : null}
          </View>
          <View style={styles.sortRow}>
            {displayMode === 'battle'
              ? <SortChip label="Visão geral TCG" active={sort === 'battle'} onPress={() => setSort('battle')} />
              : <SortChip label="Mais caras" active={sort === 'value'} onPress={() => setSort('value')} />}
            {enableCombatSort ? (
              <>
                <SortChip label="ATK MAIOR" active={sort === 'atk_desc'} onPress={() => setSort('atk_desc')} />
                <SortChip label="ATK MENOR" active={sort === 'atk_asc'} onPress={() => setSort('atk_asc')} />
                <SortChip label="DEF MAIOR" active={sort === 'def_desc'} onPress={() => setSort('def_desc')} />
                <SortChip label="DEF MENOR" active={sort === 'def_asc'} onPress={() => setSort('def_asc')} />
              </>
            ) : null}
            <SortChip label="A–Z" active={sort === 'name'} onPress={() => setSort('name')} />
            <SortChip label="Quantidade" active={sort === 'quantity'} onPress={() => setSort('quantity')} />
            <SortChip label="Recentes" active={sort === 'recent'} onPress={() => setSort('recent')} />
          </View>
          {enableCombatSort ? <Text style={[styles.combatSortHint,{color:colors.muted}]}>ATK = maior dano • DEF = HP da carta</Text> : null}
          <Text style={[styles.result, { color: colors.muted }]}>{visibleCards.length} cartas disponíveis</Text>
        </View>

        <FlatList
          key={`picker-${columns}`}
          data={visibleCards}
          numColumns={columns}
          keyExtractor={(entry) => entry.cards?.id ?? `${entry.first_obtained_at}-${entry.quantity}`}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PickerCard
              entry={item}
              mode={mode}
              selected={mode === 'single' ? selectedId === item.cards?.id : Number(selectedMap[item.cards?.id ?? ''] ?? 0) > 0}
              quantity={Number(selectedMap[item.cards?.id ?? ''] ?? 0)}
              displayMode={displayMode}
              showCombatStats={enableCombatSort}
              onPress={() => selectSingle(item)}
              onMinus={() => changeQuantity(item, -1)}
              onPlus={() => changeQuantity(item, 1)}
            />
          )}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="search-outline" size={32} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma carta encontrada.</Text></View>}
        />

        {errorText ? (
          <View style={styles.pickerError}>
            <Ionicons name="alert-circle" size={17} color="#FF9FAF" />
            <Text style={styles.pickerErrorText}>{errorText}</Text>
          </View>
        ) : null}

        <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.footerInfo}>
            <Text style={[styles.footerLabel, { color: colors.muted }]}>{mode === 'single' ? 'SELEÇÃO' : 'CARTAS SELECIONADAS'}</Text>
            <Text style={[styles.footerValue, { color: colors.text }]}>{selectedCount}{maxTotal != null ? `/${maxTotal}` : ''} • {displayMode === 'battle' ? 'preço não conta' : formatUsd(selectedValue)}</Text>
          </View>
          <Pressable
            style={[styles.confirm, { backgroundColor: colors.yellow }, selectedCount === 0 && styles.disabled]}
            disabled={working || selectedCount === 0}
            onPress={() => { void onConfirm(); }}
          >
            <Ionicons name={working ? 'hourglass' : 'checkmark-circle'} size={20} color="#07111F" />
            <Text style={styles.confirmText}>{working ? 'SALVANDO…' : confirmLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const PickerCard = memo(function PickerCard({ entry, mode, selected, quantity, displayMode, showCombatStats, onPress, onMinus, onPlus }: {
  entry: OwnedCardEntry;
  mode: 'single' | 'quantity';
  selected: boolean;
  quantity: number;
  displayMode: 'market' | 'battle';
  showCombatStats: boolean;
  onPress: () => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { colors } = useAppTheme();
  const card = entry.cards;
  if (!card) return null;
  const combat = getBattleCardPreview(card);
  const marketplaceQuantity = Math.max(0, Number(entry.marketplace_quantity ?? 0));
  const inventoryQuantity = Math.max(
    0,
    Number(entry.inventory_quantity ?? Math.max(Number(entry.quantity ?? 0) - marketplaceQuantity, 0)),
  );
  const locationLabel = marketplaceQuantity > 0
    ? inventoryQuantity > 0
      ? `Bag ×${inventoryQuantity} • Loja ×${marketplaceQuantity}`
      : `Loja ×${marketplaceQuantity}`
    : `Bag ×${entry.quantity}`;
  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderColor: selected ? colors.yellow : colors.border }]}
      onPress={mode === 'single' ? onPress : undefined}
    >
      <View style={[styles.imageWrap, { backgroundColor: colors.surfaceAlt }]}>
        {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.image} resizeMode="contain" /> : <Ionicons name="image-outline" size={30} color={colors.muted} />}
        <View style={[styles.valueBadge, { backgroundColor: '#070707DD' }]}><Text style={[styles.valueBadgeText, { color: colors.yellow }]}>{displayMode === 'battle' ? `HP ${combat.hp}` : card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}</Text></View>
        {selected && mode === 'single' ? <View style={[styles.checkBadge, { backgroundColor: colors.yellow }]}><Ionicons name="checkmark" size={17} color="#07111F" /></View> : null}
      </View>
      <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.pokemon_name}</Text>
      <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{displayMode === 'battle' ? `ATQ BASE ${combat.maxDamage} • ⚡ custo ${combat.bestEnergy}` : `${card.rarity ?? 'Sem raridade'} • ${locationLabel}`}</Text>
      {showCombatStats && displayMode !== 'battle' ? <Text numberOfLines={1} style={[styles.legacyCombatMeta,{color:colors.yellow}]}>ATK {combat.maxDamage} • DEF {combat.hp}</Text> : null}
      {displayMode === 'battle' ? <Text numberOfLines={1} style={[styles.battleMeta, { color: colors.muted }]}>⚡ mín {combat.minEnergy} • {combat.attackCount} ataques • {combat.abilityCount} habilidades</Text> : null}
      {mode === 'quantity' ? (
        <View style={styles.qtyRow}>
          <Pressable style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }]} onPress={onMinus}><Text style={[styles.qtySign, { color: colors.text }]}>−</Text></Pressable>
          <Text style={[styles.qty, { color: quantity ? colors.yellow : colors.muted }]}>{quantity}</Text>
          <Pressable style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }]} onPress={onPlus}><Text style={[styles.qtySign, { color: colors.text }]}>+</Text></Pressable>
        </View>
      ) : null}
    </Pressable>
  );
});

function SortChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.chipText, { color: active ? colors.text : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { fontSize: 23, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 10, marginTop: 3 },
  close: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tools: { paddingHorizontal: 14, paddingTop: 12, gap: 9 },
  searchBox: { minHeight: 48, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, height: '100%', fontSize: 13 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  chipText: { fontSize: 9, fontWeight: '900' },
  result: { fontSize: 9, fontWeight: '800' },
  combatSortHint:{fontSize:8,fontWeight:'800',marginTop:-2},
  list: { padding: 12, paddingBottom: 24 },
  row: { gap: 8 },
  card: { flex: 1, minWidth: 0, marginBottom: 8, borderRadius: 15, borderWidth: 1, padding: 7 },
  imageWrap: { width: '100%', aspectRatio: 0.72, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  image: { width: '100%', height: '100%' },
  valueBadge: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  valueBadgeText: { fontSize: 9, fontWeight: '900' },
  checkBadge: { position: 'absolute', right: 6, top: 6, width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 11, fontWeight: '900', marginTop: 7 },
  cardMeta: { fontSize: 8, marginTop: 2 },
  battleMeta: { fontSize: 7, marginTop: 3, fontWeight: '800' },
  legacyCombatMeta:{fontSize:8,marginTop:3,fontWeight:'900'},
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  qtyButton: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  qtySign: { fontSize: 18, fontWeight: '900' },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: '900' },
  empty: { padding: 50, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 12 },
  pickerError:{marginHorizontal:14,marginBottom:8,borderRadius:12,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',paddingHorizontal:10,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:7},
  pickerErrorText:{flex:1,color:'#FFD7DD',fontSize:9,fontWeight:'800',lineHeight:13},
  footer: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerInfo: { flex: 1 },
  footerLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  footerValue: { fontSize: 15, fontWeight: '900', marginTop: 2 },
  confirm: { minHeight: 48, minWidth: 175, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: 0.4 },
});
