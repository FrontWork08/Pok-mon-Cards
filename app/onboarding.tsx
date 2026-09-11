import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyOnboardingProgress, type OnboardingProgress } from '@/services/playerExperienceV2';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function OnboardingScreen(){
 const router=useRouter();const{colors}=useAppTheme();const[data,setData]=useState<OnboardingProgress|null>(null);const[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{try{setData(await getMyOnboardingProgress());}finally{setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const pct=data?Math.round(data.completed/Math.max(1,data.total)*100):0;
 return <Screen title="Primeiros Passos" subtitle="Tutorial interativo: cada etapa é marcada automaticamente quando você faz a ação de verdade.">
  {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
  {data?<><View style={[styles.hero,{backgroundColor:colors.surface,borderColor:data.allDone?'#65D894':colors.accent}]}><Ionicons name={data.allDone?'ribbon':'compass'} size={31} color={data.allDone?'#65D894':colors.accent}/><View style={{flex:1}}><Text style={[styles.heroTitle,{color:colors.text}]}>{data.allDone?'Treinamento concluído':'Sua jornada começou'}</Text><Text style={[styles.meta,{color:colors.muted}]}>{data.completed}/{data.total} etapas • {pct}%</Text><View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:data.allDone?'#65D894':colors.accent,width:`${pct}%`}]} /></View></View></View>
  <View style={styles.list}>{data.steps.map((step,index)=><Pressable key={step.id} disabled={step.done} onPress={()=>router.push(step.route as never)} style={[styles.step,{backgroundColor:colors.surface,borderColor:step.done?'#65D894':colors.border}]}><View style={[styles.number,{backgroundColor:step.done?'#163323':colors.accentSoft}]}>{step.done?<Ionicons name="checkmark" size={18} color="#65D894"/>:<Text style={[styles.numberText,{color:colors.accent}]}>{index+1}</Text>}</View><View style={{flex:1}}><Text style={[styles.stepTitle,{color:colors.text}]}>{step.title}</Text><Text style={[styles.meta,{color:colors.muted}]}>{step.description}</Text></View>{!step.done?<Ionicons name="chevron-forward" size={18} color={colors.muted}/>:null}</Pressable>)}</View>
  <Pressable onPress={()=>router.push('/trainer-guide')} style={[styles.guide,{borderColor:colors.border}]}><Ionicons name="help-circle" size={18} color={colors.accent}/><Text style={[styles.guideText,{color:colors.text}]}>Abrir Guia do Treinador</Text></Pressable></>:null}
 </Screen>;
}
const styles=StyleSheet.create({hero:{borderRadius:18,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:11},heroTitle:{fontSize:17,fontWeight:'900'},meta:{fontSize:8,lineHeight:12,marginTop:2},track:{height:7,borderRadius:999,overflow:'hidden',marginTop:8},fill:{height:'100%',borderRadius:999},list:{gap:8},step:{minHeight:72,borderRadius:17,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},number:{width:39,height:39,borderRadius:13,alignItems:'center',justifyContent:'center'},numberText:{fontSize:15,fontWeight:'900'},stepTitle:{fontSize:11,fontWeight:'900'},guide:{minHeight:46,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},guideText:{fontSize:9,fontWeight:'900'}});