import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getAdminPlayers, getMyAdminAccess, type AdminPlayer } from '@/services/admin';
import { listGamepasses, setGamepass, type GamepassGrant } from '@/services/adminBoosterGamepass';
import { getMyGamepasses, type GamepassItem, type MyGamepasses } from '@/services/gamepasses';
import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminGamepassesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [catalog, setCatalog] = useState<MyGamepasses | null>(null);
  const [grants, setGrants] = useState<GamepassGrant[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPassId, setSelectedPassId] = useState<string>('booster_auto_open');
  const [playerPickerOpen, setPlayerPickerOpen] = useState(false);
  const [passPickerOpen, setPassPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const access = await getMyAdminAccess();
      if (!access.isOwner && !access.permissions.includes('gamepasses_manage')) throw new Error('Sua conta de admin não possui permissão para gerenciar Gamepasses.');
      const [playerRows, grantRows, passState] = await Promise.all([
        getAdminPlayers(), listGamepasses(), getMyGamepasses(),
      ]);
      setPlayers(playerRows);
      setGrants(grantRows);
      setCatalog(passState);
      setSelectedPlayerId((current) => current && playerRows.some((p)=>p.id===current) ? current : playerRows[0]?.id ?? null);
      setSelectedPassId((current) => passState.items.some((p)=>p.id===current) ? current : passState.items[0]?.id ?? 'booster_auto_open');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as Gamepasses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selectedPlayer = useMemo(() => players.find((player)=>player.id===selectedPlayerId) ?? null, [players, selectedPlayerId]);
  const selectedPass = useMemo(() => catalog?.items.find((pass)=>pass.id===selectedPassId) ?? null, [catalog, selectedPassId]);
  const filteredPlayers = useMemo(() => {
    const term=search.trim().toLowerCase();
    return players.filter((player)=>!term||player.username.toLowerCase().includes(term));
  }, [players,search]);

  const directGrant = useMemo(() => grants.find((g)=>g.playerId===selectedPlayerId&&g.gamepassId===selectedPassId) ?? null, [grants,selectedPassId,selectedPlayerId]);
  const trainerPlusGrant = useMemo(() => grants.find((g)=>g.playerId===selectedPlayerId&&g.gamepassId==='trainer_plus'&&g.active) ?? null, [grants,selectedPlayerId]);
  const effectiveActive = Boolean(directGrant?.active || (selectedPass?.includedInTrainerPlus && trainerPlusGrant));
  const viaTrainerPlus = Boolean(!directGrant?.active && selectedPass?.includedInTrainerPlus && trainerPlusGrant);

  async function apply(enabled:boolean) {
    if (!selectedPlayer || !selectedPass || working) return;
    try {
      setWorking(true); setError(null);
      await setGamepass([selectedPlayer.id], selectedPass.id, enabled, note);
      setNotice(enabled ? `${selectedPass.name} ativada para @${selectedPlayer.username}.` : `${selectedPass.name} removida de @${selectedPlayer.username}.`);
      if (enabled) setNote('');
      setGrants(await listGamepasses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a Gamepass.');
    } finally { setWorking(false); }
  }

  function confirm(enabled:boolean) {
    if (!selectedPlayer || !selectedPass) return;
    Alert.alert(
      enabled ? `Ativar ${selectedPass.name}?` : `Remover ${selectedPass.name}?`,
      enabled
        ? `Ative somente depois de confirmar o pagamento em dinheiro real de @${selectedPlayer.username}. O app não cobra automaticamente.`
        : `Remover a ativação direta de @${selectedPlayer.username}?${viaTrainerPlus ? '\n\nEste benefício continuará ativo enquanto o Trainer Plus estiver ativo.' : ''}`,
      [{text:'Cancelar',style:'cancel'},{text:enabled?'ATIVAR MANUALMENTE':'REMOVER',style:enabled?'default':'destructive',onPress:()=>{void apply(enabled);}}],
    );
  }

  return (
    <Screen title="Gamepasses Manuais" subtitle="Central autorizada para registrar compras reais e ativar ou revogar Gamepasses.">
      <Pressable style={styles.back} onPress={()=>goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>

      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="key" size={28} color={colors.yellow}/></View>
        <View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>VENDAS / GAMEPASSES</Text><Text style={[styles.title,{color:colors.text}]}>Ativação manual autorizada</Text><Text style={[styles.helper,{color:colors.muted}]}>Coins e Diamantes nunca compram estas Gamepasses. Selecione o treinador e o passe depois de confirmar o pagamento fora do aplicativo.</Text></View>
      </View>

      {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:'#15392A',borderColor:'#59D49A'}]}><Ionicons name="checkmark-circle" size={18} color="#59D49A"/><Text style={styles.noticeText}>{notice}</Text></Pressable>:null}
      {error?<Pressable onPress={()=>setError(null)} style={[styles.notice,{backgroundColor:'#351A24',borderColor:'#683243'}]}><Ionicons name="alert-circle" size={18} color="#FF8998"/><Text style={[styles.noticeText,{color:'#FFD7DD'}]}>{error}</Text></Pressable>:null}
      {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}

      {!loading?<View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.label,{color:colors.muted}]}>1. TREINADOR</Text>
        <Pressable onPress={()=>setPlayerPickerOpen(true)} style={[styles.selector,{backgroundColor:colors.surfaceAlt,borderColor:colors.accent}]}><Ionicons name="person-circle" size={23} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.selectorName,{color:colors.text}]}>{selectedPlayer?`@${selectedPlayer.username}`:'Escolher treinador'}</Text><Text style={[styles.selectorMeta,{color:colors.muted}]}>Toque para pesquisar entre {players.length} conta(s)</Text></View><Ionicons name="chevron-down" size={18} color={colors.muted}/></Pressable>

        <Text style={[styles.label,{color:colors.muted}]}>2. GAMEPASS</Text>
        <Pressable onPress={()=>setPassPickerOpen(true)} style={[styles.selector,{backgroundColor:colors.surfaceAlt,borderColor:effectiveActive?'#59D49A':colors.accent}]}><Ionicons name={(selectedPass?.icon??'sparkles') as keyof typeof Ionicons.glyphMap} size={22} color={effectiveActive?'#59D49A':colors.yellow}/><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.selectorName,{color:colors.text}]}>{selectedPass?.name??'Escolher Gamepass'}</Text><Text style={[styles.selectorMeta,{color:effectiveActive?'#79E6AE':colors.muted}]}>{effectiveActive?(viaTrainerPlus?'ATIVA VIA TRAINER PLUS':'ATIVA DIRETAMENTE'):'NÃO POSSUI'}</Text></View><Ionicons name="chevron-down" size={18} color={colors.muted}/></Pressable>

        <Text style={[styles.label,{color:colors.muted}]}>3. NOTA DA VENDA / REFERÊNCIA</Text>
        <TextInput value={note} onChangeText={setNote} maxLength={300} placeholder="Ex.: Pago e confirmado em 04/09/2026" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>

        {selectedPass&&selectedPlayer?<View style={[styles.statusBox,{backgroundColor:effectiveActive?'#15392A':colors.surfaceAlt,borderColor:effectiveActive?'#59D49A':colors.border}]}><Ionicons name={effectiveActive?'checkmark-circle':'lock-open'} size={21} color={effectiveActive?'#59D49A':colors.muted}/><View style={{flex:1}}><Text style={[styles.statusTitle,{color:colors.text}]}>{effectiveActive?'BENEFÍCIO ATIVO':'SEM GAMEPASS'}</Text><Text style={[styles.statusText,{color:effectiveActive?'#A7EBC8':colors.muted}]}>{viaTrainerPlus?`@${selectedPlayer.username} recebe ${selectedPass.name} pelo Trainer Plus.`:directGrant?.active?`Ativação direta registrada${directGrant.note?` • ${directGrant.note}`:''}.`:`@${selectedPlayer.username} ainda não possui ${selectedPass.name}.`}</Text></View></View>:null}

        <View style={styles.actions}>
          <Pressable disabled={!selectedPlayer||!selectedPass||working||Boolean(directGrant?.active)} onPress={()=>confirm(true)} style={[styles.action,{backgroundColor:colors.yellow},(!selectedPlayer||!selectedPass||working||Boolean(directGrant?.active))&&styles.disabled]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="checkmark-circle" size={18} color="#07111F"/>}<Text style={styles.actionText}>ATIVAR</Text></Pressable>
          <Pressable disabled={!directGrant?.active||working} onPress={()=>confirm(false)} style={[styles.remove,{borderColor:'#683243'},(!directGrant?.active||working)&&styles.disabled]}><Ionicons name="close-circle" size={18} color="#FF8998"/><Text style={styles.removeText}>REMOVER DIRETA</Text></Pressable>
        </View>
      </View>:null}

      <Modal visible={playerPickerOpen} transparent animationType="fade" onRequestClose={()=>setPlayerPickerOpen(false)}>
        <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setPlayerPickerOpen(false)}/><View style={[styles.picker,{backgroundColor:colors.bg,borderColor:colors.border}]}>
          <View style={styles.pickerHead}><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>CONTAS</Text><Text style={[styles.pickerTitle,{color:colors.text}]}>Escolher treinador</Text></View><Pressable onPress={()=>setPlayerPickerOpen(false)}><Ionicons name="close" size={23} color={colors.text}/></Pressable></View>
          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Buscar treinador..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>
          <FlatList {...VIRTUAL_LIST_PERF_PROPS} data={filteredPlayers} keyExtractor={(p)=>p.id} contentContainerStyle={styles.list} renderItem={({item})=><Pressable onPress={()=>{setSelectedPlayerId(item.id);setPlayerPickerOpen(false);setSearch('');}} style={[styles.row,{backgroundColor:colors.surface,borderColor:item.id===selectedPlayerId?colors.accent:colors.border}]}><Ionicons name="person" size={18} color={colors.accent}/><Text style={[styles.rowName,{color:colors.text}]}>@{item.username}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>}/>
        </View></View>
      </Modal>

      <Modal visible={passPickerOpen} transparent animationType="fade" onRequestClose={()=>setPassPickerOpen(false)}>
        <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setPassPickerOpen(false)}/><View style={[styles.picker,{backgroundColor:colors.bg,borderColor:colors.border}]}>
          <View style={styles.pickerHead}><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>16 GAMEPASSES</Text><Text style={[styles.pickerTitle,{color:colors.text}]}>Escolher benefício</Text></View><Pressable onPress={()=>setPassPickerOpen(false)}><Ionicons name="close" size={23} color={colors.text}/></Pressable></View>
          <FlatList {...VIRTUAL_LIST_PERF_PROPS} data={catalog?.items??[]} keyExtractor={(p)=>p.id} contentContainerStyle={styles.list} renderItem={({item}:{item:GamepassItem})=><Pressable onPress={()=>{setSelectedPassId(item.id);setPassPickerOpen(false);}} style={[styles.row,{backgroundColor:colors.surface,borderColor:item.id===selectedPassId?colors.yellow:colors.border}]}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.rowName,{color:colors.text}]}>{item.name}</Text><Text style={[styles.rowSub,{color:colors.muted}]}>{item.includedInTrainerPlus?'INCLUÍDA NO TRAINER PLUS':item.category.toUpperCase()}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>}/>
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},hero:{borderRadius:22,borderWidth:1,padding:16,flexDirection:'row',gap:12,alignItems:'center'},heroIcon:{width:56,height:56,borderRadius:17,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},title:{fontSize:19,fontWeight:'900',marginTop:2},helper:{fontSize:9,lineHeight:14,marginTop:3},notice:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},noticeText:{flex:1,color:'#D9FFEC',fontSize:9,lineHeight:14,fontWeight:'800'},
  panel:{borderRadius:18,borderWidth:1,padding:12,gap:9},label:{fontSize:8,fontWeight:'900',letterSpacing:.8,marginTop:3},selector:{minHeight:56,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:9},selectorName:{fontSize:12,fontWeight:'900'},selectorMeta:{fontSize:7.5,fontWeight:'800',marginTop:2},input:{minHeight:46,borderRadius:12,borderWidth:1,paddingHorizontal:11,fontSize:10},statusBox:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},statusTitle:{fontSize:8,fontWeight:'900'},statusText:{fontSize:8,lineHeight:12,marginTop:2},actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},action:{minHeight:44,borderRadius:12,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,flexGrow:1},actionText:{color:'#07111F',fontSize:9,fontWeight:'900'},remove:{minHeight:44,borderRadius:12,borderWidth:1,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},removeText:{color:'#FF8998',fontSize:8,fontWeight:'900'},disabled:{opacity:.4},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.7)',justifyContent:'flex-end'},picker:{height:'82%',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,paddingTop:14},pickerHead:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingBottom:10},pickerTitle:{fontSize:23,fontWeight:'900',marginTop:2},searchBox:{height:46,borderRadius:12,borderWidth:1,paddingHorizontal:11,marginHorizontal:12,marginBottom:8,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,height:'100%',fontSize:11},list:{padding:12,gap:7,paddingBottom:28},row:{minHeight:58,borderRadius:13,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},rowName:{flex:1,fontSize:11,fontWeight:'900'},rowSub:{fontSize:7,fontWeight:'800',marginTop:2},
});
