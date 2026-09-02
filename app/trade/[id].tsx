import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { CardPickerModal } from '@/components/CardPickerModal';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { cancelTrade, confirmTrade, getTrade, setTradeCards, subscribeToTrade } from '@/services/trades';
import { supabase } from '@/lib/supabase';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

type SelectedMap = Record<string, number>;

function cardValue(item: any) {
  const relation = item?.cards;
  const card = Array.isArray(relation) ? relation[0] : relation;
  return Number(card?.market_price_usd ?? 0) * Number(item?.quantity ?? 0);
}

function selectionFromTrade(trade: any, ownerId: string): SelectedMap {
  const offer: SelectedMap = {};
  if (!ownerId) return offer;
  for (const item of trade?.trade_cards ?? []) {
    if (item.owner_id === ownerId) offer[item.card_id] = Number(item.quantity ?? 0);
  }
  return offer;
}

export default function TradeBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const [trade, setTrade] = useState<any>(null);
  const [bag, setBag] = useState<OwnedCardEntry[]>([]);
  const [selected, setSelected] = useState<SelectedMap>({});
  const [userId, setUserId] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const syncingRef = useRef(false);
  const pickerOpenRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [{ data: auth }, tradeData, bagData] = await Promise.all([
        supabase.auth.getUser(),
        getTrade(String(id)),
        getMyBag(),
      ]);
      const uid = auth.user?.id ?? '';
      setUserId(uid);
      setTrade(tradeData);
      setBag(bagData ?? []);

      const participantIds = [tradeData.sender_id, tradeData.receiver_id];
      const { data: players } = await supabase.from('players').select('id,username').in('id', participantIds);
      setNames(Object.fromEntries((players ?? []).map((player) => [player.id, player.username])));

      setSelected(selectionFromTrade(tradeData, uid));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar a troca.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refreshTrade = useCallback(async () => {
    if (!id || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const tradeData = await getTrade(String(id));
      setTrade((current: any) => {
        if (
          current?.status !== 'completed' &&
          tradeData.status === 'completed'
        ) {
          setNotice('Troca concluída! As Bags dos dois treinadores já foram atualizadas.');
        }
        return tradeData;
      });

      const uid = userId || (await supabase.auth.getUser()).data.user?.id || '';
      // Keep the saved offer synchronized only while the editor is closed.
      // While it is open, the 900 ms live refresh must never overwrite the local draft.
      if (uid && !pickerOpenRef.current) {
        setSelected(selectionFromTrade(tradeData, uid));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível sincronizar a troca.');
    } finally {
      syncingRef.current = false;
    }
  }, [id, userId]);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToTrade(
      String(id),
      () => refreshTrade(),
      setSyncStatus,
    );

    // Near-real-time fallback while the negotiation is open.
    // This keeps both phones synced even if the websocket drops on mobile data.
    const timer = setInterval(() => {
      if (trade?.status === 'pending') refreshTrade();
    }, 900);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshTrade();
    });

    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [id, refreshTrade, trade?.status]);

  const myConfirmed = useMemo(() => {
    if (!trade || !userId) return false;
    return userId === trade.sender_id ? trade.sender_confirmed : trade.receiver_confirmed;
  }, [trade, userId]);

  const otherConfirmed = useMemo(() => {
    if (!trade || !userId) return false;
    return userId === trade.sender_id ? trade.receiver_confirmed : trade.sender_confirmed;
  }, [trade, userId]);

  const otherId = trade ? (trade.sender_id === userId ? trade.receiver_id : trade.sender_id) : '';
  const otherCards = useMemo(() => (trade?.trade_cards ?? []).filter((item: any) => item.owner_id !== userId), [trade, userId]);
  const ownSavedCards = useMemo(() => (trade?.trade_cards ?? []).filter((item: any) => item.owner_id === userId), [trade, userId]);
  const pending = trade?.status === 'pending';
  const completed = trade?.status === 'completed';
  const ownSavedValue = useMemo(() => ownSavedCards.reduce((sum: number, item: any) => sum + cardValue(item), 0), [ownSavedCards]);
  const otherValue = useMemo(() => otherCards.reduce((sum: number, item: any) => sum + cardValue(item), 0), [otherCards]);
  const selectedCount = useMemo(() => Object.values(selected).reduce((sum, qty) => sum + Number(qty), 0), [selected]);
  const selectedValue = useMemo(() => bag.reduce((sum, entry) => sum + Number(entry.cards?.market_price_usd ?? 0) * Number(selected[entry.cards?.id ?? ''] ?? 0), 0), [bag, selected]);

  function openPicker() {
    setSelected(selectionFromTrade(trade, userId));
    pickerOpenRef.current = true;
    setPickerOpen(true);
  }

  function closePicker() {
    pickerOpenRef.current = false;
    setPickerOpen(false);
    setSelected(selectionFromTrade(trade, userId));
  }

  async function saveOffer() {
    if (!id) return;
    try {
      setSaving(true);
      setNotice(null);
      await setTradeCards(String(id), Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })));
      pickerOpenRef.current = false;
      setPickerOpen(false);
      setNotice('Oferta salva e sincronizada. Se alguém já tinha confirmado, a confirmação foi reiniciada porque a oferta mudou.');
      await refreshTrade();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar a oferta.');
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (!id) return;
    try {
      setSaving(true);
      setNotice(null);
      const result = await confirmTrade(String(id));
      setTrade((current: any) => {
        if (!current) return current;
        if (result?.status === 'completed') return { ...current, status: 'completed', sender_confirmed: true, receiver_confirmed: true };
        return userId === current.sender_id
          ? { ...current, sender_confirmed: true }
          : { ...current, receiver_confirmed: true };
      });
      setNotice(result?.status === 'completed' ? 'Troca concluída! As Bags dos dois treinadores já foram atualizadas.' : 'Sua confirmação foi registrada. Falta o outro treinador confirmar.');
      await refreshTrade();

      if (result?.status !== 'completed') {
        // For a few seconds after confirming, check faster for the other side.
        // It makes the completed state appear immediately even on unstable mobile networks.
        const startedAt = Date.now();
        const fastSync = setInterval(() => {
          refreshTrade();
          if (Date.now() - startedAt > 10000) clearInterval(fastSync);
        }, 450);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível confirmar a troca.');
      await load().catch(() => null);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!id) return;
    try {
      setSaving(true);
      await cancelTrade(String(id));
      goBackOrHome(router);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível cancelar a troca.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator size="large" color={colors.yellow} /></View>;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, pending && styles.contentWithDock]} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={21} color={colors.text} /></Pressable>
          <View style={styles.topInfo}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>NEGOCIAÇÃO SEGURA</Text>
            <Text style={[styles.title, { color: colors.text }]}>Troca #{String(id).slice(0, 8)}</Text>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: syncStatus === 'live' ? '#65D894' : syncStatus === 'fallback' ? '#FFC857' : colors.muted }]} />
              <Text style={[styles.liveText, { color: colors.muted }]}>
                {syncStatus === 'live' ? 'SINCRONIZAÇÃO AO VIVO' : syncStatus === 'fallback' ? 'SINCRONIZAÇÃO AUTOMÁTICA' : 'CONECTANDO...'}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: completed ? '#173C2C' : colors.surfaceAlt }]}><Text style={[styles.statusText, { color: completed ? '#70D69D' : colors.muted }]}>{completed ? 'CONCLUÍDA' : String(trade?.status ?? '').toUpperCase()}</Text></View>
        </View>

        {notice ? <Pressable style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.yellow }]} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={20} color={colors.yellow} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text><Ionicons name="close" size={18} color={colors.muted} /></Pressable> : null}

        <View style={[styles.participants, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Participant label="VOCÊ" name={names[userId] ?? 'Treinador'} confirmed={myConfirmed} />
          <View style={[styles.swapCircle, { backgroundColor: colors.accentSoft }]}><Ionicons name="swap-horizontal" size={23} color={colors.yellow} /></View>
          <Participant label="OUTRO TREINADOR" name={names[otherId] ?? 'Treinador'} confirmed={otherConfirmed} />
        </View>

        {pending ? (
          <Pressable style={[styles.editOffer, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} onPress={openPicker}>
            <View style={[styles.editIcon, { backgroundColor: colors.surface }]}><Ionicons name="albums" size={25} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: colors.yellow }]}>SUA OFERTA</Text>
              <Text style={[styles.editTitle, { color: colors.text }]}>{selectedCount ? `${selectedCount} carta(s) selecionada(s)` : 'Escolha suas cartas'}</Text>
              <Text style={[styles.editMeta, { color: colors.muted }]}>Valor fixo em USD: {formatUsd(selectedValue)} • toque para editar</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.accent} />
          </Pressable>
        ) : null}

        <View style={styles.valueCompare}>
          <ValueCard label="SUA OFERTA" value={ownSavedValue} count={ownSavedCards.reduce((s: number, x: any) => s + Number(x.quantity ?? 0), 0)} accent={colors.yellow} />
          <View style={[styles.valueDivider, { backgroundColor: colors.border }]} />
          <ValueCard label={`@${names[otherId] ?? 'TREINADOR'}`} value={otherValue} count={otherCards.reduce((s: number, x: any) => s + Number(x.quantity ?? 0), 0)} accent={colors.accent} />
        </View>

        <View style={styles.offersGrid}>
          <OfferPanel title="Sua oferta salva" cards={ownSavedCards} ownerEmpty="Você ainda não salvou cartas nesta troca." />
          <OfferPanel title={`Oferta de @${names[otherId] ?? 'treinador'}`} cards={otherCards} ownerEmpty="O outro treinador ainda não adicionou cartas." />
        </View>

        {pending ? (
          <View style={[styles.review, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}><Text style={[styles.reviewTitle, { color: colors.text }]}>Revise os dois lados</Text><Text style={[styles.reviewText, { color: colors.muted }]}>A tela sincroniza automaticamente entre os dois celulares. Se qualquer lado alterar a oferta, as confirmações são zeradas por segurança. Quando os dois confirmarem, a transferência acontece de forma atômica no servidor.</Text></View>
          </View>
        ) : null}

        {completed ? <View style={[styles.completed, { backgroundColor: colors.surface, borderColor: '#2B7350' }]}><Ionicons name="checkmark-circle" size={34} color="#65D894" /><View><Text style={[styles.completedTitle, { color: colors.text }]}>Troca concluída</Text><Text style={[styles.completedText, { color: colors.muted }]}>Os inventários dos dois treinadores já foram atualizados.</Text></View></View> : null}
      </ScrollView>

      {pending ? (
        <View style={[styles.actionDock, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable style={[styles.editDockButton, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]} onPress={openPicker} disabled={saving}>
            <Ionicons name="albums-outline" size={20} color={colors.accent} />
            <View><Text style={[styles.dockSmall, { color: colors.muted }]}>OFERTA</Text><Text style={[styles.dockEditText, { color: colors.text }]}>EDITAR</Text></View>
          </Pressable>
          <Pressable style={[styles.confirmButton, { backgroundColor: myConfirmed ? '#28563F' : colors.yellow }, (saving || myConfirmed || ownSavedCards.length === 0) && styles.disabled]} onPress={confirm} disabled={saving || myConfirmed || ownSavedCards.length === 0}>
            <Ionicons name={myConfirmed ? 'checkmark-circle' : 'shield-checkmark'} size={20} color={myConfirmed ? '#B9F4D2' : '#07111F'} />
            <View><Text style={[styles.dockSmall, { color: myConfirmed ? '#9FD8B8' : '#4D4312' }]}>{myConfirmed ? 'CONFIRMADA' : formatUsd(ownSavedValue)}</Text><Text style={[styles.confirmButtonText, { color: myConfirmed ? '#D9FFE9' : '#07111F' }]}>{myConfirmed ? 'AGUARDANDO O OUTRO' : 'CONFIRMAR TROCA'}</Text></View>
          </Pressable>
          <Pressable style={styles.cancelDock} onPress={cancel} disabled={saving}><Ionicons name="close" size={20} color="#FF858F" /></Pressable>
        </View>
      ) : null}

      <CardPickerModal
        visible={pickerOpen}
        title="Monte sua oferta"
        subtitle="Lista virtualizada • ordene por valor e encontre cartas rapidamente."
        bag={bag}
        mode="quantity"
        enableTypeFilter
        selectedMap={selected}
        onSelectedMapChange={setSelected}
        onClose={closePicker}
        onConfirm={saveOffer}
        confirmLabel="SALVAR OFERTA"
        working={saving}
      />
    </SafeAreaView>
  );
}

function Participant({ label, name, confirmed }: { label: string; name: string; confirmed: boolean }) {
  const { colors } = useAppTheme();
  return <View style={styles.participant}><View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.avatarText, { color: colors.text }]}>{name.slice(0, 1).toUpperCase()}</Text></View><View><Text style={[styles.participantLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.participantName, { color: colors.text }]}>@{name}</Text><Text style={[styles.confirmState, { color: confirmed ? '#65D894' : colors.muted }]}>{confirmed ? '✓ Confirmado' : 'Aguardando confirmação'}</Text></View></View>;
}

