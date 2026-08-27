import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { equipAchievementTitle, getMyAchievements, refreshAchievements, type PlayerAchievement } from '@/services/achievements';
import { getMyProfile, type PlayerProfile } from '@/services/player';
import { useAppTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | 'unlocked' | 'locked';

export default function AchievementsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [achievements, setAchievements] = useState<PlayerAchievement[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setNotice(null);
      await refreshAchievements();
      const [player, rows] = await Promise.all([getMyProfile(), getMyAchievements()]);
      setProfile(player); setAchievements(rows);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar suas conquistas.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unlockedCount = achievements.filter((item) => item.unlocked_at).length;
  const visible = useMemo(() => achievements.filter((item) => filter === 'all' || (filter === 'unlocked' ? Boolean(item.unlocked_at) : !item.unlocked_at)), [achievements, filter]);
  const equippedRow = achievements.find((item) => item.achievement_id === profile?.equipped_title_id);
  const equipped = equippedRow ? (Array.isArray(equippedRow.achievement) ? equippedRow.achievement[0] : equippedRow.achievement) : null;

  async function equip(achievementId: string) {
    try {
      setWorking(achievementId); setNotice(null);
      await equipAchievementTitle(achievementId);
      setProfile((current) => current ? { ...current, equipped_title_id: achievementId } : current);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível equipar o título.');
    } finally { setWorking(null); }
  }

  return <Screen title="Conquistas e Títulos" subtitle="Acompanhe desafios concluídos e escolha o título exibido no seu perfil.">
    <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText, { color: colors.muted }]}>Voltar ao perfil</Text></Pressable>
    {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={18} color={colors.yellow} /><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
    {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

    <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <View style={[styles.heroIcon, { backgroundColor: colors.surface }]}><Ionicons name="ribbon" size={31} color={colors.yellow} /></View>
      <View style={styles.grow}><Text style={[styles.kicker, { color: colors.yellow }]}>TÍTULO EQUIPADO</Text><Text style={[styles.heroTitle, { color: colors.text }]}>{equipped ? `${equipped.icon} ${equipped.title}` : 'Nenhum título equipado'}</Text><Text style={[styles.heroMeta, { color: colors.muted }]}>{unlockedCount} de {achievements.length} conquistas desbloqueadas</Text></View>
    </View>

    <View style={styles.filters}>
      <FilterChip label="Todas" active={filter === 'all'} onPress={() => setFilter('all')} />
      <FilterChip label="Desbloqueadas" active={filter === 'unlocked'} onPress={() => setFilter('unlocked')} />
      <FilterChip label="Bloqueadas" active={filter === 'locked'} onPress={() => setFilter('locked')} />
    </View>

    {!loading && visible.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="ribbon-outline" size={34} color={colors.muted} /><Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma conquista neste filtro.</Text></View> : null}

    <View style={styles.grid}>{visible.map((item) => {
      const def = Array.isArray(item.achievement) ? item.achievement[0] : item.achievement;
      if (!def) return null;
      const unlocked = Boolean(item.unlocked_at);
      const isEquipped = profile?.equipped_title_id === item.achievement_id;
      const progress = Math.min(100, Number(item.progress ?? 0) / Math.max(1, Number(def.target ?? 1)) * 100);
      return <Pressable key={item.achievement_id} onPress={() => unlocked && !isEquipped && equip(item.achievement_id)} disabled={!unlocked || Boolean(working)} style={[styles.card, { backgroundColor: unlocked ? colors.surface : colors.surfaceAlt, borderColor: isEquipped ? colors.yellow : unlocked ? colors.accent : colors.border }, !unlocked && styles.locked]}>
        <View style={styles.cardTop}><Text style={styles.icon}>{unlocked ? def.icon : '🔒'}</Text><Text style={[styles.state, { color: isEquipped ? colors.yellow : colors.muted }]}>{isEquipped ? 'EQUIPADO' : unlocked ? working === item.achievement_id ? 'EQUIPANDO…' : 'TOQUE PARA EQUIPAR' : Math.min(item.progress, def.target) + '/' + def.target}</Text></View>
        <Text style={[styles.name, { color: colors.text }]}>{def.name}</Text>
        <Text style={[styles.title, { color: unlocked ? colors.yellow : colors.muted }]}>{def.title}</Text>
        <Text style={[styles.description, { color: colors.muted }]}>{def.description}</Text>
        <View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { width: `${progress}%` as `${number}%`, backgroundColor: unlocked ? colors.yellow : colors.accent }]} /></View>
      </Pressable>;
    })}</View>
  </Screen>;
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.filter, { backgroundColor: active ? colors.accentSoft : colors.surface, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.filterText, { color: active ? colors.text : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 12, fontWeight: '800' },
  notice: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 14, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  noticeText: { flex: 1, color: '#F8EFCB', fontSize: 11, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: 21, borderWidth: 1 },
  heroIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { fontSize: 20, fontWeight: '900', marginTop: 3 },
  heroMeta: { fontSize: 9, marginTop: 3 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  filterText: { fontSize: 9, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: { flexGrow: 1, flexBasis: 245, minWidth: 170, padding: 13, borderRadius: 17, borderWidth: 1 },
  locked: { opacity: .64 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  icon: { fontSize: 25 },
  state: { fontSize: 7, fontWeight: '900' },
  name: { fontSize: 14, fontWeight: '900', marginTop: 8 },
  title: { fontSize: 11, fontWeight: '900', marginTop: 2 },
  description: { fontSize: 9, lineHeight: 14, marginTop: 5 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 10 },
  fill: { height: '100%', borderRadius: 999 },
  empty: { padding: 24, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 10, fontWeight: '800' },
});
