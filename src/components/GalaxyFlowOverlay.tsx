import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';

const STARS = [
  ['8%','18%',3,.10],['17%','65%',2,.28],['26%','34%',4,.46],['35%','78%',2,.64],
  ['46%','13%',3,.82],['55%','56%',2,.20],['63%','28%',4,.38],['72%','76%',3,.56],
  ['81%','42%',2,.74],['90%','20%',4,.92],['94%','69%',2,.34],['12%','87%',3,.70],
] as const;

export function GalaxyFlowOverlay({
  intensity='premium',
  opacity=1,
}:{
  intensity?:'soft'|'premium'|'master';
  opacity?:number;
}) {
  const flow=useRef(new Animated.Value(0)).current;
  const pulse=useRef(new Animated.Value(0)).current;
  const [reduceMotion,setReduceMotion]=useState(false);

  useEffect(()=>{
    let mounted=true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value)=>{
      if(mounted)setReduceMotion(Boolean(value));
    }).catch(()=>undefined);
    return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(reduceMotion){
      flow.setValue(.42);
      pulse.setValue(.55);
      return;
    }
    const native=Platform.OS!=='web';
    const flowLoop=Animated.loop(Animated.timing(flow,{
      toValue:1,duration:intensity==='master'?6200:7800,useNativeDriver:native,
    }));
    const pulseLoop=Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1,duration:2300,useNativeDriver:native}),
      Animated.timing(pulse,{toValue:0,duration:2300,useNativeDriver:native}),
    ]));
    flowLoop.start(); pulseLoop.start();
    return()=>{flowLoop.stop();pulseLoop.stop();};
  },[flow,intensity,pulse,reduceMotion]);

  const driftA=flow.interpolate({inputRange:[0,1],outputRange:[-52,62]});
  const driftB=flow.interpolate({inputRange:[0,1],outputRange:[48,-66]});
  const driftY=pulse.interpolate({inputRange:[0,1],outputRange:[-12,14]});
  const scale=pulse.interpolate({inputRange:[0,1],outputRange:[.92,1.12]});
  const ringRotate=flow.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  const ringRotateBack=flow.interpolate({inputRange:[0,1],outputRange:['360deg','0deg']});
  const strength=intensity==='master'?1:intensity==='premium'?.72:.44;

  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.root,{opacity}]}>
    <Animated.View style={[styles.nebula,styles.nebulaA,{
      backgroundColor:'#7A49FF',opacity:.18*strength,
      transform:[{translateX:driftA},{translateY:driftY},{scale}],
    }]}/>
    <Animated.View style={[styles.nebula,styles.nebulaB,{
      backgroundColor:'#21D4FD',opacity:.16*strength,
      transform:[{translateX:driftB},{translateY:driftY},{scale}],
    }]}/>
    <Animated.View style={[styles.nebula,styles.nebulaC,{
      backgroundColor:'#E056FD',opacity:.14*strength,
      transform:[{translateX:driftA},{scale}],
    }]}/>
    <Animated.View style={[styles.orbit,styles.orbitOuter,{borderColor:'#8B5CFF',opacity:.24*strength,transform:[{rotate:ringRotate}]}]}/>
    <Animated.View style={[styles.orbit,styles.orbitInner,{borderColor:'#5CE1E6',opacity:.28*strength,transform:[{rotate:ringRotateBack}]}]}/>
    {STARS.map(([left,top,size,phase],index)=>{
      const starOpacity=pulse.interpolate({
        inputRange:[0,Math.max(.05,phase),1],
        outputRange:[.18,.95,.25],
      });
      const rise=flow.interpolate({inputRange:[0,1],outputRange:[index%2?7:-5,index%2?-8:9]});
      return <Animated.View key={index} style={[styles.star,{
        left:left as any,top:top as any,width:size,height:size,borderRadius:size,
        backgroundColor:index%3===0?'#FFFFFF':index%3===1?'#8EE7FF':'#D8B8FF',
        opacity:Animated.multiply(starOpacity,strength),
        transform:[{translateY:rise}],
      }]}/>;
    })}
    <Animated.View style={[styles.flowRibbon,styles.ribbonA,{
      borderColor:'#8B5CFF',opacity:.22*strength,
      transform:[{translateX:driftA},{rotate:'-14deg'}],
    }]}/>
    <Animated.View style={[styles.flowRibbon,styles.ribbonB,{
      borderColor:'#55E6FF',opacity:.20*strength,
      transform:[{translateX:driftB},{rotate:'18deg'}],
    }]}/>
  </View>;
}

const styles=StyleSheet.create({
  root:{overflow:'hidden'},
  nebula:{position:'absolute',borderRadius:999},
  nebulaA:{width:260,height:180,right:-80,top:-70},
  nebulaB:{width:230,height:165,left:-80,bottom:-60},
  nebulaC:{width:160,height:130,left:'38%',top:'23%'},
  orbit:{position:'absolute',borderRadius:999,borderWidth:1.5},
  orbitOuter:{width:330,height:150,left:'50%',top:'42%',marginLeft:-165,marginTop:-75},
  orbitInner:{width:230,height:105,left:'50%',top:'42%',marginLeft:-115,marginTop:-52},
  star:{position:'absolute'},
  flowRibbon:{position:'absolute',borderWidth:2,borderRadius:999},
  ribbonA:{width:360,height:76,right:-110,top:20},
  ribbonB:{width:310,height:68,left:-120,bottom:20},
});
