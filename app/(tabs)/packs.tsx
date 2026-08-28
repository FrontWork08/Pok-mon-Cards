import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { BoosterPack2D } from '@/components/BoosterPack2D';
import { PackContentsModal } from '@/components/PackContentsModal';
import { PackOpeningModal } from '@/components/PackOpeningModal';
import { PremiumBackground } from '@/components/PremiumBackground';
import {
  exchangeCoinsForDiamonds,
  getFavoritePackIds,
  getLegendaryPackConfig,
  listPacks,
  openLegendaryDiamondPack,
  openPack,
  setPackFavorite,
  type OpenedCard,
  type Pack,
} from '@/services/packs';
import { getMyProfile } from '@/services/player';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type Notice = { kind: 'error' | 'success'; text: string } | null;
type SortMode = 'newest' | 'oldest' | 'rarity-high' | 'rarity-low' | 'price-high' | 'price-low' | 'az';
type GenerationFilter = 'all' | number;

const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'newest', label: 'MAIS NOVOS' },
  { id: 'oldest', label: 'MAIS ANTIGOS' },
  { id: 'rarity-high', label: 'MAIS RAROS' },
  { id: 'rarity-low', label: 'MENOS RAROS' },
  { id: 'price-high', label: 'MAIOR PREÇO' },
  { id: 'price-low', label: 'MENOR PREÇO' },
  { id: 'az', label: 'A–Z' },
];

const DIAMOND_PACK_BASE: Pack = {
  id:'diamond-legendary',name:'Cofre Lendário',set_id:'legendary-vault',
  price:25,base_price:25,free_until:null,cards_per_pack:1,image_url:null,art_url:null,
  booster_art_url:null,booster_art_urls:[],booster_back_url:null,booster_logo_url:null,
  booster_art_source:'trainer-vault',release_date:null,generation:null,rarity_score:999,active:true,currency:'diamonds',
};

