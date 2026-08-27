import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { BoosterPack2D } from '@/components/BoosterPack2D';
import { PackOpeningModal } from '@/components/PackOpeningModal';
import { listPacks, openPack, type OpenedCard, type Pack } from '@/services/packs';
import { getMyProfile } from '@/services/player';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE = 18;
type Notice = { kind: 'error' | 'success'; text: string } | null;

export default function PacksScreen() {
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try { setLoading(true); const [packRows, profile] = await Promise.all([listPacks(), getMyProfile()]); setPacks(packRows); setCoins(profile.coins); }
    catch { setNotice({ kind: 'error', text: 'Não foi possível atualizar a loja agora.' }); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => { const term = search.trim().toLowerCase(); return !term ? packs : packs.filter((pack) => pack.name.toLowerCase().includes(term) || pack.set_id.toLowerCase().includes(term)); }, [packs, search]);
  const visiblePacks = filtered.slice(0, visibleCount);
  const isMobile = width < 560;
  const packWidth = isMobile ? '100%' : width >= 1100 ? '32.4%' : '49%';
  const artWidth = isMobile ? Math.min(218, Math.max(194, width - 142)) : width >= 1100 ? 162 : 174;
  const displayHeight = isMobile ? Math.round(artWidth * 1.82) : 315;

  function choosePack(pack: Pack) {
    if (coins < pack.price) { setNotice({ kind: 'error', text: `Moedas insuficientes: você tem 🪙 ${coins.toLocaleString('pt-BR')} e este booster custa 🪙 ${pack.price.toLocaleString('pt-BR')}.` }); return; }
    setNotice(null); setSelectedPack(pack);
  }

  async function purchaseSelectedPack(): Promise<OpenedCard[]> {
    if (!selectedPack) throw new Error('Nenhum booster selecionado.');
    const before = await getMyProfile(); setCoins(before.coins);
    if (before.coins < selectedPack.price) throw new Error(`Moedas insuficientes. Seu saldo atual é 🪙 ${before.coins.toLocaleString('pt-BR')}.`);
    try { const result = await openPack(selectedPack.id); const after = await getMyProfile(); setCoins(after.coins); return result.cards; }
    catch (error) { const refreshed = await getMyProfile().catch(() => null); if (refreshed) setCoins(refreshed.coins); throw error; }
  }

  return <Screen title="Pack Shop" subtitle="Escolha um booster 2D, rasgue o lacre e revele seus cards.">
    <View style={[styles.balanceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}><View><Text style={[styles.balanceLabel, { color: colors.muted }]}>SEU SALDO</Text><Text style={[styles.balanceValue, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}</Text></View><View style={[styles.balanceBadge, { backgroundColor: colors.accentSoft }]}><Ionicons name="wallet-outline" size={20} color={colors.yellow} /></View></View>
    {notice ? <View style={[styles.notice, { backgroundColor: notice.kind === 'error' ? (isLight ? '#FFE8EC' : '#351A24') : (isLight ? '#E3F8EB' : '#142C23'), borderColor: notice.kind === 'error' ? '#C96B7A' : '#4A9B70' }]}><Ionicons name={notice.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={21} color={notice.kind === 'error' ? '#D34F62' : '#45B777'} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice.text}</Text><Pressable onPress={() => setNotice(null)} hitSlop={8}><Ionicons name="close" size={19} color={colors.text} /></Pressable></View> : null}

    <View style={[styles.shopHero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><View style={[styles.shopHeroIcon, { backgroundColor: colors.surface }]}><Ionicons name="sparkles" size={22} color={colors.yellow} /></View><View style={{ flex: 1 }}><Text style={[styles.shopHeroKicker, { color: colors.yellow }]}>BOOSTER WALL</Text><Text style={[styles.shopHeroTitle, { color: colors.text }]}>{packs.length || 173} packs para colecionar</Text><Text style={[styles.shopHeroText, { color: colors.muted }]}>Cada embalagem usa arte e identidade da própria coleção para parecer um booster físico na sua prateleira.</Text></View></View>

    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.muted} /><TextInput value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(PAGE_SIZE); }} placeholder="Buscar booster ou set..." placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.searchInput, { color: colors.text }]} />{search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={colors.muted} /></Pressable> : null}</View>
    <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.text }]}>Boosters</Text><Text style={[styles.resultCount, { color: colors.muted }]}>{filtered.length} encontrados</Text></View>
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

    <View style={styles.packGrid}>{visiblePacks.map((pack) => {
      const affordable = coins >= pack.price;
      return <Pressable key={pack.id} onPress={() => choosePack(pack)} style={[styles.pack, isMobile && styles.packMobile, { width: packWidth as any, backgroundColor: colors.surface, borderColor: colors.border }, !affordable && styles.packUnaffordable]}>
        <View style={[styles.displayCase, isMobile && styles.displayCaseMobile, { height: displayHeight, backgroundColor: colors.surfaceAlt }]}><View style={[styles.spotlight, { backgroundColor: colors.accent }]} /><BoosterPack2D pack={pack} width={artWidth} /><View style={styles.shelfShadow} /><View style={[styles.cardCountBadge, { backgroundColor: colors.bg }]}><Text style={[styles.cardCountText, { color: colors.text }]}>{pack.cards_per_pack} cards</Text></View></View>
        <View style={styles.packTitleRow}><View style={{ flex: 1 }}><Text numberOfLines={2} style={[styles.packName, { color: colors.text }]}>{pack.name}</Text><Text style={[styles.setId, { color: colors.muted }]}>{pack.set_id.toUpperCase()}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted} /></View>
        <View style={styles.packFooter}><Text style={[styles.price, { color: affordable ? colors.yellow : colors.muted }]}>🪙 {pack.price.toLocaleString('pt-BR')}</Text><View style={[styles.openButton, { backgroundColor: affordable ? colors.yellow : colors.surfaceAlt, borderColor: affordable ? colors.yellow : colors.border }]}><Text style={[styles.openButtonText, { color: affordable ? '#07111F' : colors.muted }]}>{affordable ? 'ABRIR PACK' : 'SEM SALDO'}</Text></View></View>
      </Pressable>;
    })}</View>

    {!loading && filtered.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search-outline" size={30} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum booster encontrado</Text></View> : null}
    {visibleCount < filtered.length ? <Pressable style={[styles.loadMore, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setVisibleCount((value) => value + PAGE_SIZE)}><Text style={[styles.loadMoreText, { color: colors.accent }]}>VER MAIS BOOSTERS</Text><Ionicons name="chevron-down" size={18} color={colors.accent} /></Pressable> : null}
    <PackOpeningModal visible={selectedPack !== null} pack={selectedPack} onClose={() => setSelectedPack(null)} onPurchase={purchaseSelectedPack} onFinished={() => setNotice({ kind: 'success', text: 'Booster aberto! Os cards já estão na sua Bag, você ganhou +20 XP e avançou suas missões.' })} />
  </Screen>;
}

const styles = StyleSheet.create({
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1 }, balanceLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, balanceValue: { fontSize: 22, fontWeight: '900', marginTop: 2 }, balanceBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 }, noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' }, shopHero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, borderWidth: 1 }, shopHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, shopHeroKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, shopHeroTitle: { fontSize: 19, fontWeight: '900', marginTop: 2 }, shopHeroText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  searchBox: { height: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1 }, searchInput: { flex: 1, fontSize: 14, height: '100%' }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }, sectionTitle: { fontSize: 21, fontWeight: '900' }, resultCount: { fontSize: 12, fontWeight: '700' },
  packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, pack: { borderRadius: 20, padding: 9, borderWidth: 1 }, packMobile: { padding: 10, borderRadius: 22 }, packUnaffordable: { opacity: .72 }, displayCase: { minHeight: 315, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }, displayCaseMobile: { paddingVertical: 12 }, spotlight: { position: 'absolute', top: -80, width: 230, height: 260, borderRadius: 130, opacity: .14, transform: [{ scaleX: 1.45 }] }, shelfShadow: { position: 'absolute', bottom: 21, width: 155, height: 22, borderRadius: 80, backgroundColor: 'rgba(0,0,0,.56)', transform: [{ scaleX: 1.12 }] }, cardCountBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, opacity: .9 }, cardCountText: { fontSize: 8, fontWeight: '900' }, packTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 }, packName: { fontSize: 14, lineHeight: 18, fontWeight: '900', minHeight: 36 }, setId: { fontSize: 9, fontWeight: '800', marginTop: 2 }, packFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }, price: { fontSize: 13, fontWeight: '900' }, openButton: { minHeight: 40, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, openButtonText: { fontSize: 9, fontWeight: '900', letterSpacing: .3 },
  empty: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1 }, emptyTitle: { fontSize: 17, fontWeight: '900' }, loadMore: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, borderWidth: 1 }, loadMoreText: { fontWeight: '900', fontSize: 11, letterSpacing: .5 },
});
