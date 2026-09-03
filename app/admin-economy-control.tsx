import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { captureEconomySnapshot, getEconomyTrend } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminEconomyControlScreen(){
  const{colors}=useAppTheme();
  const[data,setData]=useState<any>(null);
  const[working,setWorking]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setError(null);setData(await getEconomyTrend(30));}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar a tendência.');}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function capture(){try{setWorking(true);setError(null);await captureEconomySnapshot();await load();}catch(e){setError(e instanceof Error?e.message:'Não foi possível capturar o snapshot.');}finally{setWorking(false);}}
  const latest=data?.snapshots?.[data.snapshots.length-1];
  return <Screen title="Controle Anti-inflação" subtitle="Snapshots, concentração de saldo, burn/mint e recomendações — sem alterações automáticas.">
    <View style={[styles.safety,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="shield-checkmark" size={24} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.safetyTitle,{color:colors.text}]}>Guardrails consultivos</Text><Text style={[styles.safetyText,{color:colors.muted}]}>Este painel nunca muda preços, recompensas, taxas ou soft cap sozinho. Toda recomendação exige decisão administrativa.</Text></View></View>
    <Pressable disabled={working} onPress={()=>void capture()} style={[styles.capture,{backgroundColor:colors.yellow}]}><Ionicons name="camera" size={18} color="#07111F"/><Text style={styles.captureText}>{working?'CAPTURANDO…':'CAPTURAR SNAPSHOT AGORA'}</Text></Pressable>
    {error?<Text style={styles.error}>{error}</Text>:null}
    {latest?<><Text style={[styles.section,{color:colors.text}]}>Snapshot mais recente</Text>
      <View style={styles.grid}>
        <Metric label="STATUS" value={String(latest.health?.status??'—').toUpperCase()} accent={latest.health?.status==='healthy'?'#65D894':latest.health?.status==='watch'?colors.yellow:'#FF8290'}/>
        <Metric label="BURN / MINT" value={latest.health?.burnToMintRatio==null?'—':String(latest.health.burnToMintRatio)} accent="#5AA8FF"/>
        <Metric label="COINS / JOGADOR" value={Number(latest.health?.coinsPerActivePlayer??0).toLocaleString('pt-BR')} accent="#F0C74E"/>
        <Metric label="TOP 10% SHARE" value={(Number(latest.distribution?.top10CoinShare??0)*100).toFixed(1)+'%'} accent="#9B7BFF"/>
        <Metric label="P90 COINS" value={Number(latest.distribution?.coinP90??0).toLocaleString('pt-BR')} accent="#54C78D"/>
        <Metric label="MEDIANA VENDAS 7D" value={Number(latest.market?.medianSoldCoins7d??0).toLocaleString('pt-BR')} accent="#FF735C"/>
      </View>
    </>:null}
    <Text style={[styles.section,{color:colors.text}]}>Alertas abertos</Text>
    <View style={styles.list}>{(data?.openAlerts??[]).map((a:any)=><View key={a.id} style={[styles.row,{backgroundColor:colors.surface,borderColor:a.severity==='critical'?'#D96575':colors.yellow}]}><Ionicons name={a.severity==='critical'?'warning':'information-circle'} size={19} color={a.severity==='critical'?'#FF8290':colors.yellow}/><View style={{flex:1}}><Text style={[styles.rowTitle,{color:colors.text}]}>{String(a.severity).toUpperCase()}</Text><Text style={[styles.rowText,{color:colors.muted}]}>{a.message}</Text></View></View>)}</View>
    <Text style={[styles.section,{color:colors.text}]}>Recomendações</Text>
    <View style={styles.list}>{(data?.recommendations??[]).map((r:any)=><View key={r.id} style={[styles.row,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="bulb" size={19} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.rowTitle,{color:colors.text}]}>{String(r.type).replaceAll('_',' ').toUpperCase()}</Text><Text style={[styles.rowText,{color:colors.muted}]}>{r.rationale}</Text>{r.suggestedValue!=null?<Text style={[styles.suggested,{color:colors.yellow}]}>Sugestão: {String(r.currentValue)} → {String(r.suggestedValue)}</Text>:null}</View></View>)}</View>
    <Text style={[styles.section,{color:colors.text}]}>Histórico de snapshots</Text>
    <View style={styles.list}>{(data?.snapshots??[]).slice().reverse().map((s:any)=><View key={s.id} style={[styles.snap,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.snapDate,{color:colors.text}]}>{new Date(s.capturedAt).toLocaleString('pt-BR')}</Text><Text style={[styles.rowText,{color:colors.muted}]}>Status {String(s.health?.status??'—').toUpperCase()} • burn/mint {s.health?.burnToMintRatio??'—'} • coins/jogador {Number(s.health?.coinsPerActivePlayer??0).toLocaleString('pt-BR')}</Text></View>)}</View>
  </Screen>;
}
function Metric({label,value,accent}:{label:string;value:string;accent:string}){const{colors}=useAppTheme();return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:accent}]}>{value}</Text></View>;}
const styles=StyleSheet.create({safety:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row',gap:9,alignItems:'center'},safetyTitle:{fontSize:12,fontWeight:'900'},safetyText:{fontSize:8,lineHeight:12,marginTop:2},capture:{alignSelf:'flex-start',borderRadius:12,paddingHorizontal:12,minHeight:42,flexDirection:'row',alignItems:'center',gap:7},captureText:{fontSize:8,fontWeight:'900',color:'#07111F'},error:{color:'#FF9EAA',fontSize:9},section:{fontSize:18,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:150,minWidth:140,borderRadius:15,borderWidth:1,padding:10},metricLabel:{fontSize:6.5,fontWeight:'900'},metricValue:{fontSize:18,fontWeight:'900',marginTop:3},list:{gap:7},row:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},rowTitle:{fontSize:9,fontWeight:'900'},rowText:{fontSize:7.5,lineHeight:11,marginTop:2},suggested:{fontSize:8,fontWeight:'900',marginTop:4},snap:{borderRadius:13,borderWidth:1,padding:9},snapDate:{fontSize:8.5,fontWeight:'900'}});
