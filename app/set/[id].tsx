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
import {
  getMyOwnedCardIdsForSet,
  getSetCards,
  type SetCardPreview,
} from '@/services/collections';
import { gameTheme } from '@/theme/gameTheme';

export default function SetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
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

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

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
        style={[styles.card, { width: cardWidth }, !owned && styles.locked]}
      >
        <View style={styles.imageWrap}>
          {owned && card.image_small ? (
            <Image
              source={{ uri: card.image_small }}
              style={styles.image}
              resizeMode="contain"
              resizeMethod={Platform.OS === 'android' ? 'resize' : 'auto'}
              fadeDuration={0}
            />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name={owned ? 'image-outline' : 'lock-closed'} size={owned ? 28 : 24} color="#546B87" />
            </View>
          )}
          {owned ? (
            <View style={styles.ownedBadge}>
              <Ionicons name="checkmark" size={12} color="#07111F" />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.name}>{owned ? card.pokemon_name : 'Card não obtido'}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          #{card.card_number ?? '—'} • {owned ? card.rarity ?? 'Sem raridade' : 'Bloqueado'}
        </Text>
      </Pressable>
    );
  }, [cardWidth, ownedIds, router]);

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={21} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>SET {String(id ?? '').toUpperCase()}</Text>
          <Text style={styles.title}>{setName}</Text>
        </View>
      </View>

      {error ? (
        <Pressable style={styles.errorBox} onPress={() => setError(null)}>
          <Ionicons name="alert-circle" size={20} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      {!loading && cards.length > 0 ? (
        <>
          <View style={styles.hero}>
            <View>
              <Text style={styles.heroKicker}>PROGRESSO DO SET</Text>
              <Text style={styles.heroValue}>{ownedCount} / {cards.length}</Text>
              <Text style={styles.heroText}>cards únicos obtidos</Text>
            </View>
            <View style={styles.percentCircle}><Text style={styles.percent}>{percent}%</Text></View>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
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
            <ActivityIndicator style={styles.loader} size="large" color={gameTheme.colors.yellow} />
          ) : !error ? (
            <View style={styles.empty}><Text style={styles.emptyText}>Nenhum card neste set.</Text></View>
          ) : null
        }
        contentContainerStyle={styles.content}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={60}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: gameTheme.colors.bg },
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 18, paddingBottom: 44 },
  header: { gap: 15, marginBottom: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  kicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 2 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 12, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 22, backgroundColor: '#10284B', borderWidth: 1, borderColor: '#285A9A' },
  heroKicker: { color: '#78A8EB', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#fff', fontSize: 31, fontWeight: '900', marginTop: 3 },
  heroText: { color: '#A3B7D0', fontSize: 10 },
  percentCircle: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: gameTheme.colors.yellow, backgroundColor: '#0A1930' },
  percent: { color: '#fff', fontSize: 17, fontWeight: '900' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: '#19283B' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: gameTheme.colors.yellow },
  row: { gap: 10 },
  card: { marginBottom: 10, padding: 7, borderRadius: 15, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  locked: { opacity: 0.64 },
  imageWrap: { width: '100%', aspectRatio: 0.72, borderRadius: 10, overflow: 'hidden', position: 'relative', backgroundColor: '#091524' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1625' },
  ownedBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.yellow },
  name: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 6 },
  meta: { color: '#768BA6', fontSize: 8, marginTop: 2 },
  loader: { marginVertical: 38 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#768BA6', fontSize: 12, fontWeight: '700' },
});