export default function PacksScreen() {
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const wallet = useWallet();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [coins, setCoins] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [diamondCost, setDiamondCost] = useState(25);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [generationFilter, setGenerationFilter] = useState<GenerationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [contentsPack, setContentsPack] = useState<Pack | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [clock, setClock] = useState(Date.now());

  const isMobile = width < 560;
  const columns = isMobile ? 1 : width >= 1100 ? 3 : 2;
  const artWidth = isMobile
    ? Math.min(218, Math.max(194, width - 142))
    : width >= 1100 ? 162 : 174;
  const displayHeight = isMobile ? Math.round(artWidth * 1.82) : 315;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [packRows, profile, favorites, legendaryConfig] = await Promise.all([
        listPacks(),
        getMyProfile(),
        getFavoritePackIds(),
        getLegendaryPackConfig(),
      ]);
      setPacks(packRows);
      setSelectedPack((current) => current ? packRows.find((pack) => pack.id === current.id) ?? null : null);
      setCoins(profile.coins);
      setDiamonds(profile.diamonds);
      setDiamondCost(legendaryConfig.costDiamonds);
      setFavoriteIds(new Set(favorites));
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível atualizar a loja agora.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const diamondPack = useMemo(
    () => ({ ...DIAMOND_PACK_BASE, price: diamondCost, base_price: diamondCost }),
    [diamondCost],
  );

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const channel = supabase
      .channel(`free-booster-shop-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_game_events' },
        () => { void load(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const freeUntil = packs.find((pack) => pack.free_until)?.free_until ?? null;

  useEffect(() => {
    if (!freeUntil) return;
    const delay = Math.max(0, new Date(freeUntil).getTime() - Date.now()) + 250;
    const expiryTimer = setTimeout(() => { void load(); }, delay);
    const countdownTimer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      clearTimeout(expiryTimer);
      clearInterval(countdownTimer);
    };
  }, [freeUntil, load]);

  const freeRemaining = useMemo(() => {
    if (!freeUntil) return '';
    const seconds = Math.max(0, Math.ceil((new Date(freeUntil).getTime() - clock) / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes > 0 ? String(minutes) + 'm ' + String(rest).padStart(2, '0') + 's' : String(rest) + 's';
  }, [clock, freeUntil]);


  const generationOptions = useMemo(
    () => [...new Set(packs.map((pack) => pack.generation).filter((value): value is number => value != null))]
      .sort((a, b) => a - b),
    [packs],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = packs.filter((pack) => {
      if (favoriteOnly && !favoriteIds.has(pack.id)) return false;
      if (generationFilter !== 'all' && pack.generation !== generationFilter) return false;
      if (!term) return true;
      return pack.name.toLowerCase().includes(term) || pack.set_id.toLowerCase().includes(term);
    });

    const normalizedPrice = (pack:Pack) => pack.currency === 'diamonds' ? pack.base_price * 500000 : pack.base_price;
    return [...visible].sort((a, b) => {
      if (sortMode === 'rarity-high') return b.rarity_score - a.rarity_score || normalizedPrice(b) - normalizedPrice(a);
      if (sortMode === 'rarity-low') return a.rarity_score - b.rarity_score || normalizedPrice(a) - normalizedPrice(b);
      if (sortMode === 'price-high') return normalizedPrice(b) - normalizedPrice(a);
      if (sortMode === 'price-low') return normalizedPrice(a) - normalizedPrice(b);
      if (sortMode === 'az') return a.name.localeCompare(b.name, 'pt-BR');
      const aDate = a.release_date ? new Date(a.release_date).getTime() : 0;
      const bDate = b.release_date ? new Date(b.release_date).getTime() : 0;
      return sortMode === 'oldest' ? aDate - bDate : bDate - aDate;
    });
  }, [packs, search, favoriteOnly, favoriteIds, generationFilter, sortMode]);

  function choosePack(pack: Pack) {
    const balance = pack.currency === 'diamonds' ? diamonds : coins;
    const icon = pack.currency === 'diamonds' ? '💎' : '🪙';
    if (balance < pack.price) {
      setNotice({ kind:'error', text:`Saldo insuficiente: você tem ${icon} ${balance.toLocaleString('pt-BR')} e este booster custa ${icon} ${pack.price.toLocaleString('pt-BR')}.` });
      return;
    }
    setNotice(null);
    setSelectedPack(pack);
  }

  async function exchangeOneDiamond() {
    const cost=500000;
    if(coins<cost){setNotice({kind:'error',text:'Você precisa de 🪙 500.000 para trocar por 💎 1 Diamante.'});return;}
    const run=async()=>{try{const result=await exchangeCoinsForDiamonds(1);setCoins(result.coins);setDiamonds(result.diamonds);await wallet.refresh();setNotice({kind:'success',text:'Câmbio concluído: 🪙 500.000 → 💎 1. Diamantes continuam sendo uma moeda rara.'});}catch(e){setNotice({kind:'error',text:e instanceof Error?e.message:'Não foi possível fazer o câmbio.'});}};
    if(Platform.OS==='web') void run();
    else Alert.alert('Trocar por 1 Diamante?','O câmbio custa 🪙 500.000 e não pode ser desfeito.',[{text:'Cancelar',style:'cancel'},{text:'TROCAR',onPress:()=>{void run();}}]);
  }

  async function toggleFavorite(pack: Pack) {
    const wasFavorite = favoriteIds.has(pack.id);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(pack.id);
      else next.add(pack.id);
      return next;
    });

    try {
      await setPackFavorite(pack.id, !wasFavorite);
    } catch {
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.add(pack.id);
        else next.delete(pack.id);
        return next;
      });
      setNotice({ kind: 'error', text: 'Não foi possível salvar este favorito agora.' });
    }
  }

  async function purchaseSelectedPack(): Promise<OpenedCard[]> {
    if (!selectedPack) throw new Error('Nenhum booster selecionado.');

    if (selectedPack.id === DIAMOND_PACK_BASE.id) {
      const before = await getMyProfile();
      setDiamonds(before.diamonds);
      if (before.diamonds < diamondCost) {
        throw new Error(`Diamantes insuficientes. Seu saldo atual é 💎 ${before.diamonds.toLocaleString('pt-BR')}.`);
      }
      try {
        const result = await openLegendaryDiamondPack();
        setDiamonds(result.diamonds);
        await wallet.refresh();
        return result.cards;
      } catch (error) {
        const refreshed = await getMyProfile().catch(() => null);
        if (refreshed) setDiamonds(refreshed.diamonds);
        throw error;
      }
    }

    const [before, latestPacks] = await Promise.all([getMyProfile(), listPacks()]);
    const latestPack = latestPacks.find((pack) => pack.id === selectedPack.id);
    if (!latestPack) throw new Error('Este booster não está mais disponível.');
    setSelectedPack(latestPack);
    setCoins(before.coins); setDiamonds(before.diamonds);
    const balance = latestPack.currency === 'diamonds' ? before.diamonds : before.coins;
    if (balance < latestPack.price) {
      throw new Error(`${latestPack.currency === 'diamonds' ? 'Diamantes' : 'Moedas'} insuficientes. Seu saldo atual é ${latestPack.currency === 'diamonds' ? '💎' : '🪙'} ${balance.toLocaleString('pt-BR')}.`);
    }

    try {
      const result = await openPack(latestPack.id);
      const after = await getMyProfile();
      setCoins(after.coins); setDiamonds(after.diamonds);
      await wallet.refresh();
      return result.cards;
    } catch (error) {
      const refreshed = await getMyProfile().catch(() => null);
      if (refreshed) setCoins(refreshed.coins);
      throw error;
    }
  }

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.headerTop}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: colors.yellow }]}>TRAINER HUB</Text>
          <Text style={[styles.title, { color: colors.text }]}>Pack Shop</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Preços balanceados pelo valor da carta mais valiosa do set; packs com 5+ anos usam Diamantes.
          </Text>
        </View>
      </View>

      <View style={[styles.balanceRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.balanceLabel, { color: colors.muted }]}>SEU SALDO</Text>
          <Text style={[styles.balanceValue, { color: colors.yellow }]}>🪙 {coins.toLocaleString('pt-BR')}  •  <Text style={{color:'#68D9FF'}}>💎 {diamonds.toLocaleString('pt-BR')}</Text></Text>
        </View>
        <View style={styles.balanceActions}><Pressable onPress={()=>void exchangeOneDiamond()} style={[styles.exchangeButton,{backgroundColor:colors.surfaceAlt,borderColor:'#68D9FF'}]}><Ionicons name="diamond" size={15} color="#68D9FF"/><Text style={[styles.exchangeText,{color:colors.text}]}>🪙500K → 💎1</Text></Pressable><View style={[styles.balanceBadge, { backgroundColor: colors.accentSoft }]}><Ionicons name="wallet-outline" size={20} color={colors.yellow} /></View></View>
      </View>

      {freeUntil ? (
        <View style={[styles.notice, { backgroundColor: isLight ? '#E3F8EB' : '#142C23', borderColor: '#4A9B70' }]}>
          <Ionicons name="gift" size={21} color="#45B777" />
          <Text style={[styles.noticeText, { color: colors.text }]}>
            ADMIN ABUSE ATIVO: todos os boosters estão GRÁTIS por mais {freeRemaining}.
          </Text>
        </View>
      ) : null}

      {notice ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: notice.kind === 'error'
                ? (isLight ? '#FFE8EC' : '#351A24')
                : (isLight ? '#E3F8EB' : '#142C23'),
              borderColor: notice.kind === 'error' ? '#C96B7A' : '#4A9B70',
            },
          ]}
        >
          <Ionicons
            name={notice.kind === 'error' ? 'alert-circle' : 'checkmark-circle'}
            size={21}
            color={notice.kind === 'error' ? '#D34F62' : '#45B777'}
          />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice.text}</Text>
          <Pressable onPress={() => setNotice(null)} hitSlop={8}>
            <Ionicons name="close" size={19} color={colors.text} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.diamondHero, { backgroundColor: isLight ? '#E9F9FF' : '#10283A', borderColor: '#68D9FF' }]}>
        <View style={styles.diamondOrb}><Ionicons name="diamond" size={27} color="#68D9FF" /></View>
        <View style={{ flex: 1, minWidth: 190 }}>
          <Text style={styles.diamondKicker}>COFRE DE DIAMANTES</Text>
          <Text style={[styles.diamondTitle, { color: colors.text }]}>1 carta lendária acima de US$ 25</Text>
          <Text style={[styles.diamondText, { color: colors.muted }]}>Somente Pokémon lendários ou míticos. Uma carta por abertura, sem itens extras.</Text>
        </View>
        <Pressable
          disabled={diamonds < diamondCost}
          onPress={() => diamonds >= diamondCost ? setSelectedPack(diamondPack) : setNotice({kind:'error',text:`Você precisa de 💎 ${diamondCost} Diamantes para abrir o Cofre Lendário.`})}
          style={[styles.diamondButton, { backgroundColor: diamonds >= diamondCost ? '#68D9FF' : colors.surfaceAlt }]}
        >
          <Text style={[styles.diamondButtonText, diamonds < diamondCost && { color: colors.muted }]}>💎 {diamondCost} • ABRIR</Text>
        </Pressable>
      </View>

      <View style={[styles.shopHero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <View style={[styles.shopHeroIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name="sparkles" size={22} color={colors.yellow} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.shopHeroKicker, { color: colors.yellow }]}>BOOSTER WALL</Text>
          <Text style={[styles.shopHeroTitle, { color: colors.text }]}>{packs.length || 173} packs para colecionar</Text>
          <Text style={[styles.shopHeroText, { color: colors.muted }]}>
            Packs recentes partem de 🪙500. Os mais valiosos sobem de forma moderada; vintages chegam no máximo a 💎100.
          </Text>
        </View>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar booster ou set..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFavoriteOnly((value) => !value)}
          style={[
            styles.favoriteFilter,
            {
              backgroundColor: favoriteOnly ? colors.accentSoft : colors.surface,
              borderColor: favoriteOnly ? colors.accent : colors.border,
            },
          ]}
        >
          <Ionicons name={favoriteOnly ? 'heart' : 'heart-outline'} size={17} color={favoriteOnly ? '#FF5C86' : colors.muted} />
          <Text style={[styles.favoriteFilterText, { color: colors.text }]}>
            {favoriteOnly ? 'SÓ FAVORITOS' : `FAVORITOS ${favoriteIds.size}`}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Text style={[styles.resultCount, { color: colors.muted }]}>{filtered.length} encontrados</Text>
      </View>

      <View style={styles.generationSection}>
        <Text style={[styles.filterLabel, { color: colors.muted }]}>GERAÇÃO</Text>
        <View style={styles.sortRow}>
          <Pressable
            onPress={() => setGenerationFilter('all')}
            style={[
              styles.sortChip,
              {
                backgroundColor: generationFilter === 'all' ? colors.accentSoft : colors.surface,
                borderColor: generationFilter === 'all' ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={[styles.sortChipText, { color: generationFilter === 'all' ? colors.accent : colors.muted }]}>TODAS</Text>
          </Pressable>
          {generationOptions.map((generation) => {
            const active = generationFilter === generation;
            return (
              <Pressable
                key={generation}
                onPress={() => setGenerationFilter(generation)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={[styles.sortChipText, { color: active ? colors.accent : colors.muted }]}>GEN {generation}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.filterLabel, { color: colors.muted }]}>ORDENAR</Text>
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((option) => {
          const active = sortMode === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSortMode(option.id)}
              style={[
                styles.sortChip,
                {
                  backgroundColor: active ? colors.accentSoft : colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[styles.sortChipText, { color: active ? colors.accent : colors.muted }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Boosters</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <FlatList
        key={`pack-grid-${columns}`}
        data={filtered}
        keyExtractor={(pack) => pack.id}
        numColumns={columns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={columns > 1 ? styles.columnWrap : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={colors.yellow} />
          ) : (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name={favoriteOnly ? 'heart-outline' : 'search-outline'} size={30} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {favoriteOnly ? 'Nenhum booster favorito' : 'Nenhum booster encontrado'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={styles.listFooter} />}
        initialNumToRender={isMobile ? 3 : 6}
        maxToRenderPerBatch={isMobile ? 3 : 6}
        updateCellsBatchingPeriod={70}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: pack }) => {
          const affordable = (pack.currency === 'diamonds' ? diamonds : coins) >= pack.price;
          const favorite = favoriteIds.has(pack.id);

          return (
            <View
              style={[
                styles.itemWrap,
                columns === 1 ? styles.itemSingle : styles.itemMulti,
              ]}
            >
              <View
                style={[
                  styles.pack,
                  isMobile && styles.packMobile,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !affordable && styles.packUnaffordable,
                ]}
              >
                <View
                  style={[
                    styles.displayCase,
                    isMobile && styles.displayCaseMobile,
                    { height: displayHeight, backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <View style={[styles.spotlight, { backgroundColor: colors.accent }]} />
                  <BoosterPack2D pack={pack} width={artWidth} />
                  <View style={styles.shelfShadow} />

                  <Pressable
                    hitSlop={8}
                    onPress={() => toggleFavorite(pack)}
                    style={[styles.favoriteButton, { backgroundColor: colors.bg }]}
                  >
                    <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={19} color={favorite ? '#FF5C86' : colors.text} />
                  </Pressable>

                  <View style={[styles.cardCountBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.cardCountText, { color: colors.text }]}>{pack.cards_per_pack} cards</Text>
                  </View>
                </View>

                <View style={styles.packTitleRow}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={[styles.packName, { color: colors.text }]}>{pack.name}</Text>
                    <Text style={[styles.setId, { color: colors.muted }]}>{pack.set_id.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.packMetaActions}>
                  <Pressable
                    onPress={() => setContentsPack(pack)}
                    style={[styles.contentsButton, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  >
                    <Ionicons name="grid-outline" size={15} color={colors.accent} />
                    <Text style={[styles.contentsButtonText, { color: colors.text }]}>VER CARTAS</Text>
                  </Pressable>

                  <Text style={[styles.price, { color: affordable ? colors.yellow : colors.muted }]}>
                    {pack.price === 0 ? '🎁 GRÁTIS' : `${pack.currency === 'diamonds' ? '💎' : '🪙'} ${pack.price.toLocaleString('pt-BR')}`}
                  </Text>
                </View>

                <Pressable
                  onPress={() => choosePack(pack)}
                  style={[
                    styles.openButton,
                    {
                      backgroundColor: affordable ? colors.yellow : colors.surfaceAlt,
                      borderColor: affordable ? colors.yellow : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.openButtonText, { color: affordable ? '#07111F' : colors.muted }]}>
                    {affordable ? (pack.price === 0 ? 'ABRIR GRÁTIS' : 'ABRIR PACK') : 'SEM SALDO'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <PackContentsModal
        visible={contentsPack !== null}
        pack={contentsPack}
        onClose={() => setContentsPack(null)}
      />

      <PackOpeningModal
        visible={selectedPack !== null}
        pack={selectedPack}
        onClose={() => setSelectedPack(null)}
        onPurchase={purchaseSelectedPack}
        onFinished={() => setNotice({
          kind: 'success',
          text: selectedPack?.currency === 'diamonds'
            ? 'Booster de Diamantes aberto! As cartas já estão na sua Bag.'
            : 'Booster aberto! Os cards já estão na sua Bag e avançaram suas missões.',
        })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  listContent: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 34 },
  columnWrap: { alignItems: 'stretch' },
  headerStack: { gap: 14, paddingHorizontal: 6, paddingBottom: 14 },
  headerTop: { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', alignItems:'flex-start', gap:10 },
  header: { gap: 5, marginBottom: 2 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, lineHeight: 20 },

  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1 },
  balanceLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  balanceValue: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  balanceActions:{flexDirection:'row',alignItems:'center',gap:7},exchangeButton:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},exchangeText:{fontSize:8,fontWeight:'900'},balanceBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  diamondHero: { flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:12, borderRadius:20, borderWidth:1, padding:14 },
  diamondOrb: { width:52, height:52, borderRadius:18, backgroundColor:'#163C55', alignItems:'center', justifyContent:'center' },
  diamondKicker: { color:'#68D9FF', fontSize:8, fontWeight:'900', letterSpacing:1.2 },
  diamondTitle: { fontSize:17, fontWeight:'900', marginTop:2 },
  diamondText: { fontSize:10, lineHeight:15, marginTop:3 },
  diamondButton: { minHeight:45, borderRadius:13, paddingHorizontal:13, alignItems:'center', justifyContent:'center' },
  diamondButtonText: { color:'#07111F', fontSize:9, fontWeight:'900' },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },

  shopHero: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 16, borderWidth: 1 },
  shopHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  shopHeroKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  shopHeroTitle: { fontSize: 19, fontWeight: '900', marginTop: 2 },
  shopHeroText: { fontSize: 12, lineHeight: 17, marginTop: 3 },

  searchBox: { height: 52, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, height: '100%' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  favoriteFilter: { minHeight: 39, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  favoriteFilterText: { fontSize: 9, fontWeight: '900', letterSpacing: .4 },
  resultCount: { fontSize: 12, fontWeight: '700' },
  generationSection: { marginTop: 4 },
  filterLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 8 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  sortChip: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  sortChipText: { fontSize: 8, fontWeight: '900', letterSpacing: .35 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },

  itemWrap: { paddingHorizontal: 6, paddingBottom: 12 },
  itemSingle: { width: '100%' },
  itemMulti: { flex: 1, minWidth: 0 },
  pack: { flex: 1, borderRadius: 20, padding: 9, borderWidth: 1 },
  packMobile: { padding: 10, borderRadius: 22 },
  packUnaffordable: { opacity: .72 },

  displayCase: { minHeight: 315, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  displayCaseMobile: { paddingVertical: 12 },
  spotlight: { position: 'absolute', top: -80, width: 230, height: 260, borderRadius: 130, opacity: .14, transform: [{ scaleX: 1.45 }] },
  shelfShadow: { position: 'absolute', bottom: 21, width: 155, height: 22, borderRadius: 80, backgroundColor: 'rgba(0,0,0,.56)', transform: [{ scaleX: 1.12 }] },

  favoriteButton: { position: 'absolute', top: 12, left: 12, width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', opacity: .94 },
  cardCountBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, opacity: .9 },
  cardCountText: { fontSize: 8, fontWeight: '900' },

  packTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  packName: { fontSize: 14, lineHeight: 18, fontWeight: '900', minHeight: 36 },
  setId: { fontSize: 9, fontWeight: '800', marginTop: 2 },

  packMetaActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7 },
  contentsButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  contentsButtonText: { fontSize: 8, fontWeight: '900', letterSpacing: .3 },
  price: { fontSize: 13, fontWeight: '900' },

  openButton: { minHeight: 44, marginTop: 8, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  openButtonText: { fontSize: 9, fontWeight: '900', letterSpacing: .3 },

  empty: { marginHorizontal: 6, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTitle: { fontSize: 17, fontWeight: '900' },
  loader: { marginVertical: 30 },
  listFooter: { height: 24 },
});
