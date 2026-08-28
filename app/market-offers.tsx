import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import {
  cancelMarketOffer,
  getMarketOffers,
  respondMarketOffer,
  subscribeMarketplace,
  type MarketOffer,
  type MarketOffersHub,
} from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

export default function MarketOffersScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [hub, setHub] = useState<MarketOffersHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      setHub(await getMarketOffers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar ofertas.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeMarketplace(() => { void load(true); }), [load]);

  async function respond(item: MarketOffer, accept: boolean) {
    if (working) return;
    try {
      setWorking(item.id);
      await respondMarketOffer(item.id, accept);
      setNotice(accept ? 'Oferta aceita. A venda foi concluída.' : 'Oferta recusada.');
      await Promise.all([load(true), wallet.refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível responder.');
    } finally {
      setWorking(null);
    }
  }

  async function cancel(item: MarketOffer) {
    if (working) return;
    try {
      setWorking(item.id);
      await cancelMarketOffer(item.id);
      setNotice('Oferta cancelada.');
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <Screen title="Central de Ofertas" subtitle="Negocie abaixo ou acima do preço anunciado sem tirar a carta da custódia do mercado.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar ao mercado</Text>
      </Pressable>
      {notice ? <Pressable onPress={() => setNotice(null)} style={[styles.notice, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></Pressable> : null}
      {error ? <Pressable onPress={() => setError(null)} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
      <OfferSection title="Recebidas" items={hub?.incoming ?? []} incoming working={working} onRespond={respond} onCancel={cancel} />
      <OfferSection title="Enviadas" items={hub?.outgoing ?? []} incoming={false} working={working} onRespond={respond} onCancel={cancel} />
    </Screen>
  );
}

function OfferSection({ title, items, incoming, working, onRespond, onCancel }: {
  title: string;
  items: MarketOffer[];
  incoming: boolean;
  working: string | null;
  onRespond: (offer: MarketOffer, accept: boolean) => void;
  onCancel: (offer: MarketOffer) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <View style={styles.head}><Text style={[styles.title, { color: colors.text }]}>{title}</Text><Text style={[styles.count, { color: colors.yellow }]}>{items.length}</Text></View>
      {items.length ? items.map((item) => (
        <View key={item.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: item.status === 'pending' ? colors.yellow : colors.border }]}>
          {item.card.image ? <Image source={{ uri: item.card.image }} resizeMode="contain" style={styles.image} /> : <View style={styles.image} />}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]}>{item.card.name}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{incoming ? '@' + item.buyerUsername : 'para @' + item.sellerUsername} • anúncio 🪙 {item.listingPrice.toLocaleString('pt-BR')}</Text>
            <Text style={[styles.amount, { color: colors.yellow }]}>OFERTA 🪙 {item.amountCoins.toLocaleString('pt-BR')}</Text>
            <Text style={[styles.status, { color: item.status === 'pending' ? '#65D894' : colors.muted }]}>{item.status.toUpperCase()}</Text>
          </View>
          {item.status === 'pending' ? incoming ? (
            <View style={styles.actions}>
              <Pressable disabled={working === item.id} onPress={() => onRespond(item, false)} style={[styles.action, { borderColor: '#683243' }]}><Ionicons name="close" size={17} color="#FF9FAF" /></Pressable>
              <Pressable disabled={working === item.id} onPress={() => onRespond(item, true)} style={[styles.action, { backgroundColor: '#65D894', borderColor: '#65D894' }]}><Ionicons name="checkmark" size={17} color="#07111F" /></Pressable>
            </View>
          ) : (
            <Pressable disabled={working === item.id} onPress={() => onCancel(item)} style={[styles.action, { borderColor: '#683243' }]}><Ionicons name="trash" size={17} color="#FF9FAF" /></Pressable>
          ) : null}
        </View>
      )) : (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.meta, { color: colors.muted }]}>Nenhuma oferta nesta seção.</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { fontSize: 11, fontWeight: '800' },
  notice: { borderRadius: 14, borderWidth: 1, padding: 11 },
  noticeText: { fontSize: 10, fontWeight: '800' },
  error: { borderRadius: 14, padding: 11, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { color: '#FFD7DD', fontSize: 10, fontWeight: '800' },
  section: { gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 19, fontWeight: '900' },
  count: { fontSize: 13, fontWeight: '900' },
  row: { minHeight: 96, borderRadius: 17, borderWidth: 1, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  image: { width: 58, height: 76 },
  name: { fontSize: 12, fontWeight: '900' },
  meta: { fontSize: 8, marginTop: 2 },
  amount: { fontSize: 10, fontWeight: '900', marginTop: 5 },
  status: { fontSize: 7, fontWeight: '900', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 5 },
  action: { width: 39, height: 39, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 15, borderWidth: 1, padding: 18, alignItems: 'center' },
});