function ValueCard({ label, value, count, accent }: { label: string; value: number; count: number; accent: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.valueCard}><Text style={[styles.valueLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.valueAmount, { color: accent }]}>{formatUsd(value)}</Text><Text style={[styles.valueCount, { color: colors.muted }]}>{count} carta(s)</Text></View>;
}

function OfferPanel({ title, cards, ownerEmpty }: { title: string; cards: any[]; ownerEmpty: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.offerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.offerTitle, { color: colors.text }]}>{title}</Text>
      {cards.length === 0 ? <Text style={[styles.offerEmpty, { color: colors.muted }]}>{ownerEmpty}</Text> : cards.map((item) => {
        const relation = item.cards;
        const card = Array.isArray(relation) ? relation[0] : relation;
        return <View key={`${item.owner_id}-${item.card_id}`} style={[styles.offerItem, { backgroundColor: colors.surfaceAlt }]}>{card?.image_small ? <Image source={{ uri: card.image_small }} style={styles.offerThumb} resizeMode="contain" /> : <View style={styles.offerThumb} />}<View style={{ flex: 1 }}><Text style={[styles.offerName, { color: colors.text }]}>{card?.pokemon_name ?? item.card_id}</Text><Text style={[styles.offerMeta, { color: colors.muted }]}>{card?.rarity ?? 'Sem raridade'} • ×{item.quantity}</Text></View><Text style={[styles.offerValue, { color: colors.yellow }]}>{card?.market_price_usd != null ? formatUsd(Number(card.market_price_usd) * Number(item.quantity ?? 0)) : 'US$ —'}</Text></View>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 16, paddingBottom: 42, gap: 13 }, contentWithDock: { paddingBottom: 120 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 11 }, backButton: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, topInfo: { flex: 1 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, title: { fontSize: 22, fontWeight: '900', marginTop: 2 }, liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }, liveDot: { width: 7, height: 7, borderRadius: 99 }, liveText: { fontSize: 7, fontWeight: '900', letterSpacing: .7 }, statusBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 }, statusText: { fontSize: 9, fontWeight: '900' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, borderWidth: 1 }, noticeText: { flex: 1, fontWeight: '700', fontSize: 11 },
  participants: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 }, participant: { flexGrow: 1, flexBasis: 240, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 18, fontWeight: '900' }, participantLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, participantName: { fontSize: 14, fontWeight: '900', marginTop: 2 }, confirmState: { fontSize: 9, marginTop: 2, fontWeight: '700' }, swapCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  editOffer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, padding: 14 }, editIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, editTitle: { fontSize: 18, fontWeight: '900', marginTop: 2 }, editMeta: { fontSize: 10, marginTop: 3 },
  valueCompare: { flexDirection: 'row', alignItems: 'stretch' }, valueCard: { flex: 1, paddingVertical: 11, paddingHorizontal: 12 }, valueDivider: { width: 1 }, valueLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, valueAmount: { fontSize: 20, fontWeight: '900', marginTop: 3 }, valueCount: { fontSize: 9, marginTop: 2 },
  offersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, offerPanel: { flexGrow: 1, flexBasis: 300, minWidth: 270, borderRadius: 19, borderWidth: 1, padding: 13, gap: 8 }, offerTitle: { fontSize: 14, fontWeight: '900' }, offerEmpty: { fontSize: 10, lineHeight: 15, paddingVertical: 14 }, offerItem: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, padding: 7 }, offerThumb: { width: 43, height: 58, borderRadius: 5 }, offerName: { fontSize: 11, fontWeight: '900' }, offerMeta: { fontSize: 8, marginTop: 2 }, offerValue: { fontSize: 10, fontWeight: '900' },
  review: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 13, borderRadius: 17, borderWidth: 1 }, reviewTitle: { fontSize: 13, fontWeight: '900' }, reviewText: { fontSize: 9, lineHeight: 14, marginTop: 2 }, completed: { flexDirection: 'row', gap: 11, alignItems: 'center', padding: 15, borderRadius: 18, borderWidth: 1 }, completedTitle: { fontSize: 16, fontWeight: '900' }, completedText: { fontSize: 10, marginTop: 2 },
  actionDock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 10, flexDirection: 'row', alignItems: 'stretch', gap: 8 }, editDockButton: { minWidth: 104, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, dockSmall: { fontSize: 7, fontWeight: '900', letterSpacing: .7 }, dockEditText: { fontSize: 10, fontWeight: '900', marginTop: 1 }, confirmButton: { flex: 1, minHeight: 55, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }, confirmButtonText: { fontSize: 11, fontWeight: '900', marginTop: 1 }, cancelDock: { width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#63323A', backgroundColor: '#251418' }, disabled: { opacity: .45 },
});
