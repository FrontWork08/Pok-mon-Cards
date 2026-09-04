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

type BannerVisual = {
  premium:boolean;
  galaxy:boolean;
  tier:2|3|4|5;
  primary:string;
  secondary:string;
  tertiary:string;
  background:string;
};

const sharedFlow=new Animated.Value(0);
let sharedLoop:Animated.CompositeAnimation|null=null;
let sharedUsers=0;
let sharedReduceMotion:boolean|null=null;

function startSharedFlow(){
  sharedUsers+=1;
  if(sharedUsers>1)return;

  const start=(reduce:boolean)=>{
    sharedReduceMotion=reduce;
    sharedLoop?.stop();
    sharedLoop=null;

    if(reduce){
      sharedFlow.setValue(.42);
      return;
    }

    sharedFlow.setValue(0);
    const native=Platform.OS!=='web';
    sharedLoop=Animated.loop(Animated.sequence([
      Animated.timing(sharedFlow,{toValue:1,duration:7200,useNativeDriver:native}),
      Animated.timing(sharedFlow,{toValue:0,duration:7900,useNativeDriver:native}),
    ]));
    sharedLoop.start();
  };

  if(sharedReduceMotion!=null){
    start(sharedReduceMotion);
    return;
  }

  void AccessibilityInfo.isReduceMotionEnabled()
    .then(start)
    .catch(()=>start(false));
}

function stopSharedFlow(){
  sharedUsers=Math.max(0,sharedUsers-1);
  if(sharedUsers===0){
    sharedLoop?.stop();
    sharedLoop=null;
  }
}

function visualFor(frameId?:string|null,backgroundId?:string|null,fallback='#6A7CFF'):BannerVisual{
  const frame=String(frameId??'').toLowerCase();
  const background=String(backgroundId??'').toLowerCase();
  const key=`${frame} ${background}`;
  if(key.includes('galaxy')) return {
    premium:true,galaxy:true,tier:5,primary:'#8B5CFF',secondary:'#55E6FF',tertiary:'#E056FD',background:'#151027',
  };
  if(key.includes('aurora')||key.includes('prism')||key.includes('cosmetic_pass_nebula')) return {
    premium:true,galaxy:true,tier:4,primary:'#8B5CFF',secondary:'#55E6FF',tertiary:'#C493FF',background:'#120D2B',
  };
  if(key.includes('trainer_vip')) return {
    premium:true,galaxy:false,tier:4,primary:'#FFD447',secondary:'#8B5CFF',tertiary:'#FFF0A8',background:'#15102B',
  };
  if(key.includes('kanto')) return {
    premium:true,galaxy:false,tier:3,primary:'#E84D5B',secondary:'#FF9A71',tertiary:'#FFD0A8',background:'#35151B',
  };
  if(key.includes('johto')) return {
    premium:true,galaxy:false,tier:3,primary:'#F0C84B',secondary:'#FFF0A8',tertiary:'#FF9F2F',background:'#30280E',
  };
  if(key.includes('platinum')) return {
    premium:true,galaxy:false,tier:3,primary:'#9CB6FF',secondary:'#D7E2FF',tertiary:'#6A7CFF',background:'#17203C',
  };
  if(key.includes('midnight')) return {
    premium:true,galaxy:false,tier:3,primary:'#586A9E',secondary:'#8EA3E8',tertiary:'#AFA8FF',background:'#0B1020',
  };
  if(key.includes('collector')) return {
    premium:true,galaxy:false,tier:3,primary:'#65D894',secondary:'#A7F3C7',tertiary:'#55E6FF',background:'#123023',
  };
  if(key.includes('guild')) return {
    premium:true,galaxy:false,tier:3,primary:'#68D9FF',secondary:'#B7EEFF',tertiary:'#6A7CFF',background:'#102C3A',
  };
  if(key.includes('classic')) return {
    premium:true,galaxy:false,tier:3,primary:'#FFD447',secondary:'#FFF0A8',tertiary:'#8EE7FF',background:'#111827',
  };
  if(key.includes('master')) return {
    premium:true,galaxy:false,tier:5,primary:'#C493FF',secondary:'#8EE7FF',tertiary:'#F0CBFF',background:'#191329',
  };
  if(key.includes('crimson')||key.includes('crown')) return {
    premium:true,galaxy:false,tier:4,primary:'#FF667A',secondary:'#FFB36B',tertiary:'#FFD3A1',background:'#271419',
  };
  if(key.includes('champion')||key.includes('gold')) return {
    premium:true,galaxy:false,tier:4,primary:'#FFD447',secondary:'#FFF0A8',tertiary:'#FF9F2F',background:'#28220E',
  };
  if(key.includes('indigo')) return {
    premium:true,galaxy:false,tier:3,primary:'#6A7CFF',secondary:'#55D9FF',tertiary:'#AFA8FF',background:'#121A36',
  };
  if(/^(coin_|lux_)/.test(frame)||/^(coin_|lux_)/.test(background)) return {
    premium:true,galaxy:false,tier:2,primary:fallback,secondary:'#FFD447',tertiary:'#8EE7FF',background:'#111B2C',
  };
  if(frame||background) return {
    premium:true,galaxy:false,tier:2,primary:'#6A7CFF',secondary:'#55D9FF',tertiary:'#AFA8FF',background:'#111827',
  };
  return {
    premium:false,galaxy:false,tier:2,primary:fallback,secondary:fallback,tertiary:fallback,background:'transparent',
  };
}

