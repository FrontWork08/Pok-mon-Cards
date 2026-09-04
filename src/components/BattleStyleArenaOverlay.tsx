import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { getMyBattleStyle, type BattleStyle } from '@/services/proGamepasses';

const PALETTES:Record<BattleStyle['arenaStyle'],{bg:string;border:string;glow:string;label:string}>={
 classic:{bg:'transparent',border:'transparent',glow:'transparent',label:'CLASSIC'},
 kanto_night:{bg:'rgba(16,21,46,.72)',border:'#6A7CFF',glow:'rgba(106,124,255,.18)',label:'KANTO NIGHT'},
 neon_grid:{bg:'rgba(7,27,36,.78)',border:'#45F3FF',glow:'rgba(69,243,255,.18)',label:'NEON GRID'},
 champion_gold:{bg:'rgba(42,36,20,.76)',border:'#FFD447',glow:'rgba(255,212,71,.18)',label:'CHAMPION GOLD'},
 galaxy_void:{bg:'rgba(23,16,39,.82)',border:'#8B5CFF',glow:'rgba(139,92,255,.22)',label:'GALAXY VOID'},
};

export function BattleStyleArenaOverlay({turn,activeSlot}:{turn:number;activeSlot:number|null|undefined}){
 const[state,setState]=useState<{active:boolean;style:BattleStyle}|null>(null);
 const fade=useRef(new Animated.Value(0)).current;
 const pulse=useRef(new Animated.Value(0)).current;
 const scan=useRef(new Animated.Value(0)).current;
 const slide=useRef(new Animated.Value(0)).current;
 const previousSlot=useRef<number|null|undefined>(activeSlot);

 useEffect(()=>{let alive=true;void getMyBattleStyle().then(next=>{if(alive){setState(next);Animated.timing(fade,{toValue:1,duration:360,useNativeDriver:true}).start();}}).catch(()=>null);return()=>{alive=false;};},[fade]);

 const fx=useMemo(()=>{
   if(!state?.active)return null;
   const switched=previousSlot.current!==activeSlot;
   previousSlot.current=activeSlot;
   return switched?state.style.switchFx:state.style.entranceFx;
 },[activeSlot,state,turn]);

 useEffect(()=>{
   if(!state?.active||!fx||fx==='none')return;
   pulse.setValue(0);scan.setValue(0);slide.setValue(0);
   if(fx==='scan') Animated.timing(scan,{toValue:1,duration:650,useNativeDriver:true}).start();
   else if(fx==='slide') Animated.sequence([Animated.timing(slide,{toValue:1,duration:180,useNativeDriver:true}),Animated.timing(slide,{toValue:0,duration:260,useNativeDriver:true})]).start();
   else Animated.sequence([Animated.timing(pulse,{toValue:1,duration:180,useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:420,useNativeDriver:true})]).start();
 },[fx,turn,activeSlot,pulse,scan,slide,state?.active]);

 if(!state?.active||state.style.arenaStyle==='classic')return null;
 const palette=PALETTES[state.style.arenaStyle];
 const pulseOpacity=pulse.interpolate({inputRange:[0,1],outputRange:[0,.72]});
 const pulseScale=pulse.interpolate({inputRange:[0,1],outputRange:[.9,1.08]});
 const scanY=scan.interpolate({inputRange:[0,1],outputRange:[-80,220]});
 const slideX=slide.interpolate({inputRange:[0,1],outputRange:[-140,140]});
 return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.root,{opacity:fade,backgroundColor:palette.bg,borderColor:palette.border}]}>
   <View style={[styles.corner,styles.cornerTL,{borderColor:palette.border}]}/><View style={[styles.corner,styles.cornerBR,{borderColor:palette.border}]}/>
   {state.style.arenaStyle==='neon_grid'?<View style={styles.grid}>{[0,1,2,3,4].map(i=><View key={'h'+i} style={[styles.gridH,{top:`${15+i*18}%` as any,backgroundColor:palette.glow}]}/>) }{[0,1,2,3,4,5].map(i=><View key={'v'+i} style={[styles.gridV,{left:`${8+i*17}%` as any,backgroundColor:palette.glow}]}/>)}</View>:null}
   {state.style.arenaStyle==='galaxy_void'?<>{[0,1,2,3,4,5,6,7].map(i=><View key={i} style={[styles.star,{left:`${8+(i*13)%86}%` as any,top:`${12+(i*19)%72}%` as any,backgroundColor:i%2?palette.border:'#55E6FF'}]}/>)}</>:null}
   {state.style.arenaStyle==='champion_gold'?<View style={[styles.crownLine,{borderColor:palette.border}]}/>:null}
   {fx==='scan'?<Animated.View style={[styles.scan,{backgroundColor:palette.border,transform:[{translateY:scanY}]}]}/>:null}
   {fx==='slide'?<Animated.View style={[styles.slide,{backgroundColor:palette.glow,borderColor:palette.border,transform:[{translateX:slideX}]}]}/>:null}
   {fx==='spark'?<Animated.View style={[styles.sparkWrap,{opacity:pulseOpacity,transform:[{scale:pulseScale}]}]}>{[0,1,2,3,4,5].map(i=><View key={i} style={[styles.spark,{transform:[{rotate:`${i*60}deg`},{translateY:-46}],backgroundColor:palette.border}]}/>)}</Animated.View>:null}
   {fx==='warp'?<Animated.View style={[styles.warp,{borderColor:palette.border,opacity:pulseOpacity,transform:[{scale:pulseScale}]}]}><View style={[styles.warpInner,{borderColor:palette.border}]}/></Animated.View>:null}
   {fx==='pulse'||state.style.entranceFx==='flash'?<Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:palette.glow,opacity:pulseOpacity}]}/>:null}
   <View style={[styles.label,{borderColor:palette.border,backgroundColor:'rgba(3,6,14,.68)'}]}><Text style={[styles.labelText,{color:palette.border}]}>BATTLE STYLE • {palette.label} • {String(fx??'').toUpperCase()}</Text></View>
 </Animated.View>;
}

