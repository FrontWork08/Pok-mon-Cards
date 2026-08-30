import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import {
  getMyOwnedCardIdsForSet,
  getSetCards,
  type SetCardPreview,
} from '@/services/collections';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function SetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const [cards, setCards] = useState<SetCardPreview[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const setId = String(id);
    try {
      setLoading(true);
      setError(null);
      const [setCardRows, ownedCardIds] = await Promise.all([
        getSetCards(setId),
        getMyOwnedCardIdsForSet(setId),
      ]);
      setCards(setCardRows);
      setOwnedIds(new Set(ownedCardIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar este set.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const ownedCount = useMemo(
    () => cards.reduce((total, card) => total + (ownedIds.has(card.id) ? 1 : 0), 0),
    [cards, ownedIds],
  );
  const percent = cards.length ? Math.round((ownedCount / cards.length) * 100) : 0;
  const columns = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const listWidth = Math.max(280, Math.min(width, 1280) - 36);
  const gap = 10;
  const cardWidth = Math.floor((listWidth - gap * (columns - 1)) / columns);
  const setName = cards[0]?.set_name ?? String(id ?? '').toUpperCase();

  const renderItem = useCallback(({ item: card }: { item: SetCardPreview }) => {
    const owned = ownedIds.has(card.id);
    return (
      <Pressable
        disabled={!owned}
        onPress={() => router.push(`/card/${card.id}`)}
        style={[
          styles.card,
          {
            width: cardWidth,
            backgroundColor: owned ? colors.surface : colors.surfaceAlt,
            borderColor: colors.border,
            opacity: owned ? 1 : .66,
          },
        ]}
      >
        <View style={[styles.imageWrap,{backgroundColor:isLight?'#EDF2F7':colors.bg}]}>
          {owned && card.image_small ? (
            <Image
              source={{ uri: card.image_small }}
              style={styles.image}
              resizeMode="contain"
              resizeMethod={Platform.OS === 'android' ? 'resize' : 'auto'}
              fadeDuration={0}
            />
          ) : (
            <View style={[styles.placeholder,{backgroundColor:colors.surfaceAlt}]}>
              <Ionicons name={owned ? 'image-outline' : 'lock-closed'} size={owned ? 28 : 24} color={colors.muted} />
            </View>
          )}
          {owned ? (
            <View style={[styles.ownedBadge,{backgroundColor:colors.yellow}]}>
              <Ionicons name="checkmark" size={12} color="#07111F" />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={[styles.name,{color:owned?colors.text:colors.muted}]}>{owned ? card.pokemon_name : 'Card não obtido'}</Text>
        <Text numberOfLines={1} style={[styles.meta,{color:colors.muted}]}>
          #{card.card_number ?? '—'} • {owned ? card.rarity ?? 'Sem raridade' : 'Bloqueado'}
        </Text>
      </Pressable>
    );
  }, [cardWidth, colors.bg, colors.border, colors.muted, colors.surface, colors.surfaceAlt, colors.text, colors.yellow, isLight, ownedIds, router]);

  const header = (
    <View style={styles.header}>
      <TrainerPageHeader
        title={setName}
        subtitle={`Set ${String(id ?? '').toUpperCase()} • acompanhe seu progresso e abra os cards que você já possui.`}
        icon="layers"
      />

      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted}/>
        <Text style={[styles.backText,{color:colors.muted}]}>Voltar aos Sets</Text>
      </Pressable>

      {error ? (
        <Pressable style={styles.errorBox} onPress={() => setError(null)}>
          <Ionicons name="alert-circle" size={20} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      {!loading && cards.length > 0 ? (
        <>
          <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
            <View>
              <Text style={[styles.heroKicker,{color:colors.yellow}]}>PROGRESSO DO SET</Text>
              <Text style={[styles.heroValue,{color:colors.text}]}>{ownedCount} / {cards.length}</Text>
              <Text style={[styles.heroText,{color:colors.muted}]}>cards únicos obtidos</Text>
            </View>
            <View style={[styles.percentCircle,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
              <Text style={[styles.percent,{color:colors.text}]}>{percent}%</Text>
            </View>
          </View>
          <View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor:percent===100?colors.green:colors.yellow }]} />
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.safe,{backgroundColor:colors.bg}]}>
      <PremiumBackground />
      <FlatList
        key={`set-detail-${columns}`}
        data={loading ? [] : cards}
        keyExtractor={(card) => card.id}
        renderItem={renderItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={colors.yellow} />
          ) : !error ? (
            <View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Ionicons name="layers-outline" size={30} color={colors.accent}/>
              <Text style={[styles.emptyText,{color:colors.muted}]}>Nenhum card neste set.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.content}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  safe:{flex:1,overflow:'hidden'},
  content:{width:'100%',maxWidth:1280,alignSelf:'center',padding:16,paddingBottom:44},
  header:{gap:15,marginBottom:12},
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},
  backText:{fontSize:11,fontWeight:'900'},
  errorBox:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:12},
  errorText:{flex:1,color:'#FFD7DD',fontSize:11,fontWeight:'700'},
  hero:{borderRadius:23,borderWidth:1,padding:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  heroValue:{fontSize:29,fontWeight:'900',marginTop:2},
  heroText:{fontSize:10},
  percentCircle:{width:70,height:70,borderRadius:35,borderWidth:5,alignItems:'center',justifyContent:'center'},
  percent:{fontSize:17,fontWeight:'900'},
  track:{height:7,borderRadius:999,overflow:'hidden'},
  fill:{height:'100%',borderRadius:999},
  row:{gap:10},
  card:{borderRadius:16,borderWidth:1,padding:7,marginBottom:10},
  imageWrap:{width:'100%',aspectRatio:.72,borderRadius:10,overflow:'hidden',position:'relative'},
  image:{width:'100%',height:'100%'},
  placeholder:{flex:1,alignItems:'center',justifyContent:'center'},
  ownedBadge:{position:'absolute',right:6,bottom:6,width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},
  name:{fontSize:10,fontWeight:'900',marginTop:6},
  meta:{fontSize:7,marginTop:2},
  loader:{marginTop:44},
  empty:{padding:30,borderRadius:18,borderWidth:1,alignItems:'center',gap:7},
  emptyText:{fontSize:11,fontWeight:'700'},
});
