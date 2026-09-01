import { type ReactNode, useEffect, useMemo } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

type AuraIntensity='soft'|'premium'|'master';

const sharedAuraFlow=new Animated.Value(0);
let sharedAuraLoop:Animated.CompositeAnimation|null=null;
let sharedAuraUsers=0;
let sharedAuraReduceMotion:boolean|null=null;

function startSharedAura(){
  sharedAuraUsers+=1;
  if(sharedAuraUsers>1)return;

  const start=(reduce:boolean)=>{
    sharedAuraReduceMotion=reduce;
    sharedAuraLoop?.stop();
    sharedAuraLoop=null;

    if(reduce){
      sharedAuraFlow.setValue(.42);
      return;
    }

    sharedAuraFlow.setValue(0);
    const native=Platform.OS!=='web';
    sharedAuraLoop=Animated.loop(
      Animated.timing(sharedAuraFlow,{
        toValue:1,
        duration:5200,
        useNativeDriver:native,
      }),
    );
    sharedAuraLoop.start();
  };

  if(sharedAuraReduceMotion!=null){
    start(sharedAuraReduceMotion);
    return;
  }

  void AccessibilityInfo.isReduceMotionEnabled()
    .then(start)
    .catch(()=>start(false));
}

function stopSharedAura(){
  sharedAuraUsers=Math.max(0,sharedAuraUsers-1);
  if(sharedAuraUsers===0){
    sharedAuraLoop?.stop();
    sharedAuraLoop=null;
  }
}

const STARS=[
  ['11%','19%',3],
  ['23%','72%',2],
  ['39%','27%',3],
  ['57%','78%',2],
  ['71%','21%',3],
  ['86%','62%',2],
] as const;

/**
 * Reusable premium aura wrapper.
 *
 * Important: foreground effects are intentionally rendered AFTER children.
 * This keeps the animation visible even when the wrapped card has an opaque
 * background (decks, cosmetics, guild gyms, card styles, store items, etc).
 *
 * Every AuraFrame shares one Animated.Value, so dense grids do not spawn an
 * animation loop per card.
 */
