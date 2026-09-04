import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getBattle } from '@/services/battles';
import {
  chooseTeamBattleAttack,
  chooseTeamBattleSwitch,
  forfeitTeamBattle,
  getEligibleTeamBattleCards,
  getTeamBattleState,
  setTeamBattleTeam,
  subscribeToTeamBattle,
  type TeamBattleAttackOption,
  type TeamBattleCard,
  type TeamBattleMember,
  type TeamBattleState,
} from '@/services/teamBattles';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';

function hpValues(member?: TeamBattleMember | null) {
  const item = (member ?? {}) as Record<string, unknown>;
  const current = Number(item.remainingHp ?? item.currentHp ?? item.hp ?? 0);
  const max = Number(item.hp ?? item.maxHp ?? current ?? 1);
  return { current: Math.max(0, current), max: Math.max(1, max) };
}

function hpPercent(current: number, max: number) {
  return `${Math.max(0, Math.min(100, (current / Math.max(1, max)) * 100))}%` as `${number}%`;
}

function attackLabel(attack: TeamBattleAttackOption) {
  return String(attack.name ?? attack.identifier ?? 'Ataque');
}

export default function TeamBattleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const battleId = String(id ?? '');
  const router = useRouter();
  const { colors } = useAppTheme();
  const { userId } = useWallet();
  const [state, setState] = useState<TeamBattleState | null>(null);
  const [battle, setBattle] = useState<any>(null);
  const [cards, setCards] = useState<TeamBattleCard[]>([]);
  const [selected, setSelected] = useState<TeamBattleCard[]>([]);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refreshBusy = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!battleId || refreshBusy.current) return;
    refreshBusy.current = true;
    try {
      const next = await getTeamBattleState(battleId);
      setState(next);
      if (next.status === 'completed') {
        const battleRow = await getBattle(battleId).catch(() => null);
        if (battleRow) setBattle(battleRow);
      }
    } catch (error) {
      if (!silent) setNotice(error instanceof Error ? error.message : 'Não foi possível carregar a batalha 3×3.');
    } finally {
      refreshBusy.current = false;
      if (!silent) setLoading(false);
    }
  }, [battleId]);

  const loadCards = useCallback(async (query = '') => {
    if (!battleId) return;
    try {
      const result = await getEligibleTeamBattleCards(battleId, query, 120, 0);
      setCards(result.items ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar seus Pokémon.');
    }
  }, [battleId]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!battleId) return;
    const unsubscribe = subscribeToTeamBattle(battleId, () => { void refresh(true); });
    const timer = setInterval(() => { void refresh(true); }, 2500);
    return () => { clearInterval(timer); unsubscribe(); };
  }, [battleId, refresh]);

  useEffect(() => {
    if (state?.status !== 'drafting' || state?.myTeamLocked) return;
    const timer = setTimeout(() => { void loadCards(search); }, 250);
    return () => clearTimeout(timer);
  }, [loadCards, search, state?.myTeamLocked, state?.status]);

  const myTeam = Array.isArray(state?.myTeam) ? state!.myTeam! : [];
  const opponentTeam = Array.isArray(state?.opponentTeam) ? state!.opponentTeam! : [];
  const attacks = Array.isArray((state as any)?.attacks) ? ((state as any).attacks as TeamBattleAttackOption[]) : [];
  const switches = Array.isArray(state?.switchOptions) ? state!.switchOptions! : [];
  const myLocked = Boolean((state as any)?.myLocked);
  const opponentLocked = Boolean((state as any)?.opponentLocked);
  const forcedSwitch = Boolean(state?.myForcedSwitch);
  const myHp = Number((state as any)?.myHp ?? 0);
  const myMaxHp = Math.max(1, Number((state as any)?.myMaxHp ?? 1));
  const opponentHp = Number((state as any)?.opponentHp ?? 0);
  const opponentMaxHp = Math.max(1, Number((state as any)?.opponentMaxHp ?? 1));
  const myName = String((state as any)?.myCardName ?? 'Seu Pokémon');
  const opponentName = String((state as any)?.opponentCardName ?? 'Pokémon adversário');
  const deadline = String((state as any)?.deadline ?? '');
  const secondsLeft = useMemo(() => {
    if (!deadline) return null;
    const value = Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000);
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }, [deadline, state?.turn, state?.status]);

  const toggleCard = (card: TeamBattleCard) => {
    if (working) return;
    setSelected((current) => {
      const index = current.findIndex((item) => item.cardId === card.cardId);
      if (index >= 0) return current.filter((item) => item.cardId !== card.cardId);
      if (current.length >= 3) return current;
      return [...current, card];
    });
  };

  const lockTeam = async () => {
    if (selected.length !== 3) {
      setNotice('Escolha exatamente 3 Pokémon. O primeiro será o líder.');
      return;
    }
    setWorking(true);
    setNotice(null);
    try {
      await setTeamBattleTeam(battleId, selected.map((card) => card.cardId));
      await refresh(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível confirmar sua equipe.');
    } finally {
      setWorking(false);
    }
  };

  const doAttack = async (attack: TeamBattleAttackOption) => {
    const value = String(attack.identifier ?? attack.name ?? '');
    if (!value || working || myLocked) return;
    setWorking(true);
    setNotice(null);
    try {
      await chooseTeamBattleAttack(battleId, value);
      await refresh(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível usar esse ataque.');
    } finally {
      setWorking(false);
    }
  };

  const doSwitch = async (slot: number) => {
    if (working || myLocked) return;
    setWorking(true);
    setNotice(null);
    try {
      await chooseTeamBattleSwitch(battleId, slot);
      await refresh(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível trocar de Pokémon.');
    } finally {
      setWorking(false);
    }
  };

  const confirmForfeit = () => {
    Alert.alert('Desistir da batalha?', 'Depois que a batalha começou, a desistência dá a vitória ao adversário.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desistir',
        style: 'destructive',
        onPress: () => {
          setWorking(true);
          void forfeitTeamBattle(battleId)
            .then(() => refresh(true))
            .catch((error) => setNotice(error instanceof Error ? error.message : 'Não foi possível desistir.'))
            .finally(() => setWorking(false));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen title="Batalha 3×3" subtitle="Modo Game Boy">
        <View style={[styles.centerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.muted }}>Carregando batalha...</Text>
        </View>
      </Screen>
    );
  }

  const completed = state?.status === 'completed';
  const won = completed && Boolean(userId && battle?.winner_id === userId);
  const lost = completed && Boolean(userId && battle?.winner_id && battle.winner_id !== userId);

  return (
    <>
      <Stack.Screen options={{ title: 'Batalha 3×3' }} />
      <Screen title="Equipe 3×3" subtitle="Batalha estilo Game Boy • ataques, HP persistente e troca de Pokémon">
        {notice ? (
          <View style={[styles.notice, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name="information-circle" size={18} color={colors.yellow} />
            <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color={colors.muted} /></Pressable>
          </View>
        ) : null}

        {state?.status === 'drafting' ? (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>Monte sua equipe</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Escolha 3 Pokémon. A ordem importa: o nº 1 começa em campo.</Text>
              </View>
              {secondsLeft !== null ? <Text style={[styles.timer, { color: secondsLeft <= 20 ? colors.red : colors.yellow }]}>{secondsLeft}s</Text> : null}
            </View>

            {state.myTeamLocked ? (
              <View style={[styles.waitBox, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Ionicons name="shield-checkmark" size={22} color={colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bold, { color: colors.text }]}>Sua equipe está confirmada</Text>
                  <Text style={{ color: colors.muted }}>{state.opponentTeamLocked ? 'Os dois times estão prontos. Iniciando batalha...' : 'Aguardando o adversário escolher os 3 Pokémon.'}</Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.selectedRow}>
                  {[0, 1, 2].map((index) => {
                    const item = selected[index];
                    return (
                      <View key={index} style={[styles.selectedSlot, { borderColor: item ? colors.accent : colors.border, backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[styles.slotNumber, { color: item ? colors.accent : colors.muted }]}>{index + 1}</Text>
                        <Text numberOfLines={1} style={[styles.slotName, { color: colors.text }]}>{item?.name ?? 'Vazio'}</Text>
                        {index === 0 ? <Text style={[styles.leader, { color: colors.yellow }]}>LÍDER</Text> : null}
                      </View>
                    );
                  })}
                </View>

                <Pressable
                  onPress={() => setPickerOpen(true)}
                  style={[styles.pickerTrigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent }]}
                >
                  <View style={[styles.pickerTriggerIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="albums" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.bold, { color: colors.text }]}>Escolher Pokémon</Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {selected.length}/3 escolhidos • lista otimizada para scroll
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.accent} />
                </Pressable>

                <Pressable disabled={working || selected.length !== 3} onPress={() => void lockTeam()} style={[styles.primaryButton, { backgroundColor: selected.length === 3 ? colors.accent : colors.border, opacity: working ? 0.65 : 1 }]}>
                  {working ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  <Text style={styles.primaryButtonText}>Confirmar equipe 3×3</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {state?.status === 'revealing' ? (
          <>
            <View style={[styles.arena, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.fighterSide}>
                <Text style={[styles.fighterOwner, { color: colors.muted }]}>ADVERSÁRIO</Text>
                <Text style={[styles.fighterName, { color: colors.text }]}>{opponentName}</Text>
                <View style={[styles.hpTrack, { backgroundColor: colors.border }]}><View style={[styles.hpFill, { width: hpPercent(opponentHp, opponentMaxHp), backgroundColor: opponentHp / opponentMaxHp <= 0.25 ? colors.red : colors.green }]} /></View>
                <Text style={[styles.hpText, { color: colors.muted }]}>{opponentHp}/{opponentMaxHp} HP</Text>
                {(state as any)?.opponentCardImage ? <Image source={{ uri: String((state as any).opponentCardImage) }} style={styles.sprite} resizeMode="contain" /> : <View style={styles.sprite} />}
              </View>

              <View style={styles.vsColumn}>
                <Text style={[styles.turnText, { color: colors.yellow }]}>TURNO {Number((state as any)?.turn ?? 1)}</Text>
                <Text style={[styles.vs, { color: colors.accent }]}>VS</Text>
                {secondsLeft !== null ? <Text style={[styles.timerSmall, { color: secondsLeft <= 15 ? colors.red : colors.muted }]}>{secondsLeft}s</Text> : null}
              </View>

              <View style={styles.fighterSide}>
                <Text style={[styles.fighterOwner, { color: colors.muted }]}>VOCÊ</Text>
                <Text style={[styles.fighterName, { color: colors.text }]}>{myName}</Text>
                <View style={[styles.hpTrack, { backgroundColor: colors.border }]}><View style={[styles.hpFill, { width: hpPercent(myHp, myMaxHp), backgroundColor: myHp / myMaxHp <= 0.25 ? colors.red : colors.green }]} /></View>
                <Text style={[styles.hpText, { color: colors.muted }]}>{myHp}/{myMaxHp} HP</Text>
                {(state as any)?.myCardImage ? <Image source={{ uri: String((state as any).myCardImage) }} style={styles.sprite} resizeMode="contain" /> : <View style={styles.sprite} />}
              </View>
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={[styles.title, { color: colors.text }]}>{forcedSwitch ? 'Escolha o próximo Pokémon' : 'Escolha sua ação'}</Text>
                  <Text style={[styles.subtitle, { color: colors.muted }]}>{forcedSwitch ? 'Seu Pokémon foi nocauteado. A troca é obrigatória.' : 'Atacar ou trocar consome este turno.'}</Text>
                </View>
                {myLocked ? <View style={[styles.lockedBadge, { backgroundColor: colors.accentSoft }]}><Text style={{ color: colors.accent, fontWeight: '800' }}>AÇÃO CONFIRMADA</Text></View> : null}
              </View>

              {!forcedSwitch ? (
                <View style={styles.actionGrid}>
                  {attacks.map((attack, index) => {
                    const pp = Number(attack.ppRemaining ?? attack.pp ?? 0);
                    const disabled = working || myLocked || pp === 0;
                    return (
                      <Pressable key={`${attack.identifier ?? attack.name}-${index}`} disabled={disabled} onPress={() => void doAttack(attack)} style={[styles.attackButton, { borderColor: colors.border, backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.5 : 1 }]}>
                        <Text style={[styles.attackName, { color: colors.text }]}>{attackLabel(attack)}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Poder {attack.power ?? '—'} • Precisão {attack.accuracy ?? '—'}%</Text>
                        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{String(attack.type ?? 'normal').toUpperCase()} • PP {pp || '—'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {switches.length ? (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>{forcedSwitch ? 'Pokémon disponíveis' : 'Trocar Pokémon'}</Text>
                  <View style={styles.switchGrid}>
                    {switches.map((option) => {
                      const member = option as unknown as TeamBattleMember;
                      const hp = hpValues(member);
                      return (
                        <Pressable key={option.slot} disabled={working || myLocked} onPress={() => void doSwitch(option.slot)} style={[styles.switchButton, { borderColor: forcedSwitch ? colors.yellow : colors.border, backgroundColor: colors.surfaceAlt, opacity: working || myLocked ? 0.55 : 1 }]}>
                          <Ionicons name="swap-horizontal" size={19} color={forcedSwitch ? colors.yellow : colors.accent} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.bold, { color: colors.text }]}>{String(option.name ?? `Pokémon ${option.slot}`)}</Text>
                            <Text style={{ color: colors.muted, fontSize: 12 }}>{hp.current}/{hp.max} HP</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {myLocked ? <Text style={[styles.waitText, { color: colors.muted }]}>{opponentLocked ? 'As duas ações foram confirmadas. Resolvendo o turno...' : 'Aguardando a ação do adversário...'}</Text> : null}
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Sua equipe</Text>
              <View style={styles.teamRow}>
                {myTeam.map((member) => {
                  const hp = hpValues(member);
                  const knockedOut = Boolean((member as any).knockedOut) || hp.current <= 0;
                  const active = Number(member.slot) === Number(state.myActiveSlot);
                  return (
                    <View key={member.slot} style={[styles.teamMember, { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surfaceAlt, opacity: knockedOut ? 0.55 : 1 }]}>
                      <Text style={[styles.teamMemberName, { color: colors.text }]} numberOfLines={1}>{String(member.name ?? `Pokémon ${member.slot}`)}</Text>
                      <Text style={{ color: knockedOut ? colors.red : colors.muted, fontSize: 11 }}>{knockedOut ? 'Nocauteado' : `${hp.current}/${hp.max} HP`}{active ? ' • ATIVO' : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <Pressable disabled={working} onPress={confirmForfeit} style={[styles.dangerButton, { borderColor: colors.red }]}>
              <Ionicons name="flag" size={18} color={colors.red} />
              <Text style={{ color: colors.red, fontWeight: '800' }}>Desistir da batalha</Text>
            </Pressable>
          </>
        ) : null}

        {completed ? (
          <View style={[styles.resultPanel, { backgroundColor: colors.surface, borderColor: won ? colors.green : lost ? colors.red : colors.border }]}>
            <Ionicons name={won ? 'trophy' : lost ? 'close-circle' : 'checkmark-circle'} size={46} color={won ? colors.yellow : lost ? colors.red : colors.accent} />
            <Text style={[styles.resultTitle, { color: colors.text }]}>{won ? 'Vitória!' : lost ? 'Derrota' : 'Batalha concluída'}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>O resultado e o ELO foram processados pelo servidor.</Text>
            <Pressable onPress={() => router.replace('/(tabs)/battles')} style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Voltar às batalhas</Text>
            </Pressable>
          </View>
        ) : null}

        {state && !['drafting', 'revealing', 'completed'].includes(state.status) ? (
          <View style={[styles.centerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text }}>Preparando batalha 3×3...</Text>
          </View>
        ) : null}
      </Screen>

      <Modal visible={pickerOpen && state?.status === 'drafting' && !state?.myTeamLocked} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} />
          <View style={[styles.pickerModal, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.leader, { color: colors.yellow }]}>EQUIPE 3×3 • SELETOR OTIMIZADO</Text>
                <Text style={[styles.title, { color: colors.text }]}>Escolha seus Pokémon</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{selected.length}/3 selecionados • o primeiro será o líder</Text>
              </View>
              <Pressable onPress={() => setPickerOpen(false)} style={[styles.pickerClose, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar Pokémon ou coleção..."
              placeholderTextColor={colors.muted}
              style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <FlatList
              {...VIRTUAL_LIST_PERF_PROPS}
              data={cards}
              keyExtractor={(card) => card.cardId}
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              ListEmptyComponent={(
                <View style={styles.pickerEmpty}>
                  <Ionicons name="search" size={28} color={colors.muted} />
                  <Text style={[styles.subtitle, { color: colors.muted }]}>Nenhum Pokémon encontrado.</Text>
                </View>
              )}
              renderItem={({ item: card }) => {
                const index = selected.findIndex((item) => item.cardId === card.cardId);
                const active = index >= 0;
                const blocked = !active && selected.length >= 3;
                return (
                  <Pressable
                    disabled={blocked || working}
                    onPress={() => toggleCard(card)}
                    style={[styles.pickerCard, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.surface }, blocked && styles.pickerBlocked]}
                  >
                    {card.image ? <Image source={{ uri: card.image }} style={styles.cardImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0} /> : <View style={[styles.cardImage, { backgroundColor: colors.surfaceAlt }]} />}
                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.name}</Text>
                      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>{card.setName ?? card.rarity ?? 'Pokémon'}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>HP {card.hp ?? '—'} • SPD {card.speed ?? '—'}</Text>
                    </View>
                    {active ? <View style={[styles.pickBadge, { backgroundColor: colors.accent }]}><Text style={styles.pickBadgeText}>{index + 1}</Text></View> : <Ionicons name="add-circle-outline" size={22} color={blocked ? colors.muted : colors.accent} />}
                  </Pressable>
                );
              }}
            />

            <Pressable onPress={() => setPickerOpen(false)} style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>USAR {selected.length}/3 SELECIONADOS</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  centerCard: { borderWidth: 1, borderRadius: 18, padding: 24, gap: 12, alignItems: 'center' },
  notice: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 19, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  bold: { fontWeight: '800' },
  timer: { fontSize: 22, fontWeight: '900' },
  timerSmall: { fontSize: 13, fontWeight: '800' },
  waitBox: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectedRow: { flexDirection: 'row', gap: 8 },
  selectedSlot: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  slotNumber: { fontSize: 18, fontWeight: '900' },
  slotName: { fontSize: 12, fontWeight: '800' },
  leader: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pickerTrigger: { minHeight: 64, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  pickerTriggerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(2,5,12,.84)', padding: 14, justifyContent: 'center' },
  pickerModal: { width: '100%', maxWidth: 720, height: '88%', alignSelf: 'center', borderWidth: 1, borderRadius: 22, padding: 12, gap: 10 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pickerClose: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pickerList: { flex: 1 },
  pickerListContent: { gap: 7, paddingBottom: 8 },
  pickerCard: { minHeight: 100, borderWidth: 1.5, borderRadius: 13, padding: 8, flexDirection: 'row', gap: 9, alignItems: 'center', position: 'relative' },
  pickerBlocked: { opacity: 0.45 },
  pickerEmpty: { padding: 30, alignItems: 'center', gap: 8 },
  cardImage: { width: 58, height: 82, borderRadius: 6 },
  cardName: { fontSize: 13, fontWeight: '900' },
  pickBadge: { position: 'absolute', right: 6, top: 6, minWidth: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  primaryButton: { borderRadius: 13, minHeight: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  arena: { borderWidth: 1, borderRadius: 20, padding: 12, minHeight: 260, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fighterSide: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  fighterOwner: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  fighterName: { fontSize: 15, fontWeight: '900', textAlign: 'center' },
  sprite: { width: 128, height: 128 },
  hpTrack: { width: '92%', height: 8, borderRadius: 999, overflow: 'hidden' },
  hpFill: { height: '100%', borderRadius: 999 },
  hpText: { fontSize: 11, fontWeight: '700' },
  vsColumn: { width: 52, alignItems: 'center', gap: 8 },
  vs: { fontSize: 24, fontWeight: '1000' as any },
  turnText: { fontSize: 9, fontWeight: '900', textAlign: 'center' },
  lockedBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attackButton: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 11, gap: 4 },
  attackName: { fontSize: 14, fontWeight: '900' },
  sectionLabel: { fontSize: 14, fontWeight: '900' },
  switchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchButton: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitText: { textAlign: 'center', fontSize: 12, fontWeight: '700' },
  teamRow: { flexDirection: 'row', gap: 8 },
  teamMember: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 11, padding: 9, gap: 2 },
  teamMemberName: { fontSize: 12, fontWeight: '900' },
  dangerButton: { borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  resultPanel: { borderWidth: 2, borderRadius: 20, padding: 24, alignItems: 'center', gap: 10 },
  resultTitle: { fontSize: 26, fontWeight: '900' },
});
