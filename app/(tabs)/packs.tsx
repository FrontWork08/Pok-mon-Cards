import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PackOpeningModal } from '@/components/PackOpeningModal';
import { listPacks, openPack, type OpenedCard, type Pack } from '@/services/packs';
import { getMyProfile } from '@/services/player';
import { gameTheme } from '@/theme/gameTheme';

const PAGE_SIZE = 18;
type Notice = { kind: 'error' | 'success'; text: string } | null;

export default function PacksScreen() {
  const { width } = useWindowDimensions();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [packData, profile] = await Promise.all([listPacks(), getMyProfile()]);
      setPacks(packData);
      setCoins(profile.coins);
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível atualizar a loja agora.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packs;
    return packs.filter((pack) => pack.name.toLowerCase().includes(term) || pack.set_id.toLowerCase().includes(term));
  }, [packs, search]);

  const visiblePacks = filtered.slice(0, visibleCount);
  const packWidth = width < 540 ? '100%' : width >= 1050 ? '32.4%' : '49%';

  function choosePack(pack: Pack) {
    if (coins < pack.price) {
      setNotice({ kind: 'error', text: `Moedas insuficientes: você tem 🪙 ${coins.toLocaleString('pt-BR')} e este booster custa 🪙 ${pack.price.toLocaleString('pt-BR')}.` });
      return;
    }
    setNotice(null);
    setSelectedPack(pack);
  }

  async function purchaseSelectedPack(): Promise<OpenedCard[]> {
    if (!selectedPack) throw new Error('Nenhum booster selecionado.');
    const before = await getMyProfile();
    setCoins(before.coins);
    if (before.coins < selectedPack.price) throw new Error(`Moedas insuficientes. Seu saldo atual é 🪙 ${before.coins.toLocaleString('pt-BR')}.`);

    try {
      const result = await openPack(selectedPack.id);
      const after = await getMyProfile();
      setCoins(after.coins);
      return result.cards;
    } catch (error) {
      const refreshed = await getMyProfile().catch(() => null);
      if (refreshed) setCoins(refreshed.coins);
      throw error;
    }
  }

  return (
    <Screen title="Pack Shop" subtitle="Escolha uma coleção, abra o booster e torça pelo pull raro.">
      <View style={styles.balanceRow}>
        <View><Text style={styles.balanceLabel}>SEU SALDO</Text><Text style={styles.balanceValue}>🪙 {coins.toLocaleString('pt-BR')}</Text></View>
        <View style={styles.balanceBadge}><Ionicons name="wallet-outline" size={20} color={gameTheme.colors.yellow} /></View>
      </View>

      {notice ? (
        <View style={[styles.notice, notice.kind === 'error' ? styles.noticeError : styles.noticeSuccess]}>
          <Ionicons name={notice.kind === 'error' ? 'alert-circle' : 'checkmark-circle'} size={21} color={notice.kind === 'error' ? '#FF9C9C' : '#72DEA0'} />
          <Text style={styles.noticeText}>{notice.text}</Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8}><Ionicons name="close" size={19} color="#D7E2F2" /></Pressable>
        </View>
      ) : null}

      <View style={styles.shopHero}>
        <View style={styles.shopHeroIcon}><Ionicons name="sparkles" size={22} color={gameTheme.colors.yellow} /></View>
        <View style={{ flex: 1 }}><Text style={styles.shopHeroKicker}>CATÁLOGO ONLINE</Text><Text style={styles.shopHeroTitle}>{packs.length || 173} boosters disponíveis</Text><Text style={styles.shopHeroText}>Somente cards de Pokémon. Energy e Trainer ficam fora dos packs.</Text></View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={gameTheme.colors.muted} />
        <TextInput value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(PAGE_SIZE); }} placeholder="Buscar booster ou set..." placeholderTextColor="#70839F" autoCapitalize="none" style={styles.searchInput} />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={gameTheme.colors.muted} /></Pressable> : null}
      </View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Boosters</Text><Text style={styles.resultCount}>{filtered.length} encontrados</Text></View>
      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      {!loading && filtered.length === 0 ? (
        <View style={styles.empty}><Ionicons name="search-outline" size={30} color={gameTheme.colors.muted} /><Text style={styles.emptyTitle}>Nenhum booster encontrado</Text><Text style={styles.muted}>Tente pesquisar por outro nome de coleção.</Text></View>
      ) : null}

      <View style={styles.packGrid}>
        {visiblePacks.map((pack) => {
          const affordable = coins >= pack.price;
          return (
            <View key={pack.id} style={[styles.pack, { width: packWidth as any }, !affordable && styles.packUnaffordable]}>
              <View style={styles.imageWrap}>
                <View style={styles.foilPack}>
                  <View style={styles.foilTop} />
                  <View style={styles.foilGlow} />
                  <Text style={styles.foilKicker}>POKÉMON TCG</Text>
                  {pack.image_url ? <Image source={{ uri: pack.image_url }} style={styles.packImage} resizeMode="contain" /> : <View style={styles.placeholder}><Ionicons name="cube" size={38} color="#7FA2D2" /><Text style={styles.placeholderText}>BOOSTER</Text></View>}
                  <Text style={styles.foilSet}>{pack.set_id.toUpperCase()}</Text>
                  <View style={styles.foilBottom} />
                </View>
                <View style={styles.cardCountBadge}><Text style={styles.cardCountText}>{pack.cards_per_pack} cards</Text></View>
              </View>
              <Text numberOfLines={2} style={styles.packName}>{pack.name}</Text>
              <Text numberOfLines={1} style={styles.setId}>{pack.set_id.toUpperCase()}</Text>
              <View style={styles.packFooter}>
                <Text style={[styles.price, !affordable && styles.priceDisabled]}>🪙 {pack.price}</Text>
                <Pressable style={[styles.openButton, !affordable && styles.noBalanceButton]} onPress={() => choosePack(pack)}><Text style={styles.openButtonText}>{affordable ? 'ABRIR' : 'SEM SALDO'}</Text></Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {visibleCount < filtered.length ? (
        <Pressable style={styles.loadMore} onPress={() => setVisibleCount((value) => value + PAGE_SIZE)}><Text style={styles.loadMoreText}>VER MAIS BOOSTERS</Text><Ionicons name="chevron-down" size={18} color={gameTheme.colors.blue} /></Pressable>
      ) : null}

      <PackOpeningModal
        visible={selectedPack !== null}
        pack={selectedPack}
        onClose={() => setSelectedPack(null)}
        onPurchase={purchaseSelectedPack}
        onFinished={() => setNotice({ kind: 'success', text: 'Booster aberto! Os cards já estão na sua Bag e você ganhou +20 XP.' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#141F31', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: '#273C59' },
  balanceLabel: { color: '#7990AD', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  balanceValue: { color: gameTheme.colors.yellow, fontSize: 22, fontWeight: '900', marginTop: 2 },
  balanceBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#2C291B', alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  noticeError: { backgroundColor: '#351A24', borderColor: '#683243' },
  noticeSuccess: { backgroundColor: '#142C23', borderColor: '#27553E' },
  noticeText: { flex: 1, color: '#F2F6FC', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  shopHero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#132A45', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#27486E' },
  shopHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#302B19' },
  shopHeroKicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  shopHeroTitle: { color: gameTheme.colors.text, fontSize: 19, fontWeight: '900', marginTop: 2 },
  shopHeroText: { color: '#9FB2CB', fontSize: 12, lineHeight: 17, marginTop: 3 },
  searchBox: { height: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: gameTheme.colors.surface, borderWidth: 1, borderColor: gameTheme.colors.border },
  searchInput: { flex: 1, color: gameTheme.colors.text, fontSize: 14, height: '100%' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { color: gameTheme.colors.text, fontSize: 21, fontWeight: '900' },
  resultCount: { color: gameTheme.colors.muted, fontSize: 12, fontWeight: '700' },
  empty: { backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: gameTheme.colors.border },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  muted: { color: gameTheme.colors.muted, fontSize: 13, textAlign: 'center' },
  packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pack: { backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: gameTheme.colors.border },
  packUnaffordable: { opacity: 0.78 },
  imageWrap: { height: 270, borderRadius: 16, backgroundColor: '#081421', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  foilPack: { width: 155, height: 230, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#152B4B', borderWidth: 1, borderColor: '#3A628F' },
  foilTop: { position: 'absolute', top: 0, width: '100%', height: 14, backgroundColor: '#D9B83E', opacity: 0.85 },
  foilBottom: { position: 'absolute', bottom: 0, width: '100%', height: 14, backgroundColor: '#D9B83E', opacity: 0.85 },
  foilGlow: { position: 'absolute', width: 210, height: 70, backgroundColor: '#3269AA', opacity: 0.26, transform: [{ rotate: '-25deg' }] },
  foilKicker: { position: 'absolute', top: 22, color: '#D9E7FB', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  foilSet: { position: 'absolute', bottom: 23, color: '#A8BED9', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  packImage: { width: '88%', height: '62%' },
  placeholder: { alignItems: 'center', gap: 8 },
  placeholderText: { color: '#8AA8CE', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  cardCountBadge: { position: 'absolute', top: 9, right: 9, backgroundColor: '#07111FDD', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  cardCountText: { color: '#C5D4E8', fontSize: 9, fontWeight: '800' },
  packName: { color: gameTheme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 10, minHeight: 36 },
  setId: { color: '#6F85A4', fontSize: 10, fontWeight: '800', marginTop: 2 },
  packFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  price: { color: gameTheme.colors.yellow, fontSize: 13, fontWeight: '900' },
  priceDisabled: { color: '#7D8797' },
  openButton: { backgroundColor: gameTheme.colors.blue, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11 },
  noBalanceButton: { backgroundColor: '#5A3340' },
  openButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  loadMore: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: gameTheme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: gameTheme.colors.border },
  loadMoreText: { color: gameTheme.colors.blue, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
});
