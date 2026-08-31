import { type ReactNode, useEffect, useMemo } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type MarketVisual = {
  primary:string;
  secondary:string;
  tertiary:string;
  glowA:string;
  glowB:string;
  premium:boolean;
  galaxy:boolean;
};

const marketFlow=new Animated.Value(0);
let marketLoop:Animated.CompositeAnimation|null=null;
let marketUsers=0;
let marketReduceMotion:boolean|null=null;

function startMarketFlow(){
  marketUsers+=1;
  if(marketUsers>1)return;

  const start=(reduce:boolean)=>{
    marketReduceMotion=reduce;
    marketLoop?.stop();
    marketLoop=null;
    if(reduce){
      marketFlow.setValue(.38);
      return;
    }

    marketFlow.setValue(0);
    const native=Platform.OS!=='web';
    marketLoop=Animated.loop(
      Animated.timing(marketFlow,{
        toValue:1,
        duration:5600,
        useNativeDriver:native,
      }),
    );
    marketLoop.start();
  };

  if(marketReduceMotion!=null){
    start(marketReduceMotion);
    return;
  }

  void AccessibilityInfo.isReduceMotionEnabled()
    .then(start)
    .catch(()=>start(false));
}

function stopMarketFlow(){
  marketUsers=Math.max(0,marketUsers-1);
  if(marketUsers===0){
    marketLoop?.stop();
    marketLoop=null;
  }
}

function visualFor(theme:string,accent:string):MarketVisual{
  if(theme==='galaxy')return {
    primary:'#8B5CFF',secondary:'#55E6FF',tertiary:'#E056FD',
    glowA:'#7A46FF',glowB:'#10D9FF',premium:true,galaxy:true,
  };
  if(theme==='master')return {
    primary:'#C493FF',secondary:'#8EE7FF',tertiary:'#F0CBFF',
    glowA:'#A36EFF',glowB:'#68DFFF',premium:true,galaxy:false,
  };
  if(theme==='celestial')return {
    primary:'#8EE7FF',secondary:'#D6FAFF',tertiary:'#7CA8FF',
    glowA:'#62DDFD',glowB:'#9FB6FF',premium:true,galaxy:false,
  };
  if(theme==='neon')return {
    primary:'#45F3FF',secondary:'#62FFB9',tertiary:'#CF55FF',
    glowA:'#12E9FF',glowB:'#B448FF',premium:true,galaxy:false,
  };
  if(theme==='royal')return {
    primary:'#FFD447',secondary:'#FFF1A4',tertiary:'#FF9B2F',
    glowA:'#FFD447',glowB:'#FF9B2F',premium:true,galaxy:false,
  };
  if(theme==='night')return {
    primary:'#9B7BFF',secondary:'#C9B7FF',tertiary:'#6D8BFF',
    glowA:'#7E5CFF',glowB:'#5E72FF',premium:true,galaxy:false,
  };
  return {
    primary:accent,secondary:'#FFFFFF',tertiary:accent,
    glowA:accent,glowB:accent,premium:false,galaxy:false,
  };
}

/**
 * Internal marketplace effect layer.
 *
 * Effects render above opaque listing content so expensive shop themes remain
 * visible inside the card, while every visible listing shares one animation.
 */
