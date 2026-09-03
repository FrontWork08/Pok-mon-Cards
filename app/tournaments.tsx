import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import {
  getTournamentHub,
  joinTournament,
  leaveTournament,
  subscribeTournaments,
  type TournamentHub,
  type TournamentMatch,
} from '@/services/tournaments';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

export default function TournamentsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [hub, setHub] = useState<TournamentHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      setHub(await getTournamentHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o torneio.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeTournaments(() => { void load(true); }), [load]);

  async function toggleJoin() {
    if (!hub || working) return;
    try {
      setWorking(true);
      setError(null);
      if (hub.joined) {
        const result = await leaveTournament();
        setNotice(
          result.refundedCoins > 0
            ? `Inscrição removida. 🪙 ${result.refundedCoins.toLocaleString('pt-BR')} foram devolvidas.`
            : 'Inscrição removida.'
        );
      } else {
        const result = await joinTournament();
        setNotice(
          result.feeCharged > 0
            ? `Inscrição confirmada. 🪙 ${result.feeCharged.toLocaleString('pt-BR')} entraram no pot da Copa.`
            : 'Você entrou na Copa Trainer.'
        );
      }
      await Promise.all([load(true), wallet.refresh()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar sua inscrição.');
    } finally {
      setWorking(false);
    }
  }

  const rounds = useMemo(
    () => [1, 2, 3].map((round) => ({ round, matches: (hub?.matches ?? []).filter((m) => m.round === round) })),
    [hub?.matches],
  );
  const labels: Record<number, string> = { 1: 'QUARTAS', 2: 'SEMIFINAL', 3: 'FINAL' };
  const entries = hub?.entries.length ?? 0;

  return (
    <Screen title="Copa Trainer" subtitle="Torneio de 8 jogadores com bracket automático e batalhas Mystery BO3.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      {notice ? <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text></Pressable> : null}
      {error ? <Pressable onPress={() => setError(null)} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {hub ? <>
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
          <View style={styles.heroTop}>
            <View style={[styles.cup, { backgroundColor: colors.accentSoft }]}><Ionicons name="trophy" size={30} color={colors.yellow} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: colors.yellow }]}>{hub.status.toUpperCase()}</Text>
              <Text style={[styles.title, { color: colors.text }]}>{hub.name}</Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {entries}/{hub.maxPlayers} inscritos • pot 🪙 {hub.prizePoolCoins.toLocaleString('pt-BR')} + 💎 {hub.rewardDiamonds}
              </Text>
            </View>
          </View>

          <View style={styles.moneyGrid}>
            <View style={[styles.moneyCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
              <Text style={[styles.moneyLabel,{color:colors.muted}]}>TAXA DE INSCRIÇÃO</Text>
              <Text style={[styles.moneyValue,{color:colors.yellow}]}>🪙 {hub.entryFeeCoins.toLocaleString('pt-BR')}</Text>
            </View>
            <View style={[styles.moneyCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
              <Text style={[styles.moneyLabel,{color:colors.muted}]}>POT ATUAL</Text>
              <Text style={[styles.moneyValue,{color:'#65D894'}]}>🪙 {hub.prizePoolCoins.toLocaleString('pt-BR')}</Text>
            </View>
          </View>
          <Text style={[styles.poolRule,{color:colors.muted}]}>
            100% das Coins das inscrições vão para o campeão. Os 💎 {hub.rewardDiamonds} Diamantes são prêmio separado e não entram no pot.
          </Text>

          {hub.status === 'registration' ? (
            <Pressable
              disabled={working || (!hub.joined && entries >= hub.maxPlayers)}
              onPress={() => { void toggleJoin(); }}
              style={[styles.primary, { backgroundColor: hub.joined ? '#351A24' : colors.yellow }]}
            >
              {working ? <ActivityIndicator color={hub.joined ? '#fff' : '#07111F'} /> : <Ionicons name={hub.joined ? 'exit-outline' : 'enter-outline'} size={18} color={hub.joined ? '#FF9FAF' : '#07111F'} />}
              <Text style={[styles.primaryText, hub.joined && { color: '#FFB5C0' }]}>
                {hub.joined
                  ? `SAIR E RECEBER 🪙 ${hub.entryFeeCoins.toLocaleString('pt-BR')}`
                  : `PAGAR 🪙 ${hub.entryFeeCoins.toLocaleString('pt-BR')} E ENTRAR`}
              </Text>
            </Pressable>
          ) : null}

          {hub.status === 'registration' ? (
            <Text style={[styles.deadline, { color: colors.muted }]}>
              Inscrições até {new Date(hub.registrationEndsAt).toLocaleString('pt-BR')} • reembolso integral ao sair antes do início • o bracket começa automaticamente ao fechar 8.
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.text }]}>Treinadores</Text><Text style={[styles.count, { color: colors.yellow }]}>{entries}</Text></View>
        <View style={styles.entries}>
          {hub.entries.map((e, index) => (
            <Pressable key={e.playerId} onPress={() => router.push(('/player/' + e.playerId) as never)} style={[styles.entry, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.seed, { color: colors.yellow }]}>{e.seed ? '#' + e.seed : '#' + (index + 1)}</Text>
              <View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.text }]}>@{e.username}</Text><Text style={[styles.small, { color: colors.muted }]}>{e.rating} ELO</Text></View>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Bracket</Text>
        {rounds.map((group) => (
          <View key={group.round} style={styles.round}>
            <Text style={[styles.roundTitle, { color: colors.yellow }]}>{labels[group.round]}</Text>
            {group.matches.length ? group.matches.map((m) => (
              <Match key={m.id} item={m} onOpen={(battle) => router.push(('/battle/' + battle) as never)} />
            )) : (
              <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.small, { color: colors.muted }]}>Aguardando o bracket desta fase.</Text></View>
            )}
          </View>
        ))}
      </> : null}
    </Screen>
  );
}

