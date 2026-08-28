import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getOwnedCard, type OwnedCardEntry } from '@/services/player';
import { setCardFavorite } from '@/services/playerActions';
import { formatUsd } from '@/services/market';
import { getBattleCardPreview } from '@/services/battleStats';
import { getCardPriceHistory, type CardPricePoint } from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { isCardWishlisted, setCardWishlist } from '@/services/retention';

export default function CardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const [entry, setEntry] = useState<OwnedCardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wishlistSaving, setWishlistSaving] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [priceHistory, setPriceHistory] = useState<CardPricePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [owned, wanted, history] = await Promise.all([
        getOwnedCard(String(id)),
        isCardWishlisted(String(id)),
        getCardPriceHistory(String(id), 30),
      ]);
      setEntry(owned);
      setWishlisted(wanted);
      setPriceHistory(history);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar este card.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggleFavorite() {
    if (!entry?.cards || saving) return;
    const next = !entry.favorite;
    try { setSaving(true); await setCardFavorite(entry.cards.id, next); setEntry((current) => current ? { ...current, favorite: next } : current); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o favorito.'); }
    finally { setSaving(false); }
  }

  async function toggleWishlist() {
    if (!entry?.cards || wishlistSaving) return;
    const next = !wishlisted;
    try {
      setWishlistSaving(true);
      await setCardWishlist(entry.cards.id, next);
      setWishlisted(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o Card Chase.');
    } finally {
      setWishlistSaving(false);
    }
  }

  const card = entry?.cards;
  const combat = getBattleCardPreview(card ?? null);
  const unitValue = Number(card?.game_value ?? 0);
  const marketPriceUsd = card?.market_price_usd == null ? null : Number(card.market_price_usd);
  const totalMarketValueUsd = marketPriceUsd == null ? null : marketPriceUsd * Number(entry?.quantity ?? 0);
  const historyMin = priceHistory.length ? Math.min(...priceHistory.map((point) => point.priceUsd)) : 0;
  const historyMax = priceHistory.length ? Math.max(...priceHistory.map((point) => point.priceUsd)) : 0;
  const historyRange = Math.max(.01, historyMax - historyMin);
  const historyDelta = priceHistory.length > 1 ? priceHistory[priceHistory.length - 1].priceUsd - priceHistory[0].priceUsd : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <Text style={[styles.topTitle, { color: colors.muted }]}>DETALHES DO CARD</Text>
          <Pressable style={[styles.iconButton, { backgroundColor: entry?.favorite ? '#B73C59' : colors.surface, borderColor: entry?.favorite ? '#E8657F' : colors.border }]} onPress={toggleFavorite} disabled={!card || saving}><Ionicons name={entry?.favorite ? 'heart' : 'heart-outline'} size={22} color={entry?.favorite ? '#fff' : colors.yellow} /></Pressable>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.yellow} style={{ marginTop: 80 }} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9C9C" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && card ? <View style={styles.layout}>
          <View style={[styles.imagePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>{card.image_large || card.image_small ? <Image source={{ uri: card.image_large ?? card.image_small ?? '' }} resizeMode="contain" style={styles.image} /> : <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="image-outline" size={56} color={colors.muted} /></View>}</View>
          <View style={[styles.infoPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>#{card.pokedex_numbers?.[0] ?? '---'} • {card.set_id.toUpperCase()}</Text>
            <Text style={[styles.name, { color: colors.text }]}>{card.pokemon_name}</Text>
            <Text style={[styles.rarity, { color: colors.muted }]}>{card.rarity ?? 'Sem raridade informada'}</Text>

            <View style={[styles.valueHero, { backgroundColor: colors.accentSoft, borderColor: colors.yellow }]}><View style={[styles.valueIcon, { backgroundColor: colors.surface }]}><Ionicons name="cash" size={24} color={colors.yellow} /></View><View style={{ flex: 1 }}><Text style={[styles.valueLabel, { color: colors.muted }]}>VALOR DE MERCADO EM USD</Text><Text style={[styles.valueNumber, { color: colors.yellow }]}>{marketPriceUsd == null ? 'US$ —' : formatUsd(marketPriceUsd)}</Text><Text style={[styles.valueHint, { color: colors.muted }]}>{marketPriceUsd == null ? 'Preço TCGplayer indisponível para esta carta.' : 'Snapshot de mercado TCGplayer'}</Text></View></View>

            <View style={[styles.battlePanel,{backgroundColor:colors.surfaceAlt,borderColor:colors.accent}]}>
              <View style={styles.battlePanelHead}>
                <View>
                  <Text style={[styles.valueLabel,{color:colors.muted}]}>ESTATÍSTICAS DE BATALHA • REGRA V4</Text>
                  <Text style={[styles.battlePower,{color:colors.yellow}]}>⚔ PWR {combat.battleRating} / 1000</Text>
                </View>
                <Ionicons name="flash" size={24} color={colors.accent}/>
              </View>
              <View style={styles.battleStatsGrid}>
                <BattleStat label="HP" value={combat.hp} />
                <BattleStat label="ATAQUE" value={combat.maxDamage} />
                <BattleStat label="ENERGIA" value={combat.bestEnergy} />
                <BattleStat label="EFICIÊNCIA" value={combat.efficiencyScore} suffix="/100" />
                <BattleStat label="VELOCIDADE" value={combat.speedScore} suffix="/100" />
                <BattleStat label="TÉCNICA" value={combat.techniqueScore} suffix="/100" />
              </View>
              <Text style={[styles.battleHint,{color:colors.muted}]}>
                O PWR compara a força geral da carta. Na batalha real, fraqueza, resistência e o tempo para nocautear o oponente podem mudar completamente o resultado.
              </Text>
            </View>

            {priceHistory.length ? <View style={[styles.historyPanel, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <View style={styles.historyHead}>
                <View><Text style={[styles.valueLabel, { color: colors.muted }]}>HISTÓRICO DE PREÇO</Text><Text style={[styles.historyValue, { color: colors.text }]}>{formatUsd(priceHistory[priceHistory.length - 1].priceUsd)}</Text></View>
                <Text style={[styles.historyDelta, { color: historyDelta >= 0 ? '#65D894' : '#FF8290' }]}>{historyDelta >= 0 ? '+' : ''}{formatUsd(historyDelta)}</Text>
              </View>
              <View style={styles.chart}>
                {priceHistory.map((point, index) => {
                  const height = 18 + ((point.priceUsd - historyMin) / historyRange) * 72;
                  return <View key={point.recordedAt + '-' + index} style={styles.barSlot}><View style={[styles.bar, { height, backgroundColor: colors.accent }]} /></View>;
                })}
              </View>
              <View style={styles.historyDates}><Text style={[styles.historyDate, { color: colors.muted }]}>{new Date(priceHistory[0].recordedAt).toLocaleDateString('pt-BR')}</Text><Text style={[styles.historyDate, { color: colors.muted }]}>Mín. {formatUsd(historyMin)} • Máx. {formatUsd(historyMax)}</Text><Text style={[styles.historyDate, { color: colors.muted }]}>{new Date(priceHistory[priceHistory.length - 1].recordedAt).toLocaleDateString('pt-BR')}</Text></View>
            </View> : null}

            <View style={styles.badges}>{(card.types ?? []).map((type) => <View key={type} style={[styles.badge, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.text }]}>{type}</Text></View>)}</View>
            <View style={styles.statsGrid}><Info label="SET" value={card.set_name} /><Info label="NÚMERO" value={card.card_number ?? '—'} /><Info label="QUANTIDADE" value={`×${entry.quantity}`} /><Info label="VALOR TOTAL EM USD" value={totalMarketValueUsd == null ? '—' : formatUsd(totalMarketValueUsd)} /><Info label="VALOR NO JOGO" value={`🪙 ${unitValue.toLocaleString('pt-BR')}`} /><Info label="OBTIDO" value={new Date(entry.first_obtained_at).toLocaleDateString('pt-BR')} /></View>
            <View style={styles.cardActions}>
              <Pressable style={[styles.favoriteButton, styles.flexAction, { backgroundColor: entry.favorite ? '#B73C59' : colors.yellow }]} onPress={toggleFavorite} disabled={saving}><Ionicons name={entry.favorite ? 'heart' : 'heart-outline'} size={19} color={entry.favorite ? '#fff' : '#07111F'} /><Text style={[styles.favoriteButtonText, entry.favorite && { color: '#fff' }]}>{saving ? 'SALVANDO...' : entry.favorite ? 'REMOVER FAVORITO' : 'FAVORITAR'}</Text></Pressable>
              <Pressable style={[styles.favoriteButton, styles.flexAction, { backgroundColor: wishlisted ? '#FFD447' : colors.accentSoft, borderWidth: 1, borderColor: wishlisted ? '#FFD447' : colors.accent }]} onPress={toggleWishlist} disabled={wishlistSaving}><Ionicons name={wishlisted ? 'star' : 'star-outline'} size={19} color={wishlisted ? '#07111F' : colors.accent} /><Text style={[styles.favoriteButtonText, { color: wishlisted ? '#07111F' : colors.text }]}>{wishlistSaving ? 'SALVANDO...' : wishlisted ? 'NO CARD CHASE' : 'QUERO ESTA CARTA'}</Text></Pressable>
            </View>
          </View>
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function BattleStat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) { const { colors } = useAppTheme(); return <View style={[styles.battleStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.battleStatLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.battleStatValue,{color:colors.text}]}>{Number(value).toLocaleString('pt-BR')}{suffix}</Text></View>; }

function Info({ label, value }: { label: string; value: string }) { const { colors } = useAppTheme(); return <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 44, gap: 18 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, errorBox: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 16, padding: 13, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { color: '#FFD7D7', fontWeight: '700', flex: 1 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'center' }, imagePanel: { flexGrow: 1, flexBasis: 330, maxWidth: 480, minHeight: 470, borderRadius: 26, padding: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, image: { width: '100%', height: 570, maxHeight: 570 }, imagePlaceholder: { width: '100%', height: 480, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, infoPanel: { flexGrow: 1, flexBasis: 320, maxWidth: 560, borderRadius: 26, padding: 22, borderWidth: 1 }, kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, name: { fontSize: 34, lineHeight: 40, fontWeight: '900', marginTop: 5 }, rarity: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  cardActions: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:20 },
  flexAction: { flexGrow:1, minWidth:190, marginTop:0 },
  battlePanel:{marginTop:12,borderRadius:18,borderWidth:1,padding:13,gap:10},
  battlePanelHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  battlePower:{fontSize:21,fontWeight:'900',marginTop:3},
  battleStatsGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
  battleStat:{flexGrow:1,flexBasis:110,minWidth:100,borderRadius:13,borderWidth:1,padding:9},
  battleStatLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7},
  battleStatValue:{fontSize:14,fontWeight:'900',marginTop:3},
  battleHint:{fontSize:8,lineHeight:13,fontWeight:'700'},
  historyPanel: { marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 12 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  historyValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  historyDelta: { fontSize: 11, fontWeight: '900' },
  chart: { height: 96, marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minWidth: 2, borderRadius: 3 },
  historyDates: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  historyDate: { fontSize: 7, fontWeight: '700' },
  valueHero: { marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, valueIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, valueLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, valueNumber: { fontSize: 24, fontWeight: '900', marginTop: 2 }, valueHint: { fontSize: 8, lineHeight: 12, marginTop: 2 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, badge: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 }, badgeText: { fontSize: 11, fontWeight: '900' }, statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }, infoCard: { width: '48%', minHeight: 82, borderRadius: 16, padding: 13, borderWidth: 1 }, infoLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }, infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 5 }, favoriteButton: { marginTop: 20, minHeight: 52, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, favoriteButtonText: { color: '#07111F', fontSize: 11, fontWeight: '900', letterSpacing: .4 },
});
