import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getWeeklySummary } from '@/services/playerExperience';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function WeeklySummaryScreen(){
 const router=useRouter();const{colors}=useAppTheme();const[data,setData]=useState<any>(null);const[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{try{setData(await getWeeklySummary());}finally{setLoading(false);}},[]);useFocusEffect(useCallback(()=>{void load();},[load]));
 const best=data?.collection?.bestPull;
 return <Screen title="Resumo Semanal" subtitle="Seus últimos 7 dias em coleção, batalhas, economia, progresso e social.">
  {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}{data?<><View style={[styles.period,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="calendar" size={20} color={colors.accent}/><Text style={[styles.periodText,{color:colors.text}]}>{new Date(data.period.startsAt).toLocaleDateString('pt-BR')} → {new Date(data.period.endsAt).toLocaleDateString('pt-BR')}</Text></View>
   <Text style={[styles.section,{color:colors.text}]}>Coleção</Text><View style={styles.grid}><Metric label="NOVAS ÚNICAS" value={data.collection.newUniqueCards}/><Metric label="TOTAL ÚNICAS" value={data.collection.currentUniqueCards}/><Metric label="PACKS ABERTOS" value={data.packs.opened}/><Metric label="CONQUISTAS" value={data.progress.achievementsUnlocked}/></View>
   {best?<Pressable onPress={()=>router.push(('/card/'+best.cardId) as never)} style={[styles.best,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="sparkles" size={23} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>MELHOR PULL DA SEMANA</Text><Text style={[styles.bestTitle,{color:colors.text}]}>{best.name}</Text><Text style={[styles.small,{color:colors.muted}]}>{formatUsd(Number(best.marketPriceUsd??0))} • {new Date(best.openedAt).toLocaleDateString('pt-BR')}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>:null}
   <Text style={[styles.section,{color:colors.text}]}>Batalhas</Text><View style={styles.grid}><Metric label="PARTIDAS" value={data.battles.played}/><Metric label="VITÓRIAS" value={data.battles.wins}/><Metric label="DERROTAS" value={data.battles.losses}/><Metric label="Δ ELO" value={(data.battles.ratingDelta>=0?'+':'')+data.battles.ratingDelta}/></View>
   <Text style={[styles.section,{color:colors.text}]}>Economia auditada</Text><View style={styles.grid}><Metric label="COINS GANHAS" value={'🪙 '+Number(data.economy.coinsEarned).toLocaleString('pt-BR')}/><Metric label="COINS GASTAS" value={'🪙 '+Number(data.economy.coinsSpent).toLocaleString('pt-BR')}/><Metric label="DIAMANTES GANHOS" value={'💎 '+Number(data.economy.diamondsEarned).toLocaleString('pt-BR')}/><Metric label="DIAMANTES GASTOS" value={'💎 '+Number(data.economy.diamondsSpent).toLocaleString('pt-BR')}/></View>
   <View style={[styles.note,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="information-circle" size={18} color={colors.muted}/><Text style={[styles.noteText,{color:colors.muted}]}>O histórico financeiro completo começa no momento em que a auditoria foi ativada. Packs e batalhas usam seus históricos próprios e podem incluir dias anteriores ao ledger.</Text></View>
  </>:null}
 </Screen>;
}
function Metric({label,value}:{label:string;value:any}){const{colors}=useAppTheme();return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:colors.text}]}>{String(value)}</Text></View>;}
const styles=StyleSheet.create({period:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:7},periodText:{fontSize:9,fontWeight:'900'},section:{fontSize:18,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:7},metric:{flexGrow:1,flexBasis:145,minWidth:135,borderRadius:15,borderWidth:1,padding:10},metricLabel:{fontSize:6.5,fontWeight:'900'},metricValue:{fontSize:18,fontWeight:'900',marginTop:3},best:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},kicker:{fontSize:6.5,fontWeight:'900'},bestTitle:{fontSize:13,fontWeight:'900',marginTop:2},small:{fontSize:7.5,marginTop:2},note:{borderRadius:14,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:7},noteText:{fontSize:7.3,lineHeight:11,flex:1}});
