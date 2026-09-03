import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export type CelebrationPayload={
  title:string;
  subtitle:string;
  coins?:number;
  diamonds?:number;
};

export function ProgressCelebration({
  payload,
  onClose,
}:{
  payload:CelebrationPayload|null;
  onClose:()=>void;
}){
  const{colors}=useAppTheme();
  return <Modal visible={Boolean(payload)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
      <View style={[styles.card,{backgroundColor:colors.bg,borderColor:colors.yellow}]}>
        <View style={[styles.icon,{backgroundColor:colors.accentSoft,borderColor:colors.yellow}]}>
          <Ionicons name="trophy" size={42} color={colors.yellow}/>
        </View>
        <Text style={[styles.kicker,{color:colors.yellow}]}>MARCO CONCLUÍDO</Text>
        <Text style={[styles.title,{color:colors.text}]}>{payload?.title??''}</Text>
        <Text style={[styles.subtitle,{color:colors.muted}]}>{payload?.subtitle??''}</Text>
        {(payload?.coins||payload?.diamonds)?<View style={styles.rewards}>
          {payload?.coins?<View style={[styles.reward,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={styles.rewardEmoji}>🪙</Text><Text style={[styles.rewardValue,{color:colors.text}]}>+{payload.coins.toLocaleString('pt-BR')}</Text><Text style={[styles.rewardLabel,{color:colors.muted}]}>COINS</Text></View>:null}
          {payload?.diamonds?<View style={[styles.reward,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={styles.rewardEmoji}>💎</Text><Text style={[styles.rewardValue,{color:colors.text}]}>+{payload.diamonds}</Text><Text style={[styles.rewardLabel,{color:colors.muted}]}>DIAMANTES</Text></View>:null}
        </View>:null}
        <Pressable onPress={onClose} style={[styles.button,{backgroundColor:colors.yellow}]}>
          <Text style={styles.buttonText}>CONTINUAR JORNADA</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const styles=StyleSheet.create({
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.82)',alignItems:'center',justifyContent:'center',padding:18},
  card:{width:'100%',maxWidth:430,borderRadius:26,borderWidth:1.5,padding:22,alignItems:'center'},
  icon:{width:82,height:82,borderRadius:27,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:14},
  kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.4},
  title:{fontSize:24,fontWeight:'900',textAlign:'center',marginTop:5},
  subtitle:{fontSize:10,lineHeight:15,textAlign:'center',marginTop:7,maxWidth:330},
  rewards:{flexDirection:'row',gap:9,marginTop:17,width:'100%'},
  reward:{flex:1,borderRadius:16,borderWidth:1,padding:11,alignItems:'center'},
  rewardEmoji:{fontSize:22},
  rewardValue:{fontSize:17,fontWeight:'900',marginTop:3},
  rewardLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7,marginTop:2},
  button:{width:'100%',minHeight:50,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:18},
  buttonText:{fontSize:9,fontWeight:'900',color:'#07111F',letterSpacing:.6},
});
