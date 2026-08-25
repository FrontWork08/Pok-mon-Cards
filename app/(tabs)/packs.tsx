import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { listPacks, openPack, type Pack } from '@/services/packs';

type OpenedCard = { id: string; name: string; rarity: string | null; image: string | null };

export default function PacksScreen() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<OpenedCard[]>([]);

  async function load() {
    try {
      setLoading(true);
      setPacks(await listPacks());
    } catch (error) {
      console.warn(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleOpen(pack: Pack) {
    try {
      setOpening(pack.id);
      setRevealed([]);
      const result = await openPack(pack.id);
      setRevealed(result.cards);
    } catch (error: any) {
      Alert.alert('Não foi possível abrir', error?.message ?? 'Tente novamente.');
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen title="Packs" subtitle="Compre boosters e expanda sua coleção.">
      {loading ? <ActivityIndicator size="large" /> : null}

      {!loading && packs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Loja aguardando catálogo</Text>
          <Text style={styles.muted}>Os boosters aparecerão aqui assim que os sets forem sincronizados no backend.</Text>
        </View>
      ) : null}

      {packs.map((pack) => (
        <View key={pack.id} style={styles.pack}>
          {pack.image_url ? <Image source={{ uri: pack.image_url }} style={styles.packImage} resizeMode="contain" /> : <View style={styles.placeholder}><Text style={styles.placeholderText}>PACK</Text></View>}
          <View style={styles.packInfo}>
            <Text style={styles.packName}>{pack.name}</Text>
            <Text style={styles.muted}>{pack.cards_per_pack} Pokémon cards</Text>
            <Text style={styles.price}>🪙 {pack.price}</Text>
            <Pressable style={[styles.button, opening === pack.id && styles.disabled]} disabled={opening !== null} onPress={() => handleOpen(pack)}>
              <Text style={styles.buttonText}>{opening === pack.id ? 'Abrindo...' : 'ABRIR PACK'}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {revealed.length > 0 ? (
        <View style={styles.revealSection}>
          <Text style={styles.revealTitle}>Seu pack</Text>
          <View style={styles.grid}>
            {revealed.map((card) => (
              <View key={card.id} style={styles.card}>
                {card.image ? <Image source={{ uri: card.image }} style={styles.cardImage} resizeMode="contain" /> : null}
                <Text numberOfLines={1} style={styles.cardName}>{card.name}</Text>
                <Text numberOfLines={1} style={styles.rarity}>{card.rarity ?? 'Sem raridade'}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: '#121722', borderRadius: 18, padding: 20, gap: 8 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  muted: { color: '#9ba4b8', fontSize: 14 },
  pack: { flexDirection: 'row', backgroundColor: '#121722', borderRadius: 20, padding: 16, gap: 16 },
  packImage: { width: 120, height: 165 },
  placeholder: { width: 120, height: 165, borderRadius: 14, backgroundColor: '#232c3d', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#70809d', fontSize: 20, fontWeight: '900' },
  packInfo: { flex: 1, justifyContent: 'center', gap: 8 },
  packName: { color: '#fff', fontSize: 20, fontWeight: '900' },
  price: { color: '#ffd66b', fontSize: 18, fontWeight: '800' },
  button: { marginTop: 8, backgroundColor: '#3b82f6', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '900' },
  revealSection: { gap: 14, marginTop: 8 },
  revealTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '31%', backgroundColor: '#121722', borderRadius: 12, padding: 8, gap: 5 },
  cardImage: { width: '100%', aspectRatio: 0.72 },
  cardName: { color: '#fff', fontSize: 12, fontWeight: '800' },
  rarity: { color: '#9ba4b8', fontSize: 10 },
});
