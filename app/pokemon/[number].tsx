import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getMyBag } from '@/services/player';
import { generationForNumber, getPokemonCardVersions, type PokemonCardVersion } from '@/services/pokedex';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function PokemonVersionsScreen() {
  const router = useRouter();
  const { number } = useLocalSearchParams<{ number: string }>();
  const { width } = useWindowDimensions();
  const { colors, isLight } = useAppTheme();
  const pokedexNumber = Number(number);
  const [versions, setVersions] = useState<PokemonCardVersion[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(pokedexNumber)) return;
    try {
      setLoading(true);
      setError(null);
      const [cards, bag] = await Promise.all([getPokemonCardVersions(pokedexNumber), getMyBag()]);
      setVersions(cards);
      setOwnedIds(new Set(bag.map((item) => item.cards?.id).filter((value): value is string => Boolean(value))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as versões deste Pokémon.');
    } finally {
      setLoading(false);
    }
  }, [pokedexNumber]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const ownedCount = useMemo(() => versions.filter((card) => ownedIds.has(card.id)).length, [ownedIds, versions]);
  const name = versions[0]?.pokemon_name ?? `Pokémon #${pokedexNumber}`;
  const types = versions[0]?.types ?? [];
  const columns = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 650 ? 3 : 2;
  const cardWidth = columns === 5 ? '18.8%' : columns === 4 ? '23.5%' : columns === 3 ? '32%' : '48.5%';
  const completion = versions.length ? Math.round((ownedCount / versions.length) * 100) : 0;

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.safe,{backgroundColor:colors.bg}]}>
      <PremiumBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TrainerPageHeader
          title={name}
          subtitle={`Pokédex #${String(pokedexNumber).padStart(4,'0')} • Geração ${generationForNumber(pokedexNumber)} • veja todas as versões de cards desta espécie.`}
          icon="paw"
        />

        <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={18} color={colors.muted}/>
          <Text style={[styles.backText,{color:colors.muted}]}>Voltar à Pokédex</Text>
        </Pressable>

        {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && versions.length > 0 ? (
          <>
            <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
              <View style={styles.heroText}>
                <Text style={[styles.heroKicker,{color:colors.yellow}]}>GERAÇÃO {generationForNumber(pokedexNumber)}</Text>
                <Text style={[styles.heroName,{color:colors.text}]}>{name}</Text>
                <View style={styles.types}>
                  {types.map((type) => (
                    <View key={type} style={[styles.typeBadge,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                      <Text style={[styles.typeText,{color:colors.text}]}>{type.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={[styles.progressBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                <Text style={[styles.progressValue,{color:colors.yellow}]}>{ownedCount} / {versions.length}</Text>
                <Text style={[styles.progressLabel,{color:colors.muted}]}>versões na sua Bag</Text>
                <Text style={[styles.progressPercent,{color:colors.text}]}>{completion}%</Text>
              </View>
            </View>

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle,{color:colors.text}]}>Todas as versões</Text>
              <View style={[styles.countBadge,{backgroundColor:colors.accentSoft,borderColor:colors.border}]}>
                <Text style={[styles.sectionMeta,{color:colors.muted}]}>{versions.length} cards</Text>
              </View>
            </View>

            <View style={styles.grid}>
              {versions.map((card) => {
                const owned = ownedIds.has(card.id);
                return (
                  <Pressable
                    key={card.id}
                    disabled={!owned}
                    onPress={() => router.push(`/card/${card.id}`)}
                    style={[
                      styles.card,
                      {
                        width: cardWidth as any,
                        backgroundColor: owned ? colors.surface : colors.surfaceAlt,
                        borderColor: owned ? colors.border : colors.border,
                        opacity: owned ? 1 : .66,
                      },
                    ]}
                  >
                    <View style={[styles.imageWrap,{backgroundColor:isLight?'#EDF2F7':colors.bg}]}>
                      {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.image} resizeMode="contain" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={28} color={colors.muted} /></View>}
                      {!owned ? (
                        <View style={styles.lockOverlay}>
                          <Ionicons name="lock-closed" size={25} color="#E6ECF3" />
                          <Text style={styles.lockText}>NÃO OBTIDO</Text>
                        </View>
                      ) : (
                        <View style={[styles.ownedBadge,{backgroundColor:colors.yellow}]}>
                          <Ionicons name="checkmark" size={13} color="#07111F" />
                          <Text style={styles.ownedText}>NA BAG</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={[styles.cardName,{color:colors.text}]}>{card.set_name}</Text>
                    <Text numberOfLines={1} style={[styles.meta,{color:colors.muted}]}>{card.rarity ?? 'Sem raridade'} • #{card.card_number ?? '—'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,overflow:'hidden'},
  content:{width:'100%',maxWidth:1280,alignSelf:'center',padding:16,paddingBottom:44,gap:16},
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},
  backText:{fontSize:11,fontWeight:'900'},
  errorBox:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:12},
  errorText:{flex:1,color:'#FFD7DD',fontSize:11,fontWeight:'700'},
  hero:{minHeight:145,borderRadius:25,borderWidth:1,padding:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'},
  heroText:{flex:1,minWidth:190},
  heroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  heroName:{fontSize:28,fontWeight:'900',marginTop:3},
  types:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:9},
  typeBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:9,paddingVertical:5},
  typeText:{fontSize:7,fontWeight:'900'},
  progressBox:{minWidth:142,borderRadius:18,borderWidth:1,padding:13,alignItems:'flex-end'},
  progressValue:{fontSize:20,fontWeight:'900'},
  progressLabel:{fontSize:8,marginTop:2},
  progressPercent:{fontSize:11,fontWeight:'900',marginTop:8},
  sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  sectionTitle:{fontSize:20,fontWeight:'900'},
  countBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:10,paddingVertical:6},
  sectionMeta:{fontSize:8,fontWeight:'900'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  card:{borderRadius:17,borderWidth:1,padding:7},
  imageWrap:{width:'100%',aspectRatio:.72,borderRadius:11,overflow:'hidden',position:'relative'},
  image:{width:'100%',height:'100%'},
  placeholder:{flex:1,alignItems:'center',justifyContent:'center'},
  lockOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(5,9,15,.72)',alignItems:'center',justifyContent:'center',gap:5},
  lockText:{color:'#F1F5F9',fontSize:7,fontWeight:'900',letterSpacing:.5},
  ownedBadge:{position:'absolute',left:6,bottom:6,borderRadius:999,paddingHorizontal:7,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:3},
  ownedText:{color:'#07111F',fontSize:6,fontWeight:'900'},
  cardName:{fontSize:10,fontWeight:'900',marginTop:6},
  meta:{fontSize:7,marginTop:2},
});
