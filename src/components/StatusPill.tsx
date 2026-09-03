import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type StatusTone = 'new' | 'action' | 'waiting' | 'success' | 'danger' | 'neutral';

const TONES: Record<StatusTone,{bg:string;border:string;text:string;icon:keyof typeof Ionicons.glyphMap}> = {
  new:{bg:'#162B46',border:'#4C9DFF',text:'#8FC5FF',icon:'sparkles'},
  action:{bg:'#352B11',border:'#E7BC3D',text:'#FFD966',icon:'alert-circle'},
  waiting:{bg:'#24223A',border:'#8B73E8',text:'#B9A9FF',icon:'time'},
  success:{bg:'#173528',border:'#4FB77F',text:'#7CE0A7',icon:'checkmark-circle'},
  danger:{bg:'#3A2027',border:'#D96575',text:'#FF9EAA',icon:'close-circle'},
  neutral:{bg:'#252B33',border:'#56616E',text:'#A9B4C0',icon:'ellipse'},
};

export function statusTone(status:string):StatusTone{
  const key=String(status??'').toLowerCase();
  if(['completed','complete','accepted','claimed','ready','won','active'].includes(key))return'success';
  if(['cancelled','canceled','rejected','expired','lost','failed'].includes(key))return'danger';
  if(['pending','waiting','invited','registration','drafting','selecting','revealing','playing'].includes(key))return'waiting';
  if(['action','needs_action','claimable'].includes(key))return'action';
  if(['new','unread'].includes(key))return'new';
  return'neutral';
}

export function StatusPill({label,status,tone}:{label?:string;status?:string;tone?:StatusTone}){
  const resolved=tone??statusTone(status??'');
  const visual=TONES[resolved];
  const text=label??String(status??'').replaceAll('_',' ').toUpperCase();
  return <View style={[styles.pill,{backgroundColor:visual.bg,borderColor:visual.border}]}>
    <Ionicons name={visual.icon} size={11} color={visual.text}/>
    <Text numberOfLines={1} style={[styles.text,{color:visual.text}]}>{text}</Text>
  </View>;
}

const styles=StyleSheet.create({
  pill:{minHeight:24,maxWidth:150,borderRadius:999,borderWidth:1,paddingHorizontal:7,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},
  text:{fontSize:6.8,fontWeight:'900',letterSpacing:.35},
});
