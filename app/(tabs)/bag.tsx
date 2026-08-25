import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { getMyBag } from '@/services/player';

export default function BagScreen() {
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadBag(term?: string) {
    try {
      setLoading(true);
      const data = await getMyBag(term);
      setCards(data ?? []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBag();
  }, []);

  return (
    <Screen title="Pokémon Bag" subtitle="Pesquise, filtre e organize seus cards.">
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => loadBag(search)}
          placeholder="🔍 Buscar Pokémon..."
          placeholderTextColor="#7c8497"
          style={styles.search}
          returnKeyType="search"
        />
        <Pressable style={styles.searchButton} onPress={() => loadBag(search)}>
          <Text style={styles.searchButtonText}>Buscar</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        {['Tipo', 'Raridade', 'Set', 'Favoritos', 'Duplicatas'].map((filter) => (
          <Pressable key={filter} style={styles.filterChip}>
            <Text style={styles.filterText}>{filter}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.count}>{cards.length} cards na Bag</Text>

      {loading ? <ActivityIndicator size="large" /> : null}

      {!loading && cards.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sua Bag está vazia</Text>
          <Text style={styles.emptyText}>Abra boosters para começar sua coleção.</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {cards.map((entry) => {
          const card = Array.isArray(entry.cards) ? entry.cards[0] : entry.cards;
          if (!card) return null;

          return (
            <View key={card.id} style={styles.card}>
              {card.image_small ? <Image source={{ uri: card.image_small }} style={styles.cardImage} resizeMode="contain" /> : null}
              <Text style={styles.cardName} numberOfLines={1}>{card.pokemon_name}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>{card.rarity ?? 'Sem raridade'}</Text>
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityText}>×{entry.quantity}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, backgroundColor: '#151c31', color: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  searchButton: { backgroundColor: '#2d6cff', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 14 },
  searchButtonText: { color: '#fff', fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { backgroundColor: '#151c31', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { color: '#bac3d7', fontWeight: '700', fontSize: 12 },
  count: { color: '#8f99ad', fontSize: 13 },
  empty: { backgroundColor: '#111725', borderRadius: 18, padding: 24, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontWeight: '800', fontSize: 18 },
  emptyText: { color: '#939db2', marginTop: 6, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', backgroundColor: '#111725', borderRadius: 16, padding: 10, position: 'relative' },
  cardImage: { width: '100%', aspectRatio: 0.72, borderRadius: 10 },
  cardName: { color: '#fff', fontWeight: '800', marginTop: 8 },
  cardMeta: { color: '#8f99ad', fontSize: 12, marginTop: 2 },
  quantityBadge: { position: 'absolute', right: 8, top: 8, backgroundColor: '#f2c94c', borderRadius: 999, minWidth: 30, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center' },
  quantityText: { color: '#111827', fontWeight: '900', fontSize: 12 },
});
