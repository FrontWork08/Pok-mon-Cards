import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { CardPickerModal } from '@/components/CardPickerModal';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { getBattleLabMatchup } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function BattleLabScreen(){
  const{colors}=useAppTheme();
  const[bag,setBag]=useState<OwnedCardEntry[]>([]);
  const[a,setA]=useState<string|null>(null);const[b,setB]=useState<string|null>(null);
  const[picker,setPicker]=useState<'a'|'b'|null>(null);
  const[result,setResult]=useState<any>(null);const[working,setWorking]=useState(false);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setBag(await getMyBag());}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar sua Bag.');}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const entryA=useMemo(()=>bag.find(x=>x.cards?.id===a),[bag,a]);const entryB=useMemo(()=>bag.find(x=>x.cards?.id===b),[bag,b]);
  async function run(){if(!a||!b||a===b)return;try{setWorking(true);setError(null);setResult(await getBattleLabMatchup(a,b,100));}catch(e){setError(e instanceof Error?e.message:'Não foi possível rodar o Battle Lab.');}finally{setWorking(false);}}
  return <Screen title="Battle Lab" subtitle="Simule confrontos sem criar batalha real, gastar cartas, dar ELO ou recompensas.">
    <View style={[styles.notice,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="flask" size={22} color={colors.accent}/><Text style={[styles.noticeText,{color:colors.muted}]}>Modelo de projeção separado do servidor competitivo. Usa stats game_v1, golpes, STAB, tipos, habilidades defensivas, precisão, crítico, Speed e variação de dano. Não altera nenhum dado do jogo.</Text></View>
    <View style={styles.matchup}>
      <PickCard label="CARTA A" entry={entryA} onPress={()=>setPicker('a')} accent="#5AA8FF"/>
      <Text style={[styles.vs,{color:colors.yellow}]}>VS</Text>
      <PickCard label="CARTA B" entry={entryB} onPress={()=>setPicker('b')} accent="#FF735C"/>
    </View>
    <Pressable disabled={!a||!b||a===b||working} onPress={()=>void run()} style={[styles.run,{backgroundColor:colors.yellow},(!a||!b||a===b||working)&&styles.disabled]}><Ionicons name="play" size={18} color="#07111F"/><Text style={styles.runText}>{working?'SIMULANDO 100 CENÁRIOS…':'SIMULAR 100 CENÁRIOS'}</Text></Pressable>
    {working?<ActivityIndicator size="large" color={colors.yellow}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}
    {result?<><View style={styles.grid}>
      <Metric label={result.cardA?.identifier??'Carta A'} value={String(result.aWinRate)+'%'} sub={result.aWins+' vitórias'} accent="#5AA8FF"/>
      <Metric label={result.cardB?.identifier??'Carta B'} value={String(result.bWinRate)+'%'} sub={result.bWins+' vitórias'} accent="#FF735C"/>
      <Metric label="EMPATES" value={String(result.draws)} sub={result.iterations+' simulações'} accent="#9B7BFF"/>
      <Metric label="TURNOS MÉDIOS" value={String(result.averageTurns)} sub="projeção" accent="#F0C74E"/>
    </View>
    <View style={[styles.bestMoves,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.section,{color:colors.text}]}>Leitura do confronto</Text><MoveLine side="A" data={result.sample?.a?.bestMove}/><MoveLine side="B" data={result.sample?.b?.bestMove}/><Text style={[styles.disclaimer,{color:colors.muted}]}>O resultado é diagnóstico. Status complexos, decisões humanas e todas as interações do motor vivo podem mudar uma partida real.</Text></View>
    </>:null}
    <CardPickerModal visible={picker==='a'} title="Escolher Carta A" subtitle="Selecione uma carta da sua Bag para o Battle Lab." bag={bag} mode="single" selectedId={a} displayMode="battle" gameStyle enableCombatSort enableTypeFilter onSelectedIdChange={setA} onClose={()=>setPicker(null)} onConfirm={()=>setPicker(null)} confirmLabel="USAR COMO CARTA A"/>
    <CardPickerModal visible={picker==='b'} title="Escolher Carta B" subtitle="Selecione o adversário da simulação." bag={bag} mode="single" selectedId={b} displayMode="battle" gameStyle enableCombatSort enableTypeFilter onSelectedIdChange={setB} onClose={()=>setPicker(null)} onConfirm={()=>setPicker(null)} confirmLabel="USAR COMO CARTA B"/>
  </Screen>;
}
function PickCard({label,entry,onPress,accent}:{label:string;entry:OwnedCardEntry|undefined;onPress:()=>void;accent:string}){const{colors}=useAppTheme();return <Pressable onPress={onPress} style={[styles.pick,{backgroundColor:colors.surface,borderColor:entry?accent:colors.border}]}>{entry?.cards?.image_small?<Image source={{uri:entry.cards.image_small}} style={styles.image} resizeMode="contain"/>:<Ionicons name="add-circle-outline" size={36} color={colors.muted}/>}<Text style={[styles.pickLabel,{color:accent}]}>{label}</Text><Text numberOfLines={1} style={[styles.pickName,{color:colors.text}]}>{entry?.cards?.pokemon_name??'Escolher carta'}</Text></Pressable>;}
function Metric({label,value,sub,accent}:{label:string;value:string;sub:string;accent:string}){const{colors}=useAppTheme();return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.metricLabel,{color:colors.muted}]}>{label.toUpperCase()}</Text><Text style={[styles.metricValue,{color:accent}]}>{value}</Text><Text style={[styles.small,{color:colors.muted}]}>{sub}</Text></View>;}
function MoveLine({side,data}:{side:string;data:any}){const{colors}=useAppTheme();return <View style={[styles.move,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.moveSide,{color:colors.accent}]}>{side}</Text><View style={{flex:1}}><Text style={[styles.moveName,{color:colors.text}]}>{data?.name??'—'}</Text><Text style={[styles.small,{color:colors.muted}]}>Poder {data?.power??'—'} • {data?.type??'—'} • x{data?.effectiveness??'—'} • dano projetado {data?.projectedDamage??'—'}</Text></View></View>;}
const styles=StyleSheet.create({notice:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:7.8,lineHeight:12},matchup:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},pick:{flexGrow:1,flexBasis:220,minWidth:190,borderRadius:18,borderWidth:1,padding:10,alignItems:'center'},image:{width:110,height:150},pickLabel:{fontSize:7,fontWeight:'900',marginTop:4},pickName:{fontSize:12,fontWeight:'900',marginTop:2},vs:{fontSize:24,fontWeight:'900'},run:{alignSelf:'center',minHeight:46,borderRadius:13,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:7},runText:{fontSize:9,fontWeight:'900',color:'#07111F'},disabled:{opacity:.4},error:{color:'#FF9EAA',fontSize:9},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:145,minWidth:135,borderRadius:15,borderWidth:1,padding:10},metricLabel:{fontSize:6.5,fontWeight:'900'},metricValue:{fontSize:21,fontWeight:'900',marginTop:3},small:{fontSize:7.2,lineHeight:11,marginTop:2},bestMoves:{borderRadius:17,borderWidth:1,padding:11,gap:7},section:{fontSize:15,fontWeight:'900'},move:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},moveSide:{fontSize:16,fontWeight:'900',width:22},moveName:{fontSize:9.5,fontWeight:'900'},disclaimer:{fontSize:7.2,lineHeight:11}});
