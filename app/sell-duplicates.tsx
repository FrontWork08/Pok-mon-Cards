import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { PremiumBackground } from '@/components/PremiumBackground';
import {
  getDuplicateCardsForSale,
  sellAllDuplicateCards,
  sellDuplicateCards,
  type DuplicateSaleCard,
} from '@/services/cardSales';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

export default function SellDuplicatesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { refresh: refreshWallet } = useWallet();
  const [cards, setCards] = useState<DuplicateSaleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellingCardId, setSellingCardId] = useState<string | null>(null);
  const [sellingAll, setSellingAll] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCards(await getDuplicateCardsForSale());
    } catch (error) {
      Alert.alert('Vender repetidas', error instanceof Error ? error.message : 'Não foi possível carregar suas cartas repetidas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter((entry) => {
      const card = entry.cards;
      return Boolean(card && (
        card.pokemon_name.toLowerCase().includes(term)
        || card.set_name.toLowerCase().includes(term)
        || (card.rarity ?? '').toLowerCase().includes(term)
      ));
    });
  }, [cards, search]);

  const summary = useMemo(() => {
    let copies = 0;
    let sellableCopies = 0;
    let skippedCopies = 0;
    let estimatedCoins = 0;
    let sellableUnique = 0;
    for (const entry of cards) {
      const available = Math.max(0, Number(entry.quantity ?? 0) - 1);
      const unit = Number(entry.sale?.unitCoins ?? 0);
      copies += available;
      if (unit > 0) {
        sellableCopies += available;
        sellableUnique += 1;
        estimatedCoins += available * unit;
      } else {
        skippedCopies += available;
      }
    }
    return { copies, sellableCopies, skippedCopies, sellableUnique, estimatedCoins };
  }, [cards]);

  const confirmSellAll = useCallback(() => {
    if (sellingAll || sellingCardId || summary.sellableCopies <= 0) return;
    Alert.alert(
      'Vender todas as repetidas?',
      `Serão vendidas ${summary.sellableCopies.toLocaleString('pt-BR')} cópias extras de ${summary.sellableUnique.toLocaleString('pt-BR')} carta(s), por aproximadamente 🪙 ${summary.estimatedCoins.toLocaleString('pt-BR')}.\n\nO servidor recalcula os valores na confirmação e mantém 1 cópia de cada carta na sua coleção.${summary.skippedCopies ? `\n\n${summary.skippedCopies} cópia(s) sem cotação serão ignoradas.` : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'VENDER TODAS',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setSellingAll(true);
                const result = await sellAllDuplicateCards();

                // A venda já foi confirmada pelo servidor. Atualizações visuais posteriores
                // não podem transformar uma venda bem-sucedida em uma mensagem de erro.
                setCards((current) => current.filter((entry) => (
                  Number(entry.quantity ?? 0) > 1
                  && Number(entry.sale?.unitCoins ?? 0) <= 0
                )));

                if (result.quantitySold > 0) {
                  Alert.alert(
                    'Venda em lote concluída',
                    `Você vendeu ${result.quantitySold.toLocaleString('pt-BR')} repetida(s) de ${result.uniqueCardsSold.toLocaleString('pt-BR')} carta(s) e recebeu 🪙 ${result.coinsEarned.toLocaleString('pt-BR')}.${result.skippedCopies ? `\n\n${result.skippedCopies.toLocaleString('pt-BR')} cópia(s) sem cotação foram preservadas.` : ''}`,
                  );
                } else {
                  Alert.alert('Tudo atualizado', 'Não havia mais repetidas vendáveis quando o servidor confirmou a operação.');
                }

                void Promise.allSettled([
                  refreshWallet(),
                  getDuplicateCardsForSale().then(setCards),
                ]);
              } catch (error) {
                Alert.alert('Não foi possível vender tudo', error instanceof Error ? error.message : 'Tente novamente.');
              } finally {
                setSellingAll(false);
              }
            })();
          },
        },
      ],
    );
  }, [refreshWallet, sellingAll, sellingCardId, summary]);

  const confirmSale = useCallback((entry: DuplicateSaleCard, quantity: number) => {
    const card = entry.cards;
    if (!card || quantity < 1 || sellingCardId) return;
    const unitCoins = Number(entry.sale?.unitCoins ?? 0);
    if (unitCoins <= 0) {
      Alert.alert('Sem cotação', 'Esta carta ainda não possui preço de mercado e não pode ser vendida.');
      return;
    }

    const estimated = unitCoins * quantity;
    Alert.alert(
      'Confirmar venda',
      `Vender ${quantity}x ${card.pokemon_name} por aproximadamente 🪙 ${estimated.toLocaleString('pt-BR')}?\n\nSua primeira cópia ficará protegida na coleção.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vender',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setSellingCardId(card.id);
                const result = await sellDuplicateCards(card.id, quantity);
                setCards((current) => current
                  .map((item) => item.cards?.id === card.id
                    ? { ...item, quantity: result.remainingQuantity }
                    : item)
                  .filter((item) => Number(item.quantity ?? 0) > 1));
                await refreshWallet();
                Alert.alert(
                  'Venda concluída',
                  `Você recebeu 🪙 ${Number(result.coinsEarned).toLocaleString('pt-BR')} por ${result.quantitySold} carta(s).`,
                );
              } catch (error) {
                Alert.alert('Não foi possível vender', error instanceof Error ? error.message : 'Tente novamente.');
              } finally {
                setSellingCardId(null);
              }
            })();
          },
        },
      ],
    );
  }, [refreshWallet, sellingCardId]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <FlatList
        {...VIRTUAL_LIST_PERF_PROPS}
        data={filtered}
        keyExtractor={(item) => item.cards?.id ?? String(item.quantity)}
        contentContainerStyle={styles.content}
        refreshing={loading}
        onRefresh={() => void load()}
        ListHeaderComponent={(
          <View style={styles.header}>
            <View style={styles.topRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voltar"
                onPress={() => router.back()}
                style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </Pressable>
              <View style={styles.titleWrap}>
                <Text style={[styles.eyebrow, { color: colors.yellow }]}>CENTRAL DE TROCAS</Text>
                <Text style={[styles.title, { color: colors.text }]}>Vender repetidas</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  Transforme cópias extras em Coins sem perder a primeira carta da coleção.
                </Text>
              </View>
            </View>

            <View style={[styles.ruleCard, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              <View style={[styles.ruleIcon, { backgroundColor: colors.yellow }]}>
                <Ionicons name="cash" size={21} color="#07111F" />
              </View>
              <View style={styles.ruleText}>
                <Text style={[styles.ruleTitle, { color: colors.text }]}>Valor baseado no mercado</Text>
                <Text style={[styles.ruleBody, { color: colors.muted }]}>
                  O servidor combina mercado + raridade + chance de pull, com teto ligado ao preço do booster. Durante evento de boosters grátis, vendas de repetidas ficam pausadas para proteger a economia.
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>CÓPIAS VENDÁVEIS</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{summary.copies.toLocaleString('pt-BR')}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.summaryLabel, { color: colors.muted }]}>VALOR ESTIMADO</Text>
                <Text style={[styles.summaryValue, { color: colors.yellow }]}>🪙 {summary.estimatedCoins.toLocaleString('pt-BR')}</Text>
              </View>
            </View>

            <Pressable
              disabled={sellingAll || Boolean(sellingCardId) || summary.sellableCopies <= 0}
              onPress={confirmSellAll}
              style={[
                styles.sellAllButton,
                { backgroundColor: colors.yellow, borderColor: colors.yellow },
                (sellingAll || Boolean(sellingCardId) || summary.sellableCopies <= 0) && styles.disabled,
              ]}
            >
              {sellingAll ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="flash" size={19} color="#07111F" />}
              <View style={styles.sellAllCopy}>
                <Text style={styles.sellAllTitle}>{sellingAll ? 'VENDENDO COM SEGURANÇA…' : 'VENDER TODAS AS REPETIDAS'}</Text>
                <Text style={styles.sellAllMeta}>
                  {summary.sellableCopies.toLocaleString('pt-BR')} cópias • estimado 🪙 {summary.estimatedCoins.toLocaleString('pt-BR')}
                </Text>
              </View>
              {!sellingAll ? <Ionicons name="chevron-forward" size={19} color="#07111F" /> : null}
            </Pressable>

            {summary.skippedCopies > 0 ? (
              <Text style={[styles.skipHint, { color: colors.muted }]}>
                {summary.skippedCopies.toLocaleString('pt-BR')} repetida(s) sem cotação não entram na venda em lote e continuarão na sua Bag.
              </Text>
            ) : null}

            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={19} color={colors.muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar Pokémon, set ou raridade..."
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={19} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Suas repetidas</Text>
              <Text style={[styles.sectionMeta, { color: colors.muted }]}>{filtered.length} cartas</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => {
          const card = item.cards;
          if (!card) return null;
          const available = Math.max(0, Number(item.quantity ?? 0) - 1);
          const unitCoins = Number(item.sale?.unitCoins ?? 0);
          const selling = sellingCardId === card.id;
          return (
            <View style={[styles.cardRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.imageWrap, { backgroundColor: colors.surfaceAlt }]}>
                {card.image_small ? (
                  <Image source={{ uri: card.image_small }} style={styles.image} resizeMode="contain" />
                ) : (
                  <Ionicons name="image-outline" size={30} color={colors.muted} />
                )}
              </View>
              <View style={styles.cardBody}>
                <View style={styles.nameRow}>
                  <View style={styles.nameWrap}>
                    <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.pokemon_name}</Text>
                    <Text numberOfLines={1} style={[styles.cardSet, { color: colors.muted }]}>{card.set_name}</Text>
                  </View>
                  <View style={[styles.quantityBadge, { backgroundColor: colors.yellow }]}>
                    <Text style={styles.quantityText}>×{item.quantity}</Text>
                  </View>
                </View>

                <View style={styles.priceRow}>
                  <Text style={[styles.marketPrice, { color: colors.muted }]}>
                    {card.market_price_usd != null ? formatUsd(card.market_price_usd) : 'Sem cotação'}
                  </Text>
                  <Text style={[styles.coinPrice, { color: unitCoins > 0 ? colors.yellow : colors.muted }]}>
                    {unitCoins > 0 ? `🪙 ${unitCoins.toLocaleString('pt-BR')} / cópia` : 'Indisponível'}
                  </Text>
                </View>

                <Text style={[styles.protectedText, { color: colors.muted }]}>
                  {available} repetida(s) disponível(is) • 1 cópia protegida
                </Text>
                <Text style={[styles.saleDetails, { color: colors.muted }]}>
                  Tier {item.sale.rarityTier} • raridade ×{item.sale.rarityMultiplier.toFixed(2)}
                  {item.sale.dropChancePct != null ? ` • chance ~${item.sale.dropChancePct < 0.1 ? item.sale.dropChancePct.toFixed(3) : item.sale.dropChancePct.toFixed(2)}%` : ''}
                  {item.sale.dropMultiplier !== 1 ? ` • drop ×${item.sale.dropMultiplier.toFixed(2)}` : ''}
                  {item.sale.coinPackCap != null ? ` • teto 🪙 ${item.sale.coinPackCap.toLocaleString('pt-BR')}` : ''}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    disabled={sellingAll || selling || unitCoins <= 0}
                    onPress={() => confirmSale(item, 1)}
                    style={[
                      styles.secondaryButton,
                      { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
                      (sellingAll || selling || unitCoins <= 0) && styles.disabled,
                    ]}
                  >
                    {selling ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="cash-outline" size={16} color={colors.text} />}
                    <Text style={[styles.secondaryText, { color: colors.text }]}>VENDER 1</Text>
                  </Pressable>
                  <Pressable
                    disabled={sellingAll || selling || unitCoins <= 0 || available <= 0}
                    onPress={() => confirmSale(item, available)}
                    style={[
                      styles.primaryButton,
                      { backgroundColor: colors.yellow },
                      (sellingAll || selling || unitCoins <= 0 || available <= 0) && styles.disabled,
                    ]}
                  >
                    <Ionicons name="layers-outline" size={16} color="#07111F" />
                    <Text style={styles.primaryText}>VENDER {available}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="copy-outline" size={34} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {search ? 'Nenhuma repetida encontrada' : 'Você não tem cartas repetidas'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Quando tiver 2 ou mais cópias da mesma carta, ela aparecerá aqui.
            </Text>
          </View>
        ) : (
          <ActivityIndicator size="large" color={colors.yellow} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 16, paddingBottom: 42, gap: 10 },
  header: { gap: 14, marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { fontSize: 29, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  ruleCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center' },
  ruleIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  ruleText: { flex: 1 },
  ruleTitle: { fontSize: 13, fontWeight: '900' },
  ruleBody: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, borderRadius: 17, borderWidth: 1, padding: 13 },
  summaryLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { fontSize: 20, fontWeight: '900', marginTop: 5 },
  sellAllButton: { minHeight: 58, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sellAllCopy: { flex: 1, minWidth: 0 },
  sellAllTitle: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .4 },
  sellAllMeta: { color: '#4A4011', fontSize: 8, fontWeight: '800', marginTop: 2 },
  skipHint: { fontSize: 8, lineHeight: 12, fontWeight: '700', marginTop: -5 },
  searchBox: { minHeight: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, minHeight: 48, fontSize: 13 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  sectionMeta: { fontSize: 10, fontWeight: '800' },
  cardRow: { borderWidth: 1, borderRadius: 19, padding: 10, flexDirection: 'row', gap: 11, marginBottom: 10 },
  imageWrap: { width: 94, aspectRatio: .72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  cardBody: { flex: 1, minWidth: 0, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  nameWrap: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: '900' },
  cardSet: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  quantityBadge: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, alignItems: 'center' },
  quantityText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 10 },
  marketPrice: { fontSize: 10, fontWeight: '700' },
  coinPrice: { fontSize: 11, fontWeight: '900' },
  protectedText: { fontSize: 9, marginTop: 5 },
  saleDetails: { fontSize: 8, lineHeight: 12, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 10 },
  secondaryButton: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secondaryText: { fontSize: 8, fontWeight: '900' },
  primaryButton: { flex: 1, minHeight: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { color: '#07111F', fontSize: 8, fontWeight: '900' },
  disabled: { opacity: .5 },
  empty: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', gap: 8, marginTop: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
