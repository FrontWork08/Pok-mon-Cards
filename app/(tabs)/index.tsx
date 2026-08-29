import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TrainerIdentityCard } from '@/components/TrainerIdentityCard';
import { getMyProfile, getMyProfileStats, type PlayerProfile } from '@/services/player';
import { claimDailyReward } from '@/services/playerActions';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getBattlePass, type BattlePassState } from '@/services/battlePass';
import { formatUsd, isCurrentUserAdmin } from '@/services/market';
import { GlobalChatHomeCard } from '@/components/GlobalChatHomeCard';
import { UpdateLogHomeCard } from '@/components/UpdateLogHomeCard';

type HomeStats = Awaited<ReturnType<typeof getMyProfileStats>>;

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isLight } = useAppTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [battlePass, setBattlePass] = useState<BattlePassState | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [nextProfile, nextStats, nextPass, nextAdmin] = await Promise.all([
        getMyProfile(),
        getMyProfileStats(),
        getBattlePass().catch(() => null),
        isCurrentUserAdmin().catch(() => false),
      ]);
      setProfile(nextProfile);
      setStats(nextStats);
      setBattlePass(nextPass);
      setIsAdmin(nextAdmin);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível atualizar a Home.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const canClaimDaily = useMemo(
    () => !profile?.last_daily_claim_at
      || Date.now() - new Date(profile.last_daily_claim_at).getTime() >= 24 * 60 * 60 * 1000,
    [profile?.last_daily_claim_at],
  );

  const passProgress = useMemo(() => {
    if (!battlePass) return 0;
    if (battlePass.progress.level >= battlePass.season.maxLevel) return 100;
    if (!battlePass.progress.xpForNextLevel) return 0;
    return Math.min(
      100,
      battlePass.progress.xpIntoLevel / battlePass.progress.xpForNextLevel * 100,
    );
  }, [battlePass]);

  async function claimDaily() {
    if (!canClaimDaily || claiming) return;
    try {
      setClaiming(true);
      const reward = await claimDailyReward();
      setNotice(
        `Recompensa recebida: +🪙 ${Number(reward.rewardCoins).toLocaleString('pt-BR')} e +${reward.rewardXp} XP.`,
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível receber a recompensa.');
    } finally {
      setClaiming(false);
    }
  }

  const topCard = stats?.mostValuableMarketCard ?? stats?.mostValuableCard ?? null;

  return (
    <Screen
      title="Trainer Collection"
      subtitle={`Bem-vindo de volta, @${profile?.username ?? 'trainer'}. Sua jornada começa aqui.`}
    >
      {loading ? <ActivityIndicator color={colors.yellow} size="large" /> : null}

      {notice ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: isLight ? '#FFF7D6' : '#252115',
              borderColor: colors.yellow,
            },
          ]}
        >
          <Ionicons name="sparkles" size={19} color={colors.yellow} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)}>
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      <TrainerIdentityCard
        profile={profile}
        collectionValueUsd={Number(stats?.collectionMarketValueUsd ?? 0)}
        isAdmin={isAdmin}
        onPress={() => router.push('/(tabs)/profile')}
      />

      <View style={styles.quickGrid}>
        <QuickAction
          icon="cube"
          title="ABRIR PACKS"
          subtitle="Buscar novas cartas"
          accent={colors.yellow}
          onPress={() => router.push('/(tabs)/packs')}
          primary
        />
        <QuickAction
          icon="albums"
          title="MINHA BAG"
          subtitle={`${Number(stats?.totalCards ?? 0).toLocaleString('pt-BR')} cartas`}
          accent={colors.accent}
          onPress={() => router.push('/(tabs)/bag')}
        />
        <QuickAction
          icon="game-controller"
          title="BATALHAR"
          subtitle={`${profile?.battle_rating ?? 1000} ELO`}
          accent="#FF8E76"
          onPress={() => router.push('/(tabs)/battles')}
        />
        <QuickAction
          icon="swap-horizontal"
          title="TROCAR"
          subtitle="Negocie com amigos"
          accent="#72D9C2"
          onPress={() => router.push('/(tabs)/trade')}
        />
      </View>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.sectionKicker, { color: colors.yellow }]}>COLEÇÃO</Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Seu pulso de colecionador</Text>
        </View>
        <Pressable onPress={() => router.push('/collection-ranking')} style={styles.sectionLink}>
          <Text style={[styles.sectionLinkText, { color: colors.yellow }]}>RANKING</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.yellow} />
        </Pressable>
      </View>

      <View style={[styles.collectionPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.collectionMetrics}>
          <CollectionMetric
            label="VALOR"
            value={formatUsd(Number(stats?.collectionMarketValueUsd ?? 0))}
            icon="diamond"
          />
          <CollectionMetric
            label="DIFERENTES"
            value={Number(stats?.uniqueCards ?? 0).toLocaleString('pt-BR')}
            icon="grid"
          />
          <CollectionMetric
            label="POKÉDEX"
            value={Number(stats?.species ?? 0).toLocaleString('pt-BR')}
            icon="paw"
          />
          <CollectionMetric
            label="PACKS"
            value={Number(stats?.packsOpened ?? 0).toLocaleString('pt-BR')}
            icon="cube"
          />
        </View>

        {topCard ? (
          <Pressable
            onPress={() => router.push(`/card/${topCard.id}`)}
            style={[styles.topPull, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          >
            {topCard.image_small ? (
              <Image
                source={{ uri: topCard.image_small }}
                resizeMode="contain"
                fadeDuration={0}
                style={styles.topPullImage}
              />
            ) : (
              <View style={[styles.topPullImage, { backgroundColor: colors.surface }]} />
            )}

            <View style={styles.topPullCopy}>
              <Text style={[styles.topPullKicker, { color: colors.yellow }]}>DESTAQUE DA COLEÇÃO</Text>
              <Text numberOfLines={1} style={[styles.topPullName, { color: colors.text }]}>
                {topCard.pokemon_name}
              </Text>
              <Text numberOfLines={1} style={[styles.topPullMeta, { color: colors.muted }]}>
                {topCard.rarity ?? 'Sem raridade'} • {topCard.set_name}
              </Text>
              <Text style={[styles.topPullValue, { color: colors.yellow }]}>
                {topCard.market_price_usd == null
                  ? 'Sem cotação'
                  : formatUsd(Number(topCard.market_price_usd))}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.splitRow}>
        <Pressable
          disabled={!canClaimDaily || claiming}
          onPress={() => { void claimDaily(); }}
          style={[
            styles.rewardCard,
            {
              backgroundColor: canClaimDaily ? '#292113' : colors.surface,
              borderColor: canClaimDaily ? colors.yellow : colors.border,
              opacity: claiming ? .72 : 1,
            },
          ]}
        >
          <View style={[styles.rewardIcon, { backgroundColor: canClaimDaily ? '#493A18' : colors.surfaceAlt }]}>
            {claiming ? (
              <ActivityIndicator size="small" color={colors.yellow} />
            ) : (
              <Ionicons name="gift" size={24} color={canClaimDaily ? colors.yellow : colors.muted} />
            )}
          </View>
          <View style={styles.rewardCopy}>
            <Text style={[styles.rewardKicker, { color: canClaimDaily ? colors.yellow : colors.muted }]}>
              RECOMPENSA DIÁRIA
            </Text>
            <Text style={[styles.rewardTitle, { color: colors.text }]}>
              {canClaimDaily ? 'Sua recompensa está pronta' : 'Recompensa já recebida'}
            </Text>
            <Text style={[styles.rewardHint, { color: colors.muted }]}>
              {canClaimDaily ? 'Toque para coletar agora.' : 'Volte quando completar 24 horas.'}
            </Text>
          </View>
          <Ionicons name={canClaimDaily ? 'gift-outline' : 'checkmark-circle'} size={19} color={canClaimDaily ? colors.yellow : '#65D894'} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/missions')}
          style={[styles.rewardCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.rewardIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="checkbox" size={24} color={colors.accent} />
          </View>
          <View style={styles.rewardCopy}>
            <Text style={[styles.rewardKicker, { color: colors.accent }]}>MISSÕES</Text>
            <Text style={[styles.rewardTitle, { color: colors.text }]}>Objetivos do treinador</Text>
            <Text style={[styles.rewardHint, { color: colors.muted }]}>
              Complete tarefas diárias e semanais.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>
      </View>

      {battlePass ? (
        <Pressable
          onPress={() => router.push('/battle-pass')}
          style={[styles.passCard, { backgroundColor: colors.surface, borderColor: colors.yellow }]}
        >
          <View style={[styles.passIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="ribbon" size={25} color={colors.yellow} />
          </View>
          <View style={styles.passCopy}>
            <View style={styles.passTop}>
              <Text style={[styles.passKicker, { color: colors.yellow }]}>PASSE DE BATALHA</Text>
              <Text style={[styles.passLevel, { color: colors.text }]}>
                NV {battlePass.progress.level}/{battlePass.season.maxLevel}
              </Text>
            </View>
            <Text style={[styles.passTitle, { color: colors.text }]}>{battlePass.season.name}</Text>
            <View style={[styles.passTrack, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.passFill, { backgroundColor: colors.yellow, width: `${passProgress}%` }]} />
            </View>
            <Text style={[styles.passHint, { color: colors.muted }]}>
              {battlePass.progress.vipUnlocked ? 'VIP ativo • ' : ''}
              {battlePass.progress.level >= battlePass.season.maxLevel
                ? 'Passe concluído'
                : `${battlePass.progress.xpIntoLevel.toLocaleString('pt-BR')} / ${battlePass.progress.xpForNextLevel.toLocaleString('pt-BR')} XP`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.yellow} />
        </Pressable>
      ) : null}

      <GlobalChatHomeCard />
      <UpdateLogHomeCard />
    </Screen>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  accent,
  onPress,
  primary = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: primary ? '#2A2314' : colors.surface,
          borderColor: primary ? accent : colors.border,
          opacity: pressed ? .75 : 1,
        },
      ]}
    >
      <View style={[styles.quickIcon, { backgroundColor: accent + '20', borderColor: accent + '55' }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={[styles.quickTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.quickSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      <Ionicons name="arrow-forward" size={16} color={accent} style={styles.quickArrow} />
    </Pressable>
  );
}

function CollectionMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.collectionMetric}>
      <View style={styles.collectionMetricTop}>
        <Ionicons name={icon} size={14} color={colors.yellow} />
        <Text style={[styles.collectionMetricLabel, { color: colors.muted }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.collectionMetricValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  quickAction: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 145,
    minHeight: 132,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    position: 'relative',
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: { fontSize: 12, fontWeight: '900', marginTop: 11 },
  quickSubtitle: { fontSize: 8.5, lineHeight: 13, marginTop: 3, paddingRight: 18 },
  quickArrow: { position: 'absolute', right: 12, bottom: 12 },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 2,
  },
  sectionKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', marginTop: 2 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 5 },
  sectionLinkText: { fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  collectionPanel: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  collectionMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  collectionMetric: { flexGrow: 1, flexBasis: 120, minWidth: 110 },
  collectionMetricTop: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  collectionMetricLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .75 },
  collectionMetricValue: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  topPull: {
    minHeight: 102,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  topPullImage: { width: 62, height: 84, borderRadius: 8 },
  topPullCopy: { flex: 1, minWidth: 0 },
  topPullKicker: { fontSize: 7, fontWeight: '900', letterSpacing: .9 },
  topPullName: { fontSize: 14, fontWeight: '900', marginTop: 3 },
  topPullMeta: { fontSize: 8, marginTop: 2 },
  topPullValue: { fontSize: 10, fontWeight: '900', marginTop: 5 },
  splitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  rewardCard: {
    flexGrow: 1,
    flexBasis: 270,
    minWidth: 250,
    minHeight: 95,
    borderRadius: 19,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rewardIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rewardCopy: { flex: 1, minWidth: 0 },
  rewardKicker: { fontSize: 7, fontWeight: '900', letterSpacing: .9 },
  rewardTitle: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  rewardHint: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  passCard: {
    minHeight: 112,
    borderRadius: 21,
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  passIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  passCopy: { flex: 1, minWidth: 0 },
  passTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  passKicker: { fontSize: 7, fontWeight: '900', letterSpacing: .9 },
  passLevel: { fontSize: 8, fontWeight: '900' },
  passTitle: { fontSize: 15, fontWeight: '900', marginTop: 3 },
  passTrack: { height: 6, borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  passFill: { height: '100%', borderRadius: 999 },
  passHint: { fontSize: 8, marginTop: 5 },
});
