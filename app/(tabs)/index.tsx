import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag, getMyProfile } from '@/services/player';
import { getMyTrades } from '@/services/trades';
import { gameTheme } from '@/theme/gameTheme';

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [bag, setBag] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMyProfile(), getMyBag(), getMyTrades()])
      .then(([profileData, bagData, tradesData]) => {
        setProfile(profileData);
        setBag(bagData ?? []);
        setTrades(tradesData ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalCards = bag.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    const species = new Set(
      bag
        .map((item) => item.cards?.pokedex_numbers?.[0])
        .filter((value) => typeof value === 'number')
    ).size;
    const completedTrades = trades.filter((trade) => trade.status === 'completed').length;
    return { totalCards, species, completedTrades };
  }, [bag, trades]);

  return (
    <Screen title={`Olá, ${profile?.username ?? 'Trainer'}`} subtitle="Sua coleção, seus boosters e suas trocas em um só lugar.">
      {loading ? <ActivityIndicator color={gameTheme.colors.yellow} size="large" /> : null}

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.coinBadge}>
            <Ionicons name="sparkles" color={gameTheme.colors.yellow} size={16} />
            <Text style={styles.coinText}>{Number(profile?.coins ?? 0).toLocaleString('pt-BR')}</Text>
          </View>
          <Text style={styles.level}>LV. {profile?.level ?? 1}</Text>
        </View>
        <Text style={styles.heroEyebrow}>PRÓXIMO PULL PODE SER O RARO</Text>
        <Text style={styles.heroTitle}>Abra um booster e aumente sua coleção.</Text>
        <Text style={styles.heroText}>Todos os resultados são sorteados e registrados pelo servidor.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/packs')}>
          <Ionicons name="cube" color="#07111F" size={19} />
          <Text style={styles.primaryButtonText}>IR PARA OS PACKS</Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <Stat icon="albums" label="Cards" value={stats.totalCards.toLocaleString('pt-BR')} />
        <Stat icon="paw" label="Pokédex" value={String(stats.species)} />
        <Stat icon="swap-horizontal" label="Trocas" value={String(stats.completedTrades)} />
        <Stat icon="flash" label="XP" value={Number(profile?.xp ?? 0).toLocaleString('pt-BR')} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKicker}>JORNADA</Text>
          <Text style={styles.sectionTitle}>Seu progresso</Text>
        </View>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressIcon}><Ionicons name="trophy" size={24} color={gameTheme.colors.yellow} /></View>
        <View style={styles.progressBody}>
          <Text style={styles.progressTitle}>Colecionador nível {profile?.level ?? 1}</Text>
          <Text style={styles.progressText}>Continue abrindo packs, completando sets e negociando duplicatas.</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Number(profile?.xp ?? 0) % 100)}%` }]} /></View>
        </View>
      </View>
    </Screen>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}><Ionicons name={icon} size={19} color={gameTheme.colors.blue} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#10284B', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#285A9A', gap: 10, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coinBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#071728', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
  coinText: { color: gameTheme.colors.yellow, fontWeight: '900', fontSize: 14 },
  level: { color: '#AFC9F4', fontWeight: '900', fontSize: 12 },
  heroEyebrow: { color: '#76A9FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 6 },
  heroTitle: { color: '#fff', fontSize: 25, lineHeight: 30, fontWeight: '900', maxWidth: 310 },
  heroText: { color: '#B7C8E3', lineHeight: 20, fontSize: 14 },
  primaryButton: { marginTop: 6, flexDirection: 'row', gap: 8, alignSelf: 'flex-start', alignItems: 'center', backgroundColor: gameTheme.colors.yellow, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  primaryButtonText: { color: '#07111F', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48.5%', backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: gameTheme.colors.border },
  statIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#102A4E', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  statValue: { color: gameTheme.colors.text, fontSize: 23, fontWeight: '900' },
  statLabel: { color: gameTheme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  sectionKicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { color: gameTheme.colors.text, fontSize: 21, fontWeight: '900', marginTop: 2 },
  progressCard: { flexDirection: 'row', gap: 14, backgroundColor: gameTheme.colors.surface, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: gameTheme.colors.border },
  progressIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#302B19', alignItems: 'center', justifyContent: 'center' },
  progressBody: { flex: 1 },
  progressTitle: { color: gameTheme.colors.text, fontSize: 16, fontWeight: '900' },
  progressText: { color: gameTheme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  progressTrack: { height: 7, backgroundColor: '#1C2A3E', borderRadius: 999, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: gameTheme.colors.yellow, borderRadius: 999 },
});
