import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getSetCards } from '@/services/collections';
import { getMyBag } from '@/services/player';
import { gameTheme } from '@/theme/gameTheme';

export default function SetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [cards, setCards] = useState<any[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [setCardRows, bag] = await Promise.all([getSetCards(String(id)), getMyBag()]);
      setCards(setCardRows);
      setOwnedIds(new Set(bag.map((item) => item.cards?.id).filter((value): value is string => Boolean(value))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar este set.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ownedCount = useMemo(() => cards.filter((card) => ownedIds.has(card.id)).length, [cards, ownedIds]);
  const percent = cards.length ? Math.round((ownedCount / cards.length) * 100) : 0;
  const columns = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const cardWidth = columns === 6 ? '15.5%' : columns === 5 ? '18.8%' : columns === 4 ? '23.5%' : '48.5%';
  const setName = cards[0]?.set_name ?? String(id).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}><Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color="#fff" /></Pressable><View style={{ flex: 1 }}><Text style={styles.kicker}>SET {String(id).toUpperCase()}</Text><Text style={styles.title}>{setName}</Text></View></View>
        {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && cards.length > 0 ? (
          <>
            <View style={styles.hero}><View><Text style={styles.heroKicker}>PROGRESSO DO SET</Text><Text style={styles.heroValue}>{ownedCount} / {cards.length}</Text><Text style={styles.heroText}>cards únicos obtidos</Text></View><View style={styles.percentCircle}><Text style={styles.percent}>{percent}%</Text></View></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
            <View style={styles.grid}>
              {cards.map((card) => {
                const owned = ownedIds.has(card.id);
                return (
                  <Pressable key={card.id} disabled={!owned} onPress={() => router.push(`/card/${card.id}`)} style={[styles.card, { width: cardWidth as any }, !owned && styles.locked]}>
                    <View style={styles.imageWrap}>{card.image_small ? <Image source={{ uri: card.image_small }} style={styles.image} resizeMode="contain" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={28} color="#546B87" /></View>}{!owned ? <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={23} color="#D1DCE9" /></View> : <View style={styles.ownedBadge}><Ionicons name="checkmark" size={12} color="#07111F" /></View>}</View>
                    <Text numberOfLines={1} style={styles.name}>{owned ? card.pokemon_name : 'Card não obtido'}</Text>
                    <Text numberOfLines={1} style={styles.meta}>#{card.card_number ?? '—'} • {card.rarity ?? 'Sem raridade'}</Text>
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
  content: { width: '100%', maxWidth: 1280, alignSelf: 'center', padding: 18, paddingBottom: 44, gap: 15 },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { padding: 7, borderRadius: 15, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  locked: { opacity: 0.58 },
  imageWrap: { width: '100%', aspectRatio: 0.72, borderRadius: 10, overflow: 'hidden', position: 'relative', backgroundColor: '#091524' },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07111FA0' },
  ownedBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.yellow },
  name: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 6 },
  meta: { color: '#768BA6', fontSize: 8, marginTop: 2 },
});
