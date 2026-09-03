import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { CardPickerModal, getBattleCardPreview } from '@/components/CardPickerModal';
import { CompactTrainerBanner } from '@/components/CompactTrainerBanner';
import { PixelBattleArena, type PixelBattleFighter } from '@/components/PixelBattleArena';
import { supabase } from '@/lib/supabase';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { getMyDecks } from '@/services/decks';
import { cancelBattle, chooseBattleAttack, forfeitBattle, getBattle, getBattleAttackState, getBattleCardStakes, getBattleDraftCards, getBattleEvents, getBattleRounds, lockBattleCard, pickBattleDraftCard, rematchBattle, resolveBattleTimeout, respondToBattle, subscribeToBattle } from '@/services/battles';
import { isFunctionErrorCode } from '@/services/functionErrors';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

export default function BattleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, settings } = useAppTheme();
  const { userId: walletUserId } = useWallet();
  const userId = walletUserId ?? '';
  const [battle, setBattle] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stakes, setStakes] = useState<any[]>([]);
  const [draftCards, setDraftCards] = useState<any[]>([]);
  const [bag, setBag] = useState<OwnedCardEntry[]>([]);
  const [decks, setDecks] = useState<any[]>([]);
  const [players, setPlayers] = useState<Record<string, any>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAttackName, setSelectedAttackName] = useState<string | null>(null);
  const [attackState, setAttackState] = useState<any>(null);
  const [arenaResultRound, setArenaResultRound] = useState<any>(null);
  const [arenaTurnResult, setArenaTurnResult] = useState<any>(null);
  const [draftPreviewCard, setDraftPreviewCard] = useState<any>(null);
  const [stakeCardId, setStakeCardId] = useState<string | null>(null);
  const [sourceDeck, setSourceDeck] = useState<string>('bag');
  const [pickerMode, setPickerMode] = useState<'battle' | 'stake' | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const timeoutRound = useRef<string | null>(null);
  const revealAnim = useRef(new Animated.Value(1)).current;
  const animatedRound = useRef(0);
  const arenaResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const battleLoadPromise = useRef<Promise<void> | null>(null);
  const battleLoadPending = useRef(false);
  const battleLoadRef = useRef<(silent?: boolean) => Promise<void>>(async () => undefined);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerPairKey = useRef('');

  const loadBattleState = useCallback(async (silent = false) => {
    if (!id) return;
    if (battleLoadPromise.current) {
      battleLoadPending.current = true;
      await battleLoadPromise.current;
      return;
    }

    const task = (async () => {
      try {
        const [battleData, roundData, eventData, stakeData, draftData] = await Promise.all([
          getBattle(String(id)),
          getBattleRounds(String(id)),
          getBattleEvents(String(id)),
          getBattleCardStakes(String(id)).catch(() => []),
          getBattleDraftCards(String(id)).catch(() => []),
        ]);
        setBattle(battleData);
        setRounds(roundData);
        setEvents(eventData);
        setStakes(stakeData ?? []);
        setDraftCards(draftData ?? []);

        if (battleData.mode === 'draft3' && battleData.status === 'revealing') {
          const nextAttackState = await getBattleAttackState(String(id)).catch(() => null);
          setAttackState(nextAttackState);
          setSelectedAttackName(nextAttackState?.myAttackName ? String(nextAttackState.myAttackName) : null);
        } else {
          setAttackState(null);
          setSelectedAttackName(null);
        }

        const ids = [String(battleData.challenger_id), String(battleData.opponent_id)];
        const pairKey = [...ids].sort().join(':');
        if (playerPairKey.current !== pairKey) {
          playerPairKey.current = pairKey;
          const { data: playerRows } = await supabase
            .from('players')
            .select('id,username,level,battle_rating,equipped_frame_id,equipped_background_id,is_bot')
            .in('id', ids);
          setPlayers(Object.fromEntries((playerRows ?? []).map((player) => [player.id, player])));
        }
      } catch (error) {
        if (!silent) setNotice(error instanceof Error ? error.message : 'Não foi possível carregar a batalha.');
      }
    })();

    battleLoadPromise.current = task;
    try {
      await task;
    } finally {
      battleLoadPromise.current = null;
      if (battleLoadPending.current) {
        battleLoadPending.current = false;
        setTimeout(() => { void battleLoadRef.current(true); }, 0);
      }
    }
  }, [id]);
  battleLoadRef.current = loadBattleState;

  const loadStaticBattleResources = useCallback(async () => {
    const [bagData, deckData] = await Promise.all([
      getMyBag(),
      getMyDecks(),
    ]);
    setBag(bagData ?? []);
    setDecks(deckData ?? []);
  }, []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void Promise.all([
      loadBattleState(false),
      loadStaticBattleResources().catch((error) => {
        if (!disposed) setNotice(error instanceof Error ? error.message : 'Não foi possível carregar suas cartas.');
      }),
    ]).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, [loadBattleState, loadStaticBattleResources]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToBattle(String(id), () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => {
        void loadBattleState(true);
      }, 140);
    });
    return () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      unsubscribe();
    };
  }, [id, loadBattleState]);

  useEffect(() => {
    if (!battle?.selection_deadline || !['drafting', 'selecting', 'revealing'].includes(battle.status)) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, Math.ceil((new Date(battle.selection_deadline).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [battle?.selection_deadline, battle?.status]);

  useEffect(() => {
    if (!battle || !['drafting', 'selecting', 'revealing'].includes(battle.status) || remaining > 0 || !id) return;
    const timeoutKey = `${battle.status}:${battle.status === 'drafting' ? battle.draft_pick_count : battle.active_round}`;
    if (timeoutRound.current === timeoutKey) return;
    timeoutRound.current = timeoutKey;
    resolveBattleTimeout(String(id))
      .then(() => loadBattleState())
      .catch(async (error) => {
        if (isFunctionErrorCode(error, 'NOT_EXPIRED')) {
          // The phone can display 0 a fraction of a second before the server deadline.
          // Allow the same timeout key to retry instead of freezing permanently at 0.
          timeoutRound.current = '';
          await new Promise((resolve) => setTimeout(resolve, 350));
          await loadBattleState().catch(() => null);
          return;
        }
        if (isFunctionErrorCode(error, 'INVALID_STATUS', 'SELECTION_EXPIRED')) {
          await loadBattleState().catch(() => null);
          return;
        }
        setNotice(error instanceof Error ? error.message : 'O servidor está concluindo a rodada.');
        await new Promise((resolve) => setTimeout(resolve, 700));
        timeoutRound.current = '';
        await loadBattleState().catch(() => null);
      });
  }, [battle, id, loadBattleState, remaining]);

  const currentRound = Number(battle?.active_round ?? 1);
  const isDrafting = battle?.status === 'drafting';
  const choosingAttack = battle?.mode === 'draft3' && battle?.status === 'revealing';
  const myAttackLocked = Boolean(attackState?.myLocked);
  const opponentAttackLocked = Boolean(attackState?.opponentLocked);
  const gameStyleBattle = battle?.engine_version === 'game_v1' || Boolean(attackState?.gameStyle);
  const attackOptions = Array.isArray(attackState?.attacks) ? attackState.attacks : [];
  const manualAttackOptions = attackOptions.length
    ? attackOptions
    : gameStyleBattle
      ? [{ identifier: 'struggle', name: 'Struggle', type: 'normal', category: 'physical', power: 50, damage: '50', pp: 999, maxPp: 999, accuracy: 100, priority: 0 }]
      : [{ name: 'Sem ataque', damage: '0', text: 'Este Pokémon não possui ataque impresso.', convertedEnergyCost: 0, __noAttack: true }];
  const lockedPlayers = useMemo(() => new Set(events.filter((event) => ['card_locked', 'auto_locked'].includes(event.event_type) && Number(event.payload?.round) === currentRound).map((event) => event.payload?.playerId).filter(Boolean)), [currentRound, events]);
  const selfLocked = lockedPlayers.has(userId);
  const otherId = battle ? (battle.challenger_id === userId ? battle.opponent_id : battle.challenger_id) : '';
  const opponentLocked = lockedPlayers.has(otherId);
  const amChallenger = battle?.challenger_id === userId;
  const challengerStake = stakes.find((stake) => stake.player_id === battle?.challenger_id);
  const myStake = stakes.find((stake) => stake.player_id === userId);
  const selectedDeck = useMemo(() => decks.find((deck) => deck.id === sourceDeck), [decks, sourceDeck]);
  const allowedIds = useMemo(() => sourceDeck === 'bag' ? null : new Set((selectedDeck?.deck_cards ?? []).map((item: any) => item.card_id)), [selectedDeck, sourceDeck]);
  const standardPickerBag = useMemo(() => allowedIds ? bag.filter((entry) => entry.cards?.id && allowedIds.has(entry.cards.id)) : bag, [allowedIds, bag]);
  const ownDraftIds = useMemo(() => new Set(draftCards.filter((item) => item.player_id === userId).map((item) => item.card_id)), [draftCards, userId]);
  const usedDraftIds = useMemo(() => new Set(rounds.map((round) => battle?.challenger_id === userId ? round.challenger_card_id : round.opponent_card_id).filter(Boolean)), [battle?.challenger_id, rounds, userId]);
  const pickerBag = useMemo(() => {
    if (battle?.mode !== 'draft3') return standardPickerBag;
    if (isDrafting) return standardPickerBag.filter((entry) => entry.cards?.id && !ownDraftIds.has(entry.cards.id));
    return bag.filter((entry) => entry.cards?.id && ownDraftIds.has(entry.cards.id) && !usedDraftIds.has(entry.cards.id));
  }, [bag, battle?.mode, isDrafting, ownDraftIds, standardPickerBag, usedDraftIds]);
  const selectedEntry = useMemo(() => bag.find((entry) => entry.cards?.id === selectedId), [bag, selectedId]);
  const stakeEntry = useMemo(() => bag.find((entry) => entry.cards?.id === stakeCardId), [bag, stakeCardId]);
  const latestRound = rounds.length ? rounds[rounds.length - 1] : null;

  const resultRound = arenaResultRound;
  const resultMyIsChallenger = battle?.challenger_id === userId;
  const resultMyCard = resultRound ? (resultMyIsChallenger ? (Array.isArray(resultRound.c1) ? resultRound.c1[0] : resultRound.c1) : (Array.isArray(resultRound.c2) ? resultRound.c2[0] : resultRound.c2)) : null;
  const resultRivalCard = resultRound ? (resultMyIsChallenger ? (Array.isArray(resultRound.c2) ? resultRound.c2[0] : resultRound.c2) : (Array.isArray(resultRound.c1) ? resultRound.c1[0] : resultRound.c1)) : null;
  const resultMyCombat = resultRound ? (resultMyIsChallenger ? resultRound.challenger_combat : resultRound.opponent_combat) : null;
  const resultRivalCombat = resultRound ? (resultMyIsChallenger ? resultRound.opponent_combat : resultRound.challenger_combat) : null;

  const attackArenaMy: PixelBattleFighter | null = choosingAttack ? {
    name: String(attackState?.myCardName ?? 'Seu Pokémon'),
    pokedexNumber: attackState?.myPokedexNumber == null ? null : Number(attackState.myPokedexNumber),
    fallbackImage: attackState?.myCardImage ?? null,
    hp: attackState?.myHp == null ? null : Number(attackState.myHp),
    maxHp: attackState?.myMaxHp == null ? (attackState?.myHp == null ? null : Number(attackState.myHp)) : Number(attackState.myMaxHp),
  } : null;
  const attackArenaRival: PixelBattleFighter | null = choosingAttack ? {
    name: String(attackState?.opponentCardName ?? 'Pokémon rival'),
    pokedexNumber: attackState?.opponentPokedexNumber == null ? null : Number(attackState.opponentPokedexNumber),
    fallbackImage: attackState?.opponentCardImage ?? null,
    hp: attackState?.opponentHp == null ? null : Number(attackState.opponentHp),
    maxHp: attackState?.opponentMaxHp == null ? (attackState?.opponentHp == null ? null : Number(attackState.opponentHp)) : Number(attackState.opponentMaxHp),
  } : null;

  const resultArenaMy: PixelBattleFighter | null = resultRound && resultMyCard ? {
    name: String(resultMyCard.pokemon_name ?? 'Seu Pokémon'),
    pokedexNumber: Array.isArray(resultMyCard.pokedex_numbers) && resultMyCard.pokedex_numbers.length ? Number(resultMyCard.pokedex_numbers[0]) : null,
    fallbackImage: resultMyCard.image_small ?? null,
    hp: resultMyCombat?.remainingHp == null ? null : Number(resultMyCombat.remainingHp),
    maxHp: resultMyCombat?.hp == null ? null : Number(resultMyCombat.hp),
    attackName: resultMyCombat?.manualAttackChoice ?? resultMyCombat?.attackName ?? null,
    damage: resultMyCombat?.effectiveDamage == null ? resultMyCombat?.totalDamageDealt ?? 0 : resultMyCombat.effectiveDamage,
    firstPlayer: Boolean(resultMyCombat?.firstPlayer),
    knockedOut: Boolean(resultMyCombat?.knockedOut),
  } : null;
  const resultArenaRival: PixelBattleFighter | null = resultRound && resultRivalCard ? {
    name: String(resultRivalCard.pokemon_name ?? 'Pokémon rival'),
    pokedexNumber: Array.isArray(resultRivalCard.pokedex_numbers) && resultRivalCard.pokedex_numbers.length ? Number(resultRivalCard.pokedex_numbers[0]) : null,
    fallbackImage: resultRivalCard.image_small ?? null,
    hp: resultRivalCombat?.remainingHp == null ? null : Number(resultRivalCombat.remainingHp),
    maxHp: resultRivalCombat?.hp == null ? null : Number(resultRivalCombat.hp),
    attackName: resultRivalCombat?.manualAttackChoice ?? resultRivalCombat?.attackName ?? null,
    damage: resultRivalCombat?.effectiveDamage == null ? resultRivalCombat?.totalDamageDealt ?? 0 : resultRivalCombat.effectiveDamage,
    firstPlayer: Boolean(resultRivalCombat?.firstPlayer),
    knockedOut: Boolean(resultRivalCombat?.knockedOut),
  } : null;

  const turnMyMove = arenaTurnResult
    ? [arenaTurnResult.firstMove, arenaTurnResult.secondMove].find((move: any) => move?.playerId === userId)
    : null;
  const turnRivalMove = arenaTurnResult
    ? [arenaTurnResult.firstMove, arenaTurnResult.secondMove].find((move: any) => move?.playerId === otherId)
    : null;
  const turnMyState = arenaTurnResult
    ? (amChallenger ? arenaTurnResult.challenger : arenaTurnResult.opponent)
    : null;
  const turnRivalState = arenaTurnResult
    ? (amChallenger ? arenaTurnResult.opponent : arenaTurnResult.challenger)
    : null;
  const liveArenaMy: PixelBattleFighter | null = attackArenaMy ? {
    ...attackArenaMy,
    hp: turnMyState?.remainingHp == null ? attackArenaMy.hp : Number(turnMyState.remainingHp),
    maxHp: turnMyState?.hp == null ? attackArenaMy.maxHp : Number(turnMyState.hp),
    attackName: turnMyMove?.move ?? null,
    damage: Number(turnMyMove?.damage ?? 0),
    firstPlayer: arenaTurnResult?.firstPlayerId === userId,
    knockedOut: Boolean(turnMyState?.knockedOut),
  } : null;
  const liveArenaRival: PixelBattleFighter | null = attackArenaRival ? {
    ...attackArenaRival,
    hp: turnRivalState?.remainingHp == null ? attackArenaRival.hp : Number(turnRivalState.remainingHp),
    maxHp: turnRivalState?.hp == null ? attackArenaRival.maxHp : Number(turnRivalState.hp),
    attackName: turnRivalMove?.move ?? null,
    damage: Number(turnRivalMove?.damage ?? 0),
    firstPlayer: arenaTurnResult?.firstPlayerId === otherId,
    knockedOut: Boolean(turnRivalState?.knockedOut),
  } : null;

  useEffect(() => {
    if (selectedId && !pickerBag.some((entry) => entry.cards?.id === selectedId)) setSelectedId(null);
  }, [pickerBag, selectedId]);

  useEffect(() => {
    const roundNo = Number(latestRound?.round_no ?? 0);
    if (!roundNo || animatedRound.current === roundNo) return;
    animatedRound.current = roundNo;
    revealAnim.setValue(0);
    Animated.sequence([
      Animated.timing(revealAnim, { toValue: .25, duration: 160, useNativeDriver: true }),
      Animated.spring(revealAnim, { toValue: 1, speed: 11, bounciness: 7, useNativeDriver: true }),
    ]).start();
    if (settings?.battle_vibration ?? true) Vibration.vibrate([0, 60, 35, 110]);
  }, [latestRound?.round_no, revealAnim, settings?.battle_vibration]);

  useEffect(() => {
    const roundNo = Number(latestRound?.round_no ?? 0);
    if (!roundNo || battle?.mode !== 'draft3') return;
    setArenaResultRound(latestRound);
    if (arenaResultTimer.current) clearTimeout(arenaResultTimer.current);
    arenaResultTimer.current = setTimeout(() => {
      setArenaResultRound((current: any) => Number(current?.round_no ?? 0) === roundNo ? null : current);
    }, 5200);
    return () => {
      if (arenaResultTimer.current) {
        clearTimeout(arenaResultTimer.current);
        arenaResultTimer.current = null;
      }
    };
  // latestRound object is refreshed by realtime; the round number is the stable trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle?.mode, latestRound?.round_no]);

  useEffect(() => {
    if (!choosingAttack) return;
    setArenaResultRound(null);
    if (arenaResultTimer.current) {
      clearTimeout(arenaResultTimer.current);
      arenaResultTimer.current = null;
    }
  }, [choosingAttack]);

  async function respond(accept: boolean) {
    if (!id) return;
    if (accept && battle?.stake_type === 'card' && !stakeCardId) { setPickerMode('stake'); return; }
    try {
      setWorking(true); setNotice(null);
      await respondToBattle(String(id), accept, accept && battle?.stake_type === 'card' ? stakeCardId : null);
      if (settings?.battle_vibration ?? true) Vibration.vibrate(70);
      await loadBattleState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível responder ao desafio.');
      await loadBattleState().catch(() => null);
    } finally { setWorking(false); }
  }

  async function pickDraft() {
    if (!id || !selectedId || !isDrafting || battle?.draft_turn_id !== userId) return;
    try {
      setWorking(true); setNotice(null);
      await pickBattleDraftCard(String(id), selectedId);
      setSelectedId(null); setPickerMode(null);
      if (settings?.battle_vibration ?? true) Vibration.vibrate(65);
      await loadBattleState();
    } catch (error) {
      if (isFunctionErrorCode(error, 'GAME_PROFILE_UNAVAILABLE')) {
        setNotice('Não foi possível mapear esta carta para uma forma Pokémon segura. Escolha outra carta.');
      } else if (isFunctionErrorCode(error, 'BATTLE_RULE_REVIEW_REQUIRED')) {
        setNotice('Essa carta recebeu uma regra nova ou alterada e está temporariamente bloqueada na rankeada até a validação do motor. Escolha outra carta.');
      } else {
        if (isFunctionErrorCode(error, 'NOT_YOUR_TURN', 'CARD_ALREADY_DRAFTED', 'INVALID_STATUS', 'SELECTION_EXPIRED')) await loadBattleState().catch(() => null);
        setNotice(error instanceof Error ? error.message : 'Não foi possível escolher a carta do draft.');
      }
    } finally { setWorking(false); }
  }

  async function lock() {
    if (!id || !selectedId || selfLocked) return;
    try {
      setWorking(true); setNotice(null);
      const result = await lockBattleCard(String(id), selectedId);
      if (settings?.battle_vibration ?? true) Vibration.vibrate(65);
      if (result?.attackSelectionRequired) {
        setSelectedAttackName(null);
        setArenaTurnResult(null);
        setNotice(result?.engineVersion === 'game_v1'
          ? 'Pokémon definidos. Agora escolha um golpe. HP, Speed e PP serão usados no confronto.'
          : 'Pokémons definidos. Agora escolha o ataque desta rodada.');
      } else if (result?.resolved) {
        setNotice('As duas cartas foram travadas. Resultado revelado!');
      }
      await loadBattleState();
    } catch (error) {
      if (isFunctionErrorCode(error, 'BATTLE_RULE_REVIEW_REQUIRED')) {
        setNotice('Essa carta recebeu uma regra nova ou alterada e está temporariamente bloqueada na rankeada até a validação do motor. Escolha outra carta.');
      } else if (isFunctionErrorCode(error, 'ALREADY_LOCKED', 'INVALID_STATUS', 'SELECTION_EXPIRED')) {
        setNotice(error instanceof Error ? error.message : 'A rodada foi atualizada.');
        await loadBattleState();
      } else {
        setNotice(error instanceof Error ? error.message : 'Não foi possível travar a carta.');
      }
    } finally { setWorking(false); }
  }

  async function confirmAttack() {
    if (!id || !choosingAttack || !selectedAttackName || myAttackLocked || working) return;
    try {
      setWorking(true);
      setNotice(null);
      setArenaTurnResult(null);
      const result = await chooseBattleAttack(String(id), selectedAttackName);
      if (settings?.battle_vibration ?? true) Vibration.vibrate(65);
      if (result?.resolved?.engineVersion === 'game_v1') {
        setArenaTurnResult(result.resolved);
        if (result.resolved?.continueBattle) {
          setNotice(`Turno ${Number(result.resolved?.turn ?? 0)} resolvido. Nenhum Pokémon caiu — escolha o próximo golpe.`);
        } else if (result.resolved?.completed) {
          setNotice('Nocaute! A batalha foi concluída.');
        } else {
          setNotice('Nocaute! A rodada foi resolvida.');
        }
      } else if (result?.resolved) {
        setNotice('Ataques definidos. Rodada resolvida!');
      } else {
        setNotice(gameStyleBattle ? 'Golpe travado. Aguardando o adversário.' : 'Ataque travado. Aguardando o adversário.');
      }
      await loadBattleState();
    } catch (error) {
      if (isFunctionErrorCode(error, 'ALREADY_ATTACK_LOCKED', 'INVALID_STATUS', 'SELECTION_EXPIRED')) {
        await loadBattleState().catch(() => null);
      }
      if (isFunctionErrorCode(error, 'MOVE_NO_PP')) {
        setNotice('Esse golpe está sem PP. Escolha outro golpe.');
      } else if (isFunctionErrorCode(error, 'INVALID_MOVE')) {
        setNotice('Esse golpe não está disponível para este Pokémon.');
      } else {
        setNotice(error instanceof Error ? error.message : 'Não foi possível escolher o golpe.');
      }
    } finally {
      setWorking(false);
    }
  }

  async function cancel() {
    if (!id) return;
    try { setWorking(true); await cancelBattle(String(id)); goBackOrHome(router); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível cancelar.'); }
    finally { setWorking(false); }
  }

  async function forfeit() {
    if (!id || working) return;
    try {
      setWorking(true);
      setNotice(null);
      const result = await forfeitBattle(String(id));
      setNotice(
        result?.ratingNeutral
          ? 'Você desistiu antes de escolher uma carta. O adversário venceu e seu ELO não foi alterado.'
          : 'Você desistiu da batalha. A vitória foi concedida ao adversário.',
      );
      if (settings?.battle_vibration ?? true) Vibration.vibrate(80);
      await loadBattleState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível desistir da batalha.');
      await loadBattleState().catch(() => null);
    } finally {
      setWorking(false);
    }
  }

  function confirmForfeit() {
    const neutralHint =
      !draftCards.some((item) => item.player_id === userId) &&
      !events.some((event) =>
        ['card_locked', 'auto_locked'].includes(event.event_type) &&
        event.payload?.playerId === userId
      );

    const message = neutralHint
      ? 'Você ainda não escolheu nenhuma carta. O adversário receberá a vitória, mas seu ELO não será alterado.'
      : 'A batalha já começou para você. O adversário receberá a vitória e a derrota contará normalmente no ELO.';

    if (Platform.OS === 'web') {
      void forfeit();
      return;
    }

    Alert.alert('Desistir da batalha?', message, [
      { text: 'Continuar jogando', style: 'cancel' },
      { text: 'DESISTIR', style: 'destructive', onPress: () => { void forfeit(); } },
    ]);
  }

  async function rematch() {
    if (!id) return;
    try { setWorking(true); const next = await rematchBattle(String(id)); router.replace(`/battle/${next}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível criar a revanche.'); }
    finally { setWorking(false); }
  }

  if (loading) return <View style={[styles.center, { backgroundColor: colors.bg }]}><ActivityIndicator size="large" color={colors.yellow} /></View>;
  if (!battle) return <View style={[styles.center, { backgroundColor: colors.bg }]}><Text style={{ color: colors.text }}>Batalha não encontrada.</Text></View>;

  const challenger = players[battle.challenger_id];
  const opponent = players[battle.opponent_id];
  const winnerName = players[battle.winner_id]?.username;
  const selecting = battle.status === 'selecting';
  const drafting = battle.status === 'drafting';
  const attacking = battle.status === 'revealing' && battle.mode === 'draft3';
  const invited = battle.status === 'invited';
  const completed = battle.status === 'completed';

  return (
    <View style={[styles.safe, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: true, title: battle.mode === 'draft3' ? 'Draft 3' : battle.mode === 'mystery' ? 'Mystery Battle' : 'Quick Battle', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }} />
      <ScrollView contentContainerStyle={[styles.content, selecting && styles.contentWithDock]} showsVerticalScrollIndicator={false}>
        {notice ? <Pressable style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.yellow }]} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={colors.yellow} /><Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text><Ionicons name="close" size={18} color={colors.muted} /></Pressable> : null}

        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <PlayerSide label="DESAFIANTE" player={challenger} score={battle.challenger_score} />
          <View style={styles.vs}><Text style={[styles.vsText, { color: colors.text }]}>VS</Text><Text style={[styles.mode, { color: colors.accent }]}>{battle.mode === 'draft3' ? 'DRAFT • 3 RODADAS' : battle.mode === 'mystery' ? 'MELHOR DE 3' : '1 CARTA'}</Text>{battle.stake_type === 'coins' ? <Text style={[styles.wager, { color: colors.yellow }]}>🪙 {Number(battle.wager_coins).toLocaleString('pt-BR')} CADA</Text> : battle.stake_type === 'card' ? <Text style={[styles.wager, { color: '#C7A8FF' }]}>🎴 1 CARTA CADA</Text> : <Text style={[styles.casual, { color: colors.muted }]}>CASUAL</Text>}</View>
          <PlayerSide label="OPONENTE" player={opponent} score={battle.opponent_score} right />
        </View>

        {(drafting || selecting || attacking) ? (
          <View style={[styles.forfeitPanel,{backgroundColor:colors.surface,borderColor:'#6B303A'}]}>
            <View style={styles.forfeitCopy}>
              <Ionicons name="flag" size={18} color="#FF8792"/>
              <View style={{flex:1}}>
                <Text style={styles.forfeitTitle}>Desistir da batalha</Text>
                <Text style={[styles.forfeitHint,{color:colors.muted}]}>
                  Antes da sua primeira escolha: vitória do adversário sem alterar seu ELO. Depois de escolher: derrota normal.
                </Text>
              </View>
            </View>
            <Pressable disabled={working} onPress={confirmForfeit} style={[styles.forfeitButton,working&&styles.disabled]}>
              <Text style={styles.forfeitButtonText}>DESISTIR</Text>
            </Pressable>
          </View>
        ) : null}

        {invited ? (
          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="game-controller" size={40} color={colors.accent} />
            <Text style={[styles.panelTitle, { color: colors.text }]}>{amChallenger ? 'Desafio enviado' : 'Você foi desafiado!'}</Text>
            <Text style={[styles.panelText, { color: colors.muted }]}>{amChallenger ? 'Aguardando o outro treinador aceitar.' : `@${challenger?.username ?? 'Treinador'} quer uma ${battle.mode === 'draft3' ? 'Draft 3 com três escolhas abertas e três rodadas secretas' : battle.mode === 'mystery' ? 'Mystery Battle melhor de 3' : 'Quick Battle'}.`}</Text>
            {battle.stake_type === 'coins' ? <Text style={[styles.stakeHeadline, { color: colors.yellow }]}>Aposta: 🪙 {Number(battle.wager_coins).toLocaleString('pt-BR')} de cada lado</Text> : null}
            {battle.stake_type === 'card' ? (
              <View style={[styles.cardStakePanel, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.stakeHeadline, { color: '#C7A8FF' }]}>🎴 BATALHA VALENDO CARTA</Text>
                {challengerStake ? <StakePreview item={challengerStake} label={amChallenger ? 'SUA CARTA EM ESCROW' : 'CARTA DO DESAFIANTE'} /> : null}
                {!amChallenger ? (
                  <Pressable style={[styles.chooseStakeButton, { borderColor: stakeCardId ? colors.yellow : colors.border }]} onPress={() => setPickerMode('stake')}>
                    {stakeEntry?.cards?.image_small ? <Image source={{ uri: stakeEntry.cards.image_small }} style={styles.chooseStakeThumb} resizeMode="contain" /> : <View style={[styles.chooseStakeThumb, { backgroundColor: colors.surface }]}><Ionicons name="albums-outline" size={24} color={colors.accent} /></View>}
                    <View style={{ flex: 1 }}><Text style={[styles.chooseStakeKicker, { color: colors.muted }]}>SUA CARTA DE APOSTA</Text><Text style={[styles.chooseStakeName, { color: colors.text }]}>{stakeEntry?.cards?.pokemon_name ?? 'Escolher carta'}</Text><Text style={[styles.chooseStakeValue, { color: colors.yellow }]}>{stakeEntry ? (stakeEntry.cards?.market_price_usd != null ? formatUsd(Number(stakeEntry.cards.market_price_usd)) : 'US$ —') : 'Toque para abrir a Bag otimizada'}</Text></View><Ionicons name="chevron-forward" size={22} color={colors.accent} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {!amChallenger ? <View style={styles.actions}><Pressable style={[styles.decline, { borderColor: '#69313A' }]} onPress={() => respond(false)} disabled={working}><Text style={styles.declineText}>RECUSAR</Text></Pressable><Pressable style={[styles.accept, { backgroundColor: colors.yellow }, battle.stake_type === 'card' && !stakeCardId && styles.disabled]} onPress={() => respond(true)} disabled={working || (battle.stake_type === 'card' && !stakeCardId)}><Text style={styles.acceptText}>{working ? 'AGUARDE…' : 'ACEITAR'}</Text></Pressable></View> : <Pressable style={[styles.decline, { borderColor: '#69313A' }]} onPress={cancel} disabled={working}><Text style={styles.declineText}>CANCELAR DESAFIO</Text></Pressable>}
          </View>
        ) : null}

        {drafting ? (
          <View style={[styles.draftPanel, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <Text style={[styles.roundLabel, { color: colors.muted }]}>DRAFT ABERTO • {battle.draft_pick_count}/6</Text>
            <Text style={[styles.draftTitle, { color: colors.text }]}>{battle.draft_turn_id === userId ? 'Sua vez de escolher' : `Vez de @${players[battle.draft_turn_id]?.username ?? 'Treinador'}`}</Text>
            <Text style={[styles.timer, { color: remaining <= 10 ? '#FF566B' : colors.text }]}>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</Text>
            <Text style={[styles.timerHint, { color: colors.muted }]}>As escolhas ficam visíveis e alternam entre os jogadores. Depois da sexta escolha, os dois times voltam a ficar secretos.</Text>
            <View style={styles.draftGrid}>
              {draftCards.map((item) => { const card = Array.isArray(item.cards) ? item.cards[0] : item.cards; const combat = getBattleCardPreview(card); return (
                <Pressable
                  key={`${item.player_id}:${item.card_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Visualizar ${card?.pokemon_name ?? 'carta escolhida'}`}
                  onPress={() => setDraftPreviewCard(card)}
                  style={({ pressed }) => [styles.draftCard, { backgroundColor: colors.surfaceAlt, borderColor: item.player_id === userId ? colors.accent : colors.border, opacity: pressed ? .72 : 1 }]}
                >
                  {card?.image_small ? <Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.draftImage} /> : <View style={[styles.draftImage, { backgroundColor: colors.bg }]} />}
                  <Text numberOfLines={1} style={[styles.draftCardName, { color: colors.text }]}>{card?.pokemon_name ?? item.card_id}</Text>
                  <Text style={[styles.draftOwner, { color: colors.muted }]}>{item.player_id === userId ? 'VOCÊ' : `@${players[item.player_id]?.username ?? 'RIVAL'}`} • #{item.global_pick_no}</Text>
                  <Text numberOfLines={1} style={[styles.draftStats, { color: colors.yellow }]}>HP {combat.hp} • ATQ {combat.maxDamage} • ⚡ {combat.bestEnergy}</Text>
                  <View style={styles.draftViewHint}><Ionicons name="expand-outline" size={11} color={colors.accent}/><Text style={[styles.draftViewHintText,{color:colors.accent}]}>TOQUE PARA AMPLIAR</Text></View>
                </Pressable>
              ); })}
            </View>
            {battle.draft_turn_id === userId ? (
              <Pressable style={[styles.openPicker, { backgroundColor: colors.accentSoft, borderColor: colors.accent }, working && styles.disabled]} onPress={() => setPickerMode('battle')} disabled={working || remaining === 0}>
                <Ionicons name="albums-outline" size={22} color={colors.accent} />
                <View style={{ flex: 1 }}><Text style={[styles.openPickerTitle, { color: colors.text }]}>Escolher carta {ownDraftIds.size + 1} de 3</Text><Text style={[styles.openPickerMeta, { color: colors.muted }]}>{pickerBag.length} cartas disponíveis • esta escolha será pública</Text></View>
                <Ionicons name="chevron-forward" size={22} color={colors.accent} />
              </Pressable>
            ) : <View style={[styles.lockedNotice, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Ionicons name="eye" size={20} color={colors.accent} /><Text style={[styles.lockedText, { color: colors.text }]}>Acompanhe a escolha do oponente. Sua vez será a próxima.</Text></View>}
          </View>
        ) : null}

        {selecting ? (
          <>
            <View style={styles.timerPanel}><Text style={[styles.roundLabel, { color: colors.muted }]}>RODADA {currentRound}</Text><Text style={[styles.timer, { color: remaining <= 5 ? '#FF566B' : colors.text }]}>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</Text><Text style={[styles.timerHint, { color: colors.muted }]}>{remaining === 0 ? 'Tempo encerrado. O servidor está resolvendo a rodada automaticamente…' : 'Escolha em segredo. Se o tempo zerar, o servidor escolhe automaticamente.'}</Text><Text style={[styles.rulesText, { color: colors.accent }]}>Regra v6 TCG: duelo por turnos com 1 Energia virtual por turno. O primeiro jogador não ataca no primeiro turno; custo de Energia, dano variável, Fraqueza, Resistência, descarte, recarga, Condições Especiais, Abilities, efeitos entre turnos, ataques copiados e rerrolagens suportadas entram no resultado. Preço e raridade não contam.</Text></View>

            <View style={styles.arena}>
              <MysterySlot label="SUA CARTA" locked={selfLocked} card={selectedEntry?.cards ?? null} showCard={Boolean(selectedEntry)} accent={colors.accent} />
              <View style={styles.arenaVs}><Ionicons name="flash" size={27} color={colors.yellow} /><Text style={[styles.arenaVsText, { color: colors.accent }]}>MYSTERY</Text></View>
              <MysterySlot label="CARTA INIMIGA" locked={opponentLocked} card={null} showCard={false} accent={colors.accent} />
            </View>

            {!selfLocked ? (
              <View style={[styles.sourcePanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {battle.mode === 'draft3' ? <Text style={[styles.sourceLabel, { color: colors.muted }]}>SUAS CARTAS DO DRAFT AINDA NÃO USADAS</Text> : <><View style={styles.sourceLabelRow}><Text style={[styles.sourceLabel, { color: colors.muted }]}>FONTE DAS CARTAS</Text><Pressable onPress={() => router.push('/decks')}><Text style={[styles.editDecks, { color: colors.accent }]}>EDITAR DECKS</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deckChips}><DeckChip label="Bag inteira" active={sourceDeck === 'bag'} onPress={() => setSourceDeck('bag')} />{decks.map((deck) => <DeckChip key={deck.id} label={`${deck.is_default ? '★ ' : ''}${deck.name}`} active={sourceDeck === deck.id} onPress={() => setSourceDeck(deck.id)} />)}</ScrollView></>}
                <Pressable style={[styles.openPicker, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} onPress={() => setPickerMode('battle')}><Ionicons name="search" size={22} color={colors.accent} /><View style={{ flex: 1 }}><Text style={[styles.openPickerTitle, { color: colors.text }]}>{selectedEntry?.cards ? `Selecionada: ${selectedEntry.cards.pokemon_name}` : 'Escolher carta de batalha'}</Text><Text style={[styles.openPickerMeta, { color: colors.muted }]}>{selectedEntry?.cards
  ? gameStyleBattle ? 'Espécie/forma selecionada • stats Nintendo serão aplicados ao travar • toque para trocar' : `HP ${getBattleCardPreview(selectedEntry.cards).hp} • ATQ ${getBattleCardPreview(selectedEntry.cards).maxDamage} • ⚡ ${getBattleCardPreview(selectedEntry.cards).bestEnergy} • toque para trocar`
  : gameStyleBattle ? `${pickerBag.length} cartas • escolha pela espécie/forma; sem Energia TCG` : `${pickerBag.length} cartas • compare HP, ataque, Energia e efeitos`}</Text></View><Ionicons name="chevron-forward" size={22} color={colors.accent} /></Pressable>
              </View>
            ) : <View style={[styles.lockedNotice, { backgroundColor: colors.surface, borderColor: colors.accent }]}><Ionicons name="lock-closed" size={20} color={colors.accent} /><Text style={[styles.lockedText, { color: colors.text }]}>Sua carta está travada. Aguardando o oponente ou o servidor resolver a rodada.</Text></View>}
          </>
        ) : null}

        {battle.mode === 'draft3' && (attacking || Boolean(resultRound)) ? (
          <PixelBattleArena
            my={attacking ? liveArenaMy : resultArenaMy}
            rival={attacking ? liveArenaRival : resultArenaRival}
            resultKey={attacking && arenaTurnResult
              ? `${battle.id}:${currentRound}:turn:${arenaTurnResult.turn}`
              : !attacking && resultRound ? `${battle.id}:${resultRound.round_no}` : null}
            winner={attacking && arenaTurnResult?.knockout
              ? (arenaTurnResult.winnerId === userId ? 'me' : 'rival')
              : !attacking && resultRound ? (resultRound.winner_id === userId ? 'me' : 'rival') : null}
            turnOnly={Boolean(attacking && arenaTurnResult && !arenaTurnResult?.knockout)}
            title={attacking
              ? `RODADA ${currentRound} • TURNO ${Number(attackState?.turn ?? arenaTurnResult?.turn ?? 1)}`
              : `RODADA ${Number(resultRound?.round_no ?? 0)} • RESULTADO`}
            subtitle={gameStyleBattle
              ? 'Estilo Pokémon • HP, Speed, tipo, precisão, crítico, status e PP'
              : 'Compatibilidade TCG v6 para batalha iniciada antes da migração'}
          />
        ) : null}

        {attacking ? (
          <View style={[styles.sourcePanel, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <View style={styles.timerPanel}>
              <Text style={[styles.roundLabel, { color: colors.muted }]}>RODADA {currentRound} • ESCOLHA DE ATAQUE</Text>
              <Text style={[styles.timer, { color: remaining <= 5 ? '#FF566B' : colors.text }]}>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</Text>
              <Text style={[styles.timerHint, { color: colors.muted }]}>
                {remaining === 0 ? 'Tempo encerrado. O servidor escolherá um ataque automaticamente…' : 'Escolha qual ataque seu Pokémon usará neste confronto.'}
              </Text>
            </View>

            <View style={[styles.openPicker, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              {attackState?.myCardImage ? <Image source={{ uri: attackState.myCardImage }} style={styles.chooseStakeThumb} resizeMode="contain" /> : <Ionicons name="flash" size={30} color={colors.accent} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.openPickerTitle, { color: colors.text }]}>{attackState?.myCardName ?? 'Seu Pokémon'}</Text>
                {gameStyleBattle ? (
                  <>
                    <Text style={[styles.openPickerMeta, { color: colors.yellow }]}>HP {Number(attackState?.myHp ?? 0)}/{Number(attackState?.myMaxHp ?? attackState?.myHp ?? 0)} • TURNO {Number(attackState?.turn ?? 1)}</Text>
                    <Text style={[styles.openPickerMeta, { color: colors.muted }]}>
                      {Array.isArray(attackState?.myTypes) ? attackState.myTypes.map((type: string) => String(type).toUpperCase()).join(' / ') : 'TIPO —'}
                      {attackState?.myAbility ? ` • Habilidade: ${String(attackState.myAbility).replaceAll('-', ' ')}` : ''}
                      {attackState?.myStatus ? ` • Status: ${String(attackState.myStatus).toUpperCase()}` : ''}
                    </Text>
                  </>
                ) : <Text style={[styles.openPickerMeta, { color: colors.muted }]}>Compatibilidade TCG v6 desta batalha já iniciada.</Text>}
              </View>
            </View>

            <Text style={[styles.sourceLabel, { color: colors.muted }]}>ATAQUES DISPONÍVEIS</Text>
            <View style={{ gap: 9 }}>
              {manualAttackOptions.map((attack: any, index: number) => {
                const rawName = gameStyleBattle
                  ? String(attack?.identifier ?? attack?.name ?? 'struggle')
                  : attack?.__noAttack ? '__NO_ATTACK__' : String(attack?.name ?? '');
                const displayName = attack?.__noAttack ? 'Sem ataque' : String(attack?.name ?? 'Ataque');
                const energy = Number(attack?.convertedEnergyCost ?? (Array.isArray(attack?.cost) ? attack.cost.length : 0));
                const selected = selectedAttackName === rawName || (myAttackLocked && attackState?.myAttackName === rawName);
                return (
                  <Pressable
                    key={`${displayName}:${index}`}
                    disabled={myAttackLocked || working || remaining === 0}
                    onPress={() => setSelectedAttackName(rawName)}
                    style={[
                      styles.openPicker,
                      {
                        backgroundColor: selected ? colors.accentSoft : colors.surfaceAlt,
                        borderColor: selected ? colors.yellow : colors.border,
                        opacity: myAttackLocked && !selected ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.openPickerTitle, { color: colors.text }]}>{displayName}</Text>
                      {gameStyleBattle ? (
                        <>
                          <Text style={[styles.openPickerMeta, { color: colors.yellow }]}>
                            {String(attack?.type ?? 'normal').toUpperCase()} • {String(attack?.category ?? 'physical').toUpperCase()} • Poder {String(attack?.power ?? '—')} • PP {Number(attack?.pp ?? 0)}/{Number(attack?.maxPp ?? attack?.pp ?? 0)}
                          </Text>
                          <Text style={[styles.openPickerMeta, { color: colors.muted }]}>
                            Precisão {attack?.accuracy == null ? '—' : `${Number(attack.accuracy)}%`}{Number(attack?.priority ?? 0) !== 0 ? ` • Prioridade ${Number(attack.priority) > 0 ? '+' : ''}${Number(attack.priority)}` : ''}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.openPickerMeta, { color: colors.yellow }]}>⚡ {energy} Energia • Dano {String(attack?.damage || '—')}</Text>
                          {attack?.text ? <Text style={[styles.openPickerMeta, { color: colors.muted }]}>{String(attack.text)}</Text> : null}
                        </>
                      )}
                    </View>
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.yellow : colors.muted} />
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.lockedNotice, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name={opponentAttackLocked ? 'checkmark-circle' : 'time-outline'} size={20} color={opponentAttackLocked ? '#65D894' : colors.accent} />
              <Text style={[styles.lockedText, { color: colors.text }]}>
                {opponentAttackLocked ? 'O adversário já escolheu o ataque.' : 'O ataque do adversário continua secreto até a rodada ser resolvida.'}
              </Text>
            </View>

            {myAttackLocked ? (
              <View style={[styles.lockedNotice, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                <Ionicons name="lock-closed" size={20} color={colors.accent} />
                <Text style={[styles.lockedText, { color: colors.text }]}>Seu {gameStyleBattle ? 'golpe' : 'ataque'} está travado: {attackState?.myAttackName === '__NO_ATTACK__' ? 'Sem ataque' : String(attackState?.myAttackName ?? '').replaceAll('-', ' ')}. Aguardando o adversário.</Text>
              </View>
            ) : (
              <Pressable
                disabled={!selectedAttackName || working || remaining === 0}
                onPress={() => void confirmAttack()}
                style={[styles.accept, { backgroundColor: colors.yellow }, (!selectedAttackName || working || remaining === 0) && styles.disabled]}
              >
                <Text style={styles.acceptText}>{working ? 'CONFIRMANDO…' : gameStyleBattle ? 'USAR ESTE GOLPE' : 'USAR ESTE ATAQUE'}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {rounds.length ? (
          <View style={[styles.historyPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Rodadas reveladas</Text>
            {rounds.map((round) => <RoundRow key={round.round_no} round={round} challengerName={challenger?.username} opponentName={opponent?.username} userId={userId} challengerId={battle.challenger_id} revealAnim={Number(round.round_no) === Number(latestRound?.round_no) ? revealAnim : undefined} />)}
          </View>
        ) : null}

        {completed ? (
          <View style={[styles.resultPanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
            <Ionicons name="trophy" size={45} color={colors.yellow} />
            <Text style={[styles.resultKicker, { color: colors.yellow }]}>BATALHA CONCLUÍDA</Text>
            <Text style={[styles.resultTitle, { color: colors.text }]}>{players[battle.winner_id]?.is_bot ? '🤖 ' : '@'}{winnerName ?? (players[battle.winner_id]?.is_bot ? 'Treinador IA' : 'Treinador')} venceu</Text>
            <Text style={[styles.resultMeta, { color: colors.muted }]}>{battle.challenger_score} × {battle.opponent_score} • {battle.reward_eligible ? 'resultado válido para progressão' : 'sem recompensa de progressão'}</Text>
            {battle.forfeited_by ? (
              <View style={[styles.forfeitResult,{backgroundColor:battle.forfeit_rating_neutral?'#162C22':'#321A20',borderColor:battle.forfeit_rating_neutral?'#367A58':'#6B303A'}]}>
                <Ionicons name="flag" size={17} color={battle.forfeit_rating_neutral?'#65D894':'#FF8792'}/>
                <Text style={[styles.forfeitResultText,{color:colors.text}]}>
                  {battle.forfeited_by===userId ? 'Você desistiu.' : 'O adversário desistiu.'} {battle.forfeit_rating_neutral ? 'Vitória por desistência • SEM ALTERAÇÃO DE ELO.' : 'Vitória por desistência • resultado com ELO normal.'}
                </Text>
              </View>
            ) : null}
            {battle.stake_type === 'card' ? <View style={[styles.stakeResult, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.stakeResultText, { color: colors.text }]}>🎴 O vencedor recebeu as cartas mantidas em escrow.</Text>{myStake?.cards ? <Text style={[styles.stakeResultValue, { color: colors.yellow }]}>Valor fixo da sua aposta: {(() => { const stakeCard = Array.isArray(myStake.cards) ? myStake.cards[0] : myStake.cards; return stakeCard?.market_price_usd != null ? formatUsd(Number(stakeCard.market_price_usd)) : 'US$ —'; })()}</Text> : null}</View> : null}
            <View style={styles.actions}><Pressable style={[styles.accept, { backgroundColor: colors.yellow }]} onPress={rematch} disabled={working}><Text style={styles.acceptText}>REVANCHE</Text></Pressable><Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => router.push('/battles')}><Text style={[styles.secondaryText, { color: colors.text }]}>BATTLE CENTER</Text></Pressable></View>
          </View>
        ) : null}

        {!invited && !drafting && !selecting && !attacking && !completed ? <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.panelTitle, { color: colors.text }]}>Batalha {String(battle.status).toLowerCase()}</Text><Text style={[styles.panelText, { color: colors.muted }]}>Este desafio já não está ativo.</Text><Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => goBackOrHome(router)}><Text style={[styles.secondaryText, { color: colors.text }]}>VOLTAR</Text></Pressable></View> : null}
      </ScrollView>

      {selecting ? (
        <View style={[styles.actionDock, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable style={[styles.chooseDock, { backgroundColor: colors.surfaceAlt, borderColor: selectedId ? colors.accent : colors.border }, selfLocked && styles.disabled]} onPress={() => setPickerMode('battle')} disabled={selfLocked || working}>
            <Ionicons name="albums-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}><Text style={[styles.dockSmall, { color: colors.muted }]}>SUA CARTA</Text><Text numberOfLines={1} style={[styles.chooseDockName, { color: colors.text }]}>{selectedEntry?.cards?.pokemon_name ?? 'ESCOLHER'}</Text></View>
          </Pressable>
          <Pressable style={[styles.lockDock, { backgroundColor: selfLocked ? '#274E3B' : colors.yellow }, (!selectedId || working || selfLocked || remaining === 0) && styles.disabled]} onPress={lock} disabled={!selectedId || working || selfLocked || remaining === 0}>
            <Ionicons name="lock-closed" size={19} color={selfLocked ? '#B7E8CC' : '#07111F'} />
            <View><Text style={[styles.dockSmall, { color: selfLocked ? '#9CCDB1' : '#564912' }]}>{selectedEntry?.cards ? (gameStyleBattle ? 'STATS DO POKÉMON • NÍVEL 50 • SEM ENERGIA' : `HP ${getBattleCardPreview(selectedEntry.cards).hp} • ATQ ${getBattleCardPreview(selectedEntry.cards).maxDamage} • ⚡ ${getBattleCardPreview(selectedEntry.cards).bestEnergy}`) : 'SELEÇÃO SECRETA'}</Text><Text style={[styles.lockDockText, { color: selfLocked ? '#E2FFEE' : '#07111F' }]}>{selfLocked ? 'CARTA TRAVADA' : remaining === 0 ? 'RESOLVENDO…' : 'TRAVAR CARTA'}</Text></View>
          </Pressable>
        </View>
      ) : null}

      <CardPickerModal
        visible={pickerMode === 'battle'}
        title={drafting ? "Escolha pública do Draft 3" : "Carta de batalha"}
        subtitle={drafting ? 'A carta escolhida será revelada agora para os dois jogadores.' : battle?.mode === 'draft3' ? 'Escolha em segredo uma das cartas restantes do seu time.' : sourceDeck === 'bag' ? 'Sua Bag inteira • o oponente não verá sua escolha.' : `Deck: ${selectedDeck?.name ?? 'selecionado'} • escolha em segredo.`}
        bag={pickerBag}
        mode="single"
        displayMode="battle"
        enableCombatSort={!gameStyleBattle}
        gameStyle={gameStyleBattle}
        enableTypeFilter
        sourceOptions={drafting || battle?.mode !== 'draft3' ? [{ id: 'bag', label: 'Bag inteira' }, ...decks.map((deck) => ({ id: String(deck.id), label: `${deck.is_default ? '★ ' : ''}${deck.name}` }))] : []}
        sourceId={sourceDeck}
        onSourceChange={setSourceDeck}
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        onClose={() => setPickerMode(null)}
        onConfirm={drafting ? pickDraft : () => setPickerMode(null)}
        confirmLabel={drafting ? "ESCOLHER NO DRAFT" : "USAR ESTA CARTA"}
        working={working}
      />
      <DraftCardPreviewModal card={draftPreviewCard} visible={Boolean(draftPreviewCard)} onClose={() => setDraftPreviewCard(null)} />

      <CardPickerModal
        visible={pickerMode === 'stake'}
        title="Carta da aposta"
        subtitle="Esta carta ficará em escrow e irá para o vencedor. Confira o valor antes de aceitar."
        bag={bag}
        mode="single"
        selectedId={stakeCardId}
        onSelectedIdChange={setStakeCardId}
        onClose={() => setPickerMode(null)}
        onConfirm={() => setPickerMode(null)}
        confirmLabel="CONFIRMAR CARTA DA APOSTA"
        working={working}
      />
    </View>
  );
}

function DraftCardPreviewModal({ card, visible, onClose }: { card: any; visible: boolean; onClose: () => void }) {
  const { colors } = useAppTheme();
  if (!card) return null;
  const combat = getBattleCardPreview(card);
  const attacks = Array.isArray(card?.tcg_data?.attacks) ? card.tcg_data.attacks : [];
  const abilities = Array.isArray(card?.tcg_data?.abilities) ? card.tcg_data.abilities : [];
  const types = Array.isArray(card?.types) ? card.types : [];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.draftPreviewBackdrop} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.draftPreviewPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.draftPreviewHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.draftPreviewKicker, { color: colors.yellow }]}>CARTA REVELADA NO DRAFT</Text>
              <Text style={[styles.draftPreviewTitle, { color: colors.text }]}>{card.pokemon_name ?? 'Pokémon'}</Text>
              <Text style={[styles.draftPreviewMeta, { color: colors.muted }]}>{types.length ? types.join(' • ') : 'Tipo não informado'} • {card.rarity ?? 'Sem raridade'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar carta ampliada" onPress={onClose} style={[styles.draftPreviewClose,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="close" size={22} color={colors.text}/></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.draftPreviewScroll} showsVerticalScrollIndicator={false}>
            {card.image_large || card.image_small ? <Image source={{ uri: card.image_large ?? card.image_small }} resizeMode="contain" style={styles.draftPreviewImage}/> : <View style={[styles.draftPreviewImage,{backgroundColor:colors.surfaceAlt,alignItems:'center',justifyContent:'center'}]}><Ionicons name="image-outline" size={54} color={colors.muted}/></View>}
            <View style={styles.draftPreviewStats}>
              <View style={[styles.draftPreviewStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.draftPreviewStatLabel,{color:colors.muted}]}>HP / DEFESA</Text><Text style={[styles.draftPreviewStatValue,{color:colors.text}]}>{combat.hp}</Text></View>
              <View style={[styles.draftPreviewStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.draftPreviewStatLabel,{color:colors.muted}]}>MAIOR ATAQUE</Text><Text style={[styles.draftPreviewStatValue,{color:colors.yellow}]}>{combat.maxDamage}</Text></View>
              <View style={[styles.draftPreviewStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.draftPreviewStatLabel,{color:colors.muted}]}>ENERGIA MÍN.</Text><Text style={[styles.draftPreviewStatValue,{color:colors.accent}]}>⚡ {combat.bestEnergy}</Text></View>
            </View>
            {abilities.length ? <View style={styles.draftPreviewSection}><Text style={[styles.draftPreviewSectionTitle,{color:colors.muted}]}>HABILIDADES</Text>{abilities.map((ability:any,index:number)=><View key={`${ability?.name ?? 'ability'}:${index}`} style={[styles.draftPreviewMove,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.draftPreviewMoveName,{color:colors.text}]}>{String(ability?.name ?? 'Habilidade')}</Text>{ability?.text?<Text style={[styles.draftPreviewMoveText,{color:colors.muted}]}>{String(ability.text)}</Text>:null}</View>)}</View> : null}
            <View style={styles.draftPreviewSection}><Text style={[styles.draftPreviewSectionTitle,{color:colors.muted}]}>ATAQUES</Text>{attacks.length ? attacks.map((attack:any,index:number)=><View key={`${attack?.name ?? 'attack'}:${index}`} style={[styles.draftPreviewMove,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><View style={styles.draftPreviewMoveHeader}><Text style={[styles.draftPreviewMoveName,{color:colors.text}]}>{String(attack?.name ?? 'Ataque')}</Text><Text style={[styles.draftPreviewMoveDamage,{color:colors.yellow}]}>{String(attack?.damage || '—')} dano</Text></View><Text style={[styles.draftPreviewMoveEnergy,{color:colors.accent}]}>⚡ {Number(attack?.convertedEnergyCost ?? (Array.isArray(attack?.cost) ? attack.cost.length : 0))} Energia</Text>{attack?.text?<Text style={[styles.draftPreviewMoveText,{color:colors.muted}]}>{String(attack.text)}</Text>:null}</View>) : <Text style={[styles.draftPreviewMoveText,{color:colors.muted}]}>Esta carta não possui ataque impresso.</Text>}</View>
          </ScrollView>
          <Pressable style={[styles.draftPreviewDone,{backgroundColor:colors.yellow}]} onPress={onClose}><Text style={styles.draftPreviewDoneText}>VOLTAR AO DRAFT</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlayerSide({ label, player, score, right }: { label: string; player?: any; score?: number; right?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <CompactTrainerBanner
      frameId={player?.equipped_frame_id}
      backgroundId={player?.equipped_background_id}
      fallbackColor={right?colors.yellow:colors.accent}
      style={[styles.playerSide,right&&styles.right]}
    >
      <View style={[styles.playerSideInner,right&&styles.right]}>
        <Text style={[styles.sideLabel, { color: colors.muted }]}>{player?.is_bot ? 'TREINADOR IA' : label}</Text>
        <Text style={[styles.playerName, { color: colors.text }]}>{player?.is_bot ? '🤖 ' : '@'}{player?.username ?? (player?.is_bot ? 'Treinador IA' : 'Treinador')}</Text>
        <Text style={[styles.ratingText, { color: colors.muted }]}>{player?.is_bot ? 'ELO simulado' : 'ELO'} {player?.battle_rating ?? 1000}</Text>
        <Text style={[styles.score, { color: colors.yellow }]}>{score ?? 0}</Text>
      </View>
    </CompactTrainerBanner>
  );
}

function DeckChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.deckChip, { backgroundColor: active ? colors.accentSoft : colors.surfaceAlt, borderColor: active ? colors.accent : colors.border }]}><Text style={[styles.deckChipText, { color: active ? colors.text : colors.muted }]}>{label}</Text></Pressable>;
}

function StakePreview({ item, label }: { item: any; label: string }) {
  const { colors } = useAppTheme();
  const relation = item?.cards;
  const card = Array.isArray(relation) ? relation[0] : relation;
  return <View style={[styles.stakePreview, { borderColor: colors.border }]}>{card?.image_small ? <Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.stakeImage} /> : <View style={[styles.stakeImage, { backgroundColor: colors.surface }]} />}<View style={{ flex: 1 }}><Text style={[styles.stakePreviewLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.stakeName, { color: colors.text }]}>{card?.pokemon_name ?? 'Carta'}</Text><Text style={[styles.stakeMeta, { color: colors.muted }]}>{card?.rarity ?? 'Sem raridade'}</Text><Text style={[styles.stakeValue, { color: colors.yellow }]}>Valor fixo {card?.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}</Text></View></View>;
}

function MysterySlot({ label, locked, card, showCard, accent }: { label: string; locked: boolean; card: any; showCard: boolean; accent: string }) {
  const { colors } = useAppTheme();
  const combat = getBattleCardPreview(card);
  return <View style={styles.slot}><Text style={[styles.slotLabel, { color: colors.muted }]}>{label}</Text>{showCard && card?.image_small ? <View style={[styles.slotCardWrap, { borderColor: locked ? accent : colors.border }]}><Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.slotCard} /><View style={styles.slotValue}><Text style={[styles.slotValueText, { color: colors.yellow }]}>HP {combat.hp} • ATQ {combat.maxDamage} • ⚡ {combat.bestEnergy}</Text></View></View> : <View style={[styles.hiddenCard, { borderColor: locked ? accent : colors.border, backgroundColor: colors.surfaceAlt }]}><View style={[styles.questionCircle, { borderColor: accent }]}><Text style={[styles.question, { color: accent }]}>?</Text></View><Text style={[styles.hiddenState, { color: locked ? accent : colors.muted }]}>{locked ? 'TRAVADA' : 'AGUARDANDO'}</Text></View>}</View>;
}

function RoundRow({ round, challengerName, opponentName, userId, challengerId, revealAnim }: { round: any; challengerName?: string; opponentName?: string; userId: string; challengerId: string; revealAnim?: Animated.Value }) {
  const { colors } = useAppTheme();
  const c = Array.isArray(round.c1) ? round.c1[0] : round.c1;
  const o = Array.isArray(round.c2) ? round.c2[0] : round.c2;
  const won = round.winner_id === userId;
  const myIsChallenger = userId === challengerId;
  const myCard = myIsChallenger ? c : o;
  const theirCard = myIsChallenger ? o : c;
  const myCombat = myIsChallenger ? round.challenger_combat : round.opponent_combat;
  const theirCombat = myIsChallenger ? round.opponent_combat : round.challenger_combat;
  const content = <View style={[styles.roundRow, { backgroundColor: colors.surfaceAlt, borderColor: won ? '#3B8B61' : colors.border }]}><View style={styles.roundHeading}><Text style={[styles.roundNumber, { color: colors.muted }]}>RODADA {round.round_no} • REGRA V{round.rules_version ?? 3}</Text><Text style={[styles.roundWinner, { color: won ? '#65D894' : '#FF8792' }]}>{won ? 'VOCÊ VENCEU' : `@${round.winner_id === challengerId ? challengerName ?? 'desafiante' : opponentName ?? 'oponente'} VENCEU`}</Text></View><View style={styles.roundCards}><MiniRoundCard label="SUA" card={myCard} duel={myCombat} /><Text style={[styles.roundVs, { color: colors.muted }]}>VS</Text><MiniRoundCard label="RIVAL" card={theirCard} duel={theirCombat} /></View></View>;
  return revealAnim ? <Animated.View style={{ opacity: revealAnim, transform: [{ scale: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [.94, 1] }) }] }}>{content}</Animated.View> : content;
}

function MiniRoundCard({ label, card, duel }: { label: string; card: any; duel?: any }) {
  const { colors } = useAppTheme();
  const combat = getBattleCardPreview(card);
  const isV5 = Boolean(duel?.virtualEnergy) || Number(duel?.rulesVersion ?? 0) >= 5;
  const advantage = duel?.advantage === 'weakness'
    ? `SUPER EFETIVO ×${Number(duel?.weaknessMultiplier ?? 2)}`
    : duel?.advantage === 'resisted'
      ? `RESISTIDO −${Number(duel?.resistance ?? 0)}`
      : 'NEUTRO';
  const v5State = duel?.knockedOut
    ? 'NOCAUTEADO'
    : `HP ${Number(duel?.remainingHp ?? combat.hp)}/${Number(duel?.hp ?? combat.hp)}`;
  return <View style={styles.miniCard}>{card?.image_small ? <Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.miniImage} /> : <View style={[styles.miniImage, { backgroundColor: colors.surface }]} />}<View style={{ flex: 1 }}><Text style={[styles.miniLabel, { color: colors.muted }]}>{label}</Text><Text numberOfLines={1} style={[styles.miniName, { color: colors.text }]}>{card?.pokemon_name ?? 'Carta'}</Text>{duel ? <><Text numberOfLines={1} style={[styles.miniValue, { color: colors.yellow }]}>{duel.attackName ?? 'Ataque'} • {Number(duel.effectiveDamage ?? combat.maxDamage)} dano</Text><Text numberOfLines={1} style={[styles.miniCombatMeta,{color:duel.advantage==='weakness'?'#65D894':duel.advantage==='resisted'?'#FFB16A':colors.muted}]}>{isV5 ? `${v5State} • ⚡ ${Number(duel?.energyAtEnd ?? 0)}${duel?.firstPlayer ? ' • 1º' : ''} • ${advantage}` : `KO ${Number(duel.turnsToKnockout ?? 0)}t • ${advantage}`}</Text></> : <Text style={[styles.miniValue, { color: colors.yellow }]}>HP {combat.hp} • ATQ {combat.maxDamage} • ⚡ {combat.bestEnergy}</Text>}</View></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 15, paddingBottom: 48, gap: 13 }, contentWithDock: { paddingBottom: 112 },
  notice: { flexDirection: 'row', gap: 9, alignItems: 'center', padding: 12, borderRadius: 15, borderWidth: 1 }, noticeText: { flex: 1, fontSize: 11, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 22, borderWidth: 1, padding: 15 }, playerSide: { flex: 1, justifyContent: 'center' }, playerSideInner:{padding:10,justifyContent:'center',minHeight:118}, right: { alignItems: 'flex-end' }, sideLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, playerName: { fontSize: 17, fontWeight: '900', marginTop: 3, textShadowColor:'#000000FF', textShadowOffset:{width:0,height:1}, textShadowRadius:5 }, ratingText: { fontSize: 9, marginTop: 2 }, score: { fontSize: 32, fontWeight: '900', marginTop: 5 }, vs: { width: 120, alignItems: 'center', justifyContent: 'center' }, vsText: { fontSize: 27, fontWeight: '900' }, mode: { fontSize: 9, fontWeight: '900', marginTop: 3 }, wager: { fontSize: 8, fontWeight: '900', marginTop: 4 }, casual: { fontSize: 8, fontWeight: '900', marginTop: 4 },
  panel: { alignItems: 'center', gap: 10, padding: 18, borderRadius: 22, borderWidth: 1 },
  forfeitPanel:{borderRadius:16,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  forfeitCopy:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8},
  forfeitTitle:{color:'#FFB0B8',fontSize:9,fontWeight:'900'},
  forfeitHint:{fontSize:7,lineHeight:11,marginTop:2},
  forfeitButton:{minHeight:38,borderRadius:11,borderWidth:1,borderColor:'#8B3B49',backgroundColor:'#3A1921',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},
  forfeitButtonText:{color:'#FF9FAA',fontSize:8,fontWeight:'900'},
  forfeitResult:{width:'100%',borderRadius:13,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:7},
  forfeitResultText:{flex:1,fontSize:8,lineHeight:12,fontWeight:'800'}, panelTitle: { fontSize: 22, fontWeight: '900' }, panelText: { maxWidth: 620, textAlign: 'center', fontSize: 11, lineHeight: 17 }, stakeHeadline: { fontSize: 11, fontWeight: '900' }, actions: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 5 }, decline: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, backgroundColor: '#231417' }, declineText: { color: '#FF8993', fontSize: 10, fontWeight: '900' }, accept: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, acceptText: { color: '#07111F', fontSize: 10, fontWeight: '900' }, secondary: { flex: 1, minHeight: 49, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, secondaryText: { fontSize: 10, fontWeight: '900' }, disabled: { opacity: .42 },
  cardStakePanel: { width: '100%', maxWidth: 720, gap: 10, padding: 12, borderRadius: 17 }, stakePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, borderWidth: 1 }, stakeImage: { width: 66, height: 88, borderRadius: 7 }, stakePreviewLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, stakeName: { fontSize: 14, fontWeight: '900', marginTop: 2 }, stakeMeta: { fontSize: 9, marginTop: 2 }, stakeValue: { fontSize: 11, fontWeight: '900', marginTop: 4 }, chooseStakeButton: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, borderWidth: 1 }, chooseStakeThumb: { width: 55, height: 73, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, chooseStakeKicker: { fontSize: 7, fontWeight: '900', letterSpacing: 1 }, chooseStakeName: { fontSize: 13, fontWeight: '900', marginTop: 2 }, chooseStakeValue: { fontSize: 9, fontWeight: '800', marginTop: 3 },
  draftPanel: { alignItems: 'center', gap: 10, padding: 15, borderRadius: 22, borderWidth: 1 }, draftTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' }, draftGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }, draftCard: { width: '31%', maxWidth: 180, minWidth: 104, padding: 8, borderRadius: 14, borderWidth: 1 }, draftImage: { width: '100%', aspectRatio: .72, borderRadius: 8 }, draftCardName: { fontSize: 10, fontWeight: '900', marginTop: 5 }, draftOwner: { fontSize: 7, fontWeight: '900', marginTop: 2 }, draftStats:{fontSize:7,fontWeight:'900',marginTop:4},draftViewHint:{flexDirection:'row',alignItems:'center',gap:4,marginTop:5},draftViewHintText:{fontSize:6,fontWeight:'900'},
  draftPreviewBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.88)',padding:14,alignItems:'center',justifyContent:'center'},
  draftPreviewPanel:{width:'100%',maxWidth:650,maxHeight:'94%',borderRadius:22,borderWidth:1,padding:13},
  draftPreviewHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},
  draftPreviewKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},draftPreviewTitle:{fontSize:20,fontWeight:'900',marginTop:2},draftPreviewMeta:{fontSize:9,fontWeight:'700',marginTop:3},
  draftPreviewClose:{width:42,height:42,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},
  draftPreviewScroll:{paddingBottom:10},draftPreviewImage:{width:'100%',height:430,maxHeight:430},
  draftPreviewStats:{flexDirection:'row',gap:7,marginTop:8},draftPreviewStat:{flex:1,minWidth:0,borderRadius:12,borderWidth:1,padding:9},draftPreviewStatLabel:{fontSize:7,fontWeight:'900'},draftPreviewStatValue:{fontSize:16,fontWeight:'900',marginTop:3},
  draftPreviewSection:{gap:7,marginTop:12},draftPreviewSectionTitle:{fontSize:8,fontWeight:'900',letterSpacing:1},draftPreviewMove:{borderRadius:12,borderWidth:1,padding:10},draftPreviewMoveHeader:{flexDirection:'row',justifyContent:'space-between',gap:8},draftPreviewMoveName:{fontSize:11,fontWeight:'900',flex:1},draftPreviewMoveDamage:{fontSize:9,fontWeight:'900'},draftPreviewMoveEnergy:{fontSize:8,fontWeight:'900',marginTop:3},draftPreviewMoveText:{fontSize:8,lineHeight:13,marginTop:4},
  draftPreviewDone:{minHeight:46,borderRadius:12,alignItems:'center',justifyContent:'center',marginTop:10},draftPreviewDoneText:{color:'#07111F',fontSize:9,fontWeight:'900'},
  timerPanel: { alignItems: 'center', paddingVertical: 10 }, roundLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, timer: { fontSize: 43, fontWeight: '900', marginTop: 4 }, timerHint: { fontSize: 9, textAlign: 'center', lineHeight: 14, marginTop: 5 }, rulesText: { maxWidth: 620, fontSize: 9, lineHeight: 14, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  arena: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }, slot: { width: 245, alignItems: 'center', gap: 7 }, slotLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, slotCardWrap: { width: 218, aspectRatio: .72, borderRadius: 17, borderWidth: 2, padding: 5, position: 'relative' }, slotCard: { width: '100%', height: '100%' }, slotValue: { position: 'absolute', left: 10, bottom: 10, backgroundColor: '#050505E8', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 }, slotValueText: { fontSize: 10, fontWeight: '900' }, hiddenCard: { width: 218, aspectRatio: .72, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 15 }, questionCircle: { width: 105, height: 105, borderRadius: 53, borderWidth: 3, alignItems: 'center', justifyContent: 'center' }, question: { fontSize: 48, fontWeight: '900' }, hiddenState: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, arenaVs: { alignItems: 'center', gap: 2 }, arenaVsText: { fontSize: 8, fontWeight: '900' },
  sourcePanel: { borderRadius: 19, borderWidth: 1, padding: 12, gap: 10 }, sourceLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sourceLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, editDecks: { fontSize: 8, fontWeight: '900' }, deckChips: { gap: 6 }, deckChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 }, deckChipText: { fontSize: 9, fontWeight: '800' }, openPicker: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, padding: 12 }, openPickerTitle: { fontSize: 13, fontWeight: '900' }, openPickerMeta: { fontSize: 9, marginTop: 3 }, lockedNotice: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, borderWidth: 1, padding: 12 }, lockedText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  historyPanel: { gap: 9, borderRadius: 20, borderWidth: 1, padding: 12 }, historyTitle: { fontSize: 15, fontWeight: '900' }, roundRow: { borderRadius: 14, borderWidth: 1, padding: 9, gap: 7 }, roundHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, roundNumber: { fontSize: 8, fontWeight: '900' }, roundWinner: { fontSize: 8, fontWeight: '900' }, roundCards: { flexDirection: 'row', alignItems: 'center', gap: 7 }, roundVs: { fontSize: 9, fontWeight: '900' }, miniCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 }, miniImage: { width: 45, height: 60, borderRadius: 5 }, miniLabel: { fontSize: 7, fontWeight: '900' }, miniName: { fontSize: 10, fontWeight: '900' }, miniValue: { fontSize: 8, fontWeight: '900', marginTop: 2 }, miniCombatMeta: { fontSize: 7, fontWeight: '900', marginTop: 2 },
  resultPanel: { alignItems: 'center', borderRadius: 22, borderWidth: 1, padding: 19, gap: 7 }, resultKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, resultTitle: { fontSize: 24, fontWeight: '900' }, resultMeta: { fontSize: 10, textAlign: 'center' }, stakeResult: { width: '100%', maxWidth: 600, padding: 11, borderRadius: 14, marginTop: 5 }, stakeResultText: { fontSize: 10, fontWeight: '800', textAlign: 'center' }, stakeResultValue: { fontSize: 9, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  actionDock: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', gap: 8 }, chooseDock: { flex: 1, minWidth: 0, minHeight: 55, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 }, dockSmall: { fontSize: 7, fontWeight: '900', letterSpacing: .7 }, chooseDockName: { fontSize: 10, fontWeight: '900', marginTop: 1 }, lockDock: { flex: 1.15, minHeight: 55, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 }, lockDockText: { fontSize: 10, fontWeight: '900', marginTop: 1 },
});
