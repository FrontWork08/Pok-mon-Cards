import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getAdminHealthCheck, getAdminRecentErrors, type AdminError, type HealthCheck } from '@/services/safetyAndAudit';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AdminHealthScreen(){
  const{colors}=useAppTheme();
  const[health,setHealth]=useState<HealthCheck|null>(null);
  const[errors,setErrors]=useState<AdminError[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const[h,e]=await Promise.all([getAdminHealthCheck(),getAdminRecentErrors(100)]);setHealth(h);setErrors(e);}catch(err){setError(err instanceof Error?err.message:'Não foi possível executar o Health Check.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <Screen title="Health Check" subtitle="Saúde dos sistemas críticos e erros recentes em um painel administrativo.">
    <Pressable onPress={()=>void load()} disabled={loading} style={[styles.refresh,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="refresh" size={18} color={colors.accent}/><Text style={[styles.refreshText,{color:colors.text}]}>{loading?'VERIFICANDO…':'EXECUTAR NOVAMENTE'}</Text></Pressable>
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {error?<View style={[styles.error,{borderColor:'#D96575'}]}><Text style={[styles.errorText,{color:colors.text}]}>{error}</Text></View>:null}
    {health?<><View style={[styles.overall,{backgroundColor:colors.surface,borderColor:health.overall==='ok'?'#4FB77F':health.overall==='warning'?colors.yellow:'#D96575'}]}><Ionicons name={health.overall==='ok'?'checkmark-circle':health.overall==='warning'?'warning':'close-circle'} size={27} color={health.overall==='ok'?'#65D894':health.overall==='warning'?colors.yellow:'#FF8290'}/><View style={{flex:1}}><Text style={[styles.overallTitle,{color:colors.text}]}>Estado geral: {health.overall.toUpperCase()}</Text><Text style={[styles.meta,{color:colors.muted}]}>Verificado em {new Date(health.checkedAt).toLocaleString('pt-BR')}</Text></View></View>
      <View style={styles.grid}>{health.checks.map(check=>{const accent=check.status==='ok'?'#65D894':check.status==='warning'?colors.yellow:'#FF8290';return <View key={check.id} style={[styles.check,{backgroundColor:colors.surface,borderColor:accent}]}><Ionicons name={check.status==='ok'?'checkmark-circle':check.status==='warning'?'warning':'close-circle'} size={20} color={accent}/><Text style={[styles.checkTitle,{color:colors.text}]}>{check.label}</Text><Text style={[styles.checkText,{color:colors.muted}]}>{check.detail}</Text></View>;})}</View>
    </>:null}
    <View style={styles.sectionHead}><Text style={[styles.sectionTitle,{color:colors.text}]}>Erros recentes</Text><Text style={[styles.count,{color:colors.muted}]}>{errors.length}</Text></View>
    <View style={styles.list}>{errors.map(item=><View key={item.id} style={[styles.errorRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.errorIcon,{backgroundColor:'#D965751C'}]}><Ionicons name="bug" size={18} color="#FF8290"/></View><View style={{flex:1,minWidth:0}}><Text style={[styles.errorTitle,{color:colors.text}]}>{item.source}{item.code?' • '+item.code:''}</Text><Text numberOfLines={3} style={[styles.errorMessage,{color:colors.muted}]}>{item.message}</Text><Text style={[styles.meta,{color:colors.muted}]}>{item.username?'@'+item.username+' • ':''}{new Date(item.createdAt).toLocaleString('pt-BR')}</Text></View></View>)}</View>
    {!loading&&!errors.length?<Text style={[styles.empty,{color:colors.muted}]}>Nenhum erro de cliente registrado recentemente.</Text>:null}
  </Screen>;
}
const styles=StyleSheet.create({refresh:{alignSelf:'flex-start',minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},refreshText:{fontSize:8,fontWeight:'900'},error:{borderRadius:14,borderWidth:1,padding:11},errorText:{fontSize:9},overall:{borderRadius:19,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:9},overallTitle:{fontSize:14,fontWeight:'900'},meta:{fontSize:7,marginTop:2},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},check:{flexGrow:1,flexBasis:210,minWidth:190,borderRadius:16,borderWidth:1,padding:11},checkTitle:{fontSize:10,fontWeight:'900',marginTop:6},checkText:{fontSize:7.5,lineHeight:11,marginTop:3},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{fontSize:18,fontWeight:'900'},count:{fontSize:9,fontWeight:'900'},list:{gap:7},errorRow:{borderRadius:14,borderWidth:1,padding:9,flexDirection:'row',gap:8,alignItems:'center'},errorIcon:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center'},errorTitle:{fontSize:9,fontWeight:'900'},errorMessage:{fontSize:7.5,lineHeight:11,marginTop:2},empty:{fontSize:9,textAlign:'center',padding:18}});
