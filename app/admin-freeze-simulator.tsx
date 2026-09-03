import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getFreezeSimulation } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminFreezeSimulatorScreen(){
  const{colors}=useAppTheme();
  const[data,setData]=useState<any>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
  const run=useCallback(async()=>{try{setLoading(true);setError(null);setData(await getFreezeSimulation());}catch(e){setError(e instanceof Error?e.message:'Não foi possível simular o freeze.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void run();},[run]));
  const preview=data?.preview;
  return <Screen title="Freeze Simulator" subtitle="Simulação de pré-lançamento 100% leitura: não congela, não reseta e não altera conta nenhuma.">
    <View style={[styles.safety,{backgroundColor:'#173528',borderColor:'#4FB77F'}]}><Ionicons name="shield-checkmark" size={23} color="#65D894"/><View style={{flex:1}}><Text style={styles.safeTitle}>0 alterações reais</Text><Text style={styles.safeText}>Este painel executa somente consultas. Nenhum card, coin, diamante, batalha, trade ou snapshot é modificado.</Text></View></View>
    <Pressable disabled={loading} onPress={()=>void run()} style={[styles.run,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="refresh" size={18} color={colors.accent}/><Text style={[styles.runText,{color:colors.text}]}>{loading?'SIMULANDO…':'RODAR NOVAMENTE'}</Text></Pressable>
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}
    {data?<><View style={[styles.status,{backgroundColor:colors.surface,borderColor:data.wouldBeReady?'#4FB77F':'#D96575'}]}><Ionicons name={data.wouldBeReady?'checkmark-circle':'close-circle'} size={27} color={data.wouldBeReady?'#65D894':'#FF8290'}/><View style={{flex:1}}><Text style={[styles.statusTitle,{color:colors.text}]}>{data.wouldBeReady?'SIMULAÇÃO PRONTA PARA FREEZE':'AINDA EXISTEM BLOQUEIOS'}</Text><Text style={[styles.meta,{color:colors.muted}]}>Gerado em {new Date(data.generatedAt).toLocaleString('pt-BR')}</Text></View></View>
      <Text style={[styles.section,{color:colors.text}]}>Bloqueios</Text><View style={styles.list}>{(data.blockers??[]).map((b:any,index:number)=><View key={b.code+'-'+index} style={[styles.blocker,{backgroundColor:colors.surface,borderColor:'#D96575'}]}><Ionicons name="warning" size={19} color="#FF8290"/><View style={{flex:1}}><Text style={[styles.blockerTitle,{color:colors.text}]}>{b.code}</Text><Text style={[styles.blockerText,{color:colors.muted}]}>{b.message}</Text></View></View>)}</View>
      {!data.blockers?.length?<Text style={[styles.ok,{color:'#65D894'}]}>Nenhum bloqueador encontrado nesta simulação.</Text>:null}
      <Text style={[styles.section,{color:colors.text}]}>Impacto projetado</Text>
      <View style={styles.grid}>
        <Metric label="CONTAS PRESERVADAS" value={Number(preview?.preserve?.accounts??0).toLocaleString('pt-BR')}/>
        <Metric label="CARTAS PRESERVADAS" value={Number(preview?.preserve?.legacyCardCopies??0).toLocaleString('pt-BR')}/>
        <Metric label="CÓPIAS REMOVIDAS" value={Number(preview?.reset?.cardCopiesRemoved??0).toLocaleString('pt-BR')}/>
        <Metric label="COINS ANTES" value={Number(preview?.economy?.coinsBefore??0).toLocaleString('pt-BR')}/>
        <Metric label="COINS PÓS-RECOMPENSA" value={Number(preview?.economy?.coinsAfterVeteranReward??0).toLocaleString('pt-BR')}/>
        <Metric label="OPERAÇÕES ATIVAS" value={Number(preview?.activeOperations??0).toLocaleString('pt-BR')}/>
      </View>
    </>:null}
  </Screen>;
}
function Metric({label,value}:{label:string;value:string}){const{colors}=useAppTheme();return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:colors.text}]}>{value}</Text></View>;}
const styles=StyleSheet.create({safety:{borderRadius:17,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},safeTitle:{color:'#65D894',fontSize:10,fontWeight:'900'},safeText:{color:'#B7D9C8',fontSize:7.5,lineHeight:11,marginTop:2},run:{alignSelf:'flex-start',minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},runText:{fontSize:8,fontWeight:'900'},error:{color:'#FF9EAA',fontSize:9},status:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:9},statusTitle:{fontSize:13,fontWeight:'900'},meta:{fontSize:7,marginTop:2},section:{fontSize:18,fontWeight:'900'},list:{gap:7},blocker:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},blockerTitle:{fontSize:9,fontWeight:'900'},blockerText:{fontSize:7.5,lineHeight:11,marginTop:2},ok:{fontSize:9,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:150,minWidth:140,borderRadius:14,borderWidth:1,padding:10},metricLabel:{fontSize:6.5,fontWeight:'900'},metricValue:{fontSize:16,fontWeight:'900',marginTop:3}});
