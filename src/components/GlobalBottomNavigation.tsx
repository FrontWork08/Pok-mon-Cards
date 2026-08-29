import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NavItem={label:string;href:string;icon:keyof typeof Ionicons.glyphMap;activeIcon:keyof typeof Ionicons.glyphMap;matches:(pathname:string)=>boolean};
const ITEMS:NavItem[]=[
 {label:'Início',href:'/(tabs)',icon:'home-outline',activeIcon:'home',matches:p=>p==='/'||p==='/(tabs)'||p==='/index'},
 {label:'Packs',href:'/(tabs)/packs',icon:'cube-outline',activeIcon:'cube',matches:p=>p.includes('/packs')},
 {label:'Bag',href:'/(tabs)/bag',icon:'albums-outline',activeIcon:'albums',matches:p=>p.includes('/bag')},
 {label:'Trocas',href:'/(tabs)/trade',icon:'swap-horizontal-outline',activeIcon:'swap-horizontal',matches:p=>p.includes('/trade')},
 {label:'Batalha',href:'/(tabs)/battles',icon:'game-controller-outline',activeIcon:'game-controller',matches:p=>p.includes('/battles')},
];

export function GlobalBottomNavigation(){
 const router=useRouter();const pathname=usePathname();const insets=useSafeAreaInsets();
 return <View style={[styles.host,{paddingBottom:Math.max(insets.bottom,8)}]}>
   <View style={styles.bar}>
     <View style={styles.goldRail}/>
     {ITEMS.map(item=>{const active=item.matches(pathname);return <Pressable key={item.label} accessibilityRole='button' accessibilityLabel={item.label} accessibilityState={{selected:active}} onPress={()=>router.replace(item.href as never)} style={({pressed})=>[styles.item,active&&styles.itemActive,pressed&&styles.pressed]}>
       {active?<View style={styles.activeGlow}/>:null}
       <View style={[styles.iconWrap,active&&styles.iconWrapActive]}><Ionicons name={active?item.activeIcon:item.icon} size={active?22:20} color={active?'#F2CF69':'#7E8798'}/></View>
       <Text numberOfLines={1} style={[styles.label,active&&styles.labelActive]}>{item.label}</Text>
       {active?<View style={styles.activeDot}/>:null}
     </Pressable>})}
   </View>
 </View>;
}

const styles=StyleSheet.create({
 host:{width:'100%',paddingHorizontal:10,paddingTop:7,backgroundColor:'#070A12'},
 bar:{position:'relative',width:'100%',maxWidth:820,alignSelf:'center',minHeight:70,borderRadius:24,borderWidth:1,borderColor:'#3E3522',backgroundColor:'#0C111C',paddingHorizontal:6,paddingVertical:6,flexDirection:'row',alignItems:'stretch',shadowColor:'#000',shadowOpacity:.36,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:16,overflow:'hidden'},
 goldRail:{position:'absolute',top:0,left:'8%',right:'8%',height:1,backgroundColor:'#A88437',opacity:.85},
 item:{flex:1,minWidth:0,minHeight:56,borderRadius:17,alignItems:'center',justifyContent:'center',gap:2,position:'relative',overflow:'hidden'},
 itemActive:{backgroundColor:'#1A1710'},activeGlow:{position:'absolute',top:-34,width:76,height:76,borderRadius:40,backgroundColor:'#D9B24C',opacity:.10},
 iconWrap:{width:31,height:31,borderRadius:10,alignItems:'center',justifyContent:'center'},iconWrapActive:{backgroundColor:'#2A2415',borderWidth:1,borderColor:'#6F5928'},
 label:{fontSize:8,fontWeight:'900',color:'#7E8798'},labelActive:{color:'#F2CF69'},activeDot:{width:4,height:4,borderRadius:2,backgroundColor:'#F2CF69',marginTop:1},pressed:{opacity:.68}
});