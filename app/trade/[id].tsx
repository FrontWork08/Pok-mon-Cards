import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getMyBag } from '@/services/player';
import { cancelTrade, confirmTrade, getTrade, setTradeCards } from '@/services/trades';
import { supabase } from '@/lib/supabase';
import { gameTheme } from '@/theme/gameTheme';

type SelectedMap = Record<string, number>;

export default function TradeBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trade, setTrade] = useState<any>(null);
  const [bag, setBag] = useState<any[]>([]);
  const [selected, setSelected] = useState<SelectedMap>({});
  const [userId, setUserId] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

      const ownOffer: SelectedMap = {};
      for (const item of tradeData.trade_cards ?? []) {
        if (item.owner_id === uid) ownOffer[item.card_id] = item.quantity;
      }
      setSelected(ownOffer);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar a troca.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const myConfirmed = useMemo(() => {
    if (!trade || !userId) return false;
    return userId === trade.sender_id ? trade.sender_confirmed : trade.receiver_confirmed;
  }, [trade, userId]);

  const otherConfirmed = useMemo(() => {
    if (!trade || !userId) return false;
    return userId === trade.sender_id ? trade.receiver_confirmed : trade.sender_confirmed;
  }, [trade, userId]);

  const otherId = trade ? (trade.sender_id === userId ? trade.receiver_id : trade.sender_id) : '';
  const otherCards = (trade?.trade_cards ?? []).filter((item: any) => item.owner_id !== userId);
  const ownSavedCards = (trade?.trade_cards ?? []).filter((item: any) => item.owner_id === userId);
  const pending = trade?.status === 'pending';
  const completed = trade?.status === 'completed';

  const filteredBag = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bag;
    return bag.filter((item) => {
      const card = item.cards;
      return card && (card.pokemon_name.toLowerCase().includes(term) || card.set_name.toLowerCase().includes(term));
    });
  }, [bag, search]);

  function change(cardId: string, max: number, delta: number) {
    setSelected((current) => {
      const nextQty = Math.min(max, Math.max(0, (current[cardId] ?? 0) + delta));
      const next = { ...current };
      if (nextQty === 0) delete next[cardId];
      else next[cardId] = nextQty;
      return next;
    });
  }

  async function saveOffer() {
    if (!id) return;
    try {
      setSaving(true);
      setNotice(null);
      await setTradeCards(String(id), Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })));
      setNotice('Oferta salva. As confirmações anteriores foram reiniciadas porque a oferta mudou.');
      await load();
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
      await load();
      setNotice(result?.status === 'completed' ? 'Troca concluída! Os cards já foram transferidos entre as Bags.' : 'Sua confirmação foi registrada. Agora falta o outro treinador confirmar.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível confirmar a troca.');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!id) return;
    try {
      setSaving(true);
      await cancelTrade(String(id));
      router.back();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível cancelar a troca.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={gameTheme.colors.yellow} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color="#fff" /></Pressable>
          <View style={styles.topInfo}><Text style={styles.kicker}>NEGOCIAÇÃO SEGURA</Text><Text style={styles.title}>Troca #{String(id).slice(0, 8)}</Text></View>
          <View style={[styles.statusBadge, completed && styles.completedBadge]}><Text style={styles.statusText}>{completed ? 'CONCLUÍDA' : String(trade?.status ?? '').toUpperCase()}</Text></View>
        </View>

        {notice ? <View style={styles.notice}><Ionicons name="information-circle" size={20} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable></View> : null}

        <View style={styles.participants}>
          <Participant label="VOCÊ" name={names[userId] ?? 'Treinador'} confirmed={myConfirmed} />
          <View style={styles.swapCircle}><Ionicons name="swap-horizontal" size={23} color={gameTheme.colors.yellow} /></View>
          <Participant label="OUTRO TREINADOR" name={names[otherId] ?? 'Treinador'} confirmed={otherConfirmed} />
        </View>

        {pending ? (
          <View style={styles.panel}>
            <View style={styles.sectionHeader}><View><Text style={styles.kicker}>SUA BAG</Text><Text style={styles.sectionTitle}>Monte sua oferta</Text></View><Text style={styles.sectionMeta}>{Object.keys(selected).length} selecionados</Text></View>
            <Text style={styles.helper}>Escolha apenas cards que deseja entregar. Alterar sua oferta remove as confirmações dos dois jogadores.</Text>

            <View style={styles.searchBox}><Ionicons name="search" size={18} color="#7388A5" /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar na sua Bag..." placeholderTextColor="#657A96" style={styles.search} /></View>

            <View style={styles.cardList}>
              {filteredBag.map((item: any) => {
                const card = item.cards;
                if (!card) return null;
                const qty = selected[card.id] ?? 0;
                return (
                  <View key={card.id} style={[styles.cardRow, qty > 0 && styles.cardSelected]}>
                    {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.thumb} resizeMode="cover" /> : <View style={styles.thumb} />}
                    <View style={styles.cardInfo}><Text style={styles.cardName}>{card.pokemon_name}</Text><Text style={styles.cardMeta}>{card.set_name} • {card.rarity ?? 'Sem raridade'}</Text><Text style={styles.owned}>Você tem ×{item.quantity}</Text></View>
                    <View style={styles.qtyBox}>
                      <Pressable style={styles.qtyButton} onPress={() => change(card.id, item.quantity, -1)}><Text style={styles.qtyText}>−</Text></Pressable>
                      <Text style={[styles.qtyValue, qty > 0 && styles.qtyActive]}>{qty}</Text>
                      <Pressable style={styles.qtyButton} onPress={() => change(card.id, item.quantity, 1)}><Text style={styles.qtyText}>+</Text></Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable style={styles.saveButton} onPress={saveOffer} disabled={saving}><Ionicons name="save-outline" size={18} color="#07111F" /><Text style={styles.saveText}>{saving ? 'SALVANDO...' : 'SALVAR MINHA OFERTA'}</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.offersGrid}>
          <OfferPanel title="Sua oferta salva" cards={ownSavedCards} ownerEmpty="Você ainda não salvou cards nesta troca." />
          <OfferPanel title={`Oferta de @${names[otherId] ?? 'treinador'}`} cards={otherCards} ownerEmpty="O outro treinador ainda não adicionou cards." />
        </View>

        {pending ? (
          <View style={styles.confirmPanel}>
            <View style={styles.confirmCopy}><Text style={styles.confirmTitle}>Confirmação final</Text><Text style={styles.confirmText}>Só confirme depois de revisar os dois lados. Quando ambos confirmarem, a transferência acontece de forma atômica no servidor.</Text></View>
            <View style={styles.actions}>
              <Pressable style={[styles.confirmButton, myConfirmed && styles.confirmedButton]} onPress={confirm} disabled={saving || myConfirmed}><Ionicons name={myConfirmed ? 'checkmark-circle' : 'shield-checkmark-outline'} size={19} color="#fff" /><Text style={styles.confirmButtonText}>{myConfirmed ? 'VOCÊ JÁ CONFIRMOU' : 'CONFIRMAR TROCA'}</Text></Pressable>
              <Pressable style={styles.cancelButton} onPress={cancel} disabled={saving}><Text style={styles.cancelText}>CANCELAR TROCA</Text></Pressable>
            </View>
          </View>
        ) : null}

        {completed ? <View style={styles.completed}><Ionicons name="checkmark-circle" size={34} color="#65D894" /><View><Text style={styles.completedTitle}>Troca concluída</Text><Text style={styles.completedText}>Os inventários dos dois treinadores já foram atualizados.</Text></View></View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Participant({ label, name, confirmed }: { label: string; name: string; confirmed: boolean }) {
  return <View style={styles.participant}><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><View><Text style={styles.participantLabel}>{label}</Text><Text style={styles.participantName}>@{name}</Text><Text style={[styles.confirmState, confirmed && styles.confirmStateYes]}>{confirmed ? '✓ Confirmado' : 'Aguardando confirmação'}</Text></View></View>;
}

function OfferPanel({ title, cards, ownerEmpty }: { title: string; cards: any[]; ownerEmpty: string }) {
  return (
    <View style={styles.offerPanel}>
      <Text style={styles.offerTitle}>{title}</Text>
      {cards.length === 0 ? <Text style={styles.offerEmpty}>{ownerEmpty}</Text> : cards.map((item) => <View key={`${item.owner_id}-${item.card_id}`} style={styles.offerItem}>{item.cards?.image_small ? <Image source={{ uri: item.cards.image_small }} style={styles.offerThumb} /> : <View style={styles.offerThumb} />}<View style={{ flex: 1 }}><Text style={styles.offerName}>{item.cards?.pokemon_name ?? item.card_id}</Text><Text style={styles.offerMeta}>{item.cards?.rarity ?? 'Sem raridade'} • ×{item.quantity}</Text></View></View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: gameTheme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.bg },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 18, paddingBottom: 42, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  topInfo: { flex: 1 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#253653' },
  completedBadge: { backgroundColor: '#1F4A39' },
  statusText: { color: '#D7E5F7', fontSize: 9, fontWeight: '900' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  noticeText: { flex: 1, color: '#F5EAC4', fontWeight: '700', fontSize: 11 },
  participants: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: '#0D1929', borderWidth: 1, borderColor: '#213852' },
  participant: { flexGrow: 1, flexBasis: 260, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17345D' },
  avatarText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  participantLabel: { color: '#7087A5', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  participantName: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 2 },
  confirmState: { color: '#8799B0', fontSize: 9, marginTop: 2 },
  confirmStateYes: { color: '#65D894', fontWeight: '900' },
  swapCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2C291B' },
  panel: { gap: 11, padding: 15, borderRadius: 20, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  sectionMeta: { color: '#8196B2', fontSize: 10, fontWeight: '800' },
  helper: { color: '#8297B1', fontSize: 10, lineHeight: 15 },
  searchBox: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#0A1728', borderWidth: 1, borderColor: '#203650' },
  search: { flex: 1, color: '#fff', height: '100%', fontSize: 12 },
  cardList: { gap: 7 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 14, backgroundColor: '#0D1929', borderWidth: 1, borderColor: '#203650' },
  cardSelected: { borderColor: '#B4952B', backgroundColor: '#1B211C' },
  thumb: { width: 48, height: 67, borderRadius: 7, backgroundColor: '#17263B' },
  cardInfo: { flex: 1 },
  cardName: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cardMeta: { color: '#7D92AD', fontSize: 9, marginTop: 3 },
  owned: { color: '#A5B5CA', fontSize: 9, marginTop: 2, fontWeight: '800' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyButton: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#1B2C43', alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  qtyValue: { color: '#8799AF', minWidth: 18, textAlign: 'center', fontWeight: '900' },
  qtyActive: { color: gameTheme.colors.yellow },
  saveButton: { minHeight: 50, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: gameTheme.colors.yellow },
  saveText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  offersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  offerPanel: { flexGrow: 1, flexBasis: 330, gap: 8, padding: 14, borderRadius: 18, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  offerTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  offerEmpty: { color: '#788DA8', fontSize: 10, paddingVertical: 12 },
  offerItem: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 7, borderRadius: 11, backgroundColor: '#0C1828' },
  offerThumb: { width: 38, height: 53, borderRadius: 5, backgroundColor: '#17263B' },
  offerName: { color: '#fff', fontSize: 10, fontWeight: '900' },
  offerMeta: { color: '#7C91AC', fontSize: 8, marginTop: 2 },
  confirmPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 15, borderRadius: 19, backgroundColor: '#10251E', borderWidth: 1, borderColor: '#27513F' },
  confirmCopy: { flex: 1, minWidth: 260 },
  confirmTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  confirmText: { color: '#88B19F', fontSize: 10, lineHeight: 15, marginTop: 4 },
  actions: { gap: 8, minWidth: 220 },
  confirmButton: { minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#198B5F', paddingHorizontal: 12 },
  confirmedButton: { backgroundColor: '#2A5B49' },
  confirmButtonText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#74404A' },
  cancelText: { color: '#FF9BAA', fontSize: 9, fontWeight: '900' },
  completed: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 16, borderRadius: 18, backgroundColor: '#10251E', borderWidth: 1, borderColor: '#27513F' },
  completedTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  completedText: { color: '#88B19F', fontSize: 10, marginTop: 3 },
});
