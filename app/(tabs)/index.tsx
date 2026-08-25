import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyBag, getMyProfile } from '@/services/player';
import { claimDailyReward } from '@/services/playerActions';
import { getMyTrades } from '@/services/trades';
import { gameTheme } from '@/theme/gameTheme';

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [bag, setBag] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [profileData, bagData, tradesData] = await Promise.all([getMyProfile(), getMyBag(), getMyTrades()]);
      setProfile(profileData);
      setBag(bagData ?? []);
      setTrades(tradesData ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = useMemo(() => {
    const totalCards = bag.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    const species = new Set(
      bag.map((item) => item.cards?.pokedex_numbers?.[0]).filter((value) => typeof value === 'number')
    ).size;
    const completedTrades = trades.filter((trade) => trade.status === 'completed').length;
    return { totalCards, species, completedTrades };
  }, [bag, trades]);

  const canClaimDaily = useMemo(() => {
    if (!profile?.last_daily_claim_at) return true;
    return Date.now() - new Date(profile.last_daily_claim_at).getTime() >= 24 * 60 * 60 * 1000;
  }, [profile?.last_daily_claim_at]);

  async function claimDaily() {
    if (!canClaimDaily || claiming) return;
    try {
      setClaiming(true);
      const reward = await claimDailyReward();
      setNotice(`Recompensa recebida: +${reward.rewardCoins} moedas e +${reward.rewardXp} XP.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível receber a recompensa.');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Screen title={`Olá, ${profile?.username ?? 'Trainer'}`} subtitle="Sua coleção, seus boosters e suas trocas em um só lugar.">
      {loading ? <ActivityIndicator color={gameTheme.colors.yellow} size="large" /> : null}

      {notice ? (
        <View style={styles.notice}>
          <Ionicons name="gift" size={20} color={gameTheme.colors.yellow} />
          <Text style={styles.noticeText}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable>
        </View>
      ) : null}

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
        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/packs')}>
            <Ionicons name="cube" color="#07111F" size={19} />
            <Text style={styles.primaryButtonText}>IR PARA OS PACKS</Text>
          </Pressable>
          <Pressable style={[styles.dailyButton, !canClaimDaily && styles.dailyDisabled]} onPress={claimDaily} disabled={!canClaimDaily || claiming}>
            <Ionicons name="gift-outline" color={canClaimDaily ? '#fff' : '#6F8198'} size={18} />
            <Text style={[styles.dailyText, !canClaimDaily && styles.dailyTextDisabled]}>{claiming ? 'RECEBENDO...' : canClaimDaily ? 'RECOMPENSA DIÁRIA' : 'VOLTE AMANHÃ'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <Stat icon="albums" label="Cards" value={stats.totalCards.toLocaleString('pt-BR')} onPress={() => router.push('/(tabs)/bag')} />
        <Stat icon="paw" label="Pokédex" value={String(stats.species)} onPress={() => router.push('/pokedex')} />
        <Stat icon="swap-horizontal" label="Trocas" value={String(stats.completedTrades)} onPress={() => router.push('/(tabs)/trade')} />
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
          <Text style={styles.progressText}>Cada booster agora concede XP. Complete a barra para subir de nível.</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (Number(profile?.xp ?? 0) % 250) / 2.5)}%` }]} /></View>
          <Text style={styles.progressMeta}>{Number(profile?.xp ?? 0) % 250} / 250 XP para o próximo nível</Text>
        </View>
      </View>
    </Screen>
  );
}

function Stat({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress?: () => void }) {
  const content = (
    <>
      <View style={styles.statIcon}><Ionicons name={icon} size={19} color={gameTheme.colors.blue} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <View style={styles.statBottom}><Text style={styles.statLabel}>{label}</Text>{onPress ? <Ionicons name="chevron-forward" size={14} color="#5E7390" /> : null}</View>
    </>
  );
  return onPress ? <Pressable onPress={onPress} style={styles.statCard}>{content}</Pressable> : <View style={styles.statCard}>{content}</View>;
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  noticeText: { flex: 1, color: '#F8EFCB', fontWeight: '700', fontSize: 12 },
  hero: { backgroundColor: '#10284B', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#285A9A', gap: 10, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coinBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#071728', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
  coinText: { color: gameTheme.colors.yellow, fontWeight: '900', fontSize: 14 },
  level: { color: '#AFC9F4', fontWeight: '900', fontSize: 12 },
  heroEyebrow: { color: '#76A9FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 6 },
  heroTitle: { color: '#fff', fontSize: 25, lineHeight: 30, fontWeight: '900', maxWidth: 410 },
  heroText: { color: '#B7C8E3', lineHeight: 20, fontSize: 14 },
  heroActions: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  primaryButton: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: gameTheme.colors.yellow, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  primaryButtonText: { color: '#07111F', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  dailyButton: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#214E8D', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
  dailyDisabled: { backgroundColor: '#152236' },
  dailyText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  dailyTextDisabled: { color: '#6F8198' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48.5%', backgroundColor: gameTheme.colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: gameTheme.colors.border },
  statIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#102A4E', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  statValue: { color: gameTheme.colors.text, fontSize: 23, fontWeight: '900' },
  statBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  progressMeta: { color: '#6E839F', fontSize: 9, fontWeight: '800', marginTop: 5 },
});
