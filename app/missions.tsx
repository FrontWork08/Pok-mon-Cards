import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { claimMission, getMissions, type PlayerMission } from '@/services/missions';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function MissionsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [missions, setMissions] = useState<PlayerMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setMissions(await getMissions()); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Não foi possível carregar as missões.'); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const daily = useMemo(() => missions.filter((mission) => mission.cadence === 'daily'), [missions]);
  const weekly = useMemo(() => missions.filter((mission) => mission.cadence === 'weekly'), [missions]);

  async function claim(id: string) {
    try {
      setWorking(id);
      const reward = await claimMission(id);
      const diamondText = Number(reward?.diamonds ?? 0) > 0 ? ` + 💎 ${Number(reward.diamonds)}` : '';
      setNotice(`Recompensa coletada: 🪙 ${Number(reward?.coins ?? 0).toLocaleString('pt-BR')} + ${Number(reward?.xp ?? 0)} XP${diamondText}`);
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Não foi possível coletar.'); }
    finally { setWorking(null); }
  }

  return <Screen title="Missões" subtitle="Objetivos diários e semanais com atalhos para cada atividade.">
    <Pressable style={styles.backRow} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text></Pressable>
    {notice ? <Pressable style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} onPress={() => setNotice(null)}><Ionicons name="gift" size={19} color={colors.yellow}/><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></Pressable> : null}
    <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><View style={styles.grow}><Text style={[styles.kicker, { color: colors.yellow }]}>CENTRAL DE MISSÕES</Text><Text style={[styles.heroTitle, { color: colors.text }]}>Jogue e resgate</Text><Text style={[styles.heroText, { color: colors.muted }]}>O progresso é conferido no servidor. Diárias reiniciam todos os dias; semanais, toda segunda-feira.</Text></View><Ionicons name="calendar" size={42} color={colors.yellow}/></View>
    {loading ? <ActivityIndicator size="large" color={colors.yellow}/> : null}
    {!loading && missions.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="checkbox-outline" size={32} color={colors.muted}/><Text style={[styles.emptyText, { color: colors.muted }]}>Nenhuma missão disponível agora.</Text></View> : null}
    <MissionSection title="Diárias" subtitle="Reiniciam à meia-noite" icon="sunny" missions={daily} working={working} onClaim={claim} onGo={(route) => router.push(route as never)}/>
    <MissionSection title="Semanais" subtitle="Reiniciam toda segunda-feira" icon="calendar" missions={weekly} working={working} onClaim={claim} onGo={(route) => router.push(route as never)}/>
  </Screen>;
}

function MissionSection({ title, subtitle, icon, missions, working, onClaim, onGo }: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; missions: PlayerMission[]; working: string | null; onClaim: (id: string) => void; onGo: (route: string) => void }) {
  const { colors } = useAppTheme();
  if (!missions.length) return null;
  return <View style={styles.section}>
    <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name={icon} size={20} color={colors.accent}/></View><View><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text></View></View>
    <View style={styles.list}>{missions.map((mission) => <MissionCard key={mission.id} mission={mission} working={working === mission.id} onClaim={() => onClaim(mission.id)} onGo={() => onGo(mission.action_route)}/>)}</View>
  </View>;
}

function MissionCard({ mission, working, onClaim, onGo }: { mission: PlayerMission; working: boolean; onClaim: () => void; onGo: () => void }) {
  const { colors } = useAppTheme();
  const progress = Math.min(Number(mission.progress ?? 0), Number(mission.target));
  const done = progress >= mission.target;
  const percentage = mission.target ? Math.min(100, progress / mission.target * 100) : 0;
  const icon: keyof typeof Ionicons.glyphMap = mission.event_type.includes('battle') ? 'game-controller' : mission.event_type.includes('pack') || mission.event_type.includes('card') ? 'cube' : mission.event_type.includes('trade') ? 'swap-horizontal' : 'storefront';
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: done ? colors.green : colors.border }]}>
    <View style={styles.cardTop}><View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={icon} size={21} color={done ? colors.green : colors.accent}/></View><View style={styles.grow}><Text style={[styles.title, { color: colors.text }]}>{mission.title}</Text><Text style={[styles.desc, { color: colors.muted }]}>{mission.description}</Text></View><View style={styles.reward}><Text style={[styles.coins, { color: colors.yellow }]}>🪙 {mission.reward_coins.toLocaleString('pt-BR')}</Text><Text style={[styles.xp, { color: colors.muted }]}>+{mission.reward_xp} XP</Text>{mission.reward_diamonds > 0 ? <Text style={styles.diamonds}>💎 {mission.reward_diamonds}</Text> : null}</View></View>
    <View style={styles.progressRow}><View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}><View style={[styles.fill, { backgroundColor: done ? colors.green : colors.accent, width: `${percentage}%` }]}/></View><Text style={[styles.progressText, { color: colors.muted }]}>{progress}/{mission.target}</Text></View>
    {mission.claimed ? <View style={styles.claimed}><Ionicons name="checkmark-circle" size={17} color={colors.green}/><Text style={[styles.claimedText, { color: colors.green }]}>COLETADA</Text></View> : done ? <Pressable style={[styles.claimButton, { backgroundColor: colors.yellow }, working && { opacity: .5 }]} onPress={onClaim} disabled={working}><Ionicons name="gift" size={17} color="#07111F"/><Text style={styles.claimText}>{working ? 'COLETANDO...' : 'COLETAR RECOMPENSA'}</Text></Pressable> : <Pressable style={[styles.goButton, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]} onPress={onGo}><Ionicons name="navigate" size={16} color={colors.accent}/><Text style={[styles.goText, { color: colors.accent }]}>IR PARA MISSÃO</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7 }, backText: { fontSize: 12, fontWeight: '800' }, notice: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 14, borderWidth: 1 }, noticeText: { flex: 1, fontSize: 11, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 18, borderRadius: 22, borderWidth: 1 }, grow: { flex: 1, minWidth: 0 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, heroTitle: { fontSize: 22, fontWeight: '900', marginTop: 3 }, heroText: { fontSize: 10, lineHeight: 15, maxWidth: 520, marginTop: 3 },
  section: { gap: 9 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 4 }, sectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, sectionTitle: { fontSize: 20, fontWeight: '900' }, sectionSubtitle: { fontSize: 8, marginTop: 1 }, list: { gap: 9 },
  card: { padding: 14, borderRadius: 18, borderWidth: 1, gap: 10 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 14, fontWeight: '900' }, desc: { fontSize: 9, lineHeight: 14, marginTop: 3 }, reward: { alignItems: 'flex-end' }, coins: { fontSize: 11, fontWeight: '900' }, xp: { fontSize: 8, fontWeight: '900', marginTop: 2 }, diamonds: { color: '#68D9FF', fontSize: 8, fontWeight: '900', marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, track: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 999 }, progressText: { fontSize: 9, fontWeight: '900' },
  claimButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, padding: 11, borderRadius: 11 }, claimText: { color: '#07111F', fontSize: 9, fontWeight: '900' }, goButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, padding: 10, borderRadius: 11, borderWidth: 1 }, goText: { fontSize: 9, fontWeight: '900' }, claimed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }, claimedText: { fontSize: 8, fontWeight: '900' },
  empty: { padding: 22, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 7 }, emptyText: { fontSize: 10 },
});
