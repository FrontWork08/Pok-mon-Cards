import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMyBag } from '@/services/player';
import { cancelTrade, confirmTrade, getTrade, setTradeCards } from '@/services/trades';
import { supabase } from '@/lib/supabase';

type SelectedMap = Record<string, number>;

export default function TradeBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trade, setTrade] = useState<any>(null);
  const [bag, setBag] = useState<any[]>([]);
  const [selected, setSelected] = useState<SelectedMap>({});
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      const [{ data: auth }, tradeData, bagData] = await Promise.all([
        supabase.auth.getUser(),
        getTrade(id),
        getMyBag(),
      ]);
      const uid = auth.user?.id ?? '';
      setUserId(uid);
      setTrade(tradeData);
      setBag(bagData ?? []);
      const ownOffer: SelectedMap = {};
      for (const item of tradeData.trade_cards ?? []) {
        if (item.owner_id === uid) ownOffer[item.card_id] = item.quantity;
      }
      setSelected(ownOffer);
    } catch (error: any) {
      Alert.alert('Erro ao carregar troca', error?.message ?? 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const myConfirmed = useMemo(() => {
    if (!trade || !userId) return false;
    return userId === trade.sender_id ? trade.sender_confirmed : trade.receiver_confirmed;
  }, [trade, userId]);

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
    try {
      setSaving(true);
      await setTradeCards(id, Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })));
      await load();
      Alert.alert('Oferta salva', 'As confirmações foram reiniciadas porque a oferta mudou.');
    } catch (error: any) {
      Alert.alert('Não foi possível salvar', error?.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    try {
      setSaving(true);
      const result = await confirmTrade(id);
      await load();
      if (result?.status === 'completed') Alert.alert('Troca concluída!', 'Os cards já foram transferidos para as Bags.');
    } catch (error: any) {
      Alert.alert('Não foi possível confirmar', error?.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    try {
      setSaving(true);
      await cancelTrade(id);
      router.back();
    } catch (error: any) {
      Alert.alert('Não foi possível cancelar', error?.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (!trade) {
    return <View style={styles.center}><Text style={styles.text}>Troca não encontrada.</Text></View>;
  }

  const otherCards = (trade.trade_cards ?? []).filter((item: any) => item.owner_id !== userId);
  const completed = trade.status === 'completed';
  const pending = trade.status === 'pending';

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title: `Troca #${String(id).slice(0, 8)}`, headerStyle: { backgroundColor: '#090c12' }, headerTintColor: '#fff' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <Text style={styles.title}>Sua oferta</Text>
          <Text style={styles.status}>{String(trade.status).toUpperCase()}</Text>
        </View>

        {pending ? (
          <>
            <Text style={styles.helper}>Escolha cards da sua Bag. Você só pode oferecer quantidades que realmente possui.</Text>
            {bag.map((item: any) => {
              const card = item.cards;
              if (!card) return null;
              const qty = selected[card.id] ?? 0;
              return (
                <View key={card.id} style={styles.cardRow}>
                  {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.thumb} /> : <View style={styles.thumb} />}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{card.pokemon_name}</Text>
                    <Text style={styles.cardMeta}>{card.set_name} · {card.rarity ?? 'Sem raridade'} · Você tem {item.quantity}</Text>
                  </View>
                  <View style={styles.qtyBox}>
                    <Pressable style={styles.qtyButton} onPress={() => change(card.id, item.quantity, -1)}><Text style={styles.qtyText}>−</Text></Pressable>
                    <Text style={styles.qtyValue}>{qty}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => change(card.id, item.quantity, 1)}><Text style={styles.qtyText}>+</Text></Pressable>
                  </View>
                </View>
              );
            })}

            <Pressable style={styles.primary} onPress={saveOffer} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? 'Salvando...' : 'Salvar minha oferta'}</Text>
            </Pressable>
          </>
        ) : null}

        <Text style={styles.title}>Oferta do outro treinador</Text>
        {otherCards.length === 0 ? (
          <Text style={styles.helper}>O outro jogador ainda não adicionou cards.</Text>
        ) : otherCards.map((item: any) => (
          <View key={`${item.owner_id}-${item.card_id}`} style={styles.offerRow}>
            {item.cards?.image_small ? <Image source={{ uri: item.cards.image_small }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.cards?.pokemon_name ?? item.card_id}</Text>
              <Text style={styles.cardMeta}>Quantidade: {item.quantity} · {item.cards?.rarity ?? 'Sem raridade'}</Text>
            </View>
          </View>
        ))}

        {pending ? (
          <View style={styles.actions}>
            <Pressable style={[styles.confirm, myConfirmed && styles.confirmed]} onPress={confirm} disabled={saving || myConfirmed}>
              <Text style={styles.primaryText}>{myConfirmed ? 'Você confirmou ✓' : 'Confirmar troca'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={cancel} disabled={saving}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}

        {completed ? <Text style={styles.completed}>✓ Troca concluída. Os inventários já foram atualizados.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090c12' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#090c12' },
  content: { padding: 18, gap: 12 },
  text: { color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 6 },
  status: { color: '#80a9ff', fontWeight: '900', fontSize: 11 },
  helper: { color: '#8f99ad', lineHeight: 19 },
  cardRow: { backgroundColor: '#111725', borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  offerRow: { backgroundColor: '#111725', borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 48, height: 67, borderRadius: 6, backgroundColor: '#1c2538' },
  cardInfo: { flex: 1 },
  cardName: { color: '#fff', fontWeight: '900' },
  cardMeta: { color: '#8f99ad', fontSize: 11, marginTop: 4 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  qtyButton: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#1f2a44', alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  qtyValue: { color: '#fff', minWidth: 18, textAlign: 'center', fontWeight: '900' },
  primary: { backgroundColor: '#2d6cff', padding: 14, borderRadius: 13, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '900' },
  actions: { gap: 10, marginTop: 6 },
  confirm: { backgroundColor: '#16a36a', padding: 14, borderRadius: 13, alignItems: 'center' },
  confirmed: { backgroundColor: '#225b48' },
  cancel: { borderWidth: 1, borderColor: '#7a3342', padding: 13, borderRadius: 13, alignItems: 'center' },
  cancelText: { color: '#ff8b9b', fontWeight: '900' },
  completed: { color: '#5ee0a3', fontWeight: '900', textAlign: 'center', paddingVertical: 16 },
});
