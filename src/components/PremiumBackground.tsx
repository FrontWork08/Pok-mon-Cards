import { memo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

const STAR_POSITIONS=[
 ['8%','12%',8],['24%','22%',5],['72%','9%',7],['89%','31%',5],['61%','42%',6],['14%','63%',5],['80%','72%',7],['34%','86%',5],
] as const;

export const PremiumBackground=memo(function PremiumBackground(){
 const {colors,isLight,themeName}=useAppTheme();
 const visual=getThemeVisual(themeName);
 const webTexture=Platform.OS==='web'?({
   backgroundImage:
    'linear-gradient(135deg, rgba(217,178,76,.06), transparent 32%),'+
    'radial-gradient(circle at 82% 14%, rgba(217,178,76,.13) 0 90px, transparent 91px),'+
    'radial-gradient(circle at 18% 78%, rgba(109,130,255,.08) 0 120px, transparent 121px),'+
    'repeating-linear-gradient(118deg, rgba(255,255,255,.018) 0 1px, transparent 1px 22px)'
 } as any):null;
 return <View style={[styles.layer,{backgroundColor:colors.bg},webTexture]}>
   <View style={styles.goldArc}/>
   <View style={styles.blueArc}/>
   <View style={styles.diagonalA}/>
   <View style={styles.diagonalB}/>
   <Image source={{uri:visual.image}} resizeMode='contain' style={[styles.heroPokemon,{opacity:isLight?.08:.20}]}/>
   <Image source={{uri:visual.image}} resizeMode='contain' style={[styles.heroPokemonGhost,{opacity:isLight?.03:.055}]}/>
   {STAR_POSITIONS.map(([left,top,size],index)=><View key={index} style={{position:'absolute',left:left as any,top:top as any,opacity:isLight?.08:.16}}><Ionicons name='sparkles' size={size} color={index%2?'#D9B24C':'#7388FF'}/></View>)}
 </View>;
});

const styles=StyleSheet.create({
 layer:{...StyleSheet.absoluteFillObject,overflow:'hidden',pointerEvents:'none'} as any,
 heroPokemon:{position:'absolute',right:-45,top:'4%',width:360,height:430,transform:[{rotate:'7deg'}]},
 heroPokemonGhost:{position:'absolute',left:-120,bottom:'-4%',width:420,height:480,transform:[{rotate:'-13deg'},{scaleX:-1}]},
 goldArc:{position:'absolute',right:-95,top:-72,width:320,height:320,borderRadius:180,borderWidth:2,borderColor:'#D9B24C',opacity:.13},
 blueArc:{position:'absolute',left:-120,bottom:-95,width:390,height:390,borderRadius:220,borderWidth:2,borderColor:'#6D82FF',opacity:.08},
 diagonalA:{position:'absolute',width:'72%',height:2,right:'-18%',top:'37%',backgroundColor:'#D9B24C',opacity:.07,transform:[{rotate:'-17deg'}]},
 diagonalB:{position:'absolute',width:'66%',height:2,left:'-22%',bottom:'28%',backgroundColor:'#6D82FF',opacity:.05,transform:[{rotate:'14deg'}]}
});