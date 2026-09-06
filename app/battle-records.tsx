import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getTrainerBattleRecords, type AdventureHub } from '@/services/adventure';

const LABELS:Record<string,{label:string;icon:keyof typeof Ionicons.glyphMap;unit?:string}>={
 adventure_stars:{label:'Estrelas da Jornada',icon:'star'},tower_best_floor:{label:'Recorde da Battle Tower',icon:'business',unit:'andar'},elite_four_clears:{label:'Elite Four concluída',icon:'medal',unit:'vezes'},raid_damage:{label:'Dano total em Raids',icon:'flame'},rogue_best_floor:{label:'Melhor Rogue Run',icon:'dice',unit:'andar'},champion_echo_wins:{label:'Vitórias contra Campeões',icon:'trophy'},world_event_wins:{label:'Eventos surpresa vencidos',icon:'flash'},
};

export default function BattleRecordsScreen(){
 const{colors}=useAppTheme();const[data,setData]=useState<AdventureHub['records']|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setLoading(true);setError(null);setData(await getTrainerBattleRecords())}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar os recordes.')}finally{setLoading(false)}},[]);useFocusEffect(useCallback(()=>{void load()},[load]));
 return <Screen title="Recordes do Treinador" subtitle="Seus melhores feitos ficam registrados mesmo quando uma temporada termina.">
  <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="stats-chart" size={34} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>LIVRO DE RECORDES</Text><Text style={[styles.title,{color:colors.text}]}>{data?.items.length??0} marcas registradas</Text><Text style={[styles.sub,{color:colors.muted}]}>Battle Tower, Raids, Jornada, Rogue, Campeões e eventos especiais.</Text></View></View>
  {error?<Pressable onPress={()=>setError(null)} style={[styles.error,{borderColor:colors.red}]}><Text style={{color:colors.red,flex:1}}>{error}</Text><Ionicons name="close" size={16} color={colors.red}/></Pressable>:null}
  {loading?<ActivityIndicator color={colors.accent}/>:data?.items.map((record,index)=>{const info=LABELS[record.key]??{label:record.key.replaceAll('_',' '),icon:'ribbon' as const};return <View key={record.key} style={[styles.card,{backgroundColor:colors.surface,borderColor:index===0?colors.yellow:colors.border}]}><View style={[styles.icon,{backgroundColor:index===0?'#342D14':colors.accentSoft}]}><Ionicons name={info.icon} size={22} color={index===0?colors.yellow:colors.accent}/></View><View style={{flex:1}}><Text style={[styles.label,{color:colors.text}]}>{info.label}</Text><Text style={[styles.meta,{color:colors.muted}]}>Atualizado {new Date(record.updatedAt).toLocaleDateString('pt-BR')}</Text></View><View style={styles.valueWrap}><Text style={[styles.value,{color:index===0?colors.yellow:colors.text}]}>{Number(record.value).toLocaleString('pt-BR')}</Text>{info.unit?<Text style={[styles.unit,{color:colors.muted}]}>{info.unit}</Text>:null}</View></View>})}
  {!loading&&!data?.items.length?<View style={[styles.empty,{borderColor:colors.border}]}><Ionicons name="flag-outline" size={31} color={colors.muted}/><Text style={{color:colors.muted,textAlign:'center'}}>Seus recordes aparecerão conforme você jogar os novos modos da 1.2.</Text></View>:null}
 </Screen>
}
const styles=StyleSheet.create({hero:{borderWidth:1,borderRadius:17,padding:15,flexDirection:'row',gap:12,alignItems:'center'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1},title:{fontSize:18,fontWeight:'900',marginTop:2},sub:{fontSize:10,marginTop:3},error:{borderWidth:1,borderRadius:10,padding:9,flexDirection:'row'},card:{borderWidth:1,borderRadius:14,padding:12,flexDirection:'row',alignItems:'center',gap:10},icon:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},label:{fontSize:12,fontWeight:'900',textTransform:'capitalize'},meta:{fontSize:8,marginTop:3},valueWrap:{alignItems:'flex-end'},value:{fontSize:20,fontWeight:'900'},unit:{fontSize:8,fontWeight:'800'},empty:{borderWidth:1,borderRadius:14,padding:25,alignItems:'center',gap:9}});
