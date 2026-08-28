import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getMyBag } from '@/services/player';
import { generationForNumber, getPokemonCardVersions, type PokemonCardVersion } from '@/services/pokedex';
import { gameTheme } from '@/theme/gameTheme';

export default function PokemonVersionsScreen() {
  const router = useRouter();
  const { number } = useLocalSearchParams<{ number: string }>();
  const { width } = useWindowDimensions();
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ownedCount = useMemo(() => versions.filter((card) => ownedIds.has(card.id)).length, [ownedIds, versions]);
  const name = versions[0]?.pokemon_name ?? `Pokémon #${pokedexNumber}`;
  const types = versions[0]?.types ?? [];
  const columns = width >= 1200 ? 5 : width >= 900 ? 4 : width >= 650 ? 3 : 2;
  const cardWidth = columns === 5 ? '18.8%' : columns === 4 ? '23.5%' : columns === 3 ? '32%' : '48.5%';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={21} color="#fff" /></Pressable>
          <View style={styles.topInfo}><Text style={styles.kicker}>POKÉDEX #{String(pokedexNumber).padStart(4, '0')}</Text><Text style={styles.title}>{name}</Text></View>
        </View>

        {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && versions.length > 0 ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroText}><Text style={styles.heroKicker}>GERAÇÃO {generationForNumber(pokedexNumber)}</Text><Text style={styles.heroName}>{name}</Text><View style={styles.types}>{types.map((type) => <View key={type} style={styles.typeBadge}><Text style={styles.typeText}>{type}</Text></View>)}</View></View>
              <View style={styles.progressBox}><Text style={styles.progressValue}>{ownedCount} / {versions.length}</Text><Text style={styles.progressLabel}>versões na sua Bag</Text></View>
            </View>

            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Todas as versões</Text><Text style={styles.sectionMeta}>{versions.length} cards</Text></View>

            <View style={styles.grid}>
              {versions.map((card) => {
                const owned = ownedIds.has(card.id);
                return (
                  <Pressable key={card.id} disabled={!owned} onPress={() => router.push(`/card/${card.id}`)} style={[styles.card, { width: cardWidth as any }, !owned && styles.cardLocked]}>
                    <View style={styles.imageWrap}>
                      {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.image} resizeMode="contain" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={28} color="#536984" /></View>}
                      {!owned ? <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={25} color="#C2CFDF" /><Text style={styles.lockText}>NÃO OBTIDO</Text></View> : <View style={styles.ownedBadge}><Ionicons name="checkmark" size={13} color="#07111F" /><Text style={styles.ownedText}>NA BAG</Text></View>}
                    </View>
                    <Text numberOfLines={1} style={styles.cardName}>{card.set_name}</Text>
                    <Text numberOfLines={1} style={styles.meta}>{card.rarity ?? 'Sem raridade'} • #{card.card_number ?? '—'}</Text>
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
  safe: { flex: 1, backgroundColor: gameTheme.colors.bg },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 18, paddingBottom: 44, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  topInfo: { flex: 1 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 12, fontWeight: '700' },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 18, borderRadius: 23, backgroundColor: '#10284B', borderWidth: 1, borderColor: '#285A9A' },
  heroText: { flex: 1, minWidth: 220 },
  heroKicker: { color: '#79A8ED', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroName: { color: '#fff', fontSize: 29, fontWeight: '900', marginTop: 3 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#153862', borderWidth: 1, borderColor: '#3268A6' },
  typeText: { color: '#D4E4FA', fontSize: 9, fontWeight: '900' },
  progressBox: { minWidth: 150, padding: 15, borderRadius: 17, backgroundColor: '#0A1930' },
  progressValue: { color: gameTheme.colors.yellow, fontSize: 24, fontWeight: '900' },
  progressLabel: { color: '#8FA7C4', fontSize: 9, marginTop: 3 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sectionMeta: { color: '#8195AF', fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { padding: 8, borderRadius: 16, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  cardLocked: { opacity: 0.58 },
  imageWrap: { width: '100%', aspectRatio: 0.72, borderRadius: 11, overflow: 'hidden', backgroundColor: '#091524', position: 'relative' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#07111F99' },
  lockText: { color: '#D6E0ED', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  ownedBadge: { position: 'absolute', top: 7, right: 7, flexDirection: 'row', gap: 3, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: gameTheme.colors.yellow },
  ownedText: { color: '#07111F', fontSize: 7, fontWeight: '900' },
  cardName: { color: '#fff', fontSize: 11, fontWeight: '900', marginTop: 7 },
  meta: { color: '#778CA7', fontSize: 8, marginTop: 2 },
});
