import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getWhatsNew, markUpdateSeen } from '@/services/playerExperience';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function WhatsNewScreen(){
 const{colors}=useAppTheme();const[data,setData]=useState<any>(null);const[loading,setLoading]=useState(true);const[open,setOpen]=useState<number|null>(null);
 const load=useCallback(async()=>{try{setData(await getWhatsNew(25));}finally{setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function toggle(id:number,seen:boolean){setOpen(v=>v===id?null:id);if(!seen){await markUpdateSeen(id).catch(()=>null);setData((d:any)=>d?{...d,unseenCount:Math.max(0,d.unseenCount-1),logs:d.logs.map((x:any)=>x.id===id?{...x,seen:true}:x)}:d);}}
 return <Screen title="O que mudou" subtitle="Atualizações lidas por versão, com histórico e marcação individual para sua conta.">
  {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
  {data?.unseenCount>0?<View style={[styles.banner,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="sparkles" size={21} color={colors.accent}/><Text style={[styles.bannerText,{color:colors.text}]}>{data.unseenCount} atualização(ões) ainda não lida(s)</Text></View>:null}
  <View style={styles.list}>{(data?.logs??[]).map((log:any)=>{const expanded=open===log.id;return <Pressable key={log.id} onPress={()=>void toggle(log.id,log.seen)} style={[styles.card,{backgroundColor:colors.surface,borderColor:log.seen?colors.border:colors.yellow}]}>
   <View style={styles.head}><View style={[styles.icon,{backgroundColor:log.seen?colors.surfaceAlt:colors.accentSoft}]}><Ionicons name={log.seen?'checkmark-circle':'newspaper'} size={20} color={log.seen?'#65D894':colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.version,{color:colors.accent}]}>{log.version}</Text><Text style={[styles.title,{color:colors.text}]}>{log.title}</Text><Text style={[styles.summary,{color:colors.muted}]}>{log.summary}</Text></View><Ionicons name={expanded?'chevron-up':'chevron-down'} size={18} color={colors.muted}/></View>
   {expanded?<View style={styles.changes}>{log.changes.map((x:string,i:number)=><View key={i} style={styles.change}><Ionicons name="checkmark" size={14} color="#65D894"/><Text style={[styles.changeText,{color:colors.muted}]}>{x}</Text></View>)}</View>:null}
  </Pressable>;})}</View>
 </Screen>;
}
const styles=StyleSheet.create({banner:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},bannerText:{fontSize:9,fontWeight:'900'},list:{gap:8},card:{borderRadius:17,borderWidth:1,padding:11},head:{flexDirection:'row',alignItems:'center',gap:9},icon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'},version:{fontSize:7,fontWeight:'900'},title:{fontSize:12,fontWeight:'900',marginTop:2},summary:{fontSize:8,lineHeight:12,marginTop:2},changes:{gap:6,marginTop:10},change:{flexDirection:'row',alignItems:'flex-start',gap:6},changeText:{flex:1,fontSize:8,lineHeight:12}});