const styles=StyleSheet.create({root:{borderWidth:2,borderRadius:18,overflow:'hidden'},corner:{position:'absolute',width:34,height:34},cornerTL:{top:8,left:8,borderTopWidth:2,borderLeftWidth:2},cornerBR:{right:8,bottom:8,borderRightWidth:2,borderBottomWidth:2},grid:{...StyleSheet.absoluteFillObject},gridH:{position:'absolute',left:0,right:0,height:1},gridV:{position:'absolute',top:0,bottom:0,width:1},star:{position:'absolute',width:3,height:3,borderRadius:999},crownLine:{position:'absolute',left:'30%',right:'30%',top:10,height:14,borderTopWidth:2,borderLeftWidth:2,borderRightWidth:2,borderRadius:8},scan:{position:'absolute',left:0,right:0,top:0,height:2,shadowOpacity:.8,shadowRadius:8},slide:{position:'absolute',top:'18%',bottom:'18%',left:'45%',width:16,borderWidth:1,borderRadius:999},sparkWrap:{position:'absolute',left:'50%',top:'50%',width:1,height:1},spark:{position:'absolute',width:4,height:18,borderRadius:999},warp:{position:'absolute',left:'50%',top:'50%',marginLeft:-70,marginTop:-70,width:140,height:140,borderWidth:3,borderRadius:999},warpInner:{position:'absolute',left:22,top:22,right:22,bottom:22,borderWidth:2,borderRadius:999},label:{position:'absolute',right:8,bottom:8,borderWidth:1,borderRadius:999,paddingHorizontal:7,paddingVertical:4},labelText:{fontSize:6,fontWeight:'900',letterSpacing:.5}});
