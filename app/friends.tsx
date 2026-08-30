import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { findPlayers, getProfileAvatarUrl } from '@/services/player';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { runFriendAction } from '@/services/playerActions';
import { getMySocial, type SocialPlayer, type SocialState } from '@/services/social';
import { createTrade } from '@/services/trades';
import { subscribeOnlinePlayers } from '@/services/presence';
import { useAppTheme } from '@/theme/ThemeProvider';

const emptyState: SocialState = { friends: [], incoming: [], outgoing: [] };
type RelationshipState = 'friend' | 'incoming' | 'outgoing';

export default function FriendsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [social, setSocial] = useState<SocialState>(emptyState);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { setLoading(true); setSocial(await getMySocial()); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeOnlinePlayers(setOnlineIds), []);

  const known = useMemo(() => {
    const entries: Array<[string, RelationshipState]> = [];
    social.friends.forEach((p) => entries.push([p.id, 'friend']));
    social.incoming.forEach((p) => entries.push([p.id, 'incoming']));
    social.outgoing.forEach((p) => entries.push([p.id, 'outgoing']));
    return new Map<string, RelationshipState>(entries);
  }, [social]);

  async function doSearch() {
    if (search.trim().length < 2) return;
    try { setSearching(true); setResults(await findPlayers(search)); }
    finally { setSearching(false); }
  }

  async function action(targetId: string, type: 'send' | 'accept' | 'decline' | 'remove') {
    try {
      setWorkingId(targetId);
      const result = await runFriendAction(targetId, type);
      setNotice(result.status === 'accepted' ? 'Amizade confirmada!' : result.status === 'pending' ? 'Solicitação enviada.' : 'Amizade atualizada.');
      await load();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível atualizar a amizade.'); }
    finally { setWorkingId(null); }
  }

  function openProfile(player: SocialPlayer) { router.push(`/player/${player.id}`); }
  function openChat(player: SocialPlayer) { router.push(`/chat/${player.id}`); }

  async function startTrade(player: SocialPlayer) {
    try { setWorkingId(player.id); const tradeId = await createTrade(player.id); router.push(`/trade/${tradeId}`); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível iniciar a troca.'); }
    finally { setWorkingId(null); }
  }

  function FriendActions({ player }: { player: SocialPlayer }) {
    return <View style={styles.actionRow}>
      <Pressable style={[styles.profileButton,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]} onPress={() => openProfile(player)}><Ionicons name="person-circle-outline" size={16} color={colors.yellow}/><Text style={[styles.profileButtonText,{color:colors.text}]}>PERFIL</Text></Pressable>
      <Pressable style={[styles.chatButton,{backgroundColor:colors.accent}]} onPress={() => openChat(player)}><Ionicons name="chatbubble-ellipses" size={16} color="#fff" /><Text style={styles.chatText}>CHAT</Text></Pressable>
      <Pressable style={[styles.secondaryButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]} onPress={() => startTrade(player)} disabled={workingId === player.id}><Text style={[styles.secondaryButtonText,{color:colors.accent}]}>TROCAR</Text></Pressable>
    </View>;
  }

  return (
    <Screen title="Social Hub" subtitle="Amigos, solicitações, chat, trocas e desafios em um só lugar.">
      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText,{color:colors.muted}]}>Voltar ao perfil</Text></Pressable>
      <View style={[styles.socialHero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={[styles.socialIcon,{backgroundColor:colors.surface}]}><Ionicons name="people" size={24} color={colors.yellow}/></View>
        <View style={styles.socialCopy}><Text style={[styles.socialKicker,{color:colors.yellow}]}>TRAINER NETWORK</Text><Text style={[styles.socialTitle,{color:colors.text}]}>Sua rede de treinadores</Text><Text style={[styles.socialHint,{color:colors.muted}]}>Veja quem está online e acesse rapidamente perfis, chat, batalhas e trocas.</Text></View>
        <View style={styles.socialStats}>
          <View style={[styles.socialStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.socialStatValue,{color:colors.text}]}>{social.friends.length}</Text><Text style={[styles.socialStatLabel,{color:colors.muted}]}>AMIGOS</Text></View>
          <View style={[styles.socialStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.socialStatValue,{color:'#65D894'}]}>{social.friends.filter((player)=>onlineIds.has(player.id)).length}</Text><Text style={[styles.socialStatLabel,{color:colors.muted}]}>ONLINE</Text></View>
          <View style={[styles.socialStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.socialStatValue,{color:colors.yellow}]}>{social.incoming.length}</Text><Text style={[styles.socialStatLabel,{color:colors.muted}]}>PEDIDOS</Text></View>
          <Pressable onPress={()=>router.push('/friend-qr')} style={[styles.qrShortcut,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
            <Ionicons name="qr-code" size={20} color={colors.accent}/>
            <Text style={[styles.qrShortcutText,{color:colors.text}]}>MEU QR</Text>
          </Pressable>
          <Pressable onPress={()=>router.push('/friend-qr-scan')} style={[styles.qrShortcut,{backgroundColor:colors.yellow,borderColor:colors.yellow}]}>
            <Ionicons name="scan" size={20} color="#07111F"/>
            <Text style={[styles.qrShortcutText,{color:'#07111F'}]}>ESCANEAR</Text>
          </Pressable>
        </View>
      </View>
      {notice ? <View style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="information-circle" size={20} color={colors.yellow} /><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color={colors.muted} /></Pressable></View> : null}
      <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={doSearch} placeholder="Buscar treinador por username..." placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.search,{color:colors.text}]} /><Pressable style={[styles.searchButton,{backgroundColor:colors.accent}]} onPress={doSearch} disabled={searching}><Text style={styles.searchButtonText}>{searching ? '...' : 'BUSCAR'}</Text></Pressable></View>

      {results.length > 0 ? <Section title="Resultados" count={results.length}>{results.map((player) => {
        const state = known.get(player.id);
        return <PlayerRow key={player.id} player={player} online={state === 'friend' ? onlineIds.has(player.id) : undefined}>
          {state === 'friend' ? <FriendActions player={player} /> : state === 'incoming' ? <Pressable style={styles.primaryButton} onPress={() => action(player.id, 'accept')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ACEITAR</Text></Pressable> : state === 'outgoing' ? <View style={styles.pendingBadge}><Text style={styles.pendingText}>ENVIADO</Text></View> : <Pressable style={styles.primaryButton} onPress={() => action(player.id, 'send')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ADICIONAR</Text></Pressable>}
        </PlayerRow>;
      })}</Section> : null}

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
      {social.incoming.length > 0 ? <Section title="Solicitações recebidas" count={social.incoming.length}>{social.incoming.map((player) => <PlayerRow key={player.id} player={player}><View style={styles.actionRow}><Pressable style={styles.declineButton} onPress={() => action(player.id, 'decline')} disabled={workingId === player.id}><Ionicons name="close" size={18} color="#FFB0B0" /></Pressable><Pressable style={styles.primaryButton} onPress={() => action(player.id, 'accept')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ACEITAR</Text></Pressable></View></PlayerRow>)}</Section> : null}

      <Section title="Meus amigos" count={social.friends.length}>
        {social.friends.length === 0 && !loading ? <View style={styles.empty}><Ionicons name="people-outline" size={34} color="#5E7899" /><Text style={styles.emptyTitle}>Nenhum amigo ainda</Text><Text style={styles.emptyText}>Busque um treinador acima para enviar sua primeira solicitação.</Text></View> : null}
        {social.friends.map((player) => <PlayerRow key={player.id} player={player} online={onlineIds.has(player.id)}><View style={styles.actionRow}><Pressable style={styles.removeButton} onPress={() => action(player.id, 'remove')} disabled={workingId === player.id}><Ionicons name="person-remove-outline" size={17} color="#FF9FAF" /></Pressable><FriendActions player={player} /></View></PlayerRow>)}
      </Section>

      {social.outgoing.length > 0 ? <Section title="Aguardando resposta" count={social.outgoing.length}>{social.outgoing.map((player) => <PlayerRow key={player.id} player={player}><View style={styles.pendingBadge}><Text style={styles.pendingText}>PENDENTE</Text></View></PlayerRow>)}</Section> : null}
    </Screen>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { const {colors}=useAppTheme(); return <View style={styles.section}><View style={styles.sectionHeader}><Text style={[styles.sectionTitle,{color:colors.text}]}>{title}</Text><View style={[styles.countBadge,{backgroundColor:colors.accentSoft,borderColor:colors.border}]}><Text style={[styles.count,{color:colors.muted}]}>{count}</Text></View></View><View style={styles.sectionBody}>{children}</View></View>; }
function PlayerRow({ player, children, online }: { player: SocialPlayer; children: React.ReactNode; online?: boolean }) { const router=useRouter(); const {colors}=useAppTheme(); const avatarUrl=getProfileAvatarUrl(player.avatar_path,player.avatar_updated_at); return <Pressable onPress={()=>router.push(`/player/${player.id}`)} style={[styles.playerRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={styles.avatarWrap}><TrainerAvatar icon={player.profile_icon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.accentSoft} size={43}/>{online !== undefined ? <View style={[styles.presenceDot,{backgroundColor:online?'#5BDB9F':'#53647A',borderColor:colors.surface}]} /> : null}</View><View style={styles.playerInfo}><View style={styles.playerNameRow}><Text style={[styles.playerName,{color:colors.text}]}>@{player.username}</Text>{online !== undefined ? <View style={[styles.presenceBadge,{backgroundColor:online?'#153426':colors.surfaceAlt,borderColor:online?'#2F9E68':colors.border}]}><View style={[styles.presenceMiniDot,{backgroundColor:online?'#5BDB9F':'#6E7F94'}]} /><Text style={[styles.presenceText,{color:online?'#9CEFC1':colors.muted}]}>{online?'ONLINE':'OFFLINE'}</Text></View> : null}</View><Text style={[styles.playerLevel,{color:colors.muted}]}>Treinador nível {player.level}</Text></View>{children}</Pressable>; }

const styles = StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},
  socialHero:{borderRadius:26,borderWidth:1,padding:15,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},
  socialIcon:{width:50,height:50,borderRadius:16,alignItems:'center',justifyContent:'center'},
  socialCopy:{flex:1,minWidth:210},socialKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.25},socialTitle:{fontSize:20,fontWeight:'900',marginTop:2},socialHint:{fontSize:10,lineHeight:15,marginTop:3,maxWidth:470},
  socialStats:{flexDirection:'row',gap:7,flexWrap:'wrap'},socialStat:{minWidth:70,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},socialStatValue:{fontSize:16,fontWeight:'900'},socialStatLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6,marginTop:1},qrShortcut:{minHeight:52,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},qrShortcutText:{fontSize:8,fontWeight:'900'},
  notice:{flexDirection:'row',alignItems:'center',gap:9,borderRadius:16,padding:13,borderWidth:1},noticeText:{flex:1,fontWeight:'700',fontSize:12},
  profileButton:{minHeight:36,paddingHorizontal:10,borderRadius:10,borderWidth:1,flexDirection:'row',alignItems:'center',gap:5},profileButtonText:{fontSize:8,fontWeight:'900'},
  searchBox:{minHeight:54,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:17,borderWidth:1},search:{flex:1,height:52,fontSize:14},searchButton:{paddingHorizontal:14,paddingVertical:10,borderRadius:12},searchButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},
  section:{gap:9},sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontSize:19,fontWeight:'900'},countBadge:{minWidth:30,height:30,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center'},count:{fontSize:11,fontWeight:'900'},sectionBody:{gap:8},playerRow:{flexDirection:'row',alignItems:'center',gap:11,padding:12,borderRadius:17,backgroundColor:'#101D30',borderWidth:1,borderColor:'#263E5C'},avatarWrap:{position:'relative',width:43,height:43},presenceDot:{position:'absolute',right:-2,bottom:-2,width:12,height:12,borderRadius:6,borderWidth:2,borderColor:'#101D30'},playerInfo:{flex:1,minWidth:100},playerNameRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},playerName:{color:'#fff',fontWeight:'900',fontSize:14},presenceBadge:{flexDirection:'row',alignItems:'center',gap:4,borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:3},presenceMiniDot:{width:6,height:6,borderRadius:3},presenceText:{fontSize:7,fontWeight:'900',letterSpacing:.4},playerLevel:{color:'#7E92AD',fontSize:10,marginTop:3},
  actionRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'flex-end'},primaryButton:{minHeight:36,justifyContent:'center',paddingHorizontal:11,borderRadius:10,backgroundColor:'#F1C84B'},primaryButtonText:{color:'#07111F',fontSize:8,fontWeight:'900'},secondaryButton:{minHeight:36,justifyContent:'center',paddingHorizontal:10,borderRadius:10,borderWidth:1},secondaryButtonText:{color:'#fff',fontSize:8,fontWeight:'900'},chatButton:{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,borderRadius:10},chatText:{color:'#fff',fontSize:8,fontWeight:'900'},declineButton:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#351A24'},removeButton:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#351A24'},pendingBadge:{paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:'#222B3A'},pendingText:{color:'#879BB4',fontSize:9,fontWeight:'900'},empty:{alignItems:'center',padding:24,gap:7,borderRadius:18,backgroundColor:'#0D1929',borderWidth:1,borderColor:'#203551'},emptyTitle:{color:'#fff',fontSize:15,fontWeight:'900'},emptyText:{color:'#7E92AD',fontSize:11,textAlign:'center',maxWidth:360},
});
