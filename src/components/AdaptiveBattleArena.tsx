import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BattleArena3D } from '@/components/BattleArena3D';
import { PixelBattleArena, type PixelBattleFighter } from '@/components/PixelBattleArena';

type Fighter=PixelBattleFighter&{types?:string[]|null};
type Props={
  my:Fighter|null;
  rival:Fighter|null;
  resultKey?:string|number|null;
  winner?:'me'|'rival'|null;
  title?:string;
  subtitle?:string;
  turnOnly?:boolean;
  prefer3D?:boolean;
  modelFormKey?:string;
};

export function AdaptiveBattleArena({my,rival,resultKey=null,winner=null,title,subtitle,turnOnly=false,prefer3D=false,modelFormKey='default'}:Props){
  // 3D is an internal experiment for the owner-only lab. Production battle modes
  // must stay on the pixel arena until the 3D rollout is explicitly approved.
  const lab3DAllowed=Platform.OS!=='web'&&prefer3D===true&&modelFormKey==='lab';
  const [mode,setMode]=useState<'3d'|'2d'>(lab3DAllowed?'3d':'2d');
  const quality=useMemo<'low'|'medium'|'high'>(()=>{
    if(Platform.OS!=='android')return'medium';
    const version=Number(Platform.Version);
    if(Number.isFinite(version)&&version<=28)return'low';
    if(Number.isFinite(version)&&version>=33)return'high';
    return'medium';
  },[]);
  // PixelBattleArena animates/narrates a turn whenever resultKey is present.
  // Some live battle screens only pass current HP/ids (without the resolved moves),
  // so forwarding their key would fabricate messages such as "não causou dano".
  // Only animate when the caller actually supplied resolved action data or a winner.
  const hasResolvedAnimation=Boolean(
    winner
    || String(my?.attackName??'').trim()
    || String(rival?.attackName??'').trim()
    || Number(my?.damage??0)>0
    || Number(rival?.damage??0)>0
  );
  const pixelResultKey=hasResolvedAnimation?resultKey:null;

  useEffect(()=>{
    if(!lab3DAllowed)setMode('2d');
  },[lab3DAllowed]);

  if(!lab3DAllowed){
    return <PixelBattleArena my={my} rival={rival} resultKey={pixelResultKey} winner={winner} title={title??'ARENA 2D'} subtitle={subtitle} turnOnly={turnOnly}/>;
  }

  return <View>
    <View style={styles.toolbar}>
      <View style={styles.copy}><Ionicons name="cube-outline" size={15} color="#8DD7FF"/><Text style={styles.copyText}>{mode==='3d'?'Renderização 3D':'Arena 2D leve'}</Text></View>
      <Pressable onPress={()=>setMode(current=>current==='3d'?'2d':'3d')} style={styles.toggle}><Ionicons name={mode==='3d'?'grid-outline':'cube-outline'} size={14} color="#FFD447"/><Text style={styles.toggleText}>{mode==='3d'?'USAR 2D':'USAR 3D'}</Text></Pressable>
    </View>
    {mode==='3d'?
      <BattleArena3D my={my} rival={rival} resultKey={resultKey} winner={winner} title={title??'ARENA 3D'} subtitle={subtitle??'Modelos 3D em tempo real • Game Boy rules'} quality={quality} modelFormKey={modelFormKey}/>
      :<PixelBattleArena my={my} rival={rival} resultKey={pixelResultKey} winner={winner} title={title??'ARENA 2D'} subtitle={subtitle} turnOnly={turnOnly}/>
    }
  </View>;
}

const styles=StyleSheet.create({toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:7},copy:{flexDirection:'row',alignItems:'center',gap:6},copyText:{color:'#8098AA',fontSize:10,fontWeight:'700'},toggle:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:'#53491F',backgroundColor:'#26230F',paddingHorizontal:9,paddingVertical:5,borderRadius:999},toggleText:{color:'#FFD447',fontSize:9,fontWeight:'900'}});