/**
 * Premium identity banner for dense rankings and social lists.
 *
 * All rows share one Animated.Value, so 100 visible trainers still use a
 * single animation loop. Effects are rendered ABOVE the row content instead
 * of behind its opaque background.
 */
export function CompactTrainerBanner({
  children,
  frameId,
  backgroundId,
  fallbackColor='#6A7CFF',
  selected=false,
  style,
}:{
  children:ReactNode;
  frameId?:string|null;
  backgroundId?:string|null;
  fallbackColor?:string;
  selected?:boolean;
  style?:StyleProp<ViewStyle>;
}){
  const visual=useMemo(
    ()=>visualFor(frameId,backgroundId,fallbackColor),
    [backgroundId,fallbackColor,frameId],
  );

  useEffect(()=>{
    if(!visual.premium)return;
    startSharedFlow();
    return stopSharedFlow;
  },[visual.premium]);

  if(!visual.premium){
    return <View style={style}>{children}</View>;
  }

  const railForward=sharedFlow.interpolate({
    inputRange:[0,1],
    outputRange:[-150,640],
  });
  const railBackward=sharedFlow.interpolate({
    inputRange:[0,1],
    outputRange:[640,-150],
  });
  const pulse=sharedFlow.interpolate({
    inputRange:[0,.25,.5,.75,1],
    outputRange:[.26,.65,.95,.60,.26],
  });
  const pulseScale=sharedFlow.interpolate({
    inputRange:[0,.5,1],
    outputRange:[1,visual.tier>=4?1.035:1.022,1],
  });
  const shineX=sharedFlow.interpolate({
    inputRange:[0,.66,.67,1],
    outputRange:[-170,640,640,640],
  });
  const twinkle=sharedFlow.interpolate({
    inputRange:[0,.2,.42,.62,.8,1],
    outputRange:[.25,1,.38,.92,.32,.25],
  });

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor:selected?visual.secondary:visual.primary,
          backgroundColor:visual.background,
        },
        style,
      ]}
    >
      <View style={styles.content}>{children}</View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerPulse,
          {
            borderColor:visual.secondary,
            opacity:pulse,
            transform:[{scale:pulseScale}],
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowRight,
          {
            backgroundColor:visual.primary,
            opacity:visual.tier>=4?Animated.multiply(pulse,.24):Animated.multiply(pulse,.15),
            transform:[{scale:pulseScale}],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowLeft,
          {
            backgroundColor:visual.secondary,
            opacity:visual.tier>=4?Animated.multiply(pulse,.18):Animated.multiply(pulse,.12),
          },
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.rail,
          styles.railTop,
          {
            backgroundColor:visual.secondary,
            opacity:visual.tier>=4?.98:.82,
            transform:[{translateX:railForward}],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.rail,
          styles.railBottom,
          {
            backgroundColor:visual.tertiary,
            opacity:visual.tier>=4?.90:.72,
            transform:[{translateX:railBackward}],
          },
        ]}
      />

      {visual.tier>=3 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            {
              backgroundColor:visual.tier>=4?'#FFFFFF':'#D9F7FF',
              opacity:visual.tier>=4?.22:.13,
              transform:[{translateX:shineX},{rotate:'16deg'}],
            },
          ]}
        />
      ):null}

      <View pointerEvents="none" style={[styles.innerLine,{borderColor:`${visual.secondary}B8`}]}/>
      <Animated.View pointerEvents="none" style={[styles.gem,styles.gemTL,{backgroundColor:visual.secondary,opacity:twinkle,transform:[{scale:pulseScale}]}]}/>
      <Animated.View pointerEvents="none" style={[styles.gem,styles.gemBR,{backgroundColor:visual.tertiary,opacity:twinkle,transform:[{scale:pulseScale}]}]}/>

      {visual.galaxy ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.star,{left:'22%',top:7,backgroundColor:'#FFFFFF',opacity:twinkle,transform:[{scale:pulseScale}]}]}/>
          <Animated.View pointerEvents="none" style={[styles.starSmall,{left:'67%',bottom:8,backgroundColor:'#55E6FF',opacity:pulse}]}/>
          <Animated.View pointerEvents="none" style={[styles.starSmall,{right:24,top:13,backgroundColor:'#E9D4FF',opacity:twinkle}]}/>
          <Animated.View pointerEvents="none" style={[styles.nebulaRibbon,{backgroundColor:'#8B5CFF',opacity:Animated.multiply(pulse,.10),transform:[{translateX:railBackward},{rotate:'-9deg'}]}]}/>
          <Animated.View pointerEvents="none" style={[styles.nebulaRibbonSmall,{backgroundColor:'#E056FD',opacity:Animated.multiply(twinkle,.08),transform:[{translateX:railForward},{rotate:'8deg'}]}]}/>
        </>
      ):null}
    </View>
  );
}

const styles=StyleSheet.create({
  shell:{
    position:'relative',
    overflow:'hidden',
    borderRadius:18,
    borderWidth:2,
  },
  content:{position:'relative',zIndex:2},
  outerPulse:{
    ...StyleSheet.absoluteFillObject,
    margin:1,
    borderWidth:1.5,
    borderRadius:16,
    zIndex:8,
  },
  glowRight:{
    position:'absolute',
    right:-36,
    top:-44,
    width:150,
    height:150,
    borderRadius:999,
    zIndex:5,
  },
  glowLeft:{
    position:'absolute',
    left:-34,
    bottom:-48,
    width:126,
    height:126,
    borderRadius:999,
    zIndex:5,
  },
  rail:{
    position:'absolute',
    left:0,
    width:132,
    height:3,
    borderRadius:999,
    zIndex:11,
  },
  railTop:{top:0},
  railBottom:{bottom:0},
  shine:{
    position:'absolute',
    top:-52,
    bottom:-52,
    width:24,
    borderRadius:999,
    zIndex:9,
  },
  innerLine:{
    ...StyleSheet.absoluteFillObject,
    margin:4,
    borderRadius:13,
    borderWidth:.8,
    zIndex:7,
  },
  gem:{position:'absolute',width:7,height:7,borderRadius:2,zIndex:12},
  gemTL:{left:7,top:7},
  gemBR:{right:7,bottom:7},
  star:{position:'absolute',width:4,height:4,borderRadius:999,zIndex:10},
  starSmall:{position:'absolute',width:3,height:3,borderRadius:999,zIndex:10},
  nebulaRibbon:{
    position:'absolute',
    top:'28%',
    left:-190,
    width:240,
    height:24,
    borderRadius:999,
    zIndex:6,
  },
  nebulaRibbonSmall:{
    position:'absolute',
    bottom:'20%',
    left:-170,
    width:190,
    height:16,
    borderRadius:999,
    zIndex:6,
  },
});
