import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { findPlayers } from '@/services/player';
import { runFriendAction } from '@/services/playerActions';
import { getMySocial, type SocialPlayer, type SocialState } from '@/services/social';
import { createTrade } from '@/services/trades';
import { gameTheme } from '@/theme/gameTheme';

const emptyState: SocialState = { friends: [], incoming: [], outgoing: [] };
type RelationshipState = 'friend' | 'incoming' | 'outgoing';

export default function FriendsScreen() {
  const router = useRouter();
  const [social, setSocial] = useState<SocialState>(emptyState);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setSocial(await getMySocial()); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  function openChat(player: SocialPlayer) { router.push(`/chat/${player.id}`); }

  async function startTrade(player: SocialPlayer) {
    try { setWorkingId(player.id); const tradeId = await createTrade(player.id); router.push(`/trade/${tradeId}`); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível iniciar a troca.'); }
    finally { setWorkingId(null); }
  }

  function FriendActions({ player }: { player: SocialPlayer }) {
    return <View style={styles.actionRow}>
      <Pressable style={styles.chatButton} onPress={() => openChat(player)}><Ionicons name="chatbubble-ellipses" size={16} color="#fff" /><Text style={styles.chatText}>CHAT</Text></Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => startTrade(player)} disabled={workingId === player.id}><Text style={styles.secondaryButtonText}>TROCAR</Text></Pressable>
    </View>;
  }

  return (
    <Screen title="Amigos" subtitle="Converse, desafie para batalhas e negocie cards com seus treinadores.">
      <Pressable style={styles.backRow} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color="#A9BDD7" /><Text style={styles.backText}>Voltar ao perfil</Text></Pressable>
      {notice ? <View style={styles.notice}><Ionicons name="information-circle" size={20} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable></View> : null}
      <View style={styles.searchBox}><Ionicons name="search" size={20} color={gameTheme.colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={doSearch} placeholder="Buscar treinador por username..." placeholderTextColor="#70839F" autoCapitalize="none" style={styles.search} /><Pressable style={styles.searchButton} onPress={doSearch} disabled={searching}><Text style={styles.searchButtonText}>{searching ? '...' : 'BUSCAR'}</Text></Pressable></View>

      {results.length > 0 ? <Section title="Resultados" count={results.length}>{results.map((player) => {
        const state = known.get(player.id);
        return <PlayerRow key={player.id} player={player}>
          {state === 'friend' ? <FriendActions player={player} /> : state === 'incoming' ? <Pressable style={styles.primaryButton} onPress={() => action(player.id, 'accept')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ACEITAR</Text></Pressable> : state === 'outgoing' ? <View style={styles.pendingBadge}><Text style={styles.pendingText}>ENVIADO</Text></View> : <Pressable style={styles.primaryButton} onPress={() => action(player.id, 'send')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ADICIONAR</Text></Pressable>}
        </PlayerRow>;
      })}</Section> : null}

      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}
      {social.incoming.length > 0 ? <Section title="Solicitações recebidas" count={social.incoming.length}>{social.incoming.map((player) => <PlayerRow key={player.id} player={player}><View style={styles.actionRow}><Pressable style={styles.declineButton} onPress={() => action(player.id, 'decline')} disabled={workingId === player.id}><Ionicons name="close" size={18} color="#FFB0B0" /></Pressable><Pressable style={styles.primaryButton} onPress={() => action(player.id, 'accept')} disabled={workingId === player.id}><Text style={styles.primaryButtonText}>ACEITAR</Text></Pressable></View></PlayerRow>)}</Section> : null}

      <Section title="Meus amigos" count={social.friends.length}>
        {social.friends.length === 0 && !loading ? <View style={styles.empty}><Ionicons name="people-outline" size={34} color="#5E7899" /><Text style={styles.emptyTitle}>Nenhum amigo ainda</Text><Text style={styles.emptyText}>Busque um treinador acima para enviar sua primeira solicitação.</Text></View> : null}
        {social.friends.map((player) => <PlayerRow key={player.id} player={player}><View style={styles.actionRow}><Pressable style={styles.removeButton} onPress={() => action(player.id, 'remove')} disabled={workingId === player.id}><Ionicons name="person-remove-outline" size={17} color="#FF9FAF" /></Pressable><FriendActions player={player} /></View></PlayerRow>)}
      </Section>

      {social.outgoing.length > 0 ? <Section title="Aguardando resposta" count={social.outgoing.length}>{social.outgoing.map((player) => <PlayerRow key={player.id} player={player}><View style={styles.pendingBadge}><Text style={styles.pendingText}>PENDENTE</Text></View></PlayerRow>)}</Section> : null}
    </Screen>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <View style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.count}>{count}</Text></View><View style={styles.sectionBody}>{children}</View></View>; }
function PlayerRow({ player, children }: { player: SocialPlayer; children: React.ReactNode }) { return <View style={styles.playerRow}><View style={styles.avatar}><Text style={styles.avatarText}>{player.username.slice(0, 1).toUpperCase()}</Text></View><View style={styles.playerInfo}><Text style={styles.playerName}>@{player.username}</Text><Text style={styles.playerLevel}>Treinador nível {player.level}</Text></View>{children}</View>; }

const styles = StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{color:'#A9BDD7',fontSize:12,fontWeight:'800'},notice:{flexDirection:'row',alignItems:'center',gap:9,borderRadius:16,padding:13,backgroundColor:'#2B2818',borderWidth:1,borderColor:'#5A5125'},noticeText:{flex:1,color:'#F8EFCB',fontWeight:'700',fontSize:12},
  searchBox:{minHeight:54,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,borderRadius:17,backgroundColor:gameTheme.colors.surface,borderWidth:1,borderColor:gameTheme.colors.border},search:{flex:1,color:'#fff',height:52,fontSize:14},searchButton:{paddingHorizontal:14,paddingVertical:10,borderRadius:12,backgroundColor:gameTheme.colors.blue},searchButtonText:{color:'#fff',fontSize:10,fontWeight:'900'},
  section:{gap:9},sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{color:'#fff',fontSize:19,fontWeight:'900'},count:{color:gameTheme.colors.muted,fontSize:12,fontWeight:'800'},sectionBody:{gap:8},playerRow:{flexDirection:'row',alignItems:'center',gap:11,padding:12,borderRadius:17,backgroundColor:'#101D30',borderWidth:1,borderColor:'#263E5C'},avatar:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#17345D'},avatarText:{color:'#CFE0F9',fontSize:18,fontWeight:'900'},playerInfo:{flex:1,minWidth:100},playerName:{color:'#fff',fontWeight:'900',fontSize:14},playerLevel:{color:'#7E92AD',fontSize:10,marginTop:3},
  actionRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'flex-end'},primaryButton:{minHeight:36,justifyContent:'center',paddingHorizontal:11,borderRadius:10,backgroundColor:gameTheme.colors.yellow},primaryButtonText:{color:'#07111F',fontSize:8,fontWeight:'900'},secondaryButton:{minHeight:36,justifyContent:'center',paddingHorizontal:10,borderRadius:10,backgroundColor:gameTheme.colors.blue},secondaryButtonText:{color:'#fff',fontSize:8,fontWeight:'900'},chatButton:{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,borderRadius:10,backgroundColor:'#5936A8'},chatText:{color:'#fff',fontSize:8,fontWeight:'900'},declineButton:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#351A24'},removeButton:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#351A24'},pendingBadge:{paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:'#222B3A'},pendingText:{color:'#879BB4',fontSize:9,fontWeight:'900'},empty:{alignItems:'center',padding:24,gap:7,borderRadius:18,backgroundColor:'#0D1929',borderWidth:1,borderColor:'#203551'},emptyTitle:{color:'#fff',fontSize:15,fontWeight:'900'},emptyText:{color:'#7E92AD',fontSize:11,textAlign:'center',maxWidth:360},
});
