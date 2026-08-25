import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { listPacks, openPack, type Pack } from '@/services/packs';
import { gameTheme } from '@/theme/gameTheme';

type OpenedCard = { id: string; name: string; rarity: string | null; image: string | null };

const PAGE_SIZE = 18;

export default function PacksScreen() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<OpenedCard[]>([]);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packs;
    return packs.filter((pack) => pack.name.toLowerCase().includes(term) || pack.set_id.toLowerCase().includes(term));
  }, [packs, search]);

  const visiblePacks = filtered.slice(0, visibleCount);

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
    <Screen title="Pack Shop" subtitle="Escolha uma coleção, abra o booster e torça pelo pull raro.">
      <View style={styles.shopHero}>
        <View style={styles.shopHeroIcon}><Ionicons name="sparkles" size={22} color={gameTheme.colors.yellow} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.shopHeroKicker}>CATÁLOGO ONLINE</Text>
          <Text style={styles.shopHeroTitle}>{packs.length || 173} boosters disponíveis</Text>
          <Text style={styles.shopHeroText}>Somente cards de Pokémon. Energy e Trainer ficam fora dos packs.</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={gameTheme.colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar booster ou set..."
          placeholderTextColor="#70839F"
          autoCapitalize="none"
          style={styles.searchInput}
        />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={gameTheme.colors.muted} /></Pressable> : null}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Boosters</Text>
        <Text style={styles.resultCount}>{filtered.length} encontrados</Text>
      </View>

      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      {!loading && filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={30} color={gameTheme.colors.muted} />
          <Text style={styles.emptyTitle}>Nenhum booster encontrado</Text>
          <Text style={styles.muted}>Tente pesquisar por outro nome de coleção.</Text>
        </View>
      ) : null}

      <View style={styles.packGrid}>
        {visiblePacks.map((pack) => (
          <View key={pack.id} style={styles.pack}>
            <View style={styles.imageWrap}>
              {pack.image_url ? <Image source={{ uri: pack.image_url }} style={styles.packImage} resizeMode="contain" /> : <View style={styles.placeholder}><Ionicons name="cube" size={36} color="#55739F" /><Text style={styles.placeholderText}>BOOSTER</Text></View>}
              <View style={styles.cardCountBadge}><Text style={styles.cardCountText}>{pack.cards_per_pack} cards</Text></View>
            </View>
            <Text numberOfLines={2} style={styles.packName}>{pack.name}</Text>
            <Text numberOfLines={1} style={styles.setId}>{pack.set_id.toUpperCase()}</Text>
            <View style={styles.packFooter}>
              <Text style={styles.price}>🪙 {pack.price}</Text>
              <Pressable style={[styles.openButton, opening !== null && styles.disabled]} disabled={opening !== null} onPress={() => handleOpen(pack)}>
                <Text style={styles.openButtonText}>{opening === pack.id ? '...' : 'ABRIR'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {visibleCount < filtered.length ? (
        <Pressable style={styles.loadMore} onPress={() => setVisibleCount((value) => value + PAGE_SIZE)}>
          <Text style={styles.loadMoreText}>VER MAIS BOOSTERS</Text>
          <Ionicons name="chevron-down" size={18} color={gameTheme.colors.blue} />
        </Pressable>
      ) : null}

      {revealed.length > 0 ? (
        <View style={styles.revealSection}>
          <View>
            <Text style={styles.revealKicker}>PACK ABERTO</Text>
            <Text style={styles.revealTitle}>Seus novos cards</Text>
          </View>
          <View style={styles.cardGrid}>
            {revealed.map((card) => (
              <View key={card.id} style={styles.card}>
                {card.image ? <Image source={{ uri: card.image }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardPlaceholder} />}
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
  pack: { width: '48.5%', backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: gameTheme.colors.border },
  imageWrap: { height: 184, borderRadius: 16, backgroundColor: '#0A1627', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  packImage: { width: '88%', height: '92%' },
  placeholder: { alignItems: 'center', gap: 8 },
  placeholderText: { color: '#55739F', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  cardCountBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#07111FCC', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  cardCountText: { color: '#C5D4E8', fontSize: 9, fontWeight: '800' },
  packName: { color: gameTheme.colors.text, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 10, minHeight: 36 },
  setId: { color: '#6F85A4', fontSize: 10, fontWeight: '800', marginTop: 2 },
  packFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  price: { color: gameTheme.colors.yellow, fontSize: 13, fontWeight: '900' },
  openButton: { backgroundColor: gameTheme.colors.blue, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11 },
  openButtonText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  disabled: { opacity: 0.45 },
  loadMore: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: gameTheme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: gameTheme.colors.border },
  loadMoreText: { color: gameTheme.colors.blue, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  revealSection: { gap: 14, marginTop: 8, paddingTop: 6 },
  revealKicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  revealTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 2 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '31%', backgroundColor: gameTheme.colors.surface, borderRadius: 14, padding: 7, borderWidth: 1, borderColor: gameTheme.colors.border },
  cardImage: { width: '100%', aspectRatio: 0.72 },
  cardPlaceholder: { width: '100%', aspectRatio: 0.72, borderRadius: 8, backgroundColor: '#1A2A40' },
  cardName: { color: '#fff', fontSize: 11, fontWeight: '900', marginTop: 5 },
  rarity: { color: gameTheme.colors.muted, fontSize: 9, marginTop: 2 },
});