export function MarketplaceListingSurface({
  children,
  theme,
  accent,
  boosted=false,
  style,
}:{
  children:ReactNode;
  theme:string;
  accent:string;
  boosted?:boolean;
  style?:StyleProp<ViewStyle>;
}){
  const visual=useMemo(()=>visualFor(theme,accent),[accent,theme]);
  const active=visual.premium||boosted;

  useEffect(()=>{
    if(!active)return;
    startMarketFlow();
    return stopMarketFlow;
  },[active]);

  if(!active){
    return <View style={style}>{children}</View>;
  }

  const topRail=marketFlow.interpolate({
    inputRange:[0,1],
    outputRange:[-180,720],
  });
  const bottomRail=marketFlow.interpolate({
    inputRange:[0,1],
    outputRange:[720,-180],
  });
  const shineX=marketFlow.interpolate({
    inputRange:[0,.60,.61,1],
    outputRange:[-210,700,700,700],
  });
  const driftA=marketFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[-18,16,-18],
  });
  const driftB=marketFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[20,-14,20],
  });
  const pulse=marketFlow.interpolate({
    inputRange:[0,.25,.5,.75,1],
    outputRange:[.28,.70,1,.62,.28],
  });
  const starPulse=marketFlow.interpolate({
    inputRange:[0,.2,.45,.7,1],
    outputRange:[.28,1,.42,.88,.28],
  });

  return (
    <View style={[styles.shell,style]}>
      <View style={styles.content}>{children}</View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          styles.glowA,
          {
            backgroundColor:visual.glowA,
            opacity:Animated.multiply(pulse,visual.premium?.22:.14),
            transform:[{translateX:driftA}],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          styles.glowB,
          {
            backgroundColor:visual.glowB,
            opacity:Animated.multiply(pulse,visual.premium?.16:.10),
            transform:[{translateX:driftB}],
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.rail,
          styles.topRail,
          {
            backgroundColor:boosted?'#FFD447':visual.secondary,
            opacity:visual.premium?.98:.82,
            transform:[{translateX:topRail}],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rail,
          styles.bottomRail,
          {
            backgroundColor:visual.tertiary,
            opacity:visual.premium?.86:.68,
            transform:[{translateX:bottomRail}],
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.shine,
          {
            backgroundColor:'#FFFFFF',
            opacity:visual.premium?.16:.10,
            transform:[{translateX:shineX},{rotate:'15deg'}],
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.innerStroke,
          {borderColor:`${visual.secondary}70`},
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.cornerGem,
          styles.cornerTL,
          {backgroundColor:visual.secondary,opacity:starPulse},
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.cornerGem,
          styles.cornerBR,
          {backgroundColor:visual.tertiary,opacity:pulse},
        ]}
      />

      {visual.premium?(
        <>
          <Animated.View pointerEvents="none" style={[styles.spark,{left:'18%',top:'18%',backgroundColor:visual.secondary,opacity:starPulse}]}/>
          <Animated.View pointerEvents="none" style={[styles.sparkSmall,{left:'58%',top:'28%',backgroundColor:visual.tertiary,opacity:pulse}]}/>
          <Animated.View pointerEvents="none" style={[styles.sparkSmall,{right:'12%',bottom:'24%',backgroundColor:'#FFFFFF',opacity:starPulse}]}/>
        </>
      ):null}

      {visual.galaxy?(
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.nebula,
              {
                top:'20%',
                left:-220,
                backgroundColor:'#8B5CFF',
                opacity:Animated.multiply(pulse,.11),
                transform:[{translateX:bottomRail},{rotate:'-8deg'}],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.nebulaSmall,
              {
                bottom:'18%',
                left:-180,
                backgroundColor:'#55E6FF',
                opacity:Animated.multiply(starPulse,.08),
                transform:[{translateX:topRail},{rotate:'9deg'}],
              },
            ]}
          />
        </>
      ):null}
    </View>
  );
}

const styles=StyleSheet.create({
  shell:{
    position:'relative',
    overflow:'hidden',
    borderRadius:19,
  },
  content:{
    position:'relative',
    zIndex:2,
  },
  glow:{
    position:'absolute',
    borderRadius:999,
    zIndex:5,
  },
  glowA:{
    width:230,
    height:230,
    right:-80,
    top:-94,
  },
  glowB:{
    width:190,
    height:190,
    left:-68,
    bottom:-82,
  },
  rail:{
    position:'absolute',
    left:0,
    width:150,
    height:3,
    borderRadius:999,
    zIndex:12,
  },
  topRail:{top:0},
  bottomRail:{bottom:0},
  shine:{
    position:'absolute',
    top:-85,
    bottom:-85,
    width:34,
    borderRadius:999,
    zIndex:9,
  },
  innerStroke:{
    ...StyleSheet.absoluteFillObject,
    margin:5,
    borderWidth:1,
    borderRadius:14,
    zIndex:7,
  },
  cornerGem:{
    position:'absolute',
    width:8,
    height:8,
    borderRadius:2,
    zIndex:13,
  },
  cornerTL:{left:8,top:8},
  cornerBR:{right:8,bottom:8},
  spark:{
    position:'absolute',
    width:4,
    height:4,
    borderRadius:999,
    zIndex:10,
  },
  sparkSmall:{
    position:'absolute',
    width:3,
    height:3,
    borderRadius:999,
    zIndex:10,
  },
  nebula:{
    position:'absolute',
    width:280,
    height:34,
    borderRadius:999,
    zIndex:6,
  },
  nebulaSmall:{
    position:'absolute',
    width:220,
    height:22,
    borderRadius:999,
    zIndex:6,
  },
});
