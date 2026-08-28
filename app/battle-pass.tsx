import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerNavigation } from '@/components/TrainerNavigation';
import {
  claimBattlePassReward,
  getBattlePass,
  purchaseBattlePassVip,
  type BattlePassMission,
  type BattlePassReward,
  type BattlePassState,
  type BattlePassTrack,
} from '@/services/battlePass';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type LevelRow = {
  level: number;
  free: BattlePassReward | null;
  vip: BattlePassReward | null;
};

const PERIOD_LABEL: Record<BattlePassMission['period'], string> = {
  daily: 'DIÁRIA',
  weekly: 'SEMANAL',
  season: 'TEMPORADA',
};

export default function BattlePassScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [state, setState] = useState<BattlePassState | null>(null);
  const [tab, setTab] = useState<'rewards' | 'missions'>('rewards');
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const next = await getBattlePass();
      setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o Passe de Batalha.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    void load();
  }, [load]));

  const levels = useMemo<LevelRow[]>(() => {
    if (!state) return [];
    const byKey = new Map(state.rewards.map((reward) => [`${reward.level}:${reward.track}`, reward]));
    return Array.from({ length: state.season.maxLevel }, (_, index) => {
      const level = index + 1;
      return {
        level,
        free: byKey.get(`${level}:free`) ?? null,
        vip: byKey.get(`${level}:vip`) ?? null,
      };
    });
  }, [state]);

  const missions = useMemo(() => {
    if (!state) return [];
    return [...state.missions].sort((a, b) => {
      const order = { daily: 0, weekly: 1, season: 2 };
      return order[a.period] - order[b.period] || Number(b.completed) - Number(a.completed);
    });
  }, [state]);

  async function claim(reward: BattlePassReward) {
    if (!state || workingKey) return;
    const key = `${reward.level}:${reward.track}`;
    try {
      setWorkingKey(key);
      setError(null);
      await claimBattlePassReward(reward.level, reward.track);
      setNotice(`Recompensa do nível ${reward.level} resgatada.`);
      await Promise.all([load(), wallet.refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível resgatar a recompensa.');
    } finally {
      setWorkingKey(null);
    }
  }

  async function buyVip() {
    if (!state || workingKey) return;
    try {
      setWorkingKey('vip');
      setError(null);
      await purchaseBattlePassVip();
      setNotice('Passe VIP liberado para esta temporada.');
      await Promise.all([load(), wallet.refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível liberar o Passe VIP.');
    } finally {
      setWorkingKey(null);
    }
  }

  function confirmVip() {
    if (!state || state.progress.vipUnlocked || workingKey) return;
    Alert.alert(
      'Liberar Passe VIP?',
      `O Passe VIP custa 💎 ${state.season.vipPriceDiamonds}. Seu saldo atual é 💎 ${wallet.diamonds.toLocaleString('pt-BR')}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'LIBERAR VIP', onPress: () => { void buyVip(); } },
      ],
    );
  }

  const progressPct = state
    ? state.progress.level >= state.season.maxLevel
      ? 100
      : Math.min(100, state.progress.xpForNextLevel > 0
        ? state.progress.xpIntoLevel / state.progress.xpForNextLevel * 100
        : 0)
    : 0;

  const header = state ? (
    <View style={styles.headerStack}>
      <TrainerNavigation />
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>Voltar</Text>
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: state.progress.vipUnlocked ? colors.yellow : colors.border }]}>
        <View style={styles.heroTitleRow}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="ribbon" size={28} color={colors.yellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>PASSE DE BATALHA</Text>
            <Text style={[styles.title, { color: colors.text }]}>{state.season.name}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Até {new Date(state.season.endsAt).toLocaleDateString('pt-BR')} • nível máximo {state.season.maxLevel}
            </Text>
          </View>
          {state.progress.vipUnlocked ? (
            <View style={[styles.vipBadge, { backgroundColor: colors.yellow }]}>
              <Ionicons name="diamond" size={15} color="#07111F" />
              <Text style={styles.vipBadgeText}>VIP</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.levelRow}>
          <View>
            <Text style={[styles.levelLabel, { color: colors.muted }]}>NÍVEL DO PASSE</Text>
            <Text style={[styles.levelValue, { color: colors.text }]}>{state.progress.level}<Text style={{ color: colors.muted }}>/{state.season.maxLevel}</Text></Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.levelLabel, { color: colors.muted }]}>XP TOTAL</Text>
            <Text style={[styles.totalXp, { color: colors.yellow }]}>{state.progress.xp.toLocaleString('pt-BR')} / {state.season.totalXpRequired.toLocaleString('pt-BR')}</Text>
          </View>
        </View>

        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fill, { width: `${progressPct}%`, backgroundColor: colors.yellow }]} />
        </View>
        <Text style={[styles.xpHint, { color: colors.muted }]}>
          {state.progress.level >= state.season.maxLevel
            ? 'Passe concluído. Nível 50 alcançado.'
            : `${state.progress.xpIntoLevel.toLocaleString('pt-BR')} / ${state.progress.xpForNextLevel.toLocaleString('pt-BR')} XP para avançar.`}
        </Text>

        {!state.progress.vipUnlocked ? (
          <View style={[styles.vipPanel, { backgroundColor: colors.surfaceAlt, borderColor: colors.yellow }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vipTitle, { color: colors.text }]}>Trilha VIP</Text>
              <Text style={[styles.vipText, { color: colors.muted }]}>Desbloqueia as 50 recompensas VIP desta temporada. O nível continua igual ao da trilha grátis.</Text>
            </View>
            <Pressable
              disabled={Boolean(workingKey)}
              onPress={confirmVip}
              style={[styles.vipButton, { backgroundColor: colors.yellow, opacity: workingKey ? .7 : 1 }]}
            >
              {workingKey === 'vip' ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="diamond" size={18} color="#07111F" />}
              <Text style={styles.vipButtonText}>LIBERAR • 💎 {state.season.vipPriceDiamonds}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={styles.notice}>
          <Ionicons name="checkmark-circle" size={18} color="#65D894" />
          <Text style={styles.noticeText}>{notice}</Text>
        </Pressable>
      ) : null}
      {error ? (
        <Pressable onPress={() => setError(null)} style={styles.error}>
          <Ionicons name="alert-circle" size={18} color="#FF9FAF" />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Tab active={tab === 'rewards'} icon="gift" label="RECOMPENSAS" onPress={() => setTab('rewards')} />
        <Tab active={tab === 'missions'} icon="list" label={`MISSÕES • ${state.missions.length}`} onPress={() => setTab('missions')} />
      </View>
    </View>
  ) : null;

  if (loading) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><PremiumBackground /><View style={styles.center}><ActivityIndicator size="large" color={colors.yellow} /><Text style={[styles.loadingText, { color: colors.muted }]}>Carregando Passe de Batalha...</Text></View></SafeAreaView>;
  }

  if (!state) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}><PremiumBackground /><View style={styles.center}><Ionicons name="calendar-outline" size={38} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum passe ativo</Text><Text style={[styles.loadingText, { color: colors.muted }]}>A próxima temporada aparecerá aqui.</Text><Pressable onPress={() => router.back()} style={[styles.back, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.backText, { color: colors.text }]}>Voltar</Text></Pressable></View></SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      {tab === 'rewards' ? (
        <FlatList
          data={levels}
          keyExtractor={(item) => String(item.level)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          initialNumToRender={7}
          maxToRenderPerBatch={7}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <LevelRewardRow
              row={item}
              reached={item.level <= state.progress.level}
              vipUnlocked={state.progress.vipUnlocked}
              workingKey={workingKey}
              onClaim={claim}
            />
          )}
        />
      ) : (
        <FlatList
          data={missions}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.content}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <MissionRow mission={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function Tab({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={[styles.tab, { backgroundColor: active ? colors.accentSoft : 'transparent' }]}>
      <Ionicons name={icon} size={17} color={active ? colors.yellow : colors.muted} />
      <Text style={[styles.tabText, { color: active ? colors.text : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

function LevelRewardRow({
  row, reached, vipUnlocked, workingKey, onClaim,
}: {
  row: LevelRow;
  reached: boolean;
  vipUnlocked: boolean;
  workingKey: string | null;
  onClaim: (reward: BattlePassReward) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.levelCard, { backgroundColor: colors.surface, borderColor: reached ? colors.accent : colors.border }]}>
      <View style={[styles.levelCircle, { backgroundColor: reached ? colors.accentSoft : colors.surfaceAlt, borderColor: reached ? colors.accent : colors.border }]}>
        <Text style={[styles.levelCircleText, { color: reached ? colors.yellow : colors.muted }]}>{row.level}</Text>
      </View>
      <RewardCell reward={row.free} reached={reached} unlocked workingKey={workingKey} onClaim={onClaim} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <RewardCell reward={row.vip} reached={reached} unlocked={vipUnlocked} workingKey={workingKey} onClaim={onClaim} />
    </View>
  );
}

function RewardCell({
  reward, reached, unlocked, workingKey, onClaim,
}: {
  reward: BattlePassReward | null;
  reached: boolean;
  unlocked: boolean;
  workingKey: string | null;
  onClaim: (reward: BattlePassReward) => void;
}) {
  const { colors } = useAppTheme();
  if (!reward) return <View style={styles.rewardCell} />;
  const key = `${reward.level}:${reward.track}`;
  const canClaim = reached && unlocked && !reward.claimed;
  return (
    <View style={styles.rewardCell}>
      <View style={styles.rewardLabelRow}>
        <Ionicons name={reward.track === 'vip' ? 'diamond' : 'gift'} size={14} color={reward.track === 'vip' ? colors.yellow : colors.accent} />
        <Text style={[styles.rewardTrack, { color: reward.track === 'vip' ? colors.yellow : colors.accent }]}>{reward.track === 'vip' ? 'VIP' : 'GRÁTIS'}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.rewardLabel, { color: colors.text }]}>{reward.label}</Text>
      <Pressable
        disabled={!canClaim || Boolean(workingKey)}
        onPress={() => onClaim(reward)}
        style={[styles.claimButton, {
          backgroundColor: reward.claimed ? colors.surfaceAlt : canClaim ? colors.yellow : colors.surfaceAlt,
          borderColor: reward.claimed ? '#2F9E68' : colors.border,
        }]}
      >
        {workingKey === key ? <ActivityIndicator size="small" color="#07111F" /> :
          <Ionicons name={reward.claimed ? 'checkmark-circle' : !unlocked ? 'lock-closed' : !reached ? 'lock-closed' : 'gift'} size={14} color={reward.claimed ? '#65D894' : canClaim ? '#07111F' : colors.muted} />}
        <Text style={[styles.claimText, { color: reward.claimed ? '#65D894' : canClaim ? '#07111F' : colors.muted }]}>
          {reward.claimed ? 'RESGATADO' : !unlocked ? 'VIP' : !reached ? 'BLOQUEADO' : 'RESGATAR'}
        </Text>
      </Pressable>
    </View>
  );
}

function MissionRow({ mission }: { mission: BattlePassMission }) {
  const { colors } = useAppTheme();
  const pct = Math.min(100, mission.target > 0 ? mission.progress / mission.target * 100 : 0);
  return (
    <View style={[styles.mission, { backgroundColor: colors.surface, borderColor: mission.completed ? '#2F9E68' : colors.border }]}>
      <View style={styles.missionHead}>
        <View style={[styles.periodBadge, { backgroundColor: mission.completed ? '#153426' : colors.accentSoft }]}>
          <Text style={[styles.periodText, { color: mission.completed ? '#65D894' : colors.yellow }]}>{PERIOD_LABEL[mission.period]}</Text>
        </View>
        <Text style={[styles.missionXp, { color: colors.yellow }]}>+{mission.xpReward.toLocaleString('pt-BR')} XP</Text>
      </View>
      <Text style={[styles.missionTitle, { color: colors.text }]}>{mission.title}</Text>
      <Text style={[styles.missionDescription, { color: colors.muted }]}>{mission.description}</Text>
      <View style={styles.missionProgressRow}>
        <Text style={[styles.missionCount, { color: mission.completed ? '#65D894' : colors.muted }]}>{mission.progress}/{mission.target}</Text>
        {mission.completed ? <View style={styles.completeRow}><Ionicons name="checkmark-circle" size={15} color="#65D894" /><Text style={styles.completeText}>CONCLUÍDA</Text></View> : null}
      </View>
      <View style={[styles.missionTrack, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.missionFill, { width: `${pct}%`, backgroundColor: mission.completed ? '#65D894' : colors.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  content: { paddingHorizontal: 14, paddingBottom: 120, gap: 10 },
  headerStack: { gap: 12, paddingTop: 8, paddingBottom: 6 },
  topRow: { flexDirection: 'row' },
  back: { minHeight: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { fontSize: 10, fontWeight: '900' },
  hero: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 13 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 2 },
  subtitle: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  vipBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  vipBadgeText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  levelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  levelLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  levelValue: { fontSize: 32, fontWeight: '900' },
  totalXp: { fontSize: 12, fontWeight: '900', marginTop: 4 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  xpHint: { fontSize: 9, fontWeight: '700' },
  vipPanel: { borderRadius: 17, borderWidth: 1, padding: 12, gap: 10 },
  vipTitle: { fontSize: 15, fontWeight: '900' },
  vipText: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  vipButton: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  vipButtonText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: '#2F6F52', backgroundColor: '#142C23', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { flex: 1, color: '#D9F7E7', fontSize: 10, fontWeight: '800' },
  error: { borderRadius: 14, borderWidth: 1, borderColor: '#683243', backgroundColor: '#351A24', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1, color: '#FFD7DD', fontSize: 10, fontWeight: '800' },
  tabs: { borderWidth: 1, borderRadius: 15, padding: 4, flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabText: { fontSize: 8, fontWeight: '900', letterSpacing: .5 },
  levelCard: { minHeight: 132, borderRadius: 19, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  levelCircle: { width: 42, alignSelf: 'center', height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  levelCircleText: { fontSize: 17, fontWeight: '900' },
  rewardCell: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 6 },
  divider: { width: 1, marginVertical: 6 },
  rewardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rewardTrack: { fontSize: 7, fontWeight: '900', letterSpacing: .6 },
  rewardLabel: { fontSize: 11, lineHeight: 15, fontWeight: '900', minHeight: 30 },
  claimButton: { minHeight: 32, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 5 },
  claimText: { fontSize: 7, fontWeight: '900' },
  mission: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 7 },
  missionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  periodBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  periodText: { fontSize: 7, fontWeight: '900', letterSpacing: .6 },
  missionXp: { fontSize: 9, fontWeight: '900' },
  missionTitle: { fontSize: 15, fontWeight: '900' },
  missionDescription: { fontSize: 9, lineHeight: 14 },
  missionProgressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  missionCount: { fontSize: 9, fontWeight: '900' },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completeText: { color: '#65D894', fontSize: 7, fontWeight: '900' },
  missionTrack: { height: 7, borderRadius: 999, overflow: 'hidden' },
  missionFill: { height: '100%', borderRadius: 999 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 11, textAlign: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '900' },
});
