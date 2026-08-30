import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import {
  attackGuildWarGym,
  getGuildHub,
  getGuildWarGyms,
  healGuildWarGymDefender,
  setGuildWarGymDefender,
  subscribeToGuilds,
  subscribeToGuildWarGyms,
  type GuildHub,
  type GuildWar,
  type GuildWarGym,
  type GuildWarGymBoard,
  type GuildWarGymDefender,
} from '@/services/guilds';
import { getMyBagPage } from '@/services/bag';
import type { OwnedCardEntry } from '@/services/player';
import { getBattleCardPreview } from '@/services/battleStats';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';
import { useWallet } from '@/wallet/WalletProvider';

function formatGuildDominanceName(name:string){
  const trimmed=name.trim();
  return /^guilda\s/i.test(trimmed)?trimmed:`Guilda ${trimmed}`;
}

type PickerState = {
  mode: 'defense' | 'attack';
  warId: string;
  gymId: string;
  gymName: string;
};

export default function GuildWarsScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const { userId, coins } = useWallet();
  const themeVisual = getThemeVisual(themeName);
  const [hub, setHub] = useState<GuildHub | null>(null);
  const [boards, setBoards] = useState<Record<string, GuildWarGymBoard>>({});
  const [loading, setLoading] = useState(true);
  const [gymLoading, setGymLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [bagCards, setBagCards] = useState<OwnedCardEntry[]>([]);
  const [bagLoading, setBagLoading] = useState(false);
  const [bagLoaded, setBagLoaded] = useState(false);
  const [bagLoadError, setBagLoadError] = useState<string | null>(null);
  const [attackTeam, setAttackTeam] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      setHub(await getGuildHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar Guild Wars.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToGuilds(() => { void load(true); }), [load]);

  const active = useMemo(() => hub?.wars.filter((war) => war.status === 'active') ?? [], [hub?.wars]);
  const recent = useMemo(() => hub?.wars.filter((war) => war.status === 'completed') ?? [], [hub?.wars]);
  const myGuildId = hub?.myMembership?.guildId ?? null;
  const myActiveWars = useMemo(
    () => active.filter((war) => myGuildId === war.guildA.id || myGuildId === war.guildB.id),
    [active, myGuildId],
  );
  const myActiveKey = useMemo(() => myActiveWars.map((war) => war.id).sort().join('|'), [myActiveWars]);

  const refreshBoard = useCallback(async (warId: string, silent = true) => {
    try {
      if (!silent) setGymLoading(true);
      const board = await getGuildWarGyms(warId);
      setBoards((current) => ({ ...current, [warId]: board }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar os ginásios.');
    } finally {
      if (!silent) setGymLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!myActiveWars.length) {
      setBoards({});
      return;
    }

    let disposed = false;
    setGymLoading(true);
    Promise.all(myActiveWars.map((war) => getGuildWarGyms(war.id)))
      .then((result) => {
        if (disposed) return;
        setBoards(Object.fromEntries(result.map((board) => [board.warId, board])));
      })
      .catch((e) => {
        if (!disposed) setError(e instanceof Error ? e.message : 'Não foi possível carregar os ginásios.');
      })
      .finally(() => {
        if (!disposed) setGymLoading(false);
      });

    const unsubscribers = myActiveWars.map((war) => subscribeToGuildWarGyms(
      war.id,
      () => { void refreshBoard(war.id, true); },
    ));

    return () => {
      disposed = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [myActiveKey, refreshBoard]);

  useEffect(() => {
    if (!picker || bagLoaded) return;
    let disposed = false;

    setBagLoading(true);
    setBagLoadError(null);

    getMyBagPage(0, 100, {
      search: '',
      setQuery: '',
      quickFilter: 'all',
      typeFilter: null,
      rarityFilter: null,
      generation: null,
      sortMode: 'damage',
    })
      .then((page) => {
        if (disposed) return;
        setBagCards(page.items.filter((item) => Boolean(item.cards)));
        setBagLoaded(true);
      })
      .catch((e) => {
        if (disposed) return;
        const message = e instanceof Error ? e.message : 'Não foi possível carregar sua Bag.';
        setBagLoadError(message);
        setError(message);
      })
      .finally(() => {
        if (!disposed) setBagLoading(false);
      });

    return () => { disposed = true; };
  }, [picker, bagLoaded]);

  function retryBagLoad() {
    setBagLoadError(null);
    setBagLoaded(false);
  }

  function openDefensePicker(warId: string, gym: GuildWarGym) {
    setAttackTeam([]);
    setPicker({ mode: 'defense', warId, gymId: gym.id, gymName: gym.name });
  }

  function openAttackPicker(warId: string, gym: GuildWarGym) {
    setAttackTeam([]);
    setPicker({ mode: 'attack', warId, gymId: gym.id, gymName: gym.name });
  }

  async function chooseDefender(cardId: string) {
    if (!picker || picker.mode !== 'defense' || actionBusy) return;
    try {
      setActionBusy('defense');
      setError(null);
      await setGuildWarGymDefender(picker.warId, picker.gymId, cardId);
      const warId = picker.warId;
      setPicker(null);
      await refreshBoard(warId, true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível colocar o defensor.';
      setError(message);
      Alert.alert('Defesa do Ginásio', message);
    } finally {
      setActionBusy(null);
    }
  }

  function toggleAttackCard(cardId: string) {
    setAttackTeam((current) => {
      if (current.includes(cardId)) return current.filter((id) => id !== cardId);
      if (current.length >= 6) return current;
      return [...current, cardId];
    });
  }

  async function confirmAttack() {
    if (!picker || picker.mode !== 'attack' || !attackTeam.length || actionBusy) return;
    try {
      setActionBusy('attack');
      setError(null);
      const result = await attackGuildWarGym(picker.warId, picker.gymId, attackTeam);
      const warId = picker.warId;
      const gymName = picker.gymName;
      setPicker(null);
      setAttackTeam([]);
      await refreshBoard(warId, true);
      Alert.alert(
        result.conquered ? 'Ginásio conquistado!' : 'Ataque concluído',
        result.conquered
          ? `Sua guilda agora domina ${gymName}. ${result.defendersDefeated} defensor(es) foram derrotados.`
          : `Você derrubou ${result.defendersDefeated} defensor(es). Restam ${result.defendersRemaining} na defesa.`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível atacar o ginásio.';
      setError(message);
      Alert.alert('Ataque ao Ginásio', message);
    } finally {
      setActionBusy(null);
    }
  }

  function requestHeal(defender: GuildWarGymDefender, warId: string) {
    if (actionBusy) return;
    Alert.alert(
      'Restaurar HP',
      `Gastar 🪙 25.000 para restaurar até 50 HP de ${defender.pokemonName}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restaurar',
          onPress: () => {
            void (async () => {
              try {
                setActionBusy(`heal:${defender.id}`);
                setError(null);
                const result = await healGuildWarGymDefender(defender.id);
                await refreshBoard(warId, true);
                Alert.alert('HP restaurado', `+${result.healedHp} HP por 🪙 25.000.`);
              } catch (e) {
                const message = e instanceof Error ? e.message : 'Não foi possível restaurar o HP.';
                setError(message);
                Alert.alert('Restaurar HP', message);
              } finally {
                setActionBusy(null);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Screen title="Guild Wars Arena" subtitle="Conquiste ginásios, monte defesas coletivas e domine territórios em tempo real.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar às Guildas</Text>
      </Pressable>

      <View style={[styles.warHero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={[styles.warHeroGlow,{backgroundColor:colors.accent}]} />
        <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.warHeroPokemon}/>
        <View style={styles.warHeroCopy}>
          <View style={styles.liveRow}>
            <Text style={[styles.warHeroKicker,{color:colors.yellow}]}>GUILD TERRITORY WAR</Text>
            <View style={[styles.liveBadge,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <View style={styles.liveDot}/>
              <Text style={[styles.liveText,{color:colors.text}]}>TEMPO REAL</Text>
            </View>
          </View>
          <Text style={[styles.warHeroTitle,{color:colors.text}]}>Defenda. Ataque. Domine.</Text>
          <Text style={[styles.warHeroText,{color:colors.muted}]}>
            Cada membro pode manter 1 Pokémon de defesa na guerra. Ataques usam um time de até 6 Pokémon e o HP dos defensores persiste entre invasões.
          </Text>
          <View style={styles.warHeroStats}>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.text}]}>{myActiveWars.length}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>GUERRAS</Text></View>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.yellow}]}>{myGuildId ? 'ATIVA' : '—'}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>SUA GUILDA</Text></View>
            <View style={[styles.warHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.warHeroValue,{color:colors.yellow}]}>🪙 {coins.toLocaleString('pt-BR')}</Text><Text style={[styles.warHeroLabel,{color:colors.muted}]}>SALDO</Text></View>
          </View>
        </View>
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      <View style={[styles.rule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="shield-half" size={23} color={colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.ruleTitle, { color: colors.text }]}>Regras dos Ginásios</Text>
          <Text style={[styles.ruleText, { color: colors.muted }]}>
            1 defensor ativo por membro em cada guerra. Pokémon feridos não podem ser trocados. Qualquer membro da guilda dominante pode gastar 🪙 25.000 para restaurar até 50 HP de um defensor ainda vivo.
          </Text>
        </View>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Mapa de Ginásios</Text>
      {!myGuildId && !loading ? (
        <View style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="people" size={20} color={colors.accent}/>
          <Text style={[styles.noticeText,{color:colors.muted}]}>Entre em uma guilda para defender e atacar ginásios.</Text>
        </View>
      ) : null}

      {gymLoading ? <ActivityIndicator size="small" color={colors.yellow}/> : null}
      {myActiveWars.length ? myActiveWars.map((war) => {
        const board = boards[war.id];
        return board ? (
          <GymBoard
            key={war.id}
            board={board}
            myGuildId={myGuildId}
            userId={userId}
            busy={actionBusy}
            onDefend={(gym) => openDefensePicker(war.id, gym)}
            onAttack={(gym) => openAttackPicker(war.id, gym)}
            onHeal={(defender) => requestHeal(defender, war.id)}
          />
        ) : (
          <View key={war.id} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]}>
            <ActivityIndicator size="small" color={colors.yellow}/>
            <Text style={[styles.noticeText,{color:colors.muted}]}>Sincronizando ginásios...</Text>
          </View>
        );
      }) : !loading && myGuildId ? (
        <Text style={[styles.empty, { color: colors.muted }]}>Sua guilda não possui uma guerra ativa neste momento.</Text>
      ) : null}

      <View style={[styles.rule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="flash" size={23} color={colors.yellow} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.ruleTitle, { color: colors.text }]}>Placar tradicional da guerra</Text>
          <Text style={[styles.ruleText, { color: colors.muted }]}>Vitória ranqueada contra a guilda rival: +3. Participação do derrotado: +1. O sistema de ginásios funciona em paralelo ao placar semanal.</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/battles')} style={[styles.play, { backgroundColor: colors.yellow }]}><Text style={styles.playText}>BATALHAR</Text></Pressable>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Confrontos ativos</Text>
      {active.length ? active.map((war) => <War key={war.id} war={war} myGuildId={myGuildId} />) : <Text style={[styles.empty, { color: colors.muted }]}>Nenhum confronto ativo.</Text>}

      {recent.length ? <>
        <Text style={[styles.section, { color: colors.text }]}>Últimos resultados</Text>
        {recent.slice(0, 4).map((war) => <War key={war.id} war={war} myGuildId={myGuildId} />)}
      </> : null}

      <CardPickerModal
        state={picker}
        cards={bagCards}
        loading={bagLoading}
        loadError={bagLoadError}
        busy={Boolean(actionBusy)}
        attackTeam={attackTeam}
        onClose={() => {
          if (actionBusy) return;
          setPicker(null);
          setAttackTeam([]);
        }}
        onChooseDefender={(cardId) => { void chooseDefender(cardId); }}
        onToggleAttack={toggleAttackCard}
        onAttack={() => { void confirmAttack(); }}
        onRetry={retryBagLoad}
      />
    </Screen>
  );
}

function GymBoard({
  board,
  myGuildId,
  userId,
  busy,
  onDefend,
  onAttack,
  onHeal,
}: {
  board: GuildWarGymBoard;
  myGuildId: string | null;
  userId: string | null;
  busy: string | null;
  onDefend: (gym: GuildWarGym) => void;
  onAttack: (gym: GuildWarGym) => void;
  onHeal: (defender: GuildWarGymDefender) => void;
}) {
  const { colors } = useAppTheme();
  const myDefense = board.gyms.flatMap((gym) => gym.defenders.map((defender) => ({ gym, defender }))).find((entry) => entry.defender.playerId === userId);

  return (
    <View style={[styles.board,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.boardHeader}>
        <View style={{flex:1}}>
          <Text style={[styles.boardKicker,{color:colors.yellow}]}>MAPA DE KANTO • GUERRA ATIVA</Text>
          <Text style={[styles.boardTitle,{color:colors.text}]}>{board.guildA.name} × {board.guildB.name}</Text>
          <Text style={[styles.boardHint,{color:colors.muted}]}>
            {myDefense
              ? `Sua defesa: ${myDefense.defender.pokemonName} em ${myDefense.gym.name} • ${myDefense.defender.currentHp}/${myDefense.defender.maxHp} HP`
              : 'Você ainda não colocou seu Pokémon de defesa nesta guerra.'}
          </Text>
        </View>
        <View style={[styles.realtimePill,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
          <Ionicons name="radio" size={14} color={colors.accent}/>
          <Text style={[styles.realtimeText,{color:colors.accent}]}>LIVE</Text>
        </View>
      </View>

      <View style={styles.gymGrid}>
        {board.gyms.map((gym) => {
          const mine = Boolean(myGuildId && gym.ownerGuild?.id === myGuildId);
          return (
            <GymTerritoryCard
              key={gym.id}
              gym={gym}
              mine={mine}
              busy={busy}
              onDefend={() => onDefend(gym)}
              onAttack={() => onAttack(gym)}
              onHeal={onHeal}
            />
          );
        })}
      </View>

      {board.events.length ? (
        <View style={[styles.eventPanel,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
          <Text style={[styles.eventTitle,{color:colors.text}]}>Atividade ao vivo</Text>
          {board.events.slice(0, 6).map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={[styles.eventDot,{backgroundColor:event.eventType==='capture'?colors.yellow:colors.accent}]}/>
              <Text style={[styles.eventMessage,{color:colors.muted}]}>{event.message}</Text>
              <Text style={[styles.eventTime,{color:colors.muted}]}>
                {event.createdAt ? new Date(event.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GymTerritoryCard({
  gym,
  mine,
  busy,
  onDefend,
  onAttack,
  onHeal,
}: {
  gym: GuildWarGym;
  mine: boolean;
  busy: string | null;
  onDefend: () => void;
  onAttack: () => void;
  onHeal: (defender: GuildWarGymDefender) => void;
}) {
  const { colors } = useAppTheme();
  const ownerColor = gym.ownerGuild?.color ?? colors.border;
  const alive = gym.defenders.filter((defender) => defender.currentHp > 0).length;

  return (
    <View style={[styles.gymCard,{backgroundColor:colors.surfaceAlt,borderColor:ownerColor}]}>
      <View style={styles.gymTop}>
        <View style={[styles.gymIcon,{backgroundColor:ownerColor+'22',borderColor:ownerColor}]}>
          <Ionicons name="business" size={21} color={ownerColor}/>
        </View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={[styles.gymName,{color:colors.text}]}>{gym.name}</Text>
          <Text style={[styles.gymMeta,{color:colors.muted}]}>{alive} defensor(es) ativos • {gym.captureCount} conquista(s)</Text>
        </View>
      </View>

      <View style={[styles.dominance,{backgroundColor:ownerColor+'18',borderColor:ownerColor}]}>
        <Ionicons name="flag" size={14} color={ownerColor}/>
        <Text style={[styles.dominanceText,{color:colors.text}]}>
          {gym.ownerGuild ? `${formatGuildDominanceName(gym.ownerGuild.name)} domina ${gym.name}` : `${gym.name} está sem domínio`}
        </Text>
      </View>

      {gym.defenders.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.defenderList}>
          {gym.defenders.map((defender) => (
            <DefenderCard
              key={defender.id}
              defender={defender}
              mine={mine}
              busy={busy === `heal:${defender.id}`}
              onHeal={() => onHeal(defender)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.noDefense,{borderColor:colors.border}]}>
          <Ionicons name="shield-outline" size={18} color={colors.muted}/>
          <Text style={[styles.noDefenseText,{color:colors.muted}]}>
            Sem defensores. Uma invasão inimiga pode conquistar este ginásio imediatamente.
          </Text>
        </View>
      )}

      <Pressable
        disabled={Boolean(busy)}
        onPress={mine ? onDefend : onAttack}
        style={[
          styles.gymAction,
          {backgroundColor:mine?colors.accentSoft:colors.yellow,borderColor:mine?colors.accent:colors.yellow},
          busy && styles.disabled,
        ]}
      >
        <Ionicons name={mine?'shield-checkmark':'flash'} size={17} color={mine?colors.accent:'#07111F'}/>
        <Text style={[styles.gymActionText,{color:mine?colors.accent:'#07111F'}]}>
          {mine ? 'COLOCAR / TROCAR DEFENSOR' : 'MONTAR TIME E ATACAR'}
        </Text>
      </Pressable>
    </View>
  );
}

function DefenderCard({
  defender,
  mine,
  busy,
  onHeal,
}: {
  defender: GuildWarGymDefender;
  mine: boolean;
  busy: boolean;
  onHeal: () => void;
}) {
  const { colors } = useAppTheme();
  const hpPct = Math.max(0, Math.min(100, defender.maxHp > 0 ? defender.currentHp / defender.maxHp * 100 : 0));
  const canHeal = mine && defender.currentHp > 0 && defender.currentHp < defender.maxHp;

  return (
    <View style={[styles.defender,{backgroundColor:colors.surface,borderColor:defender.currentHp>0?colors.border:'#63303B'}]}>
      {defender.imageSmall ? <Image source={{uri:defender.imageSmall}} resizeMode="contain" style={styles.defenderImage}/> : <View style={[styles.defenderImage,{backgroundColor:colors.surfaceAlt}]}/>}
      <Text numberOfLines={1} style={[styles.defenderName,{color:colors.text}]}>{defender.pokemonName}</Text>
      <Text numberOfLines={1} style={[styles.defenderOwner,{color:colors.muted}]}>@{defender.username}</Text>
      <View style={styles.hpLine}>
        <Text style={[styles.hpText,{color:defender.currentHp>0?colors.text:'#FF8A9B'}]}>{defender.currentHp}/{defender.maxHp} HP</Text>
        <Text style={[styles.atkText,{color:colors.muted}]}>ATK {defender.maxDamage}</Text>
      </View>
      <View style={[styles.hpTrack,{backgroundColor:colors.surfaceAlt}]}>
        <View style={[styles.hpFill,{width:`${hpPct}%`,backgroundColor:hpPct>50?'#65D894':hpPct>20?'#FFD447':'#FF6475'}]}/>
      </View>
      {defender.currentHp <= 0 ? <Text style={styles.ko}>DERROTADO</Text> : null}
      {canHeal ? (
        <Pressable disabled={busy} onPress={onHeal} style={[styles.heal,{borderColor:colors.yellow},busy&&styles.disabled]}>
          {busy ? <ActivityIndicator size="small" color={colors.yellow}/> : <Ionicons name="medkit" size={13} color={colors.yellow}/>}
          <Text style={[styles.healText,{color:colors.yellow}]}>+50 HP • 25K</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CardPickerModal({
  state,
  cards,
  loading,
  loadError,
  busy,
  attackTeam,
  onClose,
  onChooseDefender,
  onToggleAttack,
  onAttack,
  onRetry,
}: {
  state: PickerState | null;
  cards: OwnedCardEntry[];
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  attackTeam: string[];
  onClose: () => void;
  onChooseDefender: (cardId: string) => void;
  onToggleAttack: (cardId: string) => void;
  onAttack: () => void;
  onRetry: () => void;
}) {
  const { colors } = useAppTheme();
  if (!state) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.pickerModal,{backgroundColor:colors.bg,borderColor:colors.border}]}>
          <View style={styles.pickerHeader}>
            <View style={[styles.pickerIcon,{backgroundColor:colors.accentSoft}]}>
              <Ionicons name={state.mode==='defense'?'shield':'flash'} size={21} color={state.mode==='defense'?colors.accent:colors.yellow}/>
            </View>
            <View style={{flex:1,minWidth:0}}>
              <Text style={[styles.pickerKicker,{color:colors.yellow}]}>{state.mode==='defense'?'DEFESA DO GINÁSIO':'TIME DE ATAQUE'}</Text>
              <Text numberOfLines={1} style={[styles.pickerTitle,{color:colors.text}]}>{state.gymName}</Text>
              <Text style={[styles.pickerHint,{color:colors.muted}]}>
                {state.mode==='defense'
                  ? 'Escolha 1 Pokémon da sua Bag. Um membro só pode manter 1 defensor ativo nesta guerra.'
                  : `Selecione de 1 a 6 Pokémon. A ordem de seleção define a ordem do ataque. ${attackTeam.length}/6 escolhidos.`}
              </Text>
            </View>
            <Pressable disabled={busy} accessibilityLabel="Fechar" onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={colors.muted}/>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.pickerState}>
              <ActivityIndicator size="large" color={colors.yellow}/>
              <Text style={[styles.pickerStateText,{color:colors.muted}]}>Carregando seus Pokémon...</Text>
            </View>
          ) : loadError ? (
            <View style={[styles.pickerError,{borderColor:'#C96B7A'}]}>
              <Ionicons name="alert-circle" size={22} color="#FF8290"/>
              <Text style={[styles.pickerStateText,{color:colors.muted}]}>{loadError}</Text>
              <Pressable onPress={onRetry} style={[styles.retryButton,{borderColor:colors.border,backgroundColor:colors.surfaceAlt}]}>
                <Text style={[styles.retryText,{color:colors.text}]}>TENTAR NOVAMENTE</Text>
              </Pressable>
            </View>
          ) : cards.length === 0 ? (
            <View style={styles.pickerState}>
              <Ionicons name="albums-outline" size={28} color={colors.muted}/>
              <Text style={[styles.pickerStateText,{color:colors.muted}]}>Sua Bag não possui Pokémon disponíveis.</Text>
            </View>
          ) : (
            <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardGrid} showsVerticalScrollIndicator={false}>
              {cards.map((entry) => {
                const card = entry.cards;
                if (!card) return null;
                const profile = getBattleCardPreview(card);
                const selectedIndex = attackTeam.indexOf(card.id);
                const selected = selectedIndex >= 0;
                return (
                  <Pressable
                    key={card.id}
                    disabled={busy}
                    onPress={() => state.mode==='defense' ? onChooseDefender(card.id) : onToggleAttack(card.id)}
                    style={[
                      styles.choiceCard,
                      {backgroundColor:colors.surface,borderColor:selected?colors.yellow:colors.border},
                      busy&&styles.disabled,
                    ]}
                  >
                    {selected ? <View style={[styles.orderBadge,{backgroundColor:colors.yellow}]}><Text style={styles.orderText}>{selectedIndex+1}</Text></View> : null}
                    {card.image_small ? <Image source={{uri:card.image_small}} resizeMode="contain" style={styles.choiceImage}/> : <View style={[styles.choiceImage,{backgroundColor:colors.surfaceAlt}]}/>}
                    <Text numberOfLines={1} style={[styles.choiceName,{color:colors.text}]}>{card.pokemon_name}</Text>
                    <Text numberOfLines={1} style={[styles.choiceMeta,{color:colors.muted}]}>{card.rarity ?? 'Sem raridade'}</Text>
                    <View style={styles.choiceStats}>
                      <Text style={[styles.choiceStat,{color:'#65D894'}]}>HP {profile.hp}</Text>
                      <Text style={[styles.choiceStat,{color:colors.yellow}]}>ATK {profile.maxDamage}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {state.mode==='attack' ? (
            <Pressable
              disabled={busy||!attackTeam.length}
              onPress={onAttack}
              style={[styles.attackConfirm,{backgroundColor:colors.yellow},(busy||!attackTeam.length)&&styles.disabled]}
            >
              {busy ? <ActivityIndicator size="small" color="#07111F"/> : <Ionicons name="flash" size={18} color="#07111F"/>}
              <Text style={styles.attackConfirmText}>ATACAR COM {attackTeam.length} POKÉMON</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function War({ war, myGuildId }: { war: GuildWar; myGuildId: string | null }) {
  const { colors } = useAppTheme();
  const aWin = war.guildA.score > war.guildB.score;
  const bWin = war.guildB.score > war.guildA.score;
  return (
    <View style={[styles.war, { backgroundColor: colors.surface, borderColor: myGuildId === war.guildA.id ? war.guildA.color : myGuildId === war.guildB.id ? war.guildB.color : colors.border }]}>
      <Text style={[styles.week, { color: colors.muted }]}>SEMANA {new Date(war.weekStart).toLocaleDateString('pt-BR')}</Text>
      <View style={styles.scoreRow}>
        <View style={styles.team}>
          <View style={[styles.dot, { backgroundColor: war.guildA.color }]} />
          <Text style={[styles.teamName, { color: aWin ? war.guildA.color : colors.text }]}>{war.guildA.name}</Text>
          <Text style={[styles.score, { color: war.guildA.color }]}>{war.guildA.score}</Text>
        </View>
        <Text style={[styles.vs, { color: colors.muted }]}>×</Text>
        <View style={[styles.team, { alignItems: 'flex-end' }]}>
          <View style={[styles.dot, { backgroundColor: war.guildB.color }]} />
          <Text style={[styles.teamName, { color: bWin ? war.guildB.color : colors.text }]}>{war.guildB.name}</Text>
          <Text style={[styles.score, { color: war.guildB.color }]}>{war.guildB.score}</Text>
        </View>
      </View>
      {war.contributors.length ? (
        <View style={styles.contributors}>
          <Text style={[styles.conTitle, { color: colors.muted }]}>TOP CONTRIBUIDORES</Text>
          {war.contributors.slice(0, 5).map((contributor, index) => (
            <View key={contributor.playerId} style={styles.conRow}>
              <Text style={[styles.rank, { color: colors.yellow }]}>#{index + 1}</Text>
              <Text style={[styles.conName, { color: colors.text }]}>@{contributor.username}</Text>
              <Text style={[styles.conPts, { color: colors.yellow }]}>{contributor.points} pts</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, alignItems: 'center' },
  backText: { fontSize: 11, fontWeight: '800' },
  warHero:{minHeight:190,borderRadius:28,borderWidth:1,padding:16,overflow:'hidden',position:'relative'},
  warHeroGlow:{position:'absolute',right:-70,top:-90,width:270,height:270,borderRadius:999,opacity:.14},
  warHeroPokemon:{position:'absolute',right:-20,bottom:-42,width:195,height:210,opacity:.21,transform:[{rotate:'7deg'}]},
  warHeroCopy:{maxWidth:700,zIndex:2},
  liveRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  warHeroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  liveBadge:{minHeight:24,borderRadius:999,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},
  liveDot:{width:7,height:7,borderRadius:99,backgroundColor:'#65D894'},
  liveText:{fontSize:7,fontWeight:'900',letterSpacing:.6},
  warHeroTitle:{fontSize:24,fontWeight:'900',marginTop:4},
  warHeroText:{fontSize:10,lineHeight:15,marginTop:5,maxWidth:520},
  warHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:13,paddingRight:70},
  warHeroStat:{minWidth:82,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  warHeroValue:{fontSize:14,fontWeight:'900'},
  warHeroLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6,marginTop:1},
  error:{borderRadius:14,padding:11,backgroundColor:'#351A24',borderWidth:1,borderColor:'#683243'},
  errorText:{color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  rule:{borderRadius:20,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:10},
  ruleTitle:{fontSize:12,fontWeight:'900'},
  ruleText:{fontSize:8,lineHeight:12,marginTop:2},
  play:{minHeight:38,borderRadius:11,paddingHorizontal:10,alignItems:'center',justifyContent:'center'},
  playText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  section:{fontSize:19,fontWeight:'900'},
  empty:{fontSize:10},
  notice:{borderRadius:16,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:9},
  noticeText:{fontSize:10,lineHeight:15,flex:1},
  board:{borderRadius:25,borderWidth:1,padding:13,gap:12},
  boardHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  boardKicker:{fontSize:8,fontWeight:'900',letterSpacing:1},
  boardTitle:{fontSize:18,fontWeight:'900',marginTop:2},
  boardHint:{fontSize:9,lineHeight:13,marginTop:3},
  realtimePill:{minHeight:30,borderRadius:11,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},
  realtimeText:{fontSize:8,fontWeight:'900'},
  gymGrid:{gap:10},
  gymCard:{borderRadius:20,borderWidth:1.5,padding:11,gap:9},
  gymTop:{flexDirection:'row',alignItems:'center',gap:9},
  gymIcon:{width:42,height:42,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},
  gymName:{fontSize:14,fontWeight:'900'},
  gymMeta:{fontSize:8,marginTop:2},
  dominance:{borderRadius:12,borderWidth:1,paddingHorizontal:9,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:6},
  dominanceText:{fontSize:9,fontWeight:'900',flex:1},
  defenderList:{gap:8,paddingVertical:1},
  defender:{width:138,borderRadius:15,borderWidth:1,padding:8,gap:4},
  defenderImage:{width:'100%',height:105,borderRadius:9},
  defenderName:{fontSize:10,fontWeight:'900'},
  defenderOwner:{fontSize:7},
  hpLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:4},
  hpText:{fontSize:7,fontWeight:'900'},
  atkText:{fontSize:7,fontWeight:'800'},
  hpTrack:{height:5,borderRadius:99,overflow:'hidden'},
  hpFill:{height:'100%',borderRadius:99},
  ko:{color:'#FF8A9B',fontSize:7,fontWeight:'900',letterSpacing:.6},
  heal:{minHeight:29,borderRadius:9,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginTop:2},
  healText:{fontSize:7,fontWeight:'900'},
  noDefense:{minHeight:56,borderRadius:13,borderWidth:1,borderStyle:'dashed',padding:10,flexDirection:'row',alignItems:'center',gap:8},
  noDefenseText:{fontSize:8,lineHeight:12,flex:1},
  gymAction:{minHeight:42,borderRadius:12,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  gymActionText:{fontSize:8,fontWeight:'900',letterSpacing:.35},
  eventPanel:{borderRadius:16,borderWidth:1,padding:10,gap:7},
  eventTitle:{fontSize:11,fontWeight:'900'},
  eventRow:{flexDirection:'row',alignItems:'center',gap:7},
  eventDot:{width:7,height:7,borderRadius:99},
  eventMessage:{fontSize:8,lineHeight:12,flex:1},
  eventTime:{fontSize:7,fontWeight:'800'},
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',alignItems:'center',justifyContent:'center',padding:14},
  pickerModal:{width:'100%',maxWidth:720,maxHeight:'91%',borderRadius:25,borderWidth:1,padding:13,gap:11},
  pickerHeader:{flexDirection:'row',alignItems:'flex-start',gap:9},
  pickerIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},
  pickerKicker:{fontSize:8,fontWeight:'900',letterSpacing:.8},
  pickerTitle:{fontSize:17,fontWeight:'900',marginTop:1},
  pickerHint:{fontSize:8,lineHeight:12,marginTop:2},
  modalClose:{width:38,height:38,alignItems:'center',justifyContent:'center'},
  pickerState:{minHeight:180,alignItems:'center',justifyContent:'center',gap:10,padding:16},
  pickerStateText:{fontSize:9,lineHeight:14,fontWeight:'800',textAlign:'center'},
  pickerError:{minHeight:180,borderWidth:1,borderRadius:16,alignItems:'center',justifyContent:'center',gap:10,padding:16},
  retryButton:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:13,alignItems:'center',justifyContent:'center'},
  retryText:{fontSize:8,fontWeight:'900',letterSpacing:.4},
  cardScroll:{flexGrow:0},
  cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,paddingBottom:4},
  choiceCard:{width:'31.5%',minWidth:130,borderRadius:15,borderWidth:1,padding:7,gap:3,position:'relative'},
  choiceImage:{width:'100%',height:138,borderRadius:9},
  choiceName:{fontSize:9,fontWeight:'900'},
  choiceMeta:{fontSize:7},
  choiceStats:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:5,marginTop:2},
  choiceStat:{fontSize:7,fontWeight:'900'},
  orderBadge:{position:'absolute',zIndex:3,right:6,top:6,width:25,height:25,borderRadius:13,alignItems:'center',justifyContent:'center'},
  orderText:{color:'#07111F',fontSize:10,fontWeight:'900'},
  attackConfirm:{minHeight:48,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  attackConfirmText:{color:'#07111F',fontSize:9,fontWeight:'900',letterSpacing:.4},
  disabled:{opacity:.45},
  war:{borderRadius:22,borderWidth:1,padding:14,gap:10},
  week:{fontSize:8,fontWeight:'900'},
  scoreRow:{flexDirection:'row',alignItems:'center',gap:9},
  team:{flex:1,gap:3},
  dot:{width:12,height:12,borderRadius:6},
  teamName:{fontSize:11,fontWeight:'900'},
  score:{fontSize:27,fontWeight:'900'},
  vs:{fontSize:13,fontWeight:'900'},
  contributors:{borderTopWidth:1,borderTopColor:'#2B2B2B',paddingTop:8,gap:5},
  conTitle:{fontSize:7,fontWeight:'900'},
  conRow:{flexDirection:'row',alignItems:'center',gap:7},
  rank:{width:25,fontSize:8,fontWeight:'900'},
  conName:{flex:1,fontSize:9,fontWeight:'800'},
  conPts:{fontSize:9,fontWeight:'900'},
});
