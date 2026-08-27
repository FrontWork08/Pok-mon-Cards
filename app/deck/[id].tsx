import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { getMyDecks, renameDeck, setDeckCards } from '@/services/decks';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

type Selected = Record<string, number>;

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const [deck, setDeck] = useState<any>(null);
  const [bag, setBag] = useState<OwnedCardEntry[]>([]);
  const [selected, setSelected] = useState<Selected>({});
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [decks, bagData] = await Promise.all([getMyDecks(), getMyBag()]);
      const found = decks.find((d: any) => d.id === id);
      if (!found) throw new Error('Deck não encontrado.');
      setDeck(found); setName(found.name); setBag(bagData ?? []);
      setSelected(Object.fromEntries((found.deck_cards ?? []).map((item: any) => [item.card_id, Number(item.quantity ?? 1)])));
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível carregar o deck.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => Object.values(selected).reduce((a, b) => a + b, 0), [selected]);
  const totalValue = useMemo(() => bag.reduce((sum, entry) => sum + Number(entry.cards?.market_price_usd ?? 0) * Number(selected[entry.cards?.id ?? ''] ?? 0), 0), [bag, selected]);
  const visible = useMemo(() => { const term = search.trim().toLowerCase(); return bag.filter((entry) => { const c = entry.cards; return c && (!term || c.pokemon_name.toLowerCase().includes(term) || String(c.rarity ?? '').toLowerCase().includes(term)); }); }, [bag, search]);
  const tileWidth = width >= 1100 ? '18.8%' : width >= 760 ? '23.5%' : '48.5%';

  function change(cardId: string, owned: number, delta: number) {
    setSelected((current) => {
      const max = Math.min(4, owned);
      const nextQty = Math.max(0, Math.min(max, (current[cardId] ?? 0) + delta));
      const next = { ...current };
      if (!nextQty) delete next[cardId]; else next[cardId] = nextQty;
      return next;
    });
  }

  async function save() {
    if (!id || total > 20) return;
    try {
      setSaving(true);
      if (name.trim() && name.trim() !== deck.name) await renameDeck(id, name.trim());
      await setDeckCards(id, Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })));
      setNotice('Deck salvo! Ele já pode ser usado nas batalhas.');
      await load();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível salvar o deck.'); }
    finally { setSaving(false); }
  }

  return <View style={[styles.safe, { backgroundColor: colors.bg }]}>
    <Stack.Screen options={{ headerShown: true, title: deck?.name ?? 'Editar Deck', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }} />
    <ScrollView contentContainerStyle={styles.content}>
      {notice ? <Pressable style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.yellow }]} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={colors.yellow} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : <>
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.yellow }]}>DECK BUILDER</Text><TextInput value={name} onChangeText={setName} maxLength={40} style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]} /><Text style={[styles.deckValue, { color: colors.yellow }]}>Valor fixo do deck: {formatUsd(totalValue)}</Text></View><View style={[styles.counter, { backgroundColor: colors.surfaceAlt }, total > 20 && styles.counterError]}><Text style={[styles.counterValue, { color: colors.text }]}>{total}/20</Text><Text style={[styles.counterLabel, { color: colors.muted }]}>CARTAS</Text></View></View>
        <Text style={[styles.helper, { color: colors.muted }]}>Cada versão pode aparecer até 4 vezes. O valor exibido usa a tabela fixa em USD do jogo.</Text>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon ou raridade..." placeholderTextColor={colors.muted} style={[styles.search, { color: colors.text }]} /></View>
        <View style={styles.grid}>{visible.map((entry) => { const card = entry.cards; if (!card) return null; const qty = selected[card.id] ?? 0; return <View key={card.id} style={[styles.cardTile, { width: tileWidth as any, backgroundColor: qty > 0 ? colors.accentSoft : colors.surface, borderColor: qty > 0 ? colors.yellow : colors.border }]}><View style={styles.imageWrap}>{card.image_small ? <Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.cardImage} /> : <View style={[styles.cardImage, { backgroundColor: colors.surfaceAlt }]} />}<View style={styles.valueBadge}><Text style={[styles.valueText, { color: colors.yellow }]}>{card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}</Text></View></View><Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.pokemon_name}</Text><Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>{card.rarity ?? 'Comum'} • Bag ×{entry.quantity}</Text>{qty ? <Text style={[styles.selectedValue, { color: colors.yellow }]}>No deck: {card.market_price_usd != null ? formatUsd(Number(card.market_price_usd) * qty) : 'US$ —'}</Text> : null}<View style={styles.qtyRow}><Pressable style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }]} onPress={() => change(card.id, entry.quantity, -1)}><Text style={[styles.qtySign, { color: colors.text }]}>−</Text></Pressable><Text style={[styles.qty, { color: colors.yellow }]}>{qty}</Text><Pressable style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }]} onPress={() => change(card.id, entry.quantity, 1)}><Text style={[styles.qtySign, { color: colors.text }]}>+</Text></Pressable></View></View>; })}</View>
        <Pressable style={[styles.saveButton, { backgroundColor: colors.yellow }, (saving || total > 20) && styles.disabled]} onPress={save} disabled={saving || total > 20}><Ionicons name="save" size={18} color="#07111F" /><Text style={styles.saveText}>{saving ? 'SALVANDO...' : `SALVAR DECK • ${formatUsd(totalValue)}`}</Text></Pressable>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={[styles.backText, { color: colors.muted }]}>VOLTAR AOS DECKS</Text></Pressable>
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 16, paddingBottom: 50, gap: 12 }, notice: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 14, borderWidth: 1 }, noticeText: { flex: 1, fontSize: 11, fontWeight: '700' }, headerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, nameInput: { fontSize: 24, fontWeight: '900', paddingVertical: 4, borderBottomWidth: 1 }, deckValue: { fontSize: 11, fontWeight: '900', marginTop: 7 }, counter: { width: 84, height: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, counterError: { backgroundColor: '#351A24' }, counterValue: { fontSize: 20, fontWeight: '900' }, counterLabel: { fontSize: 7, fontWeight: '900' }, helper: { fontSize: 10, lineHeight: 15 }, searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1 }, search: { flex: 1, height: '100%' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, cardTile: { padding: 7, borderRadius: 15, borderWidth: 1 }, imageWrap: { position: 'relative', width: '100%', aspectRatio: .72 }, cardImage: { width: '100%', height: '100%', borderRadius: 9 }, valueBadge: { position: 'absolute', left: 5, bottom: 5, backgroundColor: '#050505E6', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999 }, valueText: { fontSize: 8, fontWeight: '900' }, cardName: { fontSize: 11, fontWeight: '900', marginTop: 6 }, cardMeta: { fontSize: 8, marginTop: 2 }, selectedValue: { fontSize: 8, fontWeight: '900', marginTop: 3 }, qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }, qtyButton: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, qtySign: { fontSize: 18, fontWeight: '900' }, qty: { minWidth: 22, textAlign: 'center', fontWeight: '900' }, saveButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 }, saveText: { color: '#07111F', fontSize: 10, fontWeight: '900' }, disabled: { opacity: .45 }, backButton: { alignItems: 'center', padding: 12 }, backText: { fontSize: 9, fontWeight: '900' },
});
