import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getHallOfFame } from '@/services/adminLaunchTools';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function HallOfFameScreen(){
  const router=useRouter();const{colors}=useAppTheme();
  const[data,setData]=useState<any>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);setData(await getHallOfFame());}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o Hall da Fama.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <Screen title="Hall da Fama" subtitle="Campeões de temporadas, vencedores da Copa Trainer e recordes históricos.">
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}{error?<Text style={styles.error}>{error}</Text>:null}
    {data?<><Text style={[styles.section,{color:colors.text}]}>Recordes</Text><View style={styles.grid}>
      <Record icon="trophy" label="MAIS VITÓRIAS" row={data.records?.mostWins} valueKey="wins"/>
      <Record icon="flame" label="MELHOR STREAK" row={data.records?.bestStreak} valueKey="streak"/>
      <Record icon="podium" label="MAIOR ELO" row={data.records?.highestRating} valueKey="rating"/>
    </View>
    <Text style={[styles.section,{color:colors.text}]}>Temporadas encerradas</Text>
    <View style={styles.list}>{(data.seasons??[]).map((season:any)=><View key={season.seasonId} style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.cardKicker,{color:colors.accent}]}>{season.endsAt?new Date(season.endsAt).toLocaleDateString('pt-BR'):'TEMPORADA'}</Text><Text style={[styles.cardTitle,{color:colors.text}]}>{season.seasonName}</Text><View style={styles.podium}>{(season.podium??[]).map((p:any)=><Pressable key={p.playerId} onPress={()=>router.push(('/player/'+p.playerId) as never)} style={[styles.podiumRow,{backgroundColor:colors.surfaceAlt,borderColor:p.rank===1?colors.yellow:colors.border}]}><Text style={styles.medal}>{p.rank===1?'🥇':p.rank===2?'🥈':'🥉'}</Text><View style={{flex:1}}><Text style={[styles.name,{color:colors.text}]}>@{p.username}</Text><Text style={[styles.meta,{color:colors.muted}]}>{p.points} pts • {p.wins}V/{p.losses}D • streak {p.bestStreak}</Text></View></Pressable>)}</View></View>)}</View>
    <Text style={[styles.section,{color:colors.text}]}>Copa Trainer</Text>
    <View style={styles.list}>{(data.tournaments??[]).map((t:any)=><Pressable key={t.id} onPress={()=>router.push(('/player/'+t.winnerId) as never)} style={[styles.tournament,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="trophy" size={24} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.name,{color:colors.text}]}>{t.name}</Text><Text style={[styles.meta,{color:colors.muted}]}>Campeão: @{t.winnerUsername} • prêmio 🪙 {Number(t.rewardCoins??0).toLocaleString('pt-BR')}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>)}</View>
    </>:null}
  </Screen>;
}
function Record({icon,label,row,valueKey}:{icon:keyof typeof Ionicons.glyphMap;label:string;row:any;valueKey:string}){const router=useRouter();const{colors}=useAppTheme();return <Pressable disabled={!row?.playerId} onPress={()=>row?.playerId&&router.push(('/player/'+row.playerId) as never)} style={[styles.record,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name={icon} size={22} color={colors.yellow}/><Text style={[styles.recordLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.recordValue,{color:colors.text}]}>{row?.[valueKey]??'—'}</Text><Text numberOfLines={1} style={[styles.meta,{color:colors.muted}]}>@{row?.username??'—'}</Text></Pressable>;}
const styles=StyleSheet.create({error:{color:'#FF9EAA',fontSize:9},section:{fontSize:18,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},record:{flexGrow:1,flexBasis:145,minWidth:135,borderRadius:16,borderWidth:1,padding:11},recordLabel:{fontSize:6.5,fontWeight:'900',marginTop:6},recordValue:{fontSize:22,fontWeight:'900',marginTop:2},meta:{fontSize:7.5,marginTop:2},list:{gap:8},card:{borderRadius:18,borderWidth:1,padding:12},cardKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.8},cardTitle:{fontSize:15,fontWeight:'900',marginTop:2},podium:{gap:6,marginTop:9},podiumRow:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},medal:{fontSize:21},name:{fontSize:10,fontWeight:'900'},tournament:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:9}});
