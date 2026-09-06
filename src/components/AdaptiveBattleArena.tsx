import { useMemo, useState } from 'react';
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

export function AdaptiveBattleArena({my,rival,resultKey=null,winner=null,title,subtitle,turnOnly=false,prefer3D=true,modelFormKey='default'}:Props){
  const available=Platform.OS!=='web';
  const [mode,setMode]=useState<'3d'|'2d'>(available&&prefer3D?'3d':'2d');
  const quality=useMemo<'low'|'medium'|'high'>(()=>{
    if(Platform.OS!=='android')return'medium';
    const version=Number(Platform.Version);
    if(Number.isFinite(version)&&version<=28)return'low';
    if(Number.isFinite(version)&&version>=33)return'high';
    return'medium';
  },[]);

  return <View>
    <View style={styles.toolbar}>
      <View style={styles.copy}><Ionicons name="cube-outline" size={15} color="#8DD7FF"/><Text style={styles.copyText}>{mode==='3d'?'Renderização 3D':'Arena 2D leve'}</Text></View>
      {available?<Pressable onPress={()=>setMode(current=>current==='3d'?'2d':'3d')} style={styles.toggle}><Ionicons name={mode==='3d'?'grid-outline':'cube-outline'} size={14} color="#FFD447"/><Text style={styles.toggleText}>{mode==='3d'?'USAR 2D':'USAR 3D'}</Text></Pressable>:null}
    </View>
    {mode==='3d'&&available?
      <BattleArena3D my={my} rival={rival} resultKey={resultKey} winner={winner} title={title??'ARENA 3D'} subtitle={subtitle??'Modelos 3D em tempo real • Game Boy rules'} quality={quality} modelFormKey={modelFormKey}/>
      :<PixelBattleArena my={my} rival={rival} resultKey={resultKey} winner={winner} title={title??'ARENA 2D'} subtitle={subtitle} turnOnly={turnOnly}/>
    }
  </View>;
}

const styles=StyleSheet.create({toolbar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:7},copy:{flexDirection:'row',alignItems:'center',gap:6},copyText:{color:'#8098AA',fontSize:10,fontWeight:'700'},toggle:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:'#53491F',backgroundColor:'#26230F',paddingHorizontal:9,paddingVertical:5,borderRadius:999},toggleText:{color:'#FFD447',fontSize:9,fontWeight:'900'}});
