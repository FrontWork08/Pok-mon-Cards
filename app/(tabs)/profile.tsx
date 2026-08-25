import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { signOut } from '@/services/auth';
import { getMyProfile, getMyProfileStats, type PlayerProfile } from '@/services/player';
import { getMySocial } from '@/services/social';
import { gameTheme } from '@/theme/gameTheme';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [incomingCount, setIncomingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [profileData, statData, social] = await Promise.all([getMyProfile(), getMyProfileStats(), getMySocial()]);
      setProfile(profileData);
      setStats(statData);
      setFriendCount(social.friends.length);
      setIncomingCount(social.incoming.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar seu perfil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSignOut() {
    try {
      await signOut();
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível sair.');
    }
  }

  return (
    <Screen title="Trainer Profile" subtitle="Sua identidade, coleção e progresso no jogo.">
      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}
      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9FAF" /><Text style={styles.errorText}>{error}</Text></View> : null}

      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{profile?.username?.slice(0, 1).toUpperCase() ?? '?'}</Text></View>
        <View style={styles.heroInfo}>
          <Text style={styles.kicker}>TRAINER ID</Text>
          <Text style={styles.username}>@{profile?.username ?? '---'}</Text>
          <Text style={styles.meta}>Nível {profile?.level ?? 1} • {Number(profile?.xp ?? 0).toLocaleString('pt-BR')} XP</Text>
        </View>
        <View style={styles.coinBox}><Text style={styles.coinLabel}>MOEDAS</Text><Text style={styles.coins}>🪙 {Number(profile?.coins ?? 0).toLocaleString('pt-BR')}</Text></View>
      </View>

      <View style={styles.statsGrid}>
        <Stat icon="albums" value={stats?.totalCards ?? 0} label="Cards" />
        <Stat icon="paw" value={stats?.species ?? 0} label="Pokédex" />
        <Stat icon="cube" value={stats?.packsOpened ?? 0} label="Packs" />
        <Stat icon="swap-horizontal" value={stats?.completedTrades ?? 0} label="Trocas" />
        <Stat icon="heart" value={stats?.favorites ?? 0} label="Favoritos" />
        <Stat icon="people" value={friendCount} label="Amigos" />
      </View>

      <View style={styles.featureGrid}>
        <FeatureLink
          icon="people"
          iconColor={gameTheme.colors.blue}
          title="Amigos"
          text={friendCount + ' amigos' + (incomingCount > 0 ? ` • ${incomingCount} solicitação${incomingCount > 1 ? 'ões' : ''} aguardando` : ' • encontre treinadores e inicie trocas')}
          onPress={() => router.push('/friends')}
          badge={incomingCount || undefined}
        />
        <FeatureLink
          icon="book"
          iconColor={gameTheme.colors.yellow}
          title="Pokédex"
          text="Veja as 1.025 espécies, gerações e todas as versões de cards descobertas."
          onPress={() => router.push('/pokedex')}
        />
        <FeatureLink
          icon="layers"
          iconColor="#65D894"
          title="Coleções por Set"
          text="Acompanhe seu progresso, cards faltantes e sets completados."
          onPress={() => router.push('/sets')}
        />
        <FeatureLink
          icon="time"
          iconColor="#B26CFF"
          title="Histórico de Packs"
          text={`${stats?.packsOpened ?? 0} boosters abertos • reveja seus melhores pulls.`}
          onPress={() => router.push('/history')}
        />
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressTop}><Text style={styles.progressTitle}>Progresso do nível</Text><Text style={styles.progressValue}>{Number(profile?.xp ?? 0) % 250} / 250 XP</Text></View>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, (Number(profile?.xp ?? 0) % 250) / 2.5)}%` }]} /></View>
        <Text style={styles.progressHint}>Abra boosters e colete recompensas para ganhar XP.</Text>
      </View>

      <Pressable style={styles.logout} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color="#FF8A8A" />
        <Text style={styles.logoutText}>Sair da conta</Text>
      </Pressable>
    </Screen>
  );
}

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIcon}><Ionicons name={icon} size={18} color={gameTheme.colors.blue} /></View>
      <Text style={styles.statValue}>{Number(value).toLocaleString('pt-BR')}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FeatureLink({ icon, iconColor, title, text, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; iconColor: string; title: string; text: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable style={styles.feature} onPress={onPress}>
      <View style={styles.featureIcon}><Ionicons name={icon} size={23} color={iconColor} /></View>
      <View style={styles.featureBody}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureText}>{text}</Text></View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : <Ionicons name="chevron-forward" size={20} color="#687E9A" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, padding: 12, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD7DD', fontWeight: '700', fontSize: 12 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, backgroundColor: '#10284B', borderWidth: 1, borderColor: '#285A9A' },
  avatar: { width: 70, height: 70, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173C6D', borderWidth: 1, borderColor: '#3471B8' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  heroInfo: { flex: 1, minWidth: 190 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  username: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 3 },
  meta: { color: '#A7BBD5', fontSize: 12, marginTop: 4 },
  coinBox: { minWidth: 130, padding: 12, borderRadius: 16, backgroundColor: '#0B1A2D' },
  coinLabel: { color: '#7086A5', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  coins: { color: gameTheme.colors.yellow, fontSize: 18, fontWeight: '900', marginTop: 3 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: { flexGrow: 1, flexBasis: 145, minWidth: 135, padding: 14, borderRadius: 18, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  statIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#102A4E', alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '900' },
  statLabel: { color: '#8297B2', fontSize: 10, fontWeight: '800', marginTop: 2 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  feature: { flexGrow: 1, flexBasis: 360, minWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  featureIcon: { width: 45, height: 45, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C1A2D' },
  featureBody: { flex: 1 },
  featureTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  featureText: { color: '#8498B2', fontSize: 10, lineHeight: 15, marginTop: 3 },
  badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D84B64' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  progressCard: { padding: 15, borderRadius: 18, backgroundColor: '#0D1929', borderWidth: 1, borderColor: '#213852' },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  progressValue: { color: '#8EA4BF', fontSize: 10, fontWeight: '800' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: '#1A2A3E', marginTop: 11 },
  fill: { height: '100%', backgroundColor: gameTheme.colors.yellow, borderRadius: 999 },
  progressHint: { color: '#7186A0', fontSize: 9, marginTop: 7 },
  logout: { marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: '#C64E5A', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  logoutText: { color: '#FF8A8A', fontWeight: '900', fontSize: 11 },
});
