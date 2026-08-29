import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { findPlayers } from '@/services/player';
import { getMySocial, type SocialPlayer } from '@/services/social';
import { createTrade, getMyTrades } from '@/services/trades';
import { gameTheme } from '@/theme/gameTheme';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

const statusLabels: Record<string, string> = {
  pending: 'EM NEGOCIAÇÃO',
  completed: 'CONCLUÍDA',
  cancelled: 'CANCELADA',
  rejected: 'RECUSADA',
  accepted: 'ACEITA',
};

export default function TradeScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tradeData, social] = await Promise.all([getMyTrades(), getMySocial()]);
      setTrades(tradeData ?? []);
      setFriends(social.friends);
    } catch {
      setTrades([]);
      setFriends([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function searchPlayers() {
    if (search.trim().length < 2) {
      setNotice('Digite pelo menos 2 caracteres para buscar um treinador.');
      return;
    }
    try {
      setLoading(true);
      setNotice(null);
      setPlayers(await findPlayers(search));
    } catch {
      setPlayers([]);
      setNotice('Não foi possível buscar treinadores agora.');
    } finally {
      setLoading(false);
    }
  }

  async function startTrade(receiverId: string) {
    try {
      setCreatingId(receiverId);
      setNotice(null);
      const tradeId = await createTrade(receiverId);
      router.push(`/trade/${tradeId}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível criar a troca.');
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Screen title="Trade Center" subtitle="Negocie cards com segurança, histórico transparente e validação no servidor.">
      {notice ? (
        <View style={styles.notice}><Ionicons name="information-circle" size={20} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={() => setNotice(null)}><Ionicons name="close" size={18} color="#fff" /></Pressable></View>
      ) : null}

      <View style={[styles.tradeHero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={[styles.tradeHeroGlow,{backgroundColor:colors.accent}]} />
        <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.tradeHeroPokemon}/>
        <View style={styles.tradeHeroCopy}>
          <Text style={[styles.tradeHeroKicker,{color:colors.yellow}]}>SECURE TRAINER EXCHANGE</Text>
          <Text style={[styles.tradeHeroTitle,{color:colors.text}]}>Trocas com confirmação dos dois lados.</Text>
          <Text style={[styles.tradeHeroText,{color:colors.muted}]}>Escolha um treinador, negocie as cartas e deixe o servidor validar o inventário antes da transferência.</Text>
          <View style={styles.tradeHeroStats}>
            <View style={[styles.tradeHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.tradeHeroValue,{color:colors.text}]}>{friends.length}</Text><Text style={[styles.tradeHeroLabel,{color:colors.muted}]}>AMIGOS</Text></View>
            <View style={[styles.tradeHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.tradeHeroValue,{color:colors.yellow}]}>{trades.filter((trade)=>trade.status === 'pending').length}</Text><Text style={[styles.tradeHeroLabel,{color:colors.muted}]}>ABERTAS</Text></View>
            <View style={[styles.tradeHeroStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.tradeHeroValue,{color:'#65D894'}]}>{trades.filter((trade)=>trade.status === 'completed').length}</Text><Text style={[styles.tradeHeroLabel,{color:colors.muted}]}>CONCLUÍDAS</Text></View>
          </View>
        </View>
      </View>

      {friends.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionRow}><View><Text style={styles.kicker}>ATALHO</Text><Text style={styles.sectionTitle}>Trocar com amigos</Text></View><Pressable onPress={() => router.push('/friends')}><Text style={styles.link}>GERENCIAR</Text></Pressable></View>
          <View style={styles.friendGrid}>
            {friends.slice(0, 6).map((friend) => (
              <Pressable key={friend.id} style={[styles.friendCard,{backgroundColor:colors.surface,borderColor:colors.border}]} onPress={() => startTrade(friend.id)} disabled={creatingId !== null}>
                <View style={[styles.avatar,{backgroundColor:colors.accentSoft}]}><Text style={[styles.avatarText,{color:colors.text}]}>{friend.username.slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}><Text style={[styles.friendName,{color:colors.text}]}>@{friend.username}</Text><Text style={[styles.friendMeta,{color:colors.muted}]}>Nível {friend.level}</Text></View>
                <Ionicons name="swap-horizontal" size={19} color={gameTheme.colors.yellow} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.searchSection}>
        <Text style={styles.sectionTitle}>Encontrar treinador</Text>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={searchPlayers} placeholder="Buscar por username" placeholderTextColor={colors.muted} autoCapitalize="none" style={[styles.search,{color:colors.text}]} /></View>
          <Pressable style={[styles.searchButton,{backgroundColor:colors.accent}]} onPress={searchPlayers}><Text style={styles.searchButtonText}>BUSCAR</Text></Pressable>
        </View>
      </View>

      {loading ? <ActivityIndicator color={gameTheme.colors.yellow} /> : null}

      {players.length > 0 ? (
        <View style={styles.results}>
          {players.map((player) => (
            <View key={player.id} style={styles.playerRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{player.username.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.playerInfo}><Text style={styles.playerName}>@{player.username}</Text><Text style={styles.playerLevel}>Treinador nível {player.level}</Text></View>
              <Pressable style={styles.tradeButton} onPress={() => startTrade(player.id)} disabled={creatingId !== null}><Text style={styles.tradeButtonText}>{creatingId === player.id ? 'CRIANDO...' : 'TROCAR'}</Text></Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <View><Text style={styles.kicker}>HISTÓRICO</Text><Text style={styles.sectionTitle}>Minhas trocas</Text></View>
        <Pressable style={styles.refreshButton} onPress={load}><Ionicons name="refresh" size={16} color="#A8BBD3" /><Text style={styles.refresh}>ATUALIZAR</Text></Pressable>
      </View>

      {trades.length === 0 ? (
        <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="swap-horizontal-outline" size={30} color="#6681A4" /></View><Text style={styles.emptyTitle}>Nenhuma troca ainda</Text><Text style={styles.emptyText}>Procure um treinador ou adicione amigos para começar.</Text></View>
      ) : (
        <View style={styles.tradeList}>
          {trades.map((trade) => (
            <Pressable key={trade.id} style={styles.tradeRow} onPress={() => router.push(`/trade/${trade.id}`)}>
              <View style={styles.tradeIcon}><Ionicons name="swap-horizontal" size={20} color={gameTheme.colors.blue} /></View>
              <View style={styles.tradeInfo}><Text style={styles.tradeId}>Troca #{trade.id.slice(0, 8)}</Text><Text style={styles.tradeMeta}>{trade.trade_cards?.length ?? 0} itens • atualizada {new Date(trade.updated_at).toLocaleDateString('pt-BR')}</Text></View>
              <View style={[styles.statusBadge, trade.status === 'completed' && styles.statusCompleted, trade.status === 'cancelled' && styles.statusCancelled]}><Text style={styles.statusText}>{statusLabels[trade.status] ?? String(trade.status).toUpperCase()}</Text></View>
              <Ionicons name="chevron-forward" size={18} color="#617794" />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.securityNote}><Ionicons name="shield-checkmark" size={19} color="#64D09A" /><Text style={styles.note}>O inventário é verificado novamente antes da conclusão e a transferência dos dois lados acontece em uma única transação no servidor.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: '#2B2818', borderWidth: 1, borderColor: '#5A5125' },
  tradeHero:{minHeight:190,borderRadius:28,borderWidth:1,padding:17,overflow:'hidden',position:'relative'},
  tradeHeroGlow:{position:'absolute',right:-70,top:-90,width:280,height:280,borderRadius:999,opacity:.14},
  tradeHeroPokemon:{position:'absolute',right:-25,bottom:-42,width:205,height:220,opacity:.21,transform:[{rotate:'7deg'}]},
  tradeHeroCopy:{maxWidth:680,zIndex:2},
  tradeHeroKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.25},
  tradeHeroTitle:{fontSize:23,fontWeight:'900',marginTop:3},
  tradeHeroText:{fontSize:10,lineHeight:15,marginTop:4,maxWidth:480},
  tradeHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:14,paddingRight:95},
  tradeHeroStat:{minWidth:78,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  tradeHeroValue:{fontSize:16,fontWeight:'900'},
  tradeHeroLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6,marginTop:1},
  noticeText: { flex: 1, color: '#F5EAC4', fontWeight: '700', fontSize: 12 },
  section: { gap: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  link: { color: gameTheme.colors.blue, fontSize: 9, fontWeight: '900' },
  friendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  friendCard: { flexGrow: 1, flexBasis: 250, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17345D' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  friendName: { color: '#fff', fontSize: 13, fontWeight: '900' },
  friendMeta: { color: '#788DA9', fontSize: 9, marginTop: 2 },
  searchSection: { gap: 9 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBox: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1 },
  search: { flex: 1, height: 50, color: '#fff', fontSize: 13 },
  searchButton: { justifyContent: 'center', paddingHorizontal: 17, borderRadius: 14, backgroundColor: gameTheme.colors.blue },
  searchButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  results: { gap: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  playerInfo: { flex: 1 },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  playerLevel: { color: '#788DA9', fontSize: 10, marginTop: 2 },
  tradeButton: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: gameTheme.colors.yellow },
  tradeButtonText: { color: '#07111F', fontSize: 9, fontWeight: '900' },
  refreshButton: { flexDirection: 'row', gap: 6, alignItems: 'center', padding: 8 },
  refresh: { color: '#A8BBD3', fontSize: 9, fontWeight: '900' },
  empty: { alignItems: 'center', padding: 28, borderRadius: 19, backgroundColor: '#0E1A2B', borderWidth: 1, borderColor: '#203650' },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#13243A', marginBottom: 9 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  emptyText: { color: '#8195AF', fontSize: 11, marginTop: 4, textAlign: 'center' },
  tradeList: { gap: 8 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#263E5C' },
  tradeIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102A4E' },
  tradeInfo: { flex: 1 },
  tradeId: { color: '#fff', fontSize: 13, fontWeight: '900' },
  tradeMeta: { color: '#788DA9', fontSize: 9, marginTop: 3 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#243450' },
  statusCompleted: { backgroundColor: '#1D4938' },
  statusCancelled: { backgroundColor: '#4A2730' },
  statusText: { color: '#D4E3F8', fontSize: 8, fontWeight: '900' },
  securityNote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: 13, borderRadius: 15, backgroundColor: '#10251E', borderWidth: 1, borderColor: '#26503E' },
  note: { flex: 1, color: '#8FBBA8', fontSize: 10, lineHeight: 15 },
});
