import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getKantoAdventure, startAdventureBattle, type AdventureNode, type KantoAdventure } from '@/services/adventure';

const KIND_ICON:Record<AdventureNode['kind'],keyof typeof Ionicons.glyphMap>={route:'walk',rival:'people',gym:'shield',elite:'medal',champion:'trophy'};

export default function KantoAdventureScreen(){
 const router=useRouter();const{colors}=useAppTheme();const[data,setData]=useState<KantoAdventure|null>(null);const[loading,setLoading]=useState(true);const[working,setWorking]=useState<string|null>(null);const[notice,setNotice]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setLoading(true);setData(await getKantoAdventure())}catch(e){setNotice(e instanceof Error?e.message:'Falha ao carregar Kanto.')}finally{setLoading(false)}},[]);useFocusEffect(useCallback(()=>{void load()},[load]));
 const next=useMemo(()=>data?.nodes.find(node=>node.unlocked&&!node.completedAt)??null,[data]);
 async function fight(node:AdventureNode){if(working||!node.unlocked)return;try{setWorking(node.id);const result=await startAdventureBattle('journey',node.id);router.push(result.route as any)}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível iniciar a batalha.')}finally{setWorking(null)}}
 return <Screen title="Jornada Kanto" subtitle="Avance pelas rotas, conquiste 8 insígnias e chegue ao Campeão.">
  {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text><Ionicons name="close" size={17} color={colors.muted}/></Pressable>:null}
  {loading?<ActivityIndicator size="large" color={colors.accent}/>:null}
  {data?<>
   <View style={[styles.summary,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><View><Text style={[styles.kicker,{color:colors.yellow}]}>REGIÃO DE KANTO</Text><Text style={[styles.title,{color:colors.text}]}>{data.completed}/{data.total} etapas concluídas</Text><Text style={[styles.sub,{color:colors.muted}]}>{data.stars}/{data.maxStars} estrelas • até 3★ por vitória rápida</Text></View><View style={[styles.bigBadge,{backgroundColor:colors.accentSoft}]}><Text style={[styles.bigValue,{color:colors.yellow}]}>{data.completed}</Text><Text style={[styles.bigLabel,{color:colors.muted}]}>ETAPAS</Text></View></View>
   {next?<View style={[styles.nextBox,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="navigate" size={20} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.nextLabel,{color:colors.accent}]}>PRÓXIMO OBJETIVO</Text><Text style={[styles.nextTitle,{color:colors.text}]}>{next.title} • {next.trainerName??'Treinador'}</Text></View></View>:null}
   <View style={styles.map}>
    {data.nodes.map((node,index)=>{const done=Boolean(node.completedAt);const locked=!node.unlocked;const tone=done?'#65D894':locked?'#52606D':node.kind==='champion'?'#FFD447':node.kind==='elite'?'#D4A6FF':colors.accent;return <View key={node.id} style={styles.stepWrap}>
      {index>0?<View style={[styles.line,{backgroundColor:done?'#377D5A':colors.border}]}/>:null}
      <View style={[styles.node,{backgroundColor:colors.surface,borderColor:tone,opacity:locked?.55:1}]}>
       <View style={[styles.nodeIcon,{backgroundColor:tone+'1F',borderColor:tone}]}><Ionicons name={locked?'lock-closed':done?'checkmark':KIND_ICON[node.kind]} size={22} color={tone}/></View>
       <View style={{flex:1,minWidth:0}}><View style={styles.nodeHead}><Text numberOfLines={1} style={[styles.nodeTitle,{color:colors.text}]}>{node.title}</Text><Text style={[styles.stars,{color:done?'#FFD447':colors.muted}]}>{done?'★'.repeat(node.stars)+'☆'.repeat(3-node.stars):'☆☆☆'}</Text></View><Text style={[styles.nodeSub,{color:colors.muted}]}>{node.subtitle}</Text><Text style={[styles.meta,{color:tone}]}>{node.trainerName??'Treinador'} • {node.types.length?node.types.map(t=>t.toUpperCase()).join(' / '):'MISTO'} • IA {node.aiStyle.toUpperCase()}</Text><Text style={[styles.reward,{color:colors.muted}]}>🪙 {node.rewardCoins.toLocaleString('pt-BR')}{node.rewardDiamonds?` • 💎 ${node.rewardDiamonds}`:''}{node.badge?` • 🏅 ${node.badge}`:''}{node.bestTurns?` • melhor: ${node.bestTurns} turnos`:''}</Text></View>
       <Pressable disabled={locked||!!working} onPress={()=>void fight(node)} style={[styles.fight,{backgroundColor:locked?colors.border:tone}]}>{working===node.id?<ActivityIndicator size="small" color="#07111F"/>:<Ionicons name={done?'refresh':'flash'} size={16} color="#07111F"/>}<Text style={styles.fightText}>{done?'REPETIR':'LUTAR'}</Text></Pressable>
      </View>
     </View>})}
   </View>
  </>:null}
 </Screen>
}

const styles=StyleSheet.create({notice:{borderWidth:1,borderRadius:11,padding:10,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:11,fontWeight:'700'},summary:{borderWidth:1,borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:12},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},title:{fontSize:18,fontWeight:'900',marginTop:3},sub:{fontSize:10,marginTop:3},bigBadge:{marginLeft:'auto',width:64,height:64,borderRadius:18,alignItems:'center',justifyContent:'center'},bigValue:{fontSize:23,fontWeight:'900'},bigLabel:{fontSize:8,fontWeight:'900'},nextBox:{borderWidth:1,borderRadius:13,padding:11,flexDirection:'row',alignItems:'center',gap:9},nextLabel:{fontSize:8,fontWeight:'900',letterSpacing:.9},nextTitle:{fontSize:12,fontWeight:'800',marginTop:2},map:{gap:0},stepWrap:{position:'relative',paddingTop:10},line:{position:'absolute',left:29,top:-4,width:3,height:18,borderRadius:3},node:{borderWidth:1,borderRadius:16,padding:12,flexDirection:'row',alignItems:'center',gap:10},nodeIcon:{width:45,height:45,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},nodeHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},nodeTitle:{fontSize:13,fontWeight:'900',flex:1},stars:{fontSize:10,letterSpacing:1},nodeSub:{fontSize:9,marginTop:2},meta:{fontSize:8,fontWeight:'900',marginTop:5},reward:{fontSize:8,marginTop:4},fight:{borderRadius:10,paddingHorizontal:9,paddingVertical:8,alignItems:'center',gap:2,minWidth:55},fightText:{color:'#07111F',fontSize:8,fontWeight:'900'}});
