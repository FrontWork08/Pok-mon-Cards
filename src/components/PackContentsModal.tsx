import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatUsd } from '@/services/market';
import { listPackCards, type Pack, type PackCardPreview } from '@/services/packs';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE = 36;

type Props = {
  visible: boolean;
  pack: Pack | null;
  onClose: () => void;
};

type CollectionProgress = {
  owned: number;
  total: number;
  percent: number;
};

export function PackContentsModal({ visible, pack, onClose }: Props) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<PackCardPreview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'number'|'price-high'>('number');
  const [failedImages, setFailedImages] = useState<Record<string, number>>({});
  const [collectionProgress, setCollectionProgress] = useState<CollectionProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const hasMore = cards.length < total;

  useEffect(() => {
    if (!visible || !pack) return;
    setCards([]);
    setTotal(0);
    setPage(0);
    setError(null);
    setFailedImages({});

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      listPackCards(pack.set_id, 0, PAGE_SIZE, search, sort)
      .then((result) => {
        if (!active) return;
        setCards(result.cards);
        setTotal(result.total);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as cartas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    }, 220);

    return () => { active = false; clearTimeout(timer); };
  }, [visible, pack?.id, pack?.set_id, search, sort]);

  useEffect(() => {
    if (!visible || !pack) return;
    let active = true;
    setCollectionProgress(null);
    setProgressLoading(true);

    void (async () => {
      try {
        const result = await (supabase as any).rpc('get_my_pack_collection_progress', { p_set_id: pack.set_id }) as {
          data: unknown;
          error: unknown;
        };
        if (!active || result.error) return;
        const value = (result.data ?? {}) as Record<string, unknown>;
        setCollectionProgress({
          owned: Math.max(0, Number(value.owned ?? 0)),
          total: Math.max(0, Number(value.total ?? 0)),
          percent: Math.max(0, Math.min(100, Number(value.percent ?? 0))),
        });
      } finally {
        if (active) setProgressLoading(false);
      }
    })();

    return () => { active = false; };
  }, [visible, pack?.id, pack?.set_id]);

  async function loadMore() {
    if (!pack || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    try {
      setLoadingMore(true);
      const result = await listPackCards(pack.set_id, nextPage, PAGE_SIZE, search, sort);
      setCards((current) => {
        const seen = new Set(current.map((card) => card.id));
        return [...current, ...result.cards.filter((card) => !seen.has(card.id))];
      });
      setTotal(result.total);
      setPage(nextPage);
    } catch {
      // Keep the already loaded list usable.
    } finally {
      setLoadingMore(false);
    }
  }

  const headerSubtitle = useMemo(() => {
    if (!pack) return '';
    const packTotal = collectionProgress?.total ?? total;
    if (search.trim()) return `${total} encontradas na busca • ${packTotal || '—'} cartas no booster`;
    return `${packTotal || '—'} cartas cadastradas neste booster`;
  }, [collectionProgress?.total, pack, search, total]);

  if (!pack) return null;

  const progressPercent = collectionProgress?.percent ?? 0;
  const progressOwned = collectionProgress?.owned ?? 0;
  const progressTotal = collectionProgress?.total ?? 0;
  const progressComplete = progressTotal > 0 && progressOwned >= progressTotal;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg, paddingTop: Math.max(insets.top, 8) }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>CONTEÚDO DO BOOSTER</Text>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{pack.name}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{headerSubtitle}</Text>
            <Text style={[styles.openHint,{color:colors.accent}]}>Toque em uma carta para ver imagem, preço e estatísticas de batalha antes de comprar.</Text>
          </View>
          <Pressable onPress={onClose} style={[styles.close, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.progressPanel,{backgroundColor:colors.surface,borderColor:progressComplete?colors.green:colors.border}]}>
          <View style={styles.progressTopRow}>
            <View style={styles.progressCopy}>
              <Text style={[styles.progressKicker,{color:progressComplete?colors.green:colors.yellow}]}>SUA COLEÇÃO DESTE BOOSTER</Text>
              <Text style={[styles.progressValue,{color:colors.text}]}>
                {progressLoading ? 'Carregando progresso...' : `${progressOwned.toLocaleString('pt-BR')} / ${progressTotal.toLocaleString('pt-BR')} cartas`}
              </Text>
              <Text style={[styles.progressHint,{color:colors.muted}]}>Conta cartas diferentes que estão atualmente na sua Bag.</Text>
            </View>
            <View style={[styles.percentBadge,{backgroundColor:progressComplete?`${colors.green}20`:colors.accentSoft,borderColor:progressComplete?colors.green:colors.accent}]}>
              <Text style={[styles.percentValue,{color:progressComplete?colors.green:colors.accent}]}>{progressLoading ? '…' : `${Math.round(progressPercent)}%`}</Text>
            </View>
          </View>
          <View style={[styles.progressTrack,{backgroundColor:colors.surfaceAlt}]}>
            <View style={[styles.progressFill,{width:`${progressPercent}%`,backgroundColor:progressComplete?colors.green:colors.yellow}]} />
          </View>
        </View>

        <View style={[styles.tools,{borderBottomColor:colors.border}]}>
          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Pesquisar carta neste booster..." placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.searchInput,{color:colors.text}]}/>{search?<Pressable onPress={()=>setSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>:null}</View>
          <View style={styles.sortRow}><Pressable onPress={()=>setSort('number')} style={[styles.sortChip,{backgroundColor:sort==='number'?colors.accentSoft:colors.surface,borderColor:sort==='number'?colors.accent:colors.border}]}><Text style={[styles.sortText,{color:sort==='number'?colors.accent:colors.muted}]}>NÚMERO</Text></Pressable><Pressable onPress={()=>setSort('price-high')} style={[styles.sortChip,{backgroundColor:sort==='price-high'?colors.accentSoft:colors.surface,borderColor:sort==='price-high'?colors.accent:colors.border}]}><Ionicons name="cash" size={14} color={sort==='price-high'?colors.yellow:colors.muted}/><Text style={[styles.sortText,{color:sort==='price-high'?colors.yellow:colors.muted}]}>MAIS CARAS</Text></Pressable></View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.yellow} />
            <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando cartas possíveis...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color="#FF7D8A" />
            <Text style={[styles.error, { color: colors.text }]}>{error}</Text>
          </View>
        ) : (
          <FlatList
            {...VIRTUAL_LIST_PERF_PROPS}
            data={cards}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            columnWrapperStyle={styles.column}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  const cardId = item.id;
                  onClose();
                  setTimeout(() => router.push(`/card/${cardId}`), 80);
                }}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {(() => {
                  const candidates = [item.image, item.image_fallback]
                    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
                  const level = failedImages[item.id] ?? 0;
                  const uri = candidates[level] ?? null;

                  return uri ? (
                    <Image
                      source={{ uri, cache: 'force-cache' }}
                      resizeMode="contain"
                      style={styles.image}
                      onError={() => setFailedImages((current) => ({ ...current, [item.id]: level + 1 }))}
                    />
                  ) : (
                    <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="image-outline" size={28} color={colors.muted} />
                    </View>
                  );
                })()}
                <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text numberOfLines={1} style={[styles.rarity, { color: colors.muted }]}>{item.rarity ?? 'Sem raridade'}</Text>
                <View style={styles.cardFooter}>
                  <Text style={[styles.price, { color: colors.yellow }]}>
                    {item.market_price_usd == null ? 'US$ —' : formatUsd(item.market_price_usd)}
                  </Text>
                  <View style={[styles.detailsChip,{backgroundColor:colors.accentSoft}]}>
                    <Ionicons name="eye" size={12} color={colors.accent}/>
                    <Text style={[styles.detailsText,{color:colors.accent}]}>DETALHES</Text>
                  </View>
                </View>
              </Pressable>
            )}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.yellow} /> : null
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 88, borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  title: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 10, marginTop: 3 },
  openHint: { fontSize: 8, lineHeight: 12, fontWeight: '800', marginTop: 5 },
  close: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  progressPanel:{marginHorizontal:12,marginTop:10,borderRadius:15,borderWidth:1,padding:12,gap:8},
  progressTopRow:{flexDirection:'row',alignItems:'center',gap:10},
  progressCopy:{flex:1,minWidth:0},
  progressKicker:{fontSize:8,fontWeight:'900',letterSpacing:1},
  progressValue:{fontSize:15,fontWeight:'900',marginTop:2},
  progressHint:{fontSize:8,lineHeight:11,marginTop:2},
  percentBadge:{minWidth:56,height:38,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  percentValue:{fontSize:12,fontWeight:'900'},
  progressTrack:{height:7,borderRadius:999,overflow:'hidden'},
  progressFill:{height:'100%',borderRadius:999},
  tools:{paddingHorizontal:12,paddingVertical:9,borderBottomWidth:1,gap:8},searchBox:{height:44,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,height:'100%',fontSize:12},sortRow:{flexDirection:'row',gap:7},sortChip:{minHeight:34,borderRadius:10,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},sortText:{fontSize:8,fontWeight:'900'},
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 },
  loadingText: { fontSize: 11 },
  error: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  list: { padding: 12, paddingBottom: 34 },
  column: { gap: 10 },
  card: { flex: 1, minWidth: 0, borderRadius: 16, borderWidth: 1, padding: 8, marginBottom: 10 },
  image: { width: '100%', aspectRatio: 0.716 },
  imageFallback: { alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  name: { fontSize: 11, fontWeight: '900', marginTop: 6 },
  rarity: { fontSize: 8, marginTop: 2 },
  cardFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6,marginTop:5},
  price: { fontSize: 10, fontWeight: '900' },
  detailsChip:{borderRadius:999,paddingHorizontal:7,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:4},
  detailsText:{fontSize:7,fontWeight:'900'},
  footerLoader: { marginVertical: 18 },
});
