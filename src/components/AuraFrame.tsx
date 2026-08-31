import { type ReactNode, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';

export function AuraFrame({
  children,
  primaryColor,
  secondaryColor,
  intensity = 'premium',
  radius = 20,
  variant = 'energy',
  style,
}: {
  children: ReactNode;
  primaryColor: string;
  secondaryColor?: string;
  intensity?: 'soft'|'premium'|'master';
  radius?: number;
  variant?: 'energy'|'galaxy';
  style?: StyleProp<ViewStyle>;
}) {
  const pulse=useRef(new Animated.Value(0)).current;
  const flow=useRef(new Animated.Value(0)).current;
  const second=secondaryColor??'#FFD447';
  const reduceMotion=useRef(false);

  useEffect(()=>{
    let mounted=true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value)=>{ if(mounted) reduceMotion.current=Boolean(value); }).catch(()=>undefined);
    return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(reduceMotion.current){
      pulse.setValue(.45);
      flow.setValue(.35);
      return;
    }
    const native=Platform.OS!=='web';
    const pulseLoop=Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1,duration:1800,useNativeDriver:native}),
      Animated.timing(pulse,{toValue:0,duration:1800,useNativeDriver:native}),
    ]));
    const flowLoop=Animated.loop(Animated.timing(flow,{
      toValue:1,
      duration:intensity==='master'?3400:4400,
      useNativeDriver:native,
    }));
    pulseLoop.start();
    flowLoop.start();
    return()=>{pulseLoop.stop();flowLoop.stop();};
  },[flow,intensity,pulse]);

  const opacity=pulse.interpolate({
    inputRange:[0,1],
    outputRange:[intensity==='soft'?.20:.34,intensity==='master'?.92:.66],
  });
  const scale=pulse.interpolate({inputRange:[0,1],outputRange:[.996,1.018]});
  const topX=flow.interpolate({inputRange:[0,1],outputRange:[-90,520]});
  const bottomX=flow.interpolate({inputRange:[0,1],outputRange:[520,-90]});

  return (
    <View style={[styles.shell,{borderRadius:radius},style]}>
      <Animated.View pointerEvents="none" style={[styles.outer,{
        borderRadius:radius+4,
        borderColor:primaryColor,
        opacity,
        transform:[{scale}],
      }]}/>
      <Animated.View pointerEvents="none" style={[styles.outerSecond,{
        borderRadius:radius+8,
        borderColor:second,
        opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.06,intensity==='master'?.36:.20]}),
      }]}/>
      <Animated.View pointerEvents="none" style={[styles.flowTop,{
        backgroundColor:primaryColor,
        opacity,
        transform:[{translateX:topX}],
      }]}/>
      <Animated.View pointerEvents="none" style={[styles.flowBottom,{
        backgroundColor:second,
        opacity,
        transform:[{translateX:bottomX}],
      }]}/>
      <View style={[styles.content,{borderRadius:radius}]}>
        {variant==='galaxy'?<GalaxyFlowOverlay intensity={intensity} opacity={intensity==='master'?1:.82}/>:null}
        <View style={styles.inner}>{children}</View>
      </View>
    </View>
  );
}

const styles=StyleSheet.create({
  shell:{position:'relative',overflow:'visible'},
  outer:{position:'absolute',left:-3,right:-3,top:-3,bottom:-3,borderWidth:2},
  outerSecond:{position:'absolute',left:-7,right:-7,top:-7,bottom:-7,borderWidth:1},
  flowTop:{position:'absolute',top:-3,left:0,width:92,height:3,borderRadius:999,zIndex:4},
  flowBottom:{position:'absolute',bottom:-3,left:0,width:92,height:3,borderRadius:999,zIndex:4},
  content:{overflow:'hidden'},
  inner:{position:'relative',zIndex:2},
});
