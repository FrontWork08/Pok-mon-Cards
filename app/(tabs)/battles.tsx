import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { CardPickerModal } from '@/components/CardPickerModal';
import { Screen } from '@/components/Screen';
import { createBattle, getBattleLeaderboard, getMyActiveBattle, getMyBattleHistory, rematchBattle, respondToBattle, type BattleMode, type BattleStakeType } from '@/services/battles';
import { getMyBag, getMyProfile, getProfileAvatarUrl, type OwnedCardEntry } from '@/services/player';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { CompactTrainerBanner } from '@/components/CompactTrainerBanner';
import { getTrainerRank } from '@/services/ranks';
import { getMySocial, type SocialPlayer } from '@/services/social';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';
import { cancelMatchmaking, getMyMatchmakingState, joinMatchmaking, subscribeMyMatchmaking, type MatchmakingState } from '@/services/matchmaking';
import { isFunctionErrorCode } from '@/services/functionErrors';
import { StatusPill } from '@/components/StatusPill';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';
import { getBattleFormats, setBattleFormat, type BattleFormat } from '@/services/trainerInsights';

const MODES: Array<{ id: BattleMode; label: string; detail: string }> = [
  { id: 'quick', label: 'Quick', detail: '1 carta' },
  { id: 'mystery', label: 'Mystery BO3', detail: 'Melhor de 3' },
  { id: 'draft3', label: 'Draft 3', detail: 'Escolha alternada' },
];
const RANKED_MODES: Array<{ id: BattleMode; label: string; detail: string }> = [
  ...MODES,
  { id: 'team3', label: 'Equipe 3×3', detail: 'Game Boy • troca no turno' },
];
const battleRoute = (id: string, mode?: BattleMode | string | null) => mode === 'team3' ? `/team-battle/${id}` : `/battle/${id}`;
const STAKES: Array<{ id: BattleStakeType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'none', label: 'Casual', icon: 'happy' },
  { id: 'coins', label: 'Coins', icon: 'cash' },
  { id: 'card', label: 'Carta', icon: 'albums' },
];
const COIN_WAGERS = [100, 500, 1000, 5000];