export function AuraFrame({
  children,
  primaryColor,
  secondaryColor,
  intensity='premium',
  radius=20,
  variant='energy',
  style,
}:{
  children:ReactNode;
  primaryColor:string;
  secondaryColor?:string;
  intensity?:AuraIntensity;
  radius?:number;
  variant?:'energy'|'galaxy';
  style?:StyleProp<ViewStyle>;
}){
  const second=secondaryColor??'#FFD447';

  useEffect(()=>{
    startSharedAura();
    return stopSharedAura;
  },[]);

  const config=useMemo(()=>{
    if(intensity==='master')return {border:.96,glow:.25,shine:.22,particle:.95,rail:3.5};
    if(intensity==='premium')return {border:.72,glow:.17,shine:.15,particle:.72,rail:3};
    return {border:.44,glow:.10,shine:.08,particle:.42,rail:2.5};
  },[intensity]);

  const pulse=sharedAuraFlow.interpolate({
    inputRange:[0,.25,.5,.75,1],
    outputRange:[.34,.72,1,.66,.34],
  });
  const pulseScale=sharedAuraFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[.998,intensity==='master'?1.022:1.014,.998],
  });
  const topX=sharedAuraFlow.interpolate({
    inputRange:[0,1],
    outputRange:[-120,620],
  });
  const bottomX=sharedAuraFlow.interpolate({
    inputRange:[0,1],
    outputRange:[620,-120],
  });
  const shineX=sharedAuraFlow.interpolate({
    inputRange:[0,.62,.63,1],
    outputRange:[-170,590,590,590],
  });
  const driftA=sharedAuraFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[-18,18,-18],
  });
  const driftB=sharedAuraFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[16,-20,16],
  });
  const twinkle=sharedAuraFlow.interpolate({
    inputRange:[0,.2,.45,.72,1],
    outputRange:[.25,1,.35,.88,.25],
  });

  return (
    <View style={[styles.shell,{borderRadius:radius},style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outer,
          {
            borderRadius:radius+4,
            borderColor:primaryColor,
            opacity:Animated.multiply(pulse,config.border),
            transform:[{scale:pulseScale}],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerSecond,
          {
            borderRadius:radius+8,
            borderColor:second,
            opacity:Animated.multiply(pulse,intensity==='master'?.42:.24),
          },
        ]}
      />

      <View style={[styles.content,{borderRadius:radius}]}>
        <View style={styles.inner}>{children}</View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            styles.glowA,
            {
              backgroundColor:primaryColor,
              opacity:Animated.multiply(pulse,config.glow),
              transform:[{translateX:driftA},{scale:pulseScale}],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            styles.glowB,
            {
              backgroundColor:second,
              opacity:Animated.multiply(pulse,config.glow*.75),
              transform:[{translateX:driftB}],
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.flowTop,
            {
              height:config.rail,
              backgroundColor:primaryColor,
              opacity:Animated.multiply(pulse,config.border),
              transform:[{translateX:topX}],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flowBottom,
            {
              height:config.rail,
              backgroundColor:second,
              opacity:Animated.multiply(pulse,config.border),
              transform:[{translateX:bottomX}],
            },
          ]}
        />

        {intensity!=='soft'?(
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shine,
              {
                backgroundColor:'#FFFFFF',
                opacity:config.shine,
                transform:[{translateX:shineX},{rotate:'16deg'}],
              },
            ]}
          />
        ):null}

        <View
          pointerEvents="none"
          style={[
            styles.innerStroke,
            {
              borderRadius:Math.max(8,radius-5),
              borderColor:`${second}78`,
            },
          ]}
        />

        <Animated.View pointerEvents="none" style={[styles.gem,styles.gemTL,{backgroundColor:second,opacity:twinkle}]}/>
        <Animated.View pointerEvents="none" style={[styles.gem,styles.gemBR,{backgroundColor:primaryColor,opacity:pulse}]}/>

        {intensity!=='soft'?STARS.map(([left,top,size],index)=>(
          <Animated.View
            key={index}
            pointerEvents="none"
            style={[
              styles.star,
              {
                left:left as any,
                top:top as any,
                width:size,
                height:size,
                borderRadius:999,
                backgroundColor:index%3===0?'#FFFFFF':index%2?second:primaryColor,
                opacity:Animated.multiply(index%2?twinkle:pulse,config.particle),
              },
            ]}
          />
        )):null}

        {variant==='galaxy'?(
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.nebula,
                {
                  backgroundColor:'#8B5CFF',
                  opacity:Animated.multiply(pulse,intensity==='master'?.13:.09),
                  transform:[{translateX:bottomX},{rotate:'-9deg'}],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.nebulaSmall,
                {
                  backgroundColor:'#55E6FF',
                  opacity:Animated.multiply(twinkle,intensity==='master'?.10:.07),
                  transform:[{translateX:topX},{rotate:'10deg'}],
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.galaxyOrb,
                {
                  backgroundColor:'#E056FD',
                  opacity:Animated.multiply(pulse,.10),
                  transform:[{translateX:driftA},{scale:pulseScale}],
                },
              ]}
            />
          </>
        ):null}
      </View>
    </View>
  );
}

const styles=StyleSheet.create({
  shell:{position:'relative',overflow:'visible'},
  outer:{position:'absolute',left:-3,right:-3,top:-3,bottom:-3,borderWidth:2},
  outerSecond:{position:'absolute',left:-7,right:-7,top:-7,bottom:-7,borderWidth:1},
  content:{overflow:'hidden',position:'relative'},
  inner:{position:'relative',zIndex:2},
  glow:{position:'absolute',borderRadius:999,zIndex:5},
  glowA:{width:180,height:180,right:-64,top:-74},
  glowB:{width:150,height:150,left:-54,bottom:-68},
  flowTop:{position:'absolute',top:0,left:0,width:110,borderRadius:999,zIndex:12},
  flowBottom:{position:'absolute',bottom:0,left:0,width:110,borderRadius:999,zIndex:12},
  shine:{position:'absolute',top:-70,bottom:-70,width:26,borderRadius:999,zIndex:9},
  innerStroke:{...StyleSheet.absoluteFillObject,margin:4,borderWidth:1,zIndex:7},
  gem:{position:'absolute',width:7,height:7,borderRadius:2,zIndex:13},
  gemTL:{left:8,top:8},
  gemBR:{right:8,bottom:8},
  star:{position:'absolute',zIndex:10},
  nebula:{position:'absolute',left:-220,top:'24%',width:270,height:30,borderRadius:999,zIndex:6},
  nebulaSmall:{position:'absolute',left:-185,bottom:'18%',width:220,height:21,borderRadius:999,zIndex:6},
  galaxyOrb:{position:'absolute',right:-44,top:'18%',width:120,height:120,borderRadius:999,zIndex:5},
});
