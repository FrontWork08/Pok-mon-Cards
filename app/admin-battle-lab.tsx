import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { CardPickerModal } from '@/components/CardPickerModal';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { getAdminBattleLabMatrix } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminBattleLabScreen(){
  const{colors}=useAppTheme();const[bag,setBag]=useState<OwnedCardEntry[]>([]);const[selected,setSelected]=useState<Record<string,number>>({});const[picker,setPicker]=useState(false);const[result,setResult]=useState<any>(null);const[working,setWorking]=useState(false);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setBag(await getMyBag());}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar a Bag.');}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const ids=useMemo(()=>Object.entries(selected).filter(([,q])=>q>0).map(([id])=>id).slice(0,8),[selected]);
  const cardById=useMemo(()=>new Map(bag.flatMap((entry)=>entry.cards?[[entry.cards.id,entry.cards] as const]:[])),[bag]);
  async function run(){if(ids.length<2)return;try{setWorking(true);setError(null);setResult(await getAdminBattleLabMatrix(ids,50));}catch(e){setError(e instanceof Error?e.message:'Falha na matriz de simulação.');}finally{setWorking(false);}}
  return <Screen title="Battle Lab • Matriz Admin" subtitle="Cruze até 8 cartas em massa. O servidor não cria batalhas, não dá ELO e não altera inventário.">
    <View style={[styles.notice,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="grid" size={21} color={colors.accent}/><Text style={[styles.noticeText,{color:colors.muted}]}>Com 8 cartas são 28 pares × 50 projeções. O limite existe para evitar carga desnecessária no banco.</Text></View>
    <Pressable onPress={()=>setPicker(true)} style={[styles.select,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="albums" size={21} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.selectTitle,{color:colors.text}]}>{ids.length} carta(s) selecionada(s)</Text><Text style={[styles.small,{color:colors.muted}]}>Escolha entre 2 e 8 cartas</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
    <Pressable disabled={ids.length<2||working} onPress={()=>void run()} style={[styles.run,{backgroundColor:colors.yellow},(ids.length<2||working)&&styles.disabled]}><Text style={styles.runText}>{working?'RODANDO MATRIZ…':'RODAR MATRIZ DE 50 PROJEÇÕES'}</Text></Pressable>
    {working?<ActivityIndicator size="large" color={colors.yellow}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}
    {result?<View style={styles.list}>{(result.pairs??[]).map((p:any,index:number)=>{
      const cardA=cardById.get(String(p.cardA));
      const cardB=cardById.get(String(p.cardB));
      const nameA=cardA?.pokemon_name??String(p.cardA);
      const nameB=cardB?.pokemon_name??String(p.cardB);
      const rateA=Number(p.aWinRate??0);
      const rateB=Number(p.bWinRate??0);
      const winner=rateA===rateB?null:rateA>rateB?nameA:nameB;
      return <View key={p.cardA+'-'+p.cardB+'-'+index} style={[styles.row,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <View style={styles.matchupHead}>
          <View style={{flex:1,minWidth:0}}><Text style={[styles.pair,{color:colors.text}]}>{nameA} × {nameB}</Text><Text style={[styles.cardIds,{color:colors.muted}]}>{p.cardA} × {p.cardB}</Text></View>
          <View style={[styles.winnerBadge,{backgroundColor:winner?colors.accentSoft:colors.surfaceAlt,borderColor:winner?colors.accent:colors.border}]}><Ionicons name={winner?'trophy':'remove'} size={13} color={winner?colors.yellow:colors.muted}/><Text numberOfLines={1} style={[styles.winnerText,{color:winner?colors.text:colors.muted}]}>{winner?`Vencedor: ${winner}`:'Empate projetado'}</Text></View>
        </View>
        <View style={styles.rateRow}>
          <View style={[styles.rateBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.rateName,{color:colors.muted}]}>{nameA}</Text><Text style={[styles.rateValue,{color:'#5AA8FF'}]}>{rateA}%</Text></View>
          <View style={[styles.rateBox,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.rateName,{color:colors.muted}]}>{nameB}</Text><Text style={[styles.rateValue,{color:'#FF735C'}]}>{rateB}%</Text></View>
        </View>
        <Text style={[styles.small,{color:colors.muted}]}>Média {p.averageTurns} turnos • empates {p.draws}</Text>
      </View>;
    })}</View>:null}
    <CardPickerModal visible={picker} title="Matriz Battle Lab" subtitle="Selecione até 8 cartas. Cada carta conta apenas uma vez." bag={bag} mode="quantity" selectedMap={selected} maxPerCard={1} maxTotal={8} displayMode="battle" gameStyle enableCombatSort enableTypeFilter onSelectedMapChange={setSelected} onClose={()=>setPicker(false)} onConfirm={()=>setPicker(false)} confirmLabel="USAR NA MATRIZ"/>
  </Screen>;
}
const styles=StyleSheet.create({notice:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:7.8,lineHeight:12},select:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},selectTitle:{fontSize:11,fontWeight:'900'},small:{fontSize:7.2,lineHeight:11,marginTop:2},run:{alignSelf:'flex-start',borderRadius:12,minHeight:42,paddingHorizontal:12,justifyContent:'center'},runText:{fontSize:8,fontWeight:'900',color:'#07111F'},disabled:{opacity:.4},error:{color:'#FF9EAA',fontSize:9},list:{gap:8},row:{borderRadius:14,borderWidth:1,padding:10,gap:8},matchupHead:{flexDirection:'row',alignItems:'center',gap:8},pair:{fontSize:10.5,fontWeight:'900'},cardIds:{fontSize:6.3,marginTop:2},winnerBadge:{maxWidth:'48%',minHeight:30,borderRadius:10,borderWidth:1,paddingHorizontal:7,flexDirection:'row',alignItems:'center',gap:4},winnerText:{fontSize:6.8,fontWeight:'900',flexShrink:1},rateRow:{flexDirection:'row',gap:7},rateBox:{flex:1,minWidth:0,borderRadius:11,borderWidth:1,padding:8},rateName:{fontSize:6.8,fontWeight:'800'},rateValue:{fontSize:16,fontWeight:'900',marginTop:2}});
