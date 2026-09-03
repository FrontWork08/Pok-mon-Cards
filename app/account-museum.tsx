import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getAccountMuseum, type AccountMuseum } from '@/services/safetyAndAudit';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

const ICONS:Record<string,keyof typeof Ionicons.glyphMap>={first_pack:'cube',first_battle:'game-controller',first_win:'trophy',first_trade:'swap-horizontal',oldest_card:'time',largest_market_sale:'cash',best_pull:'sparkles'};
export default function AccountMuseumScreen(){
  const router=useRouter();const{colors}=useAppTheme();
  const[data,setData]=useState<AccountMuseum|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);setData(await getAccountMuseum());}catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir o Museu da Conta.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <Screen title="Museu da Conta" subtitle="Momentos que contam sua história: primeiras vezes, cartas marcantes, vitórias e negócios.">
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {error?<Text style={[styles.error,{color:'#FF9EAA'}]}>{error}</Text>:null}
    {data?<><View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="library" size={31} color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>MUSEU • NÍVEL {data.museum.level}</Text><Text style={[styles.title,{color:colors.text}]}>Memória da sua conta</Text><Text style={[styles.sub,{color:colors.muted}]}>O museu reaproveita sua coleção real; nenhuma carta é consumida para aparecer aqui.</Text></View></View>
      {data.displayCards.length?<><Text style={[styles.sectionTitle,{color:colors.text}]}>Cartas em exibição</Text><View style={styles.cards}>{data.displayCards.map(item=><Pressable key={item.slot} onPress={()=>router.push(('/card/'+item.card.id) as never)} style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border}]}>{item.card.image?<Image source={{uri:item.card.image}} style={styles.image} resizeMode="contain"/>:null}<Text numberOfLines={1} style={[styles.cardName,{color:colors.text}]}>{item.card.name}</Text><Text style={[styles.cardMeta,{color:colors.muted}]}>Slot {item.slot} • {item.card.marketPriceUsd==null?'US$ —':formatUsd(item.card.marketPriceUsd)}</Text></Pressable>)}</View></>:null}
      <Text style={[styles.sectionTitle,{color:colors.text}]}>Linha do tempo</Text>
      <View style={styles.timeline}>{data.moments.map((moment,index)=>{const cardId=typeof moment.metadata?.cardId==='string'?moment.metadata.cardId:null;return <Pressable key={moment.kind+'-'+index} disabled={!cardId} onPress={()=>cardId&&router.push(('/card/'+cardId) as never)} style={[styles.moment,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={[styles.momentIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={ICONS[moment.kind]??'star'} size={19} color={colors.accent}/></View><View style={{flex:1}}><Text style={[styles.momentTitle,{color:colors.text}]}>{moment.title}</Text><Text style={[styles.momentDate,{color:colors.muted}]}>{new Date(moment.occurredAt).toLocaleString('pt-BR')}</Text>{moment.kind==='best_pull'&&moment.metadata?.name?<Text style={[styles.momentExtra,{color:colors.yellow}]}>{String(moment.metadata.name)} • {formatUsd(Number(moment.metadata.marketPriceUsd??0))}</Text>:null}{moment.kind==='largest_market_sale'?<Text style={[styles.momentExtra,{color:'#65D894'}]}>🪙 {Number(moment.metadata?.grossCoins??0).toLocaleString('pt-BR')}</Text>:null}</View>{cardId?<Ionicons name="chevron-forward" size={17} color={colors.muted}/>:null}</Pressable>;})}</View>
    </>:null}
  </Screen>;
}
const styles=StyleSheet.create({error:{fontSize:9},hero:{borderRadius:20,borderWidth:1,padding:14,flexDirection:'row',gap:10,alignItems:'center'},kicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},title:{fontSize:17,fontWeight:'900',marginTop:2},sub:{fontSize:8,lineHeight:12,marginTop:3},sectionTitle:{fontSize:18,fontWeight:'900',marginTop:4},cards:{flexDirection:'row',flexWrap:'wrap',gap:8},card:{flexGrow:1,flexBasis:150,minWidth:135,borderRadius:15,borderWidth:1,padding:8},image:{width:'100%',height:160},cardName:{fontSize:9,fontWeight:'900',marginTop:5},cardMeta:{fontSize:6.8,marginTop:2},timeline:{gap:7},moment:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},momentIcon:{width:40,height:40,borderRadius:12,alignItems:'center',justifyContent:'center'},momentTitle:{fontSize:10,fontWeight:'900'},momentDate:{fontSize:7,marginTop:2},momentExtra:{fontSize:7.5,fontWeight:'900',marginTop:3}});
