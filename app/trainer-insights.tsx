import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';
import { getMyCollectionRecommendations, getMyTrainerBattleStats, type CollectionRecommendations, type TrainerBattleStats } from '@/services/trainerInsights';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function TrainerInsightsScreen(){
  const router=useRouter();const{colors}=useAppTheme();
  const[stats,setStats]=useState<TrainerBattleStats|null>(null);
  const[recs,setRecs]=useState<CollectionRecommendations|null>(null);
  const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);const[s,r]=await Promise.all([getMyTrainerBattleStats(),getMyCollectionRecommendations()]);setStats(s);setRecs(r);}catch(e){setError(e instanceof Error?e.message:'Não foi possível gerar seus Insights.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <Screen title="Insights do Treinador" subtitle="Estatísticas e sugestões baseadas no que você já possui. Nada aqui joga ou altera decks por você.">
    <AreaIdentityStrip area="progress"/>
    <View style={[styles.notice,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="bulb" size={21} color={colors.accent}/><Text style={[styles.noticeText,{color:colors.muted}]}>As recomendações são apenas dicas. O jogo nunca compra, vende, troca ou monta um deck automaticamente.</Text></View>
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {error?<Text style={[styles.error,{color:'#FF9EAA'}]}>{error}</Text>:null}
    {stats?<><Text style={[styles.sectionTitle,{color:colors.text}]}>Seu estilo de batalha</Text>
      <View style={styles.grid}>
        <Metric label="VITÓRIAS" value={String(stats.summary.wins)} sub={'ELO '+stats.summary.rating} accent="#65D894"/>
        <Metric label="MELHOR STREAK" value={String(stats.summary.bestStreak)} sub={stats.summary.losses+' derrota(s)'} accent="#F0C74E"/>
        <Metric label="GOLPES" value={String(stats.moveStats.totalMoves)} sub={stats.moveStats.topMove?'mais usado: '+stats.moveStats.topMove:'sem dados'} accent="#5AA8FF"/>
        <Metric label="KOs" value={String(stats.moveStats.knockouts)} sub={stats.moveStats.criticalHits+' críticos'} accent="#FF735C"/>
      </View>
      {stats.favoritePokemon?<Pressable onPress={()=>router.push(('/card/'+stats.favoritePokemon!.cardId) as never)} style={[styles.favorite,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="star" size={22} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>POKÉMON MAIS USADO</Text><Text style={[styles.favoriteName,{color:colors.text}]}>{stats.favoritePokemon.name}</Text><Text style={[styles.small,{color:colors.muted}]}>{stats.favoritePokemon.rounds} rodada(s) • {stats.favoritePokemon.wins} vitória(s)</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>:null}
      <View style={styles.typeList}>{stats.typePerformance.slice(0,8).map(row=><View key={row.type} style={[styles.typeRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.typeName,{color:colors.text}]}>{row.type.toUpperCase()}</Text><View style={{flex:1}}><View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{backgroundColor:colors.accent,width:`${Math.min(100,row.winRate)}%`}]}/></View><Text style={[styles.small,{color:colors.muted}]}>{row.rounds} rodada(s)</Text></View><Text style={[styles.rate,{color:row.winRate>=50?'#65D894':'#FF9A78'}]}>{row.winRate}%</Text></View>)}</View>
    </>:null}
    {recs?<><Text style={[styles.sectionTitle,{color:colors.text}]}>Sugestões da sua coleção</Text>
      {recs.chaseAvailable>0?<Pressable onPress={()=>router.push('/wishlist')} style={[styles.chase,{backgroundColor:colors.surface,borderColor:'#9B7BFF'}]}><Ionicons name="star" size={21} color="#9B7BFF"/><View style={{flex:1}}><Text style={[styles.recTitle,{color:colors.text}]}>{recs.chaseAvailable} carta(s) da sua Card Chase estão no Marketplace</Text><Text style={[styles.small,{color:colors.muted}]}>Abra a Card Chase para comparar os anúncios.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted}/></Pressable>:null}
      <Text style={[styles.subTitle,{color:colors.text}]}>Fortes e ainda fora dos seus decks</Text>
      <View style={styles.cardGrid}>{recs.unusedStrongCards.map(item=><Pressable key={item.cardId} onPress={()=>router.push(('/card/'+item.cardId) as never)} style={[styles.recCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>{item.image?<Image source={{uri:item.image}} style={styles.image} resizeMode="contain"/>:null}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.recTitle,{color:colors.text}]}>{item.name}</Text><Text style={[styles.small,{color:colors.muted}]}>{item.types.join(' / ').toUpperCase()}</Text><Text style={[styles.score,{color:colors.accent}]}>Stats combinados: {item.score}</Text></View></Pressable>)}</View>
      <Text style={[styles.subTitle,{color:colors.text}]}>Duplicadas valiosas sem bloqueio</Text>
      <View style={styles.cardGrid}>{recs.valuableDuplicates.map(item=><Pressable key={item.cardId} onPress={()=>router.push(('/card/'+item.cardId) as never)} style={[styles.recCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>{item.image?<Image source={{uri:item.image}} style={styles.image} resizeMode="contain"/>:null}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.recTitle,{color:colors.text}]}>{item.name}</Text><Text style={[styles.small,{color:colors.muted}]}>+{item.extraCopies} cópia(s) extra(s)</Text><Text style={[styles.score,{color:colors.yellow}]}>{item.marketPriceUsd==null?'US$ —':formatUsd(item.marketPriceUsd)}</Text></View></Pressable>)}</View>
    </>:null}
  </Screen>;
}
function Metric({label,value,sub,accent}:{label:string;value:string;sub:string;accent:string}){const{colors}=useAppTheme();return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:accent}]}>{value}</Text><Text style={[styles.small,{color:colors.muted}]}>{sub}</Text></View>;}
const styles=StyleSheet.create({notice:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,fontSize:8,lineHeight:12},error:{fontSize:9},sectionTitle:{fontSize:18,fontWeight:'900'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:145,minWidth:130,borderRadius:15,borderWidth:1,padding:10},metricLabel:{fontSize:6.5,fontWeight:'900'},metricValue:{fontSize:22,fontWeight:'900',marginTop:3},small:{fontSize:7.3,lineHeight:11,marginTop:2},favorite:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:9},kicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.8},favoriteName:{fontSize:14,fontWeight:'900',marginTop:2},typeList:{gap:6},typeRow:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},typeName:{width:72,fontSize:7,fontWeight:'900'},track:{height:5,borderRadius:999,overflow:'hidden'},fill:{height:'100%',borderRadius:999},rate:{width:46,textAlign:'right',fontSize:10,fontWeight:'900'},chase:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},recTitle:{fontSize:9.5,fontWeight:'900'},subTitle:{fontSize:12,fontWeight:'900'},cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},recCard:{flexGrow:1,flexBasis:230,minWidth:210,borderRadius:14,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},image:{width:45,height:60},score:{fontSize:7.5,fontWeight:'900',marginTop:3}});
