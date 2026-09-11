import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { archivePlayerGoal, createPlayerGoal, getMyGoals, type PlayerGoal, type PlayerGoalType } from '@/services/playerExperienceV2';
import { useAppTheme } from '@/theme/ThemeProvider';

const PRESETS:Array<{type:PlayerGoalType;title:string;target:number;route:string;icon:keyof typeof Ionicons.glyphMap}>=[
  {type:'collection',title:'Aumentar minha coleção',target:250,route:'/(tabs)/bag',icon:'albums'},
  {type:'rank',title:'Chegar ao ELO desejado',target:1200,route:'/(tabs)/battles',icon:'podium'},
  {type:'battle',title:'Vencer batalhas',target:25,route:'/(tabs)/battles',icon:'trophy'},
  {type:'coins',title:'Juntar Coins',target:100000,route:'/(tabs)/packs',icon:'wallet'},
  {type:'custom',title:'Meta personalizada',target:10,route:'/career',icon:'flag'},
];

export default function GoalsScreen(){
  const router=useRouter();const{colors}=useAppTheme();
  const[goals,setGoals]=useState<PlayerGoal[]>([]);const[loading,setLoading]=useState(true);const[working,setWorking]=useState(false);
  const[title,setTitle]=useState('');const[target,setTarget]=useState('10');const[type,setType]=useState<PlayerGoalType>('custom');const[route,setRoute]=useState('/career');
  const load=useCallback(async()=>{try{setGoals(await getMyGoals());}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const active=useMemo(()=>goals.filter(g=>g.status==='active'),[goals]);
  async function add(){if(working||!title.trim())return;try{setWorking(true);await createPlayerGoal({goalType:type,title,targetValue:Number(target)||1,route});setTitle('');await load();}finally{setWorking(false);}}
  async function archive(goalId:string){if(working)return;try{setWorking(true);await archivePlayerGoal(goalId);await load();}finally{setWorking(false);}}
  return <Screen title="Metas do Treinador" subtitle="Escolha objetivos pessoais. O progresso de coleção, ELO, vitórias e Coins é atualizado automaticamente.">
    <View style={[styles.tip,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="sparkles" size={20} color={colors.accent}/><Text style={[styles.tipText,{color:colors.muted}]}>Para um Pokémon específico, use a Card Chase: ela já acompanha disponibilidade no Marketplace e boosters.</Text><Pressable onPress={()=>router.push('/wishlist')}><Text style={[styles.link,{color:colors.accent}]}>ABRIR</Text></Pressable></View>
    <View style={styles.presets}>{PRESETS.map(p=><Pressable key={p.type} onPress={()=>{setType(p.type);setTitle(p.title);setTarget(String(p.target));setRoute(p.route);}} style={[styles.preset,{backgroundColor:type===p.type?colors.accentSoft:colors.surface,borderColor:type===p.type?colors.accent:colors.border}]}><Ionicons name={p.icon} size={18} color={type===p.type?colors.accent:colors.muted}/><Text style={[styles.presetText,{color:colors.text}]}>{p.title}</Text></Pressable>)}</View>
    <View style={[styles.create,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <Text style={[styles.kicker,{color:colors.yellow}]}>NOVA META</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Ex.: chegar ao Ouro" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
      <TextInput value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder="Meta numérica" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
      <Pressable onPress={()=>void add()} disabled={working||!title.trim()} style={[styles.add,{backgroundColor:colors.yellow},(working||!title.trim())&&{opacity:.5}]}><Ionicons name="add-circle" size={18} color="#07111F"/><Text style={styles.addText}>{working?'SALVANDO...':'CRIAR META'}</Text></Pressable>
    </View>
    <Text style={[styles.section,{color:colors.text}]}>Em andamento</Text>
    {loading?<ActivityIndicator color={colors.yellow}/>:active.length?<View style={styles.list}>{active.map(goal=>{const pct=Math.min(100,Math.round(goal.currentValue/Math.max(1,goal.targetValue)*100));const done=goal.currentValue>=goal.targetValue;return <View key={goal.id} style={[styles.card,{backgroundColor:colors.surface,borderColor:done?'#65D894':colors.border}]}><View style={styles.cardTop}><View style={{flex:1}}><Text style={[styles.cardTitle,{color:colors.text}]}>{goal.title}</Text><Text style={[styles.meta,{color:colors.muted}]}>{goal.currentValue.toLocaleString('pt-BR')} / {goal.targetValue.toLocaleString('pt-BR')} • {pct}%</Text></View>{done?<Ionicons name="checkmark-circle" size={22} color="#65D894"/>:null}</View><View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:done?'#65D894':colors.accent,width:`${pct}%`}]} /></View><View style={styles.actions}>{goal.route?<Pressable onPress={()=>router.push(goal.route as never)}><Text style={[styles.actionText,{color:colors.accent}]}>CONTINUAR</Text></Pressable>:null}<Pressable disabled={working} onPress={()=>void archive(goal.id)}><Text style={[styles.actionText,{color:'#FF8792'}]}>ARQUIVAR</Text></Pressable></View></View>})}</View>:<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="flag-outline" size={30} color={colors.muted}/><Text style={[styles.emptyText,{color:colors.muted}]}>Crie sua primeira meta acima.</Text></View>}
  </Screen>;
}
const styles=StyleSheet.create({tip:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},tipText:{flex:1,fontSize:8,lineHeight:12},link:{fontSize:8,fontWeight:'900'},presets:{flexDirection:'row',flexWrap:'wrap',gap:7},preset:{flexGrow:1,flexBasis:150,minHeight:46,borderRadius:14,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:7},presetText:{fontSize:9,fontWeight:'900',flex:1},create:{borderRadius:18,borderWidth:1,padding:12,gap:8},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1},input:{minHeight:44,borderRadius:12,borderWidth:1,paddingHorizontal:11,fontSize:12,fontWeight:'800'},add:{height:44,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},addText:{color:'#07111F',fontSize:9,fontWeight:'900'},section:{fontSize:18,fontWeight:'900'},list:{gap:8},card:{borderRadius:17,borderWidth:1,padding:11,gap:8},cardTop:{flexDirection:'row',gap:8,alignItems:'center'},cardTitle:{fontSize:12,fontWeight:'900'},meta:{fontSize:8,marginTop:2},track:{height:7,borderRadius:999,overflow:'hidden'},fill:{height:'100%',borderRadius:999},actions:{flexDirection:'row',justifyContent:'flex-end',gap:14},actionText:{fontSize:8,fontWeight:'900'},empty:{borderRadius:17,borderWidth:1,padding:24,alignItems:'center',gap:6},emptyText:{fontSize:9}});