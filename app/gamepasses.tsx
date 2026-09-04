import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getMyGamepasses, setLucky2xEnabled, type GamepassItem, type MyGamepasses } from '@/services/gamepasses';
import { getBoosterPerks, type BoosterPerks } from '@/services/boosterPerks';
import { useAppTheme } from '@/theme/ThemeProvider';
import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';

const CATEGORY_LABELS: Record<string, string> = {
  booster: 'BOOSTERS', identity: 'IDENTIDADE', collection: 'COLEÇÃO', battle: 'BATALHA',
  market: 'MARKETPLACE', cosmetic: 'COSMÉTICOS', guild: 'GUILDA', bundle: 'PACOTE', convenience: 'CONVENIÊNCIA',
};

export default function GamepassesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [state, setState] = useState<MyGamepasses | null>(null);
  const [perks, setPerks] = useState<BoosterPerks | null>(null);
  const [selectedId, setSelectedId] = useState<string>('trainer_plus');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [nextState, nextPerks] = await Promise.all([getMyGamepasses(), getBoosterPerks().catch(() => null)]);
      setState(nextState);
      setPerks(nextPerks);
      setSelectedId((current) => nextState.items.some((item) => item.id === current) ? current : nextState.items[0]?.id ?? 'trainer_plus');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as Gamepasses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selected = useMemo(() => state?.items.find((item) => item.id === selectedId) ?? null, [selectedId, state]);
  const activeCount = useMemo(() => state?.items.filter((item) => item.active).length ?? 0, [state]);
  const directCount = useMemo(() => state?.items.filter((item) => item.activeDirect).length ?? 0, [state]);
  const benefits = Array.isArray(selected?.metadata?.benefits) ? selected!.metadata.benefits!.map(String) : [];

  async function toggleLucky() {
    if (!perks?.luckyVaultGamepass || working) return;
    try {
      setWorking(true);
      setError(null);
      const result = await setLucky2xEnabled(!perks.lucky2xEnabled);
      setNotice(result.enabled ? '2× Lucky ativado. As próximas aberturas voltarão a consumir cargas.' : '2× Lucky pausado. Suas cargas ficam guardadas até você reativar.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível alterar o Lucky Vault.');
    } finally {
      setWorking(false);
    }
  }

  function openBenefit(item: GamepassItem) {
    const route = typeof item.metadata?.route === 'string' ? item.metadata.route : null;
    if (!route) return;
    router.push(route as never);
  }

  return (
    <Screen title="Gamepasses" subtitle="Benefícios permanentes de conveniência e personalização. Nenhuma Gamepass aumenta dano, HP ou ELO.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="diamond" size={30} color={colors.yellow}/></View>
        <View style={{flex:1,minWidth:0}}>
          <Text style={[styles.kicker,{color:colors.yellow}]}>GAMEPASSES DO TREINADOR</Text>
          <Text style={[styles.heroTitle,{color:colors.text}]}>{activeCount} benefício(s) ativo(s)</Text>
          <Text style={[styles.helper,{color:colors.muted}]}>Compra somente por dinheiro real. Fale com {state?.contactOwnerUsername ? `@${state.contactOwnerUsername}` : 'o dono do jogo'}; depois do pagamento confirmado, a ativação é feita manualmente no Admin.</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label="ATIVAS" value={String(activeCount)} colors={colors}/>
        <Metric label="DIRETAS" value={String(directCount)} colors={colors}/>
        <Metric label="CATÁLOGO" value={String(state?.items.length ?? 0)} colors={colors}/>
      </View>

      {notice ? <Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:'#15392A',borderColor:'#59D49A'}]}><Ionicons name="checkmark-circle" size={18} color="#59D49A"/><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
      {error ? <Pressable onPress={()=>setError(null)} style={[styles.notice,{backgroundColor:'#351A24',borderColor:'#683243'}]}><Ionicons name="alert-circle" size={18} color="#FF8998"/><Text style={[styles.noticeText,{color:'#FFD7DD'}]}>{error}</Text></Pressable> : null}
      {loading && !state ? <ActivityIndicator size="large" color={colors.yellow}/> : null}

      {state ? <>
        <View style={[styles.selectorPanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[styles.label,{color:colors.muted}]}>GAMEPASS SELECIONADA</Text>
          <Pressable onPress={()=>setPickerOpen(true)} style={[styles.selector,{backgroundColor:colors.surfaceAlt,borderColor:selected?.active?'#59D49A':colors.accent}]}>
            <View style={[styles.selectorIcon,{backgroundColor:selected?.active?'#15392A':colors.accentSoft}]}>
              <Ionicons name={(selected?.icon ?? 'sparkles') as keyof typeof Ionicons.glyphMap} size={23} color={selected?.active?'#59D49A':colors.accent}/>
            </View>
            <View style={{flex:1,minWidth:0}}>
              <Text numberOfLines={1} style={[styles.selectorName,{color:colors.text}]}>{selected?.name ?? 'Escolha uma Gamepass'}</Text>
              <Text style={[styles.selectorMeta,{color:selected?.active?'#79E6AE':colors.muted}]}>{selected?.active ? (selected.viaTrainerPlus ? 'ATIVA PELO TRAINER PLUS' : 'ATIVA') : 'NÃO POSSUI'}</Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.muted}/>
          </Pressable>
        </View>

        {selected ? <View style={[styles.detail,{backgroundColor:colors.surface,borderColor:selected.active?'#59D49A':colors.border}]}>
          <View style={styles.detailHead}>
            <View style={[styles.bigIcon,{backgroundColor:selected.active?'#15392A':colors.accentSoft}]}><Ionicons name={selected.icon as keyof typeof Ionicons.glyphMap} size={28} color={selected.active?'#59D49A':colors.yellow}/></View>
            <View style={{flex:1,minWidth:0}}>
              <Text style={[styles.category,{color:colors.yellow}]}>{CATEGORY_LABELS[selected.category] ?? selected.category.toUpperCase()}</Text>
              <Text style={[styles.detailTitle,{color:colors.text}]}>{selected.name}</Text>
              <Text style={[styles.status,{color:selected.active?'#79E6AE':'#FFCA72'}]}>{selected.active ? (selected.viaTrainerPlus ? '✓ Incluída no seu Trainer Plus' : '✓ Ativa diretamente na sua conta') : 'DINHEIRO REAL • ATIVAÇÃO MANUAL'}</Text>
            </View>
          </View>
          <Text style={[styles.description,{color:colors.muted}]}>{selected.description}</Text>

          {benefits.length ? <View style={styles.benefits}>{benefits.map((benefit,index)=><View key={`${selected.id}-${index}`} style={styles.benefit}><Ionicons name="checkmark-circle" size={16} color={selected.active?'#59D49A':colors.accent}/><Text style={[styles.benefitText,{color:colors.text}]}>{benefit}</Text></View>)}</View> : null}

          {selected.id === 'trainer_plus' ? <View style={[styles.bundleInfo,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="layers" size={18} color={colors.yellow}/><Text style={[styles.bundleText,{color:colors.text}]}>Trainer Plus libera automaticamente os passes marcados como incluídos no pacote, sem criar duplicatas na conta. Se ele for removido, Gamepasses compradas separadamente continuam ativas.</Text></View> : null}

          {selected.id === 'lucky_vault' && selected.active ? <Pressable disabled={working} onPress={()=>void toggleLucky()} style={[styles.primary,{backgroundColor:perks?.lucky2xEnabled?'#59D49A':colors.yellow}]}>
            {working ? <ActivityIndicator color="#07111F"/> : <Ionicons name={perks?.lucky2xEnabled?'pause':'play'} size={18} color="#07111F"/>}
            <Text style={styles.primaryText}>{perks?.lucky2xEnabled ? `PAUSAR 2× LUCKY • ${perks.lucky2xUses} CARGA(S)` : `REATIVAR 2× LUCKY • ${perks?.lucky2xUses ?? 0} CARGA(S)`}</Text>
          </Pressable> : null}

          {selected.active && typeof selected.metadata?.route === 'string' ? <Pressable onPress={()=>openBenefit(selected)} style={[styles.primary,{backgroundColor:colors.yellow}]}><Ionicons name="arrow-forward-circle" size={18} color="#07111F"/><Text style={styles.primaryText}>ABRIR RECURSO</Text></Pressable> : null}

          {!selected.active ? <View style={[styles.buyBox,{backgroundColor:'#3B2313',borderColor:'#735022'}]}><Ionicons name="cash-outline" size={20} color="#FFD447"/><View style={{flex:1}}><Text style={styles.buyTitle}>COMPRAR COM O DONO</Text><Text style={styles.buyText}>Esta Gamepass não aceita Coins nem Diamantes. Entre em contato com {state.contactOwnerUsername ? `@${state.contactOwnerUsername}` : 'o dono do jogo'} e, após o pagamento real ser confirmado, ela será ativada manualmente na sua conta.</Text></View></View> : null}
        </View> : null}
      </> : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={()=>setPickerOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={()=>setPickerOpen(false)}/>
          <View style={[styles.picker,{backgroundColor:colors.bg,borderColor:colors.border}]}>
            <View style={styles.pickerHead}><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>CATÁLOGO COMPLETO</Text><Text style={[styles.pickerTitle,{color:colors.text}]}>Escolha uma Gamepass</Text></View><Pressable onPress={()=>setPickerOpen(false)} style={[styles.close,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="close" size={20} color={colors.text}/></Pressable></View>
            <FlatList
              {...VIRTUAL_LIST_PERF_PROPS}
              data={state?.items ?? []}
              keyExtractor={(item)=>item.id}
              contentContainerStyle={styles.pickerList}
              renderItem={({item})=><Pressable onPress={()=>{setSelectedId(item.id);setPickerOpen(false);}} style={[styles.passRow,{backgroundColor:colors.surface,borderColor:item.active?'#59D49A':colors.border}]}>
                <View style={[styles.rowIcon,{backgroundColor:item.active?'#15392A':colors.surfaceAlt}]}><Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={19} color={item.active?'#59D49A':colors.accent}/></View>
                <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.rowName,{color:colors.text}]}>{item.name}</Text><Text numberOfLines={1} style={[styles.rowMeta,{color:item.active?'#79E6AE':colors.muted}]}>{item.active ? (item.viaTrainerPlus?'TRAINER PLUS':'ATIVA') : (CATEGORY_LABELS[item.category] ?? item.category.toUpperCase())}</Text></View>
                <Ionicons name={item.active?'checkmark-circle':'chevron-forward'} size={18} color={item.active?'#59D49A':colors.muted}/>
              </Pressable>}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Metric({label,value,colors}:{label:string;value:string;colors:any}) {
  return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:colors.text}]}>{value}</Text></View>;
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},
  hero:{borderRadius:22,borderWidth:1,padding:15,flexDirection:'row',gap:12,alignItems:'center'},heroIcon:{width:60,height:60,borderRadius:18,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},heroTitle:{fontSize:20,fontWeight:'900',marginTop:2},helper:{fontSize:9,lineHeight:14,marginTop:3},
  metrics:{flexDirection:'row',gap:8,flexWrap:'wrap'},metric:{flexGrow:1,flexBasis:100,borderRadius:14,borderWidth:1,padding:10},metricLabel:{fontSize:7,fontWeight:'900'},metricValue:{fontSize:20,fontWeight:'900',marginTop:2},
  notice:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},noticeText:{flex:1,color:'#D9FFEC',fontSize:9,lineHeight:14,fontWeight:'800'},
  selectorPanel:{borderRadius:18,borderWidth:1,padding:12,gap:7},label:{fontSize:8,fontWeight:'900',letterSpacing:.8},selector:{minHeight:66,borderRadius:14,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},selectorIcon:{width:45,height:45,borderRadius:13,alignItems:'center',justifyContent:'center'},selectorName:{fontSize:13,fontWeight:'900'},selectorMeta:{fontSize:7.5,fontWeight:'900',marginTop:3},
  detail:{borderRadius:20,borderWidth:1,padding:14,gap:12},detailHead:{flexDirection:'row',gap:10,alignItems:'center'},bigIcon:{width:57,height:57,borderRadius:17,alignItems:'center',justifyContent:'center'},category:{fontSize:7,fontWeight:'900',letterSpacing:1},detailTitle:{fontSize:21,fontWeight:'900',marginTop:2},status:{fontSize:7.5,fontWeight:'900',marginTop:3},description:{fontSize:10,lineHeight:15},benefits:{gap:7},benefit:{flexDirection:'row',alignItems:'center',gap:7},benefitText:{fontSize:9,fontWeight:'700',flex:1},bundleInfo:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'flex-start'},bundleText:{flex:1,fontSize:8.5,lineHeight:13,fontWeight:'700'},primary:{minHeight:46,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:12},primaryText:{color:'#07111F',fontSize:9,fontWeight:'900'},buyBox:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',gap:9},buyTitle:{color:'#FFD447',fontSize:8,fontWeight:'900'},buyText:{color:'#FFE9B6',fontSize:8,lineHeight:12,marginTop:3},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.7)',justifyContent:'flex-end'},picker:{height:'82%',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,paddingTop:14},pickerHead:{flexDirection:'row',alignItems:'center',paddingHorizontal:14,paddingBottom:10},pickerTitle:{fontSize:23,fontWeight:'900',marginTop:2},close:{width:40,height:40,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},pickerList:{padding:12,gap:8,paddingBottom:28},passRow:{minHeight:67,borderRadius:15,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},rowIcon:{width:44,height:44,borderRadius:13,alignItems:'center',justifyContent:'center'},rowName:{fontSize:12,fontWeight:'900'},rowMeta:{fontSize:7,fontWeight:'900',marginTop:3},
});
