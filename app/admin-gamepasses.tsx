import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getAdminPlayers, getMyAdminAccess, type AdminPlayer } from '@/services/admin';
import { listBoosterAutoGamepasses, setBoosterAutoGamepass, type BoosterGamepassGrant } from '@/services/adminBoosterGamepass';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminGamepassesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [grants, setGrants] = useState<BoosterGamepassGrant[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const access = await getMyAdminAccess();
      if (!access.isOwner) throw new Error('Somente o dono do jogo pode ativar esta gamepass paga.');
      const [playerRows, grantRows] = await Promise.all([
        getAdminPlayers(),
        listBoosterAutoGamepasses(),
      ]);
      setPlayers(playerRows);
      setGrants(grantRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as gamepasses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const grantByPlayer = useMemo(
    () => new Map(grants.map((grant) => [grant.playerId, grant])),
    [grants],
  );

  const visiblePlayers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players.filter((player) => !term || player.username.toLowerCase().includes(term));
  }, [players, search]);

  async function apply(player: AdminPlayer, enabled: boolean) {
    if (working) return;
    try {
      setWorking(player.id);
      setError(null);
      await setBoosterAutoGamepass([player.id], enabled, note);
      setNotice(enabled
        ? `Gamepass Auto Booster ativada para @${player.username}. Confirme a compra manual antes de usar este botão.`
        : `Gamepass Auto Booster removida de @${player.username}.`);
      if (enabled) setNote('');
      setGrants(await listBoosterAutoGamepasses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a gamepass.');
    } finally {
      setWorking(null);
    }
  }

  function confirm(player: AdminPlayer, enabled: boolean) {
    Alert.alert(
      enabled ? 'Ativar Gamepass Auto Booster?' : 'Remover Gamepass Auto Booster?',
      enabled
        ? `Ative somente depois de confirmar diretamente com @${player.username} o pagamento em dinheiro real. O aplicativo não cobra nada automaticamente.`
        : `Remover a gamepass de @${player.username}? A abertura automática será bloqueada imediatamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: enabled ? 'ATIVAR MANUALMENTE' : 'REMOVER', style: enabled ? 'default' : 'destructive', onPress: () => { void apply(player, enabled); } },
      ],
    );
  }

  return (
    <Screen title="Gamepasses Manuais" subtitle="Ativações pagas confirmadas diretamente pelo dono do jogo.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted}/>
        <Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="flash" size={27} color={colors.yellow}/></View>
        <View style={{flex:1}}>
          <Text style={[styles.kicker,{color:colors.yellow}]}>AUTO BOOSTER GAMEPASS</Text>
          <Text style={[styles.title,{color:colors.text}]}>Venda manual por dinheiro real</Text>
          <Text style={[styles.helper,{color:colors.muted}]}>Não existe checkout nem compra com Coins/Diamantes. O jogador fala com você, você confirma o pagamento fora do app e só então ativa aqui.</Text>
        </View>
      </View>

      {notice ? <Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:'#15392A',borderColor:'#59D49A'}]}><Ionicons name="checkmark-circle" size={18} color="#59D49A"/><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
      {error ? <Pressable onPress={()=>setError(null)} style={[styles.notice,{backgroundColor:'#351A24',borderColor:'#683243'}]}><Ionicons name="alert-circle" size={18} color="#FF8998"/><Text style={[styles.noticeText,{color:'#FFD7DD'}]}>{error}</Text></Pressable> : null}

      <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.label,{color:colors.muted}]}>NOTA DA VENDA / REFERÊNCIA</Text>
        <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder="Ex.: Pago e confirmado em 04/09/2026" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
        <View style={[styles.searchBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
          <Ionicons name="search" size={18} color={colors.muted}/>
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar treinador..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.yellow}/> : null}
      <View style={styles.list}>
        {visiblePlayers.map((player) => {
          const grant = grantByPlayer.get(player.id);
          const active = Boolean(grant?.active);
          return (
            <View key={player.id} style={[styles.row,{backgroundColor:colors.surface,borderColor:active?'#59D49A':colors.border}]}>
              <View style={[styles.avatar,{backgroundColor:active?'#15392A':colors.surfaceAlt}]}>
                <Ionicons name={active?'flash':'person'} size={20} color={active?'#59D49A':colors.accent}/>
              </View>
              <View style={{flex:1,minWidth:0}}>
                <Text style={[styles.name,{color:colors.text}]}>@{player.username}</Text>
                <Text style={[styles.meta,{color:active?'#79E6AE':colors.muted}]}>{active?'GAMEPASS ATIVA':'Não possui'}{grant?.note?` • ${grant.note}`:''}</Text>
              </View>
              <Pressable disabled={working===player.id} onPress={()=>confirm(player,!active)} style={[styles.action,{backgroundColor:active?colors.surfaceAlt:colors.yellow,borderColor:active?'#683243':colors.yellow}]}>
                {working===player.id?<ActivityIndicator size="small" color={active?'#FF8998':'#07111F'}/>:<Ionicons name={active?'close-circle':'checkmark-circle'} size={16} color={active?'#FF8998':'#07111F'}/>} 
                <Text style={[styles.actionText,{color:active?'#FF8998':'#07111F'}]}>{active?'REMOVER':'ATIVAR'}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},
  hero:{borderRadius:22,borderWidth:1,padding:16,flexDirection:'row',gap:12,alignItems:'center'},heroIcon:{width:56,height:56,borderRadius:17,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},title:{fontSize:19,fontWeight:'900',marginTop:2},helper:{fontSize:9,lineHeight:14,marginTop:3},
  notice:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},noticeText:{flex:1,color:'#D9FFEC',fontSize:9,lineHeight:14,fontWeight:'800'},
  panel:{borderRadius:18,borderWidth:1,padding:12,gap:9},label:{fontSize:8,fontWeight:'900',letterSpacing:.8},input:{minHeight:46,borderRadius:12,borderWidth:1,paddingHorizontal:11,fontSize:10},searchBox:{height:45,borderRadius:12,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,height:'100%',fontSize:11},
  list:{gap:8},row:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},avatar:{width:42,height:42,borderRadius:13,alignItems:'center',justifyContent:'center'},name:{fontSize:12,fontWeight:'900'},meta:{fontSize:8,lineHeight:12,marginTop:2},action:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},actionText:{fontSize:8,fontWeight:'900'},
});