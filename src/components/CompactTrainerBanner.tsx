import { type ReactNode, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type BannerVisual = {
  premium:boolean;
  galaxy:boolean;
  primary:string;
  secondary:string;
  tertiary:string;
  background:string;
};

function visualFor(frameId?:string|null,backgroundId?:string|null,fallback='#6A7CFF'):BannerVisual{
  const frame=String(frameId??'').toLowerCase();
  const background=String(backgroundId??'').toLowerCase();
  const key=`${frame} ${background}`;
  if(key.includes('galaxy')) return {
    premium:true,galaxy:true,primary:'#8B5CFF',secondary:'#55E6FF',tertiary:'#E056FD',background:'#151027',
  };
  if(key.includes('master')) return {
    premium:true,galaxy:false,primary:'#C493FF',secondary:'#8EE7FF',tertiary:'#F0CBFF',background:'#191329',
  };
  if(key.includes('crimson')||key.includes('crown')) return {
    premium:true,galaxy:false,primary:'#FF667A',secondary:'#FFB36B',tertiary:'#FFD3A1',background:'#271419',
  };
  if(key.includes('champion')||key.includes('gold')) return {
    premium:true,galaxy:false,primary:'#FFD447',secondary:'#FFF0A8',tertiary:'#FF9F2F',background:'#28220E',
  };
  if(key.includes('indigo')) return {
    premium:true,galaxy:false,primary:'#6A7CFF',secondary:'#55D9FF',tertiary:'#AFA8FF',background:'#121A36',
  };
  if(/^(coin_|lux_)/.test(frame)||/^(coin_|lux_)/.test(background)) return {
    premium:true,galaxy:false,primary:fallback,secondary:'#FFD447',tertiary:'#8EE7FF',background:'#111B2C',
  };
  return {
    premium:false,galaxy:false,primary:fallback,secondary:fallback,tertiary:fallback,background:'transparent',
  };
}

/**
 * Lightweight identity banner for dense lists/rankings.
 *
 * Deliberately avoids Animated loops: rankings can contain dozens of players.
 * The full profile keeps the expensive animated PremiumProfileFrame, while
 * this compact representation preserves prestige without reintroducing lag.
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

  if(!visual.premium){
    return <View style={style}>{children}</View>;
  }

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
      <View pointerEvents="none" style={[styles.glowRight,{backgroundColor:visual.primary}]}/>
      <View pointerEvents="none" style={[styles.glowLeft,{backgroundColor:visual.secondary}]}/>
      <View pointerEvents="none" style={[styles.railTop,{backgroundColor:visual.secondary}]}/>
      <View pointerEvents="none" style={[styles.railBottom,{backgroundColor:visual.tertiary}]}/>
      <View pointerEvents="none" style={[styles.innerLine,{borderColor:`${visual.secondary}88`}]}/>
      <View pointerEvents="none" style={[styles.gem,styles.gemTL,{backgroundColor:visual.secondary}]}/>
      <View pointerEvents="none" style={[styles.gem,styles.gemBR,{backgroundColor:visual.tertiary}]}/>
      {visual.galaxy ? (
        <>
          <View pointerEvents="none" style={[styles.star,{left:'22%',top:7,backgroundColor:'#FFFFFF'}]}/>
          <View pointerEvents="none" style={[styles.starSmall,{left:'67%',bottom:8,backgroundColor:'#55E6FF'}]}/>
          <View pointerEvents="none" style={[styles.starSmall,{right:24,top:13,backgroundColor:'#E9D4FF'}]}/>
        </>
      ):null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles=StyleSheet.create({
  shell:{
    position:'relative',
    overflow:'hidden',
    borderRadius:18,
    borderWidth:1.5,
  },
  content:{position:'relative',zIndex:3},
  glowRight:{position:'absolute',right:-42,top:-46,width:130,height:130,borderRadius:999,opacity:.13},
  glowLeft:{position:'absolute',left:-38,bottom:-54,width:112,height:112,borderRadius:999,opacity:.10},
  railTop:{position:'absolute',top:0,left:'9%',width:'35%',height:2,borderRadius:999,opacity:.92,zIndex:2},
  railBottom:{position:'absolute',bottom:0,right:'8%',width:'30%',height:2,borderRadius:999,opacity:.72,zIndex:2},
  innerLine:{...StyleSheet.absoluteFillObject,margin:3,borderRadius:14,borderWidth:.7,zIndex:1},
  gem:{position:'absolute',width:6,height:6,borderRadius:2,zIndex:4},
  gemTL:{left:7,top:7},
  gemBR:{right:7,bottom:7},
  star:{position:'absolute',width:3,height:3,borderRadius:999,zIndex:2,opacity:.90},
  starSmall:{position:'absolute',width:2,height:2,borderRadius:999,zIndex:2,opacity:.82},
});
