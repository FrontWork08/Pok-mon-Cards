import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export type TrainerArea='packs'|'collection'|'competitive'|'social'|'economy'|'progress';

const AREAS:Record<TrainerArea,{label:string;purpose:string;icon:keyof typeof Ionicons.glyphMap;color:string}>={
  packs:{label:'DESCOBERTA',purpose:'Abra boosters e encontre novas possibilidades para sua coleção.',icon:'cube',color:'#F0C74E'},
  collection:{label:'COLEÇÃO',purpose:'Organize, complete e dê identidade às cartas que você conquistou.',icon:'albums',color:'#5AA8FF'},
  competitive:{label:'COMPETITIVO',purpose:'Estratégia, tipos e golpes decidem o resultado — não o preço da carta.',icon:'game-controller',color:'#FF735C'},
  social:{label:'SOCIAL',purpose:'Construa relações, guildas e histórias com outros treinadores.',icon:'people',color:'#9B7BFF'},
  economy:{label:'ECONOMIA',purpose:'Negocie e gaste recursos com clareza sem transformar força em pay-to-win.',icon:'storefront',color:'#54C78D'},
  progress:{label:'PROGRESSO',purpose:'Transforme ações do jogo em metas, marcos e memória da sua conta.',icon:'compass',color:'#F0C74E'},
};

export function AreaIdentityStrip({area}:{area:TrainerArea}){
  const{colors}=useAppTheme();
  const data=AREAS[area];
  return <View style={[styles.wrap,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <View style={[styles.accent,{backgroundColor:data.color}]}/>
    <View style={[styles.icon,{backgroundColor:data.color+'1C'}]}><Ionicons name={data.icon} size={18} color={data.color}/></View>
    <View style={styles.body}><Text style={[styles.label,{color:data.color}]}>{data.label}</Text><Text numberOfLines={1} style={[styles.purpose,{color:colors.muted}]}>{data.purpose}</Text></View>
  </View>;
}

const styles=StyleSheet.create({
  wrap:{minHeight:48,borderRadius:14,borderWidth:1,overflow:'hidden',flexDirection:'row',alignItems:'center',gap:8,paddingRight:10},
  accent:{width:4,alignSelf:'stretch'},
  icon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},
  body:{flex:1,minWidth:0},
  label:{fontSize:7,fontWeight:'900',letterSpacing:.9},
  purpose:{fontSize:7.5,fontWeight:'700',marginTop:2},
});
