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
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import {
  getDeckBuilderPage,
  getMyDeck,
  renameDeck,
  setDeckCards,
  type DeckBuilderCardEntry,
} from '@/services/decks';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

type Selected = Record<string, number>;
type PriceMap = Record<string, number | null>;

const PAGE_SIZE = 36;

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();

  const [deck, setDeck] = useState<any>(null);
  const [cards, setCards] = useState<DeckBuilderCardEntry[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [selected, setSelected] = useState<Selected>({});
  const [prices, setPrices] = useState<PriceMap>({});
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loadingDeck, setLoadingDeck] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const pageRequestId = useRef(0);
  const loadingMoreRef = useRef(false);

  const mergePrices = useCallback((rows: DeckBuilderCardEntry[]) => {
    setPrices((current) => {
      let changed = false;
      const next = { ...current };
      for (const row of rows) {
        const card = row.cards;
        if (!card) continue;
        const value = card.market_price_usd == null ? null : Number(card.market_price_usd);
        if (!(card.id in next) || next[card.id] !== value) {
          next[card.id] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const loadDeck = useCallback(async () => {
    if (!id) return;
    try {
      setLoadingDeck(true);
      const found = await getMyDeck(id);
      setDeck(found);
      setName(String(found.name ?? ''));

      const nextSelected: Selected = {};
      const nextPrices: PriceMap = {};
      for (const item of (found.deck_cards ?? []) as any[]) {
        const card = relationOne<any>(item.cards);
        nextSelected[String(item.card_id)] = Number(item.quantity ?? 1);
        if (card?.id) {
          nextPrices[String(card.id)] = card.market_price_usd == null ? null : Number(card.market_price_usd);
        }
      }
      setSelected(nextSelected);
      setPrices((current) => ({ ...current, ...nextPrices }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar o deck.');
    } finally {
      setLoadingDeck(false);
    }
  }, [id]);

  const loadFirstPage = useCallback(async (term: string) => {
    const currentRequest = ++pageRequestId.current;
    try {
      setLoadingCards(true);
      const page = await getDeckBuilderPage(0, PAGE_SIZE, term);
      if (currentRequest !== pageRequestId.current) return;
      setCards(page.items);
      setTotalCards(page.total);
      mergePrices(page.items);
    } catch (err) {
      if (currentRequest !== pageRequestId.current) return;
      setCards([]);
      setTotalCards(0);
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar as cartas da Bag.');
    } finally {
      if (currentRequest === pageRequestId.current) setLoadingCards(false);
    }
  }, [mergePrices]);

  useEffect(() => {
    void loadDeck();
  }, [loadDeck]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFirstPage(search);
    }, search.trim() ? 220 : 20);
    return () => clearTimeout(timer);
  }, [loadFirstPage, search]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loadingCards || cards.length >= totalCards) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const currentRequest = pageRequestId.current;
    try {
      const page = await getDeckBuilderPage(cards.length, PAGE_SIZE, search);
      if (currentRequest !== pageRequestId.current) return;
      setCards((current) => {
        const known = new Set(current.map((item) => item.cards?.id));
        return [...current, ...page.items.filter((item) => !known.has(item.cards?.id))];
      });
      setTotalCards(page.total);
      mergePrices(page.items);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar mais cartas.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cards.length, loadingCards, mergePrices, search, totalCards]);

  const total = useMemo(
    () => Object.values(selected).reduce((sum, qty) => sum + qty, 0),
    [selected],
  );

  const totalValue = useMemo(
    () => Object.entries(selected).reduce(
      (sum, [cardId, qty]) => sum + Number(prices[cardId] ?? 0) * qty,
      0,
    ),
    [prices, selected],
  );

  const change = useCallback((cardId: string, owned: number, delta: number) => {
    setSelected((current) => {
      const max = Math.min(4, Number(owned ?? 0));
      const nextQty = Math.max(0, Math.min(max, (current[cardId] ?? 0) + delta));
      if ((current[cardId] ?? 0) === nextQty) return current;
      const next = { ...current };
      if (!nextQty) delete next[cardId];
      else next[cardId] = nextQty;
      return next;
    });
  }, []);

  async function save() {
    if (!id || total > 20 || saving) return;
    try {
      setSaving(true);
      const nextName = name.trim();
      if (nextName && nextName !== deck?.name) {
        await renameDeck(id, nextName);
      }
      await setDeckCards(
        id,
        Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })),
      );
      setDeck((current: any) => current ? { ...current, name: nextName || current.name } : current);
      setNotice('Deck salvo! Ele já pode ser usado nas batalhas.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível salvar o deck.');
    } finally {
      setSaving(false);
    }
  }

  const columns = width >= 1100 ? 5 : width >= 760 ? 4 : 2;
  const horizontalPadding = width >= 760 ? 18 : 12;
  const usableWidth = Math.min(width, 1180) - horizontalPadding * 2;
  const tileWidth = Math.max(142, (usableWidth - (columns - 1) * 9) / columns);

  const header = (
    <View style={styles.headerContent}>
      {notice ? (
        <Pressable
          style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.yellow }]}
          onPress={() => setNotice(null)}
        >
          <Ionicons name="information-circle" size={19} color={colors.yellow} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          <Ionicons name="close" size={17} color={colors.muted} />
        </Pressable>
      ) : null}

      {loadingDeck ? (
        <View style={styles.deckLoading}>
          <ActivityIndicator size="small" color={colors.yellow} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando deck...</Text>
        </View>
      ) : (
        <>
          <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <View style={styles.grow}>
              <Text style={[styles.kicker, { color: colors.yellow }]}>DECK BUILDER</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={40}
                style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
              />
              <Text style={[styles.deckValue, { color: colors.yellow }]}>Valor fixo do deck: {formatUsd(totalValue)}</Text>
            </View>
            <View style={[styles.counter, { backgroundColor: colors.surfaceAlt }, total > 20 && styles.counterError]}>
              <Text style={[styles.counterValue, { color: colors.text }]}>{total}/20</Text>
              <Text style={[styles.counterLabel, { color: colors.muted }]}>CARTAS</Text>
            </View>
          </View>

          <Text style={[styles.helper, { color: colors.muted }]}>
            Cada versão pode aparecer até 4 vezes. A lista carrega aos poucos para manter o editor rápido.
          </Text>
        </>
      )}

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar Pokémon, raridade ou set..."
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={[styles.search, { color: colors.text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={19} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.resultsRow}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Cartas disponíveis</Text>
        <Text style={[styles.resultsCount, { color: colors.muted }]}>{totalCards.toLocaleString('pt-BR')}</Text>
      </View>

      {loadingCards ? (
        <View style={styles.cardsLoading}>
          <ActivityIndicator size="large" color={colors.yellow} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Buscando cartas...</Text>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {loadingMore ? <ActivityIndicator size="small" color={colors.yellow} /> : null}
      {!loadingCards && cards.length > 0 && cards.length >= totalCards ? (
        <Text style={[styles.endText, { color: colors.muted }]}>Todas as cartas carregadas.</Text>
      ) : null}
      {!loadingDeck ? (
        <>
          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.yellow }, (saving || total > 20) && styles.disabled]}
            onPress={() => void save()}
            disabled={saving || total > 20}
          >
            {saving ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="save" size={18} color="#07111F" />}
            <Text style={styles.saveText}>{saving ? 'SALVANDO...' : `SALVAR DECK • ${formatUsd(totalValue)}`}</Text>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => goBackOrHome(router)}>
            <Text style={[styles.backText, { color: colors.muted }]}>VOLTAR AOS DECKS</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.safe, { backgroundColor: colors.bg }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: deck?.name ?? 'Editar Deck',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
        }}
      />
      <FlatList
        key={`deck-builder-${columns}`}
        data={loadingCards ? [] : cards}
        numColumns={columns}
        keyExtractor={(item) => item.cards.id}
        renderItem={({ item }) => (
          <DeckCardTile
            entry={item}
            width={tileWidth}
            selectedQty={selected[item.cards.id] ?? 0}
            onChange={change}
          />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={!loadingCards ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="albums-outline" size={30} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma carta encontrada</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tente outro nome, raridade ou set.</Text>
          </View>
        ) : null}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.65}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={60}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const DeckCardTile = memo(function DeckCardTile({
  entry,
  width,
  selectedQty,
  onChange,
}: {
  entry: DeckBuilderCardEntry;
  width: number;
  selectedQty: number;
  onChange: (cardId: string, owned: number, delta: number) => void;
}) {
  const { colors, isLight } = useAppTheme();
  const card = entry.cards;

  return (
    <View
      style={[
        styles.cardTile,
        {
          width,
          backgroundColor: selectedQty > 0 ? colors.accentSoft : colors.surface,
          borderColor: selectedQty > 0 ? colors.yellow : colors.border,
        },
      ]}
    >
      <View style={[styles.imageWrap, { backgroundColor: isLight ? '#E6EDF6' : colors.surfaceAlt }]}>
        {card.image_small ? (
          <Image
            source={{ uri: card.image_small }}
            resizeMode="contain"
            resizeMethod="resize"
            fadeDuration={0}
            style={styles.cardImage}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Ionicons name="image-outline" size={28} color={colors.muted} />
          </View>
        )}
        <View style={styles.valueBadge}>
          <Text style={[styles.valueText, { color: colors.yellow }]}>
            {card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}
          </Text>
        </View>
      </View>

      <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.pokemon_name}</Text>
      <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>
        {card.rarity ?? 'Comum'} • Bag ×{entry.quantity}
      </Text>
      {selectedQty > 0 ? (
        <Text style={[styles.selectedValue, { color: colors.yellow }]}>
          No deck: {card.market_price_usd != null ? formatUsd(Number(card.market_price_usd) * selectedQty) : 'US$ —'}
        </Text>
      ) : null}

      <View style={styles.qtyRow}>
        <Pressable
          disabled={selectedQty <= 0}
          style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }, selectedQty <= 0 && styles.qtyDisabled]}
          onPress={() => onChange(card.id, entry.quantity, -1)}
        >
          <Text style={[styles.qtySign, { color: colors.text }]}>−</Text>
        </Pressable>
        <Text style={[styles.qty, { color: colors.yellow }]}>{selectedQty}</Text>
        <Pressable
          disabled={selectedQty >= Math.min(4, Number(entry.quantity ?? 0))}
          style={[
            styles.qtyButton,
            { backgroundColor: colors.surfaceAlt },
            selectedQty >= Math.min(4, Number(entry.quantity ?? 0)) && styles.qtyDisabled,
          ]}
          onPress={() => onChange(card.id, entry.quantity, 1)}
        >
          <Text style={[styles.qtySign, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingTop: 12, paddingBottom: 112 },
  headerContent: { gap: 12, marginBottom: 10 },
  grow: { flex: 1, minWidth: 0 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 14, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 11, fontWeight: '700' },
  deckLoading: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontSize: 9, fontWeight: '700' },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1 },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  nameInput: { fontSize: 24, fontWeight: '900', paddingVertical: 4, borderBottomWidth: 1 },
  deckValue: { fontSize: 11, fontWeight: '900', marginTop: 7 },
  counter: { width: 84, height: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  counterError: { backgroundColor: '#351A24' },
  counterValue: { fontSize: 20, fontWeight: '900' },
  counterLabel: { fontSize: 7, fontWeight: '900' },
  helper: { fontSize: 10, lineHeight: 15 },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1 },
  search: { flex: 1, height: '100%' },
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultsTitle: { fontSize: 16, fontWeight: '900' },
  resultsCount: { fontSize: 10, fontWeight: '800' },
  cardsLoading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9 },
  column: { gap: 9 },
  cardTile: { padding: 7, borderRadius: 15, borderWidth: 1, marginBottom: 9 },
  imageWrap: { position: 'relative', width: '100%', aspectRatio: .72, borderRadius: 9, overflow: 'hidden' },
  cardImage: { width: '100%', height: '100%' },
  cardPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  valueBadge: { position: 'absolute', left: 5, bottom: 5, backgroundColor: '#050505E6', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999 },
  valueText: { fontSize: 8, fontWeight: '900' },
  cardName: { fontSize: 11, fontWeight: '900', marginTop: 6 },
  cardMeta: { fontSize: 8, marginTop: 2 },
  selectedValue: { fontSize: 8, fontWeight: '900', marginTop: 3 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  qtyButton: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  qtyDisabled: { opacity: .35 },
  qtySign: { fontSize: 18, fontWeight: '900' },
  qty: { minWidth: 22, textAlign: 'center', fontWeight: '900' },
  footer: { gap: 10, paddingTop: 8 },
  endText: { textAlign: 'center', fontSize: 8, fontWeight: '700', paddingVertical: 4 },
  saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 },
  saveText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .45 },
  backButton: { alignItems: 'center', padding: 12 },
  backText: { fontSize: 9, fontWeight: '900' },
  empty: { marginTop: 8, borderRadius: 18, borderWidth: 1, padding: 26, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyText: { fontSize: 9, textAlign: 'center' },
});