export default function BattlesHubScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<SocialPlayer | null>(null);
  const [mode, setMode] = useState<BattleMode>('draft3');
  const [stakeType, setStakeType] = useState<BattleStakeType>('none');
  const [wagerCoins, setWagerCoins] = useState(500);
  const [bag, setBag] = useState<OwnedCardEntry[]>([]);
  const [bagLoading, setBagLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rankedMode, setRankedMode] = useState<BattleMode>('draft3');
  const [queueState, setQueueState] = useState<MatchmakingState | null>(null);
  const [showBattleRules, setShowBattleRules] = useState(false);
  const [formats,setFormats]=useState<BattleFormat[]>([]);
  const [formatId,setFormatId]=useState('standard');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, h, l, social, availableFormats] = await Promise.all([getMyProfile(), getMyBattleHistory(), getBattleLeaderboard(25), getMySocial(), getBattleFormats().catch(()=>[])]);
      setProfile(p);
      setHistory(h);
      setLeaderboard(l);
      setFriends(social.friends);
      setFormats(availableFormats);
      setQueueState(await getMyMatchmakingState().catch(() => null));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível carregar as batalhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (!profile?.id) return;
    return subscribeMyMatchmaking(profile.id, (state) => {
      setQueueState(state);
      if (state.status === 'matched' && state.matched_battle_id) {
        router.push(battleRoute(state.matched_battle_id, state.mode_choice));
      }
    });
  }, [profile?.id, router]);
  useEffect(() => {
    if (queueState?.status !== 'waiting') return;

    let disposed = false;
    let inFlight = false;

    const poll = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const result = await joinMatchmaking(queueState.mode_choice);
        if (disposed) return;
        if (result.status === 'matched' && result.battleId) {
          setNotice(result.botMatch ? 'Fila preenchida por um Treinador IA de ELO próximo.' : 'Partida encontrada!');
          router.push(battleRoute(result.battleId, result.mode ?? queueState.mode_choice));
        }
      } catch (e) {
        if (isFunctionErrorCode(e, 'ACTIVE_BATTLE_EXISTS')) {
          const currentBattle = await getMyActiveBattle().catch(() => null);
          if (!disposed && currentBattle?.id) router.push(battleRoute(currentBattle.id, currentBattle.mode));
        }
      } finally {
        inFlight = false;
      }
    };

    const first = setTimeout(() => { void poll(); }, 4500);
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => {
      disposed = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [queueState?.status, queueState?.mode_choice, router]);
  const completed = useMemo(() => history.filter((item) => item.status === 'completed'), [history]);
  const incomingInvites = useMemo(
    () => history.filter((item) => item.status === 'invited' && item.opponent_id === profile?.id),
    [history, profile?.id],
  );
  const myRank = getTrainerRank(profile?.battle_rating);
  const wins = completed.filter((item) => item.winner_id === profile?.id).length;
  const losses = completed.length - wins;
  const winRate = completed.length ? Math.round(wins / completed.length * 100) : 0;

  async function startRankedSearch() {
    if (working) return;
    try {
      setWorking('matchmaking');

      const currentBattle = await getMyActiveBattle().catch(() => null);
      if (currentBattle?.id) {
        setNotice('Você já tem uma batalha ativa. Abrindo a partida...');
        router.push(battleRoute(currentBattle.id, currentBattle.mode));
        return;
      }

      const result = await joinMatchmaking(rankedMode);
      if (result.status === 'matched' && result.battleId) {
        router.push(battleRoute(result.battleId, result.mode ?? rankedMode));
        return;
      }
      setQueueState(await getMyMatchmakingState());
      setNotice('Busca iniciada. Você pode continuar navegando pelo jogo.');
    } catch (e) {
      if (isFunctionErrorCode(e, 'ACTIVE_BATTLE_EXISTS')) {
        const currentBattle = await getMyActiveBattle().catch(() => null);
        if (currentBattle?.id) {
          setNotice('Você já tem uma batalha ativa. Abrindo a partida...');
          router.push(battleRoute(currentBattle.id, currentBattle.mode));
          return;
        }
      }
      setNotice(e instanceof Error ? e.message : 'Não foi possível entrar no matchmaking.');
    } finally {
      setWorking(null);
    }
  }

  async function stopRankedSearch() {
    if (working) return;
    try {
      setWorking('matchmaking');
      await cancelMatchmaking();
      setQueueState(await getMyMatchmakingState());
      setNotice('Busca de partida cancelada.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível cancelar a busca.');
    } finally {
      setWorking(null);
    }
  }

  async function loadBagForStake() {
    if (bag.length) { setPickerOpen(true); return; }
    try {
      setBagLoading(true);
      setBag(await getMyBag());
      setPickerOpen(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível carregar sua Bag.');
    } finally {
      setBagLoading(false);
    }
  }

  async function sendChallenge() {
    if (!opponent || working) return;
    if (stakeType === 'card' && !selectedCardId) {
      setNotice('Escolha a carta que ficará apostada.');
      return;
    }
    try {
      setWorking('challenge');
      const battleId = await createBattle(opponent.id, mode, stakeType, stakeType === 'coins' ? wagerCoins : 0, selectedCardId);
      if(formatId!=='standard')await setBattleFormat(battleId,formatId);
      setOpponent(null);
      setSelectedCardId(null);
      setFormatId('standard');
      router.push(`/battle/${battleId}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível enviar o desafio.');
    } finally {
      setWorking(null);
    }
  }

  async function respondInvite(id: string, accept: boolean) {
    try {
      setWorking(id);
      await respondToBattle(id, accept);
      await load();
      if (accept) router.push(`/battle/${id}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível responder ao convite.');
    } finally {
      setWorking(null);
    }
  }

  async function rematch(id: string, battleMode?: BattleMode) {
    try {
      setWorking(id);
      const next = await rematchBattle(id);
      router.push(battleRoute(next, battleMode));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Não foi possível criar a revanche.');
    } finally {
      setWorking(null);
    }
  }

  return <Screen title="Battle Arena" subtitle="Ranqueadas, desafios entre amigos, histórico, regras e matchmaking competitivo.">
      <AreaIdentityStrip area="competitive" />
      <Pressable
        onPress={() => router.push('/adventure' as any)}
        style={{borderWidth:1,borderColor:'#4B89AF',backgroundColor:'#102534',borderRadius:16,padding:14,flexDirection:'row',alignItems:'center',gap:11}}
      >
        <View style={{width:46,height:46,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#19384C'}}><Ionicons name="map" size={24} color="#8DD7FF"/></View>
        <View style={{flex:1}}><Text style={{color:'#F0F7FC',fontSize:14,fontWeight:'900'}}>TRAINER ADVENTURE 1.2</Text><Text style={{color:'#89A2B5',fontSize:10,marginTop:2}}>Kanto • Battle Tower • Elite Four • Raids • Rogue • Desafios • Campeão • 3D</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8DD7FF"/>
      </Pressable>
    {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={18} color={colors.yellow}/><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
    {loading ? <ActivityIndicator size="large" color={colors.yellow}/> : null}

    {incomingInvites.length ? (
      <View style={[styles.invitePanel, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Convites recebidos</Text>
          <Text style={[styles.sectionMeta, { color: colors.yellow }]}>{incomingInvites.length}</Text>
        </View>
        <View style={styles.list}>
          {incomingInvites.map((item) => {
            const challenger = Array.isArray(item.challenger) ? item.challenger[0] : item.challenger;
            const cardStake = item.stake_type === 'card';
            return (
              <CompactTrainerBanner
                key={item.id}
                frameId={challenger?.equipped_frame_id}
                backgroundId={challenger?.equipped_background_id}
                fallbackColor={colors.yellow}
              >
                <View style={[styles.inviteRow, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                  <TrainerAvatar icon={challenger?.profile_icon} avatarUrl={getProfileAvatarUrl(challenger?.avatar_path,challenger?.avatar_updated_at)} color={colors.yellow} backgroundColor={colors.accentSoft} size={39}/>
                  <Pressable style={styles.grow} onPress={() => router.push(`/battle/${item.id}`)}>
                    <Text style={[styles.name, { color: colors.text }]}>@{challenger?.username ?? 'Treinador'} desafiou você</Text>
                    <Text style={[styles.sub, { color: colors.muted }]}>
                      {item.mode === 'draft3' ? 'Draft 3' : item.mode === 'mystery' ? 'Mystery BO3' : 'Quick'} • {cardStake ? '🎴 valendo carta' : item.stake_type === 'coins' ? `🪙 ${item.wager_coins}` : 'Casual'}
                    </Text>
                  </Pressable>
                  <View style={styles.inviteActions}>
                    <Pressable disabled={working === item.id} onPress={() => { void respondInvite(item.id, false); }} style={[styles.inviteButton, { borderColor: '#69313A' }]}><Text style={{ color: '#FF8290', fontWeight: '900', fontSize: 9 }}>RECUSAR</Text></Pressable>
                    {cardStake ? (
                      <Pressable onPress={() => router.push(`/battle/${item.id}`)} style={[styles.inviteButton, { borderColor: colors.accent }]}><Text style={{ color: colors.accent, fontWeight: '900', fontSize: 9 }}>ABRIR</Text></Pressable>
                    ) : (
                      <Pressable disabled={working === item.id} onPress={() => { void respondInvite(item.id, true); }} style={[styles.inviteButton, { borderColor: colors.yellow, backgroundColor: colors.yellow }]}><Text style={{ color: '#07111F', fontWeight: '900', fontSize: 9 }}>ACEITAR</Text></Pressable>
                    )}
                  </View>
                </View>
              </CompactTrainerBanner>
            );
          })}
        </View>
      </View>
    ) : null}

    <View style={[styles.rankedPanel, { backgroundColor: colors.surface, borderColor: queueState?.status === 'waiting' ? colors.yellow : colors.accent }]}>
      <View style={styles.rankedHead}>
        <View style={[styles.rankedIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="radio" size={24} color={colors.yellow}/></View>
        <View style={styles.grow}>
          <Text style={[styles.rankedTitle, { color: colors.text }]}>Matchmaking Ranqueado</Text>
          <Text style={[styles.sectionDescription, { color: colors.muted }]}>
            {queueState?.status === 'waiting' ? 'Procurando jogador real. Se ninguém aparecer, um Treinador IA de ELO próximo entra após 18 segundos.' : 'Jogadores reais têm prioridade. Se a fila estiver vazia, a IA preenche a rankeada sem travar sua busca.'}
          </Text>
        </View>
        {queueState?.status === 'waiting' ? <View style={styles.searchingDot}><ActivityIndicator size="small" color="#07111F"/></View> : null}
      </View>
      <View style={styles.rankedModes}>
        {RANKED_MODES.map((item)=><Pressable
          key={`ranked-${item.id}`}
          disabled={queueState?.status === 'waiting'}
          onPress={()=>setRankedMode(item.id)}
          style={[styles.rankedMode,{backgroundColor:rankedMode===item.id?colors.accentSoft:colors.surfaceAlt,borderColor:rankedMode===item.id?colors.accent:colors.border,opacity:queueState?.status==='waiting'?.65:1}]}
        ><Text style={[styles.rankedModeTitle,{color:colors.text}]}>{item.label}</Text><Text style={[styles.rankedModeDetail,{color:colors.muted}]}>{item.detail}</Text></Pressable>)}
      </View>
      {queueState?.status === 'waiting' ? (
        <View style={styles.queueFooter}>
          <View style={styles.grow}><Text style={[styles.queueLabel,{color:colors.yellow}]}>BUSCANDO PARTIDA...</Text><Text style={[styles.sub,{color:colors.muted}]}>Modo: {queueState.mode_choice === 'team3' ? 'Equipe 3×3' : queueState.mode_choice === 'draft3' ? 'Draft 3' : queueState.mode_choice === 'mystery' ? 'Mystery BO3' : 'Quick'} • jogador real primeiro • IA após 18s</Text></View>
          <Pressable disabled={working==='matchmaking'} onPress={()=>void stopRankedSearch()} style={[styles.cancelQueue,{borderColor:'#683243'}]}><Ionicons name="close" size={16} color="#FF8290"/><Text style={styles.cancelQueueText}>CANCELAR</Text></Pressable>
        </View>
      ) : (
        <Pressable disabled={working==='matchmaking'} onPress={()=>void startRankedSearch()} style={[styles.findMatch,{backgroundColor:colors.yellow}]}>{working==='matchmaking'?<ActivityIndicator color="#07111F"/>:<Ionicons name="flash" size={19} color="#07111F"/>}<Text style={styles.findMatchText}>BUSCAR PARTIDA</Text></Pressable>
      )}
      <Pressable onPress={()=>router.push('/season')} style={styles.seasonLink}><Ionicons name="trophy" size={15} color={colors.accent}/><Text style={[styles.seasonLinkText,{color:colors.accent}]}>VER TEMPORADA E RECOMPENSAS</Text></Pressable>
    </View>

    <View style={[styles.rulesPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showBattleRules }}
        onPress={() => setShowBattleRules((value) => !value)}
        style={styles.rulesHeader}
      >
        <View style={[styles.rulesIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="book-outline" size={22} color={colors.accent}/>
        </View>
        <View style={styles.grow}>
          <Text style={[styles.rulesTitle, { color: colors.text }]}>Como funcionam as batalhas</Text>
          <Text style={[styles.rulesSubtitle, { color: colors.muted }]}>GAME_V1 • turnos, golpes, PP, tipos e estatísticas reais da espécie</Text>
        </View>
        <Ionicons name={showBattleRules ? 'chevron-up' : 'chevron-down'} size={21} color={colors.muted}/>
      </Pressable>

      {showBattleRules ? (
        <View style={styles.rulesBody}>
          <View style={[styles.rulesHero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <View style={styles.grow}>
              <Text style={[styles.rulesKicker, { color: colors.yellow }]}>OBJETIVO DA RODADA</Text>
              <Text style={[styles.rulesHeroTitle, { color: colors.text }]}>Nocauteie o rival no menor número de turnos</Text>
              <Text style={[styles.rulesText, { color: colors.muted }]}>Cada treinador escolhe um dos golpes disponíveis. O game_v1 resolve prioridade, Speed, precisão, crítico, STAB, tipos, status e dano. Preço, raridade e Coins não aumentam a força.</Text>
            </View>
            <Ionicons name="flash" size={30} color={colors.yellow}/>
          </View>

          <View style={styles.rulesStats}>
            <RuleStat icon="heart" label="HP" text="Vida real calculada para o nível 50 do perfil game_v1." />
            <RuleStat icon="fitness" label="ATAQUE" text="Força usada pelos golpes físicos." />
            <RuleStat icon="shield" label="DEFESA" text="Reduz o dano recebido de golpes físicos." />
            <RuleStat icon="sparkles" label="SP. ATK" text="Força usada pelos golpes especiais." />
            <RuleStat icon="shield-checkmark" label="SP. DEF" text="Reduz o dano recebido de golpes especiais." />
            <RuleStat icon="speedometer" label="SPEED" text="Ajuda a decidir quem age primeiro, depois da prioridade do golpe." />
            <RuleStat icon="water" label="PP" text="Cada golpe tem usos próprios. Quando o PP acaba, ele não pode ser escolhido." />
          </View>

          <View style={[styles.rulesOrder, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[styles.rulesOrderTitle, { color: colors.text }]}>Como um turno é resolvido</Text>
            <RuleStep number="1" title="Você escolhe o golpe" text="A escolha é confirmada no servidor e fica travada até o adversário escolher." />
            <RuleStep number="2" title="Prioridade e Speed" text="Golpes com maior prioridade agem primeiro; depois entra a Speed efetiva." />
            <RuleStep number="3" title="Acerto e dano" text="Precisão, Attack/Sp. Atk, Defense/Sp. Def, STAB, tipo, crítico e variação de dano entram no cálculo." />
            <RuleStep number="4" title="Efeitos do golpe" text="Status, cura, recoil, flinch e mudanças de atributos são aplicados quando cabível." />
            <RuleStep number="5" title="Nocaute" text="Quando o HP chega a zero, a rodada é encerrada e o vencedor recebe o ponto." />
          </View>

          <View style={styles.matchupRow}>
            <View style={[styles.matchupCard, { backgroundColor: '#173728', borderColor: '#2F7451' }]}>
              <Ionicons name="trending-up" size={20} color="#65D894"/>
              <View style={styles.grow}><Text style={styles.superEffective}>SUPER EFETIVO</Text><Text style={styles.matchupText}>Fraqueza pode multiplicar ou aumentar o dano.</Text></View>
            </View>
            <View style={[styles.matchupCard, { backgroundColor: '#382414', borderColor: '#7A4B24' }]}>
              <Ionicons name="shield" size={20} color="#FFB16A"/>
              <View style={styles.grow}><Text style={styles.resisted}>RESISTIDO</Text><Text style={styles.matchupText}>Resistência reduz o dano recebido.</Text></View>
            </View>
          </View>

          <Text style={[styles.rulesFootnote, { color: colors.muted }]}>Tipos seguem a tabela completa do jogo: por exemplo, Elétrico contra Terra causa 0×, Normal contra Fantasma causa 0× e Fogo contra Planta causa 2×. Não existem cartas de Energia no game_v1.</Text>
        </View>
      ) : null}
    </View>

    <View style={[styles.hero, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <View style={[styles.arenaGlow,{backgroundColor:colors.accent}]} />
      <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.arenaPokemon}/>
      <View style={styles.arenaMain}>
        <Text style={[styles.kicker, { color: colors.yellow }]}>RANKED ARENA • SEASON</Text>
        <Text style={[styles.rating, { color: colors.text }]}>{profile?.battle_rating ?? 1000}</Text>
        <Text style={[styles.rankLabel, { color: colors.muted }]}>{myRank.symbol} {myRank.displayName}</Text>
        <View style={[styles.arenaStatus,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <View style={[styles.arenaStatusDot,{backgroundColor:queueState?.status === 'waiting' ? colors.yellow : '#65D894'}]} />
          <Text style={[styles.arenaStatusText,{color:colors.text}]}>{queueState?.status === 'waiting' ? 'MATCHMAKING ATIVO' : 'PRONTO PARA BATALHAR'}</Text>
        </View>
      </View>
      <View style={styles.heroStats}><Mini value={profile?.battle_wins ?? wins} label="Vitórias"/><Mini value={profile?.battle_losses ?? losses} label="Derrotas"/><Mini value={`${winRate}%`} label="Win rate"/><Mini value={profile?.best_battle_streak ?? 0} label="Melhor streak"/></View>
    </View>

    <View style={styles.sectionHead}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Desafiar um amigo</Text><Text style={[styles.sectionDescription, { color: colors.muted }]}>Escolha o treinador e configure a batalha aqui mesmo.</Text></View><Pressable onPress={() => router.push('/friends')}><Text style={[styles.sectionLink, { color: colors.accent }]}>AMIGOS</Text></Pressable></View>
    {friends.length ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>
        {friends.map((friend) => (
          <CompactTrainerBanner
            key={friend.id}
            frameId={friend.equipped_frame_id}
            backgroundId={friend.equipped_background_id}
            fallbackColor={colors.accent}
            style={styles.friendBanner}
          >
            <Pressable onPress={() => setOpponent(friend)} style={[styles.friend, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TrainerAvatar icon={friend.profile_icon} avatarUrl={getProfileAvatarUrl(friend.avatar_path,friend.avatar_updated_at)} color={colors.accent} backgroundColor={colors.accentSoft} size={48}/>
              <Text numberOfLines={1} style={[styles.friendName, { color: colors.text }]}>@{friend.username}</Text>
              <Text style={[styles.friendLevel, { color: colors.muted }]}>Nível {friend.level}</Text>
              <View style={[styles.challengeTag, { backgroundColor: colors.yellow }]}><Ionicons name="flash" size={13} color="#07111F"/><Text style={styles.challengeTagText}>DESAFIAR</Text></View>
            </Pressable>
          </CompactTrainerBanner>
        ))}
      </ScrollView>
    ) : !loading ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="people-outline" size={32} color={colors.muted}/><Text style={[styles.emptyTitle, { color: colors.text }]}>Adicione amigos para desafiar</Text><Pressable onPress={() => router.push('/friends')} style={[styles.findFriends, { borderColor: colors.accent }]}><Text style={[styles.rematchText, { color: colors.accent }]}>ENCONTRAR TREINADORES</Text></Pressable></View> : null}

    <View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.text }]}>Ranking de Batalhas</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>TOP {leaderboard.length}</Text></View>
    <View style={styles.list}>{leaderboard.map((player, index) => {
      const visible = player.id === profile?.id || player.show_battle_rating !== false;
      const rank = getTrainerRank(player.battle_rating);
      const mine = player.id === profile?.id;
      return (
        <CompactTrainerBanner
          key={player.id}
          frameId={player.equipped_frame_id}
          backgroundId={player.equipped_background_id}
          fallbackColor={index < 3 ? colors.yellow : colors.accent}
          selected={mine}
        >
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir perfil de @${player.username}`} onPress={() => router.push(`/player/${player.id}`)} style={[styles.rankRow, { backgroundColor: colors.surface, borderColor: mine ? colors.accent : colors.border }]}>
            <View style={[styles.position, { backgroundColor: index < 3 ? colors.accentSoft : colors.surfaceAlt }]}><Text style={[styles.positionText, { color: index < 3 ? colors.accent : colors.muted }]}>{index + 1}</Text></View>
            <TrainerAvatar icon={player.profile_icon} avatarUrl={getProfileAvatarUrl(player.avatar_path,player.avatar_updated_at)} color={colors.accent} backgroundColor={colors.accentSoft} size={42}/>
            <View style={styles.grow}>
              <Text style={[styles.name, { color: colors.text }]}>{visible ? rank.symbol + ' ' : ''}@{player.username}{mine ? ' • você' : ''}</Text>
              <Text style={[styles.sub, { color: colors.muted }]}>{visible ? rank.displayName : 'ELO oculto'} • {player.battle_wins}V • {player.battle_losses}D • streak {player.battle_streak}</Text>
            </View>
            <Text style={[styles.elo, { color: colors.yellow }]}>{visible ? player.battle_rating : '•••'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted}/>
          </Pressable>
        </CompactTrainerBanner>
      );
    })}</View>

    <View style={styles.sectionHead}><Text style={[styles.sectionTitle, { color: colors.text }]}>Minhas batalhas</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>{history.length}</Text></View>
    {!loading && history.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="game-controller-outline" size={35} color={colors.muted}/><Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma batalha ainda</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Escolha um amigo acima e envie o primeiro desafio.</Text></View> : null}
    <View style={styles.list}>{history.map((item) => {
      const mineChallenger = item.challenger_id === profile?.id;
      const other:any = mineChallenger ? (Array.isArray(item.opponent) ? item.opponent[0] : item.opponent) : (Array.isArray(item.challenger) ? item.challenger[0] : item.challenger);
      const won = item.status === 'completed' && item.winner_id === profile?.id;
      const before = mineChallenger ? item.challenger_rating_before : item.opponent_rating_before;
      const after = mineChallenger ? item.challenger_rating_after : item.opponent_rating_after;
      const delta = before != null && after != null ? Number(after) - Number(before) : 0;
      return (
        <CompactTrainerBanner key={item.id} frameId={other?.equipped_frame_id} backgroundId={other?.equipped_background_id} fallbackColor={colors.accent}>
          <View style={[styles.battleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable style={styles.battleBody} onPress={() => router.push(battleRoute(item.id, item.mode))}>
              <View style={[styles.resultIcon, { backgroundColor: won ? '#163426' : item.status === 'completed' ? '#391D26' : colors.surfaceAlt }]}><Ionicons name={won ? 'trophy' : item.status === 'completed' ? 'close-circle' : 'hourglass'} size={21} color={won ? '#63D99A' : item.status === 'completed' ? '#FF8290' : colors.muted}/></View>
              <TrainerAvatar icon={other?.profile_icon} avatarUrl={getProfileAvatarUrl(other?.avatar_path,other?.avatar_updated_at)} color={colors.accent} backgroundColor={colors.accentSoft} size={38}/>
              <View style={styles.grow}>
                <View style={styles.battleTitleRow}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.status === 'completed' ? (won ? 'Vitória' : 'Derrota') : 'Batalha vs'} {other?.is_bot ? `🤖 ${other?.username ?? 'Treinador IA'}` : `@${other?.username ?? 'Treinador'}`}</Text>
                  <StatusPill
                    status={item.status}
                    tone={item.status === 'completed' ? (won ? 'success' : 'danger') : undefined}
                    label={item.status === 'completed' ? (won ? 'VITÓRIA' : 'DERROTA') : item.status === 'invited' ? 'CONVITE' : item.status === 'drafting' ? 'DRAFT' : item.status === 'selecting' ? 'ESCOLHENDO' : item.status === 'revealing' ? 'SEU TURNO' : String(item.status).toUpperCase()}
                  />
                </View>
                <Text style={[styles.sub, { color: colors.muted }]}>{item.mode === 'team3' ? 'Equipe 3×3' : item.mode === 'draft3' ? 'Draft 3' : item.mode === 'mystery' ? 'Mystery BO3' : 'Quick'} • {item.is_bot_match ? 'Treinador IA' : item.stake_type === 'coins' ? `🪙 ${item.wager_coins}` : item.stake_type === 'card' ? '🎴 valendo carta' : 'Casual'} • {item.challenger_score}–{item.opponent_score}</Text>
                <Text style={[styles.sub, { color: item.reward_eligible === false ? '#E6A15A' : colors.muted }]}>{item.completed_at ? new Date(item.completed_at).toLocaleString('pt-BR') : new Date(item.created_at).toLocaleString('pt-BR')}{item.status === 'completed' ? ` • ELO ${delta >= 0 ? '+' : ''}${delta}` : ''}{item.reward_eligible === false ? ' • sem XP/ELO anti-farm' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
            </Pressable>
            {item.status === 'completed' ? <View style={styles.historyActions}>
              <Pressable style={[styles.rematch, { borderColor: colors.yellow }]} onPress={() => router.push(('/battle-replay/'+item.id) as never)}><Ionicons name="play-back" size={15} color={colors.yellow}/><Text style={[styles.rematchText, { color: colors.yellow }]}>REPLAY</Text></Pressable>
              {!item.is_bot_match ? <Pressable style={[styles.rematch, { borderColor: colors.accent }]} onPress={() => rematch(item.id, item.mode)} disabled={working === item.id}><Ionicons name="refresh" size={15} color={colors.accent}/><Text style={[styles.rematchText, { color: colors.accent }]}>{working === item.id ? 'CRIANDO...' : 'REVANCHE'}</Text></Pressable> : null}
            </View> : null}
          </View>
        </CompactTrainerBanner>
      );
    })}</View>

    <Modal visible={Boolean(opponent)} transparent animationType="fade" onRequestClose={() => setOpponent(null)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {opponent ? (
            <CompactTrainerBanner frameId={opponent.equipped_frame_id} backgroundId={opponent.equipped_background_id} fallbackColor={colors.yellow}>
              <View style={styles.modalHeader}><TrainerAvatar icon={opponent.profile_icon} avatarUrl={getProfileAvatarUrl(opponent.avatar_path,opponent.avatar_updated_at)} color={colors.yellow} backgroundColor={colors.accentSoft} size={46}/><View style={styles.grow}><Text style={[styles.modalTitle, { color: colors.text }]}>Desafiar @{opponent.username}</Text><Text style={[styles.modalSubtitle, { color: colors.muted }]}>Configure o formato e o que estará valendo.</Text></View><Pressable onPress={() => setOpponent(null)}><Ionicons name="close" size={23} color={colors.muted}/></Pressable></View>
            </CompactTrainerBanner>
          ) : null}
          <Text style={[styles.optionLabel, { color: colors.muted }]}>MODO</Text>
          <View style={styles.optionGrid}>{MODES.map((item) => <Pressable key={item.id} onPress={() => setMode(item.id)} style={[styles.option, { backgroundColor: mode === item.id ? colors.accentSoft : colors.surfaceAlt, borderColor: mode === item.id ? colors.accent : colors.border }]}><Text style={[styles.optionTitle, { color: colors.text }]}>{item.label}</Text><Text style={[styles.optionDetail, { color: colors.muted }]}>{item.detail}</Text></Pressable>)}</View>
          <Text style={[styles.optionLabel, { color: colors.muted }]}>FORMATO</Text>
          <View style={styles.formatList}>{(formats.length?formats:[{id:'standard',name:'Padrão',description:'Sem restrições extras.',icon:'game-controller',rules:{},rankedAllowed:true}]).map((item)=>{const active=formatId===item.id;return <Pressable key={item.id} onPress={()=>setFormatId(item.id)} style={[styles.formatOption,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.accent:colors.border}]}><Ionicons name={(item.icon||'game-controller') as keyof typeof Ionicons.glyphMap} size={17} color={active?colors.accent:colors.muted}/><View style={{flex:1}}><Text style={[styles.optionTitle,{color:colors.text}]}>{item.name}</Text><Text style={[styles.optionDetail,{color:colors.muted}]}>{item.description}</Text></View>{active?<Ionicons name="checkmark-circle" size={18} color={colors.accent}/>:null}</Pressable>;})}</View>
          <Text style={[styles.formatHint,{color:colors.muted}]}>Formatos alternativos valem apenas para desafios entre amigos. A ranqueada continua no formato Padrão.</Text>
          <Text style={[styles.optionLabel, { color: colors.muted }]}>APOSTA</Text>
          <View style={styles.optionGrid}>{STAKES.map((item) => <Pressable key={item.id} onPress={() => { setStakeType(item.id); if (item.id !== 'card') setSelectedCardId(null); }} style={[styles.stake, { backgroundColor: stakeType === item.id ? colors.accentSoft : colors.surfaceAlt, borderColor: stakeType === item.id ? colors.accent : colors.border }]}><Ionicons name={item.icon} size={18} color={stakeType === item.id ? colors.accent : colors.muted}/><Text style={[styles.optionTitle, { color: colors.text }]}>{item.label}</Text></Pressable>)}</View>
          {stakeType === 'coins' ? <View style={styles.wagers}>{COIN_WAGERS.map((value) => <Pressable key={value} onPress={() => setWagerCoins(value)} style={[styles.wager, { backgroundColor: wagerCoins === value ? colors.yellow : colors.surfaceAlt, borderColor: wagerCoins === value ? colors.yellow : colors.border }]}><Text style={[styles.wagerText, { color: wagerCoins === value ? '#07111F' : colors.text }]}>🪙 {value.toLocaleString('pt-BR')}</Text></Pressable>)}</View> : null}
          {stakeType === 'card' ? <Pressable onPress={() => void loadBagForStake()} disabled={bagLoading} style={[styles.cardChoice, { backgroundColor: colors.surfaceAlt, borderColor: selectedCardId ? colors.yellow : colors.border }]}><Ionicons name={bagLoading ? 'hourglass' : 'albums'} size={20} color={colors.yellow}/><View style={styles.grow}><Text style={[styles.optionTitle, { color: colors.text }]}>{selectedCardId ? bag.find((entry) => entry.cards?.id === selectedCardId)?.cards?.pokemon_name ?? 'Carta selecionada' : 'Escolher carta apostada'}</Text><Text style={[styles.optionDetail, { color: colors.muted }]}>{selectedCardId ? 'Toque para trocar' : 'A carta ficará reservada até o resultado'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable> : null}
          <Pressable onPress={() => void sendChallenge()} disabled={working === 'challenge'} style={[styles.send, { backgroundColor: colors.yellow }, working === 'challenge' && { opacity: .5 }]}><Ionicons name="flash" size={19} color="#07111F"/><Text style={styles.sendText}>{working === 'challenge' ? 'ENVIANDO...' : 'ENVIAR DESAFIO'}</Text></Pressable>
        </View>
      </View>
    </Modal>

    <CardPickerModal visible={pickerOpen} title="Carta da aposta" subtitle="Escolha uma carta da sua Bag para deixar em custódia." bag={bag} mode="single" selectedId={selectedCardId} displayMode="market" onSelectedIdChange={setSelectedCardId} onClose={() => setPickerOpen(false)} onConfirm={() => setPickerOpen(false)} confirmLabel="USAR ESTA CARTA"/>
  </Screen>;
}

function RuleStat({ icon, label, text }: { icon: keyof typeof Ionicons.glyphMap; label: string; text: string }) { const { colors } = useAppTheme(); return <View style={[styles.ruleStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><View style={[styles.ruleStatIcon,{backgroundColor:colors.surface}]}><Ionicons name={icon} size={17} color={colors.accent}/></View><View style={styles.grow}><Text style={[styles.ruleStatLabel,{color:colors.text}]}>{label}</Text><Text style={[styles.ruleStatText,{color:colors.muted}]}>{text}</Text></View></View>; }

function RuleStep({ number, title, text }: { number: string; title: string; text: string }) { const { colors } = useAppTheme(); return <View style={styles.ruleStep}><View style={[styles.ruleNumber,{backgroundColor:colors.yellow}]}><Text style={styles.ruleNumberText}>{number}</Text></View><View style={styles.grow}><Text style={[styles.ruleStepTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.ruleStepText,{color:colors.muted}]}>{text}</Text></View></View>; }

function Mini({ value, label }: { value: number | string; label: string }) { const { colors } = useAppTheme(); return <View><Text style={[styles.miniValue, { color: colors.text }]}>{value}</Text><Text style={[styles.miniLabel, { color: colors.muted }]}>{label}</Text></View>; }

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 14, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  rulesPanel: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  rulesHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  rulesIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rulesTitle: { fontSize: 16, fontWeight: '900' },
  rulesSubtitle: { fontSize: 9, marginTop: 2 },
  rulesBody: { paddingHorizontal: 13, paddingBottom: 13, gap: 11 },
  rulesHero: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rulesKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  rulesHeroTitle: { fontSize: 14, fontWeight: '900', marginTop: 3 },
  rulesText: { fontSize: 9, lineHeight: 14, marginTop: 4 },
  rulesStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  ruleStat: { flexGrow: 1, flexBasis: 210, minHeight: 66, borderRadius: 14, borderWidth: 1, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleStatIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ruleStatLabel: { fontSize: 9, fontWeight: '900' },
  ruleStatText: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  rulesOrder: { borderRadius: 16, borderWidth: 1, padding: 11, gap: 9 },
  rulesOrderTitle: { fontSize: 12, fontWeight: '900', marginBottom: 2 },
  ruleStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  ruleNumber: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ruleNumberText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  ruleStepTitle: { fontSize: 9, fontWeight: '900' },
  ruleStepText: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  matchupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  matchupCard: { flexGrow: 1, flexBasis: 210, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  superEffective: { color: '#65D894', fontSize: 8, fontWeight: '900' },
  resisted: { color: '#FFB16A', fontSize: 8, fontWeight: '900' },
  matchupText: { color: '#D5D8DE', fontSize: 8, lineHeight: 12, marginTop: 2 },
  rulesFootnote: { fontSize: 8, lineHeight: 13, fontWeight: '700' },
  rankedPanel: { borderRadius:26, borderWidth:1, padding:16, gap:12 },
  rankedHead: { flexDirection:'row', alignItems:'center', gap:10 },
  rankedIcon: { width:46, height:46, borderRadius:15, alignItems:'center', justifyContent:'center' },
  rankedTitle: { fontSize:18, fontWeight:'900' },
  searchingDot: { width:38, height:38, borderRadius:19, backgroundColor:'#FFD447', alignItems:'center', justifyContent:'center' },
  rankedModes: { flexDirection:'row', flexWrap:'wrap', gap:7 },
  rankedMode: { flexGrow:1, flexBasis:100, borderRadius:13, borderWidth:1, padding:10 },
  rankedModeTitle: { fontSize:10, fontWeight:'900' },
  rankedModeDetail: { fontSize:8, marginTop:2 },
  queueFooter: { flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:10 },
  queueLabel: { fontSize:10, fontWeight:'900', letterSpacing:.7 },
  cancelQueue: { minHeight:42, borderRadius:12, borderWidth:1, paddingHorizontal:12, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5 },
  cancelQueueText: { color:'#FF8290', fontSize:8, fontWeight:'900' },
  findMatch: { minHeight:50, borderRadius:14, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7 },
  findMatchText: { color:'#07111F', fontSize:10, fontWeight:'900', letterSpacing:.4 },
  seasonLink: { alignSelf:'flex-start', flexDirection:'row', alignItems:'center', gap:6, paddingVertical:3 },
  seasonLinkText: { fontSize:8, fontWeight:'900' }, noticeText: { flex: 1, color: '#F8EFCB', fontSize: 11, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', padding: 18, borderRadius: 28, borderWidth: 1, overflow:'hidden', position:'relative', minHeight:190 },
  arenaGlow:{position:'absolute',right:-70,top:-100,width:300,height:300,borderRadius:999,opacity:.14},
  arenaPokemon:{position:'absolute',right:-24,bottom:-48,width:215,height:230,opacity:.22,transform:[{rotate:'7deg'}]},
  arenaMain:{zIndex:2,minWidth:180},
  arenaStatus:{alignSelf:'flex-start',marginTop:10,borderWidth:1,borderRadius:999,paddingHorizontal:10,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:6},
  arenaStatusDot:{width:7,height:7,borderRadius:999},
  arenaStatusText:{fontSize:7,fontWeight:'900',letterSpacing:.55},
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, rating: { fontSize: 38, fontWeight: '900' }, rankLabel: { fontSize: 10 }, heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, zIndex:2, paddingRight:85 }, miniValue: { fontSize: 17, fontWeight: '900' }, miniLabel: { fontSize: 8, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 }, sectionTitle: { fontSize: 20, fontWeight: '900' }, sectionDescription: { fontSize: 9, marginTop: 2 }, sectionMeta: { fontSize: 9, fontWeight: '900' }, sectionLink: { fontSize: 9, fontWeight: '900' },
  friendList: { gap: 9, paddingRight: 8 }, friendBanner:{width:150}, friend: { width: 150, borderRadius: 19, borderWidth: 1, padding: 12, alignItems: 'flex-start' }, friendAvatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, friendName: { width: '100%', fontSize: 12, fontWeight: '900', marginTop: 8, textShadowColor:'#000000FF', textShadowOffset:{width:0,height:1}, textShadowRadius:4 }, friendLevel: { fontSize: 8, marginTop: 2 }, challengeTag: { marginTop: 10, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }, challengeTagText: { color: '#07111F', fontSize: 7, fontWeight: '900' },
  list: { gap: 8 }, rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, borderWidth: 1 }, position: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, positionText: { fontWeight: '900' }, grow: { flex: 1, minWidth: 0 }, name: { fontSize: 12, fontWeight: '900', textShadowColor:'#000000FF', textShadowOffset:{width:0,height:1}, textShadowRadius:4 }, sub: { fontSize: 9, marginTop: 3 }, elo: { fontSize: 16, fontWeight: '900', textShadowColor:'#000000F2', textShadowOffset:{width:0,height:1}, textShadowRadius:4 },
  battleRow: { borderRadius: 17, borderWidth: 1, overflow: 'hidden' }, historyActions:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-end',gap:6,paddingHorizontal:10,paddingBottom:9}, battleTitleRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'}, battleBody: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 }, resultIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, rematch: { alignSelf: 'flex-end', marginRight: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 }, rematchText: { fontSize: 8, fontWeight: '900' },
  empty: { padding: 24, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 7 }, emptyTitle: { fontSize: 15, fontWeight: '900' }, emptyText: { fontSize: 10, textAlign: 'center' }, findFriends: { marginTop: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  invitePanel: { borderRadius: 20, borderWidth: 1, padding: 13, gap: 10 },
  inviteRow: { minHeight: 68, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inviteButton: { minHeight: 36, minWidth: 70, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.76)', justifyContent: 'center', padding: 14 }, modalCard: { width: '100%', maxWidth: 600, maxHeight: '92%', alignSelf: 'center', borderRadius: 24, borderWidth: 1, padding: 16, gap: 12 }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, modalTitle: { fontSize: 18, fontWeight: '900' }, modalSubtitle: { fontSize: 9, marginTop: 2 }, optionLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 2 }, formatList:{gap:6},formatOption:{minHeight:52,borderRadius:13,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:8},formatHint:{fontSize:7,lineHeight:11,marginTop:-2}, optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, option: { flexGrow: 1, flexBasis: 100, borderRadius: 13, borderWidth: 1, padding: 10 }, stake: { flexGrow: 1, flexBasis: 90, borderRadius: 13, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, optionTitle: { fontSize: 10, fontWeight: '900' }, optionDetail: { fontSize: 8, marginTop: 2 }, wagers: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, wager: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 }, wagerText: { fontSize: 9, fontWeight: '900' }, cardChoice: { minHeight: 59, borderRadius: 14, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }, send: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, sendText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
});
