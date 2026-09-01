import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

type GalaxyIntensity='soft'|'premium'|'master';

const sharedDrift=new Animated.Value(.36);
const sharedTwinkle=new Animated.Value(.28);
let driftLoop:Animated.CompositeAnimation|null=null;
let twinkleLoop:Animated.CompositeAnimation|null=null;
let galaxyUsers=0;
let reduceMotionCache:boolean|null=null;

const STARS=[
  ['8%','18%',3,.10],['17%','65%',2,.28],['26%','34%',4,.46],['35%','78%',2,.64],
  ['46%','13%',3,.82],['55%','56%',2,.20],['63%','28%',4,.38],['72%','76%',3,.56],
  ['81%','42%',2,.74],['90%','20%',4,.92],['94%','69%',2,.34],['12%','87%',3,.70],
] as const;

function startSharedGalaxy(){
  galaxyUsers+=1;
  if(galaxyUsers>1)return;

  const start=(reduce:boolean)=>{
    reduceMotionCache=reduce;
    driftLoop?.stop();
    twinkleLoop?.stop();
    driftLoop=null;
    twinkleLoop=null;

    if(galaxyUsers<=0)return;

    if(reduce){
      sharedDrift.setValue(.42);
      sharedTwinkle.setValue(.55);
      return;
    }

    const native=Platform.OS!=='web';
    sharedDrift.setValue(0);
    sharedTwinkle.setValue(0);

    driftLoop=Animated.loop(
      Animated.timing(sharedDrift,{
        toValue:1,
        duration:7200,
        useNativeDriver:native,
      }),
    );
    twinkleLoop=Animated.loop(Animated.sequence([
      Animated.timing(sharedTwinkle,{toValue:1,duration:2300,useNativeDriver:native}),
      Animated.timing(sharedTwinkle,{toValue:0,duration:2300,useNativeDriver:native}),
    ]));

    driftLoop.start();
    twinkleLoop.start();
  };

  if(reduceMotionCache!=null){
    start(reduceMotionCache);
    return;
  }

  void AccessibilityInfo.isReduceMotionEnabled()
    .then(start)
    .catch(()=>start(false));
}

function stopSharedGalaxy(){
  galaxyUsers=Math.max(0,galaxyUsers-1);
  if(galaxyUsers===0){
    driftLoop?.stop();
    twinkleLoop?.stop();
    driftLoop=null;
    twinkleLoop=null;
  }
}

/**
 * Galaxy Flow clássico: neon cósmico, órbitas, estrelas, nebulosas e
 * faixas de energia. Mantém loops compartilhados para não pesar em grids.
 */
export function GalaxyFlowOverlay({
  intensity='premium',
  opacity=1,
}:{
  intensity?:GalaxyIntensity;
  opacity?:number;
}){
  useEffect(()=>{
    startSharedGalaxy();
    return stopSharedGalaxy;
  },[]);

  const strength=intensity==='master'?1:intensity==='premium'?.72:.44;
  const driftA=sharedDrift.interpolate({inputRange:[0,1],outputRange:[-52,62]});
  const driftB=sharedDrift.interpolate({inputRange:[0,1],outputRange:[48,-66]});
  const driftY=sharedTwinkle.interpolate({inputRange:[0,1],outputRange:[-12,14]});
  const scale=sharedTwinkle.interpolate({inputRange:[0,1],outputRange:[.92,1.12]});
  const ringRotate=sharedDrift.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  const ringRotateBack=sharedDrift.interpolate({inputRange:[0,1],outputRange:['360deg','0deg']});

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.root,{opacity}]}>
      <Animated.View style={[styles.nebula,styles.nebulaA,{
        backgroundColor:'#7A49FF',
        opacity:.18*strength,
        transform:[{translateX:driftA},{translateY:driftY},{scale}],
      }]}/>
      <Animated.View style={[styles.nebula,styles.nebulaB,{
        backgroundColor:'#21D4FD',
        opacity:.16*strength,
        transform:[{translateX:driftB},{translateY:driftY},{scale}],
      }]}/>
      <Animated.View style={[styles.nebula,styles.nebulaC,{
        backgroundColor:'#E056FD',
        opacity:.14*strength,
        transform:[{translateX:driftA},{scale}],
      }]}/>

      <Animated.View style={[styles.orbit,styles.orbitOuter,{
        borderColor:'#8B5CFF',
        opacity:.24*strength,
        transform:[{rotate:ringRotate}],
      }]}/>
      <Animated.View style={[styles.orbit,styles.orbitInner,{
        borderColor:'#55E6FF',
        opacity:.28*strength,
        transform:[{rotate:ringRotateBack}],
      }]}/>

      {STARS.map(([left,top,size,phase],index)=>{
        const starOpacity=sharedTwinkle.interpolate({
          inputRange:[0,Math.max(.05,phase),1],
          outputRange:[.18,.95,.25],
        });
        const rise=sharedDrift.interpolate({
          inputRange:[0,1],
          outputRange:[index%2?7:-5,index%2?-8:9],
        });
        return (
          <Animated.View key={index} style={[styles.star,{
            left:left as any,
            top:top as any,
            width:size,
            height:size,
            borderRadius:size,
            backgroundColor:index%3===0?'#FFFFFF':index%3===1?'#8EE7FF':'#D8B8FF',
            opacity:Animated.multiply(starOpacity,strength),
            transform:[{translateY:rise}],
          }]}/>
        );
      })}

      <Animated.View style={[styles.flowRibbon,styles.ribbonA,{
        borderColor:'#8B5CFF',
        opacity:.22*strength,
        transform:[{translateX:driftA},{rotate:'-14deg'}],
      }]}/>
      <Animated.View style={[styles.flowRibbon,styles.ribbonB,{
        borderColor:'#55E6FF',
        opacity:.20*strength,
        transform:[{translateX:driftB},{rotate:'18deg'}],
      }]}/>
    </View>
  );
}

const styles=StyleSheet.create({
  root:{overflow:'hidden',zIndex:18},
  nebula:{position:'absolute',borderRadius:999},
  nebulaA:{width:260,height:180,right:-80,top:-70},
  nebulaB:{width:230,height:165,left:-80,bottom:-60},
  nebulaC:{width:160,height:130,left:'38%',top:'23%'},
  orbit:{position:'absolute',borderRadius:999,borderWidth:1.5},
  orbitOuter:{width:330,height:150,left:'50%',top:'42%',marginLeft:-165,marginTop:-75},
  orbitInner:{width:230,height:105,left:'50%',top:'42%',marginLeft:-115,marginTop:-52},
  star:{position:'absolute',zIndex:7},
  flowRibbon:{position:'absolute',borderWidth:2,borderRadius:999},
  ribbonA:{width:360,height:76,right:-110,top:20},
  ribbonB:{width:310,height:68,left:-120,bottom:20},
});
