import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

type GalaxyIntensity='soft'|'premium'|'master';

const sharedDrift=new Animated.Value(.42);
const sharedTwinkle=new Animated.Value(.35);
let driftLoop:Animated.CompositeAnimation|null=null;
let twinkleLoop:Animated.CompositeAnimation|null=null;
let galaxyUsers=0;
let reduceMotionCache:boolean|null=null;

const STARS=[
  ['6%','13%',1,.10],['12%','47%',1,.38],['17%','76%',2,.72],['23%','26%',1,.54],
  ['29%','61%',1,.18],['34%','9%',2,.86],['39%','83%',1,.31],['45%','39%',1,.64],
  ['51%','69%',2,.45],['57%','18%',1,.22],['63%','55%',1,.79],['69%','88%',1,.52],
  ['75%','31%',2,.12],['80%','73%',1,.67],['86%','14%',1,.41],['91%','46%',2,.91],
  ['95%','81%',1,.28],['9%','91%',1,.59],['48%','94%',1,.84],['72%','6%',1,.34],
] as const;

const BRIGHT_STARS=[
  ['18%','21%',.12],
  ['61%','34%',.62],
  ['83%','67%',.88],
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
      sharedTwinkle.setValue(.48);
      return;
    }

    const native=Platform.OS!=='web';
    sharedDrift.setValue(.36);
    sharedTwinkle.setValue(.28);

    driftLoop=Animated.loop(Animated.sequence([
      Animated.timing(sharedDrift,{toValue:1,duration:12500,useNativeDriver:native}),
      Animated.timing(sharedDrift,{toValue:0,duration:14200,useNativeDriver:native}),
      Animated.timing(sharedDrift,{toValue:.36,duration:9800,useNativeDriver:native}),
    ]));

    twinkleLoop=Animated.loop(Animated.sequence([
      Animated.timing(sharedTwinkle,{toValue:1,duration:2600,useNativeDriver:native}),
      Animated.timing(sharedTwinkle,{toValue:.18,duration:3400,useNativeDriver:native}),
      Animated.timing(sharedTwinkle,{toValue:.62,duration:2100,useNativeDriver:native}),
      Animated.timing(sharedTwinkle,{toValue:.28,duration:3700,useNativeDriver:native}),
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
 * Naturalistic galaxy/nebula layer inspired by real telescope imagery:
 * mostly dark space, irregular translucent gas clouds, dusty cavities,
 * sparse star fields and only a few bright stellar blooms.
 *
 * All instances share two animation loops, so the effect stays usable in
 * dense Bag/ranking grids without spawning one animation per card.
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

  const strength=intensity==='master'?1:intensity==='premium'?.70:.42;

  const driftX=sharedDrift.interpolate({
    inputRange:[0,.5,1],
    outputRange:[-22,18,-22],
  });
  const driftXBack=sharedDrift.interpolate({
    inputRange:[0,.5,1],
    outputRange:[20,-17,20],
  });
  const driftY=sharedDrift.interpolate({
    inputRange:[0,.5,1],
    outputRange:[10,-13,10],
  });
  const cloudScale=sharedDrift.interpolate({
    inputRange:[0,.5,1],
    outputRange:[.96,1.05,.96],
  });
  const dustScale=sharedDrift.interpolate({
    inputRange:[0,.5,1],
    outputRange:[1.02,.97,1.02],
  });
  const shimmer=sharedTwinkle.interpolate({
    inputRange:[0,.45,1],
    outputRange:[.28,.78,.38],
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.root,{opacity}]}>
      <View style={styles.deepSpace}/>

      <Animated.View style={[styles.cloud,styles.cloudViolet,{
        opacity:.075*strength,
        transform:[{translateX:driftX},{translateY:driftY},{scale:cloudScale},{rotate:'-11deg'}],
      }]}/>
      <Animated.View style={[styles.cloud,styles.cloudBlue,{
        opacity:.060*strength,
        transform:[{translateX:driftXBack},{translateY:driftY},{scale:cloudScale},{rotate:'14deg'}],
      }]}/>
      <Animated.View style={[styles.cloud,styles.cloudMagenta,{
        opacity:.040*strength,
        transform:[{translateX:driftX},{scale:cloudScale},{rotate:'7deg'}],
      }]}/>
      <Animated.View style={[styles.cloud,styles.cloudIndigo,{
        opacity:.055*strength,
        transform:[{translateX:driftXBack},{translateY:driftY},{scale:cloudScale},{rotate:'-18deg'}],
      }]}/>

      <Animated.View style={[styles.filament,styles.filamentA,{
        opacity:.065*strength,
        transform:[{translateX:driftX},{scaleX:cloudScale},{rotate:'-8deg'}],
      }]}/>
      <Animated.View style={[styles.filament,styles.filamentB,{
        opacity:.050*strength,
        transform:[{translateX:driftXBack},{scaleX:cloudScale},{rotate:'12deg'}],
      }]}/>

      <Animated.View style={[styles.dust,styles.dustA,{
        opacity:.22*strength,
        transform:[{translateX:driftXBack},{scale:dustScale},{rotate:'9deg'}],
      }]}/>
      <Animated.View style={[styles.dust,styles.dustB,{
        opacity:.16*strength,
        transform:[{translateX:driftX},{scale:dustScale},{rotate:'-15deg'}],
      }]}/>

      {STARS.map(([left,top,size,phase],index)=>{
        const starOpacity=sharedTwinkle.interpolate({
          inputRange:[0,Math.max(.08,phase),1],
          outputRange:[.18,index%5===0?.88:.62,.22],
        });
        const tinyDrift=sharedDrift.interpolate({
          inputRange:[0,1],
          outputRange:[index%2?-1.5:1,index%2?1.5:-1],
        });
        return (
          <Animated.View
            key={`s-${index}`}
            style={[
              styles.star,
              {
                left:left as any,
                top:top as any,
                width:size,
                height:size,
                borderRadius:999,
                backgroundColor:index%7===0?'#CFEFFF':index%6===0?'#E7DFFF':'#FFFFFF',
                opacity:Animated.multiply(starOpacity,strength),
                transform:[{translateY:tinyDrift}],
              },
            ]}
          />
        );
      })}

      {BRIGHT_STARS.map(([left,top,phase],index)=>{
        const bloom=sharedTwinkle.interpolate({
          inputRange:[0,Math.max(.10,phase),1],
          outputRange:[.12,.72,.18],
        });
        return (
          <View key={`b-${index}`} style={[styles.brightStar,{left:left as any,top:top as any}]}>
            <Animated.View style={[styles.bloomCore,{opacity:Animated.multiply(bloom,strength)}]}/>
            <Animated.View style={[styles.bloomHorizontal,{opacity:Animated.multiply(bloom,.42*strength)}]}/>
            <Animated.View style={[styles.bloomVertical,{opacity:Animated.multiply(bloom,.34*strength)}]}/>
          </View>
        );
      })}

      <Animated.View style={[styles.haze,{
        opacity:Animated.multiply(shimmer,.035*strength),
        transform:[{translateX:driftXBack},{scale:cloudScale}],
      }]}/>
    </View>
  );
}

const styles=StyleSheet.create({
  root:{overflow:'hidden'},
  deepSpace:{...StyleSheet.absoluteFillObject,backgroundColor:'#070812',opacity:.10},

  cloud:{position:'absolute',borderRadius:999},
  cloudViolet:{width:360,height:185,right:-128,top:-62,backgroundColor:'#7350A8'},
  cloudBlue:{width:330,height:170,left:-126,bottom:-58,backgroundColor:'#3678A8'},
  cloudMagenta:{width:240,height:118,left:'28%',top:'31%',backgroundColor:'#9A4F87'},
  cloudIndigo:{width:285,height:130,right:'9%',bottom:'12%',backgroundColor:'#3A3F86'},

  filament:{position:'absolute',borderRadius:999},
  filamentA:{width:390,height:36,left:-105,top:'24%',backgroundColor:'#9B78B7'},
  filamentB:{width:350,height:28,right:-110,bottom:'25%',backgroundColor:'#4E92AD'},

  dust:{position:'absolute',borderRadius:999,backgroundColor:'#02030A'},
  dustA:{width:320,height:72,left:'12%',top:'42%'},
  dustB:{width:250,height:54,right:'5%',top:'13%'},

  star:{position:'absolute',zIndex:7},
  brightStar:{position:'absolute',width:14,height:14,marginLeft:-7,marginTop:-7,zIndex:8},
  bloomCore:{position:'absolute',left:5,top:5,width:4,height:4,borderRadius:999,backgroundColor:'#FFFFFF'},
  bloomHorizontal:{position:'absolute',left:0,top:6.5,width:14,height:1,backgroundColor:'#DDF5FF'},
  bloomVertical:{position:'absolute',left:6.5,top:0,width:1,height:14,backgroundColor:'#EBDFFF'},

  haze:{
    position:'absolute',
    width:280,
    height:120,
    left:'18%',
    top:'18%',
    borderRadius:999,
    backgroundColor:'#BFDFFF',
  },
});