function Match({ item, onOpen }: { item: TournamentMatch; onOpen: (battle: string) => void }) {
  const { colors } = useAppTheme();
  const open = Boolean(item.battleId);
  return (
    <Pressable disabled={!open} onPress={() => item.battleId && onOpen(item.battleId)} style={[styles.match, { backgroundColor: colors.surface, borderColor: item.status === 'completed' ? colors.yellow : colors.border }]}>
      <View style={styles.matchPlayer}><Text style={[styles.name, { color: item.winnerId === item.playerA?.id ? colors.yellow : colors.text }]}>{item.playerA ? '@' + item.playerA.username : 'A definir'}</Text></View>
      <Text style={[styles.vs, { color: colors.muted }]}>VS</Text>
      <View style={[styles.matchPlayer, { alignItems: 'flex-end' }]}><Text style={[styles.name, { color: item.winnerId === item.playerB?.id ? colors.yellow : colors.text }]}>{item.playerB ? '@' + item.playerB.username : 'A definir'}</Text></View>
      {open ? <Ionicons name="chevron-forward" size={18} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { fontSize: 11, fontWeight: '800' },
  notice: { borderRadius: 14, borderWidth: 1, padding: 11 },
  noticeText: { fontSize: 10, fontWeight: '800' },
  error: { borderRadius: 14, padding: 11, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { color: '#FFD7DD', fontSize: 10, fontWeight: '800' },
  hero: { borderRadius: 23, borderWidth: 1, padding: 16, gap: 13 },
  heroTop: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  cup: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 25, fontWeight: '900', marginTop: 2 },
  meta: { fontSize: 9, marginTop: 3 },
  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moneyCard: { flexGrow: 1, flexBasis: 145, minWidth: 135, borderRadius: 14, borderWidth: 1, padding: 11 },
  moneyLabel: { fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  moneyValue: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  poolRule: { fontSize: 8.5, lineHeight: 13, fontWeight: '700' },
  primary: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10 },
  primaryText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  deadline: { fontSize: 8, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  count: { fontSize: 14, fontWeight: '900' },
  entries: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  entry: { minWidth: 160, flexGrow: 1, flexBasis: 180, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  seed: { width: 30, fontSize: 11, fontWeight: '900' },
  name: { fontSize: 10, fontWeight: '900' },
  small: { fontSize: 8, marginTop: 2 },
  round: { gap: 7 },
  roundTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  match: { minHeight: 56, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchPlayer: { flex: 1 },
  vs: { fontSize: 8, fontWeight: '900' },
  empty: { borderRadius: 14, borderWidth: 1, padding: 15, alignItems: 'center' },
});
