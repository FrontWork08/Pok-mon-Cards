import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { redeemCode, type RedeemResult } from '@/services/codes';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

export default function CodesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function redeem() {
    if (code.trim().length < 4 || working) return;
    try {
      setWorking(true);
      setError(null);
      const next = await redeemCode(code);
      setResult(next);
      await wallet.refresh();
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Não foi possível resgatar o código.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Screen title="Resgatar Código" subtitle="Cada código pode ser usado uma única vez por conta.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
      <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:'#68D9FF'}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.surface}]}><Ionicons name="ticket" size={28} color="#68D9FF"/></View>
        <View style={{flex:1}}><Text style={[styles.kicker,{color:'#68D9FF'}]}>CENTRAL DE RECOMPENSAS</Text><Text style={[styles.title,{color:colors.text}]}>Código de Treinador</Text><Text style={[styles.helper,{color:colors.muted}]}>Códigos podem entregar Coins, Diamantes, cartas e cargas de 2× Lucky para boosters.</Text></View>
      </View>
      <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.label,{color:colors.muted}]}>SEU CÓDIGO</Text>
        <View style={[styles.inputWrap,{backgroundColor:colors.surfaceAlt,borderColor:error?'#FF6978':colors.border}]}>
          <Ionicons name="key" size={20} color={colors.accent}/>
          <TextInput value={code} onChangeText={(value)=>{setCode(value.toUpperCase());setError(null);setResult(null);}} autoCapitalize="characters" autoCorrect={false} maxLength={32} placeholder="EXEMPLO-2026" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text}]} onSubmitEditing={()=>void redeem()}/>
        </View>
        {error?<View style={styles.error}><Ionicons name="alert-circle" size={18} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></View>:null}
        {result?<View style={[styles.success,{backgroundColor:'#15392A',borderColor:'#59D49A'}]}><Ionicons name="gift" size={22} color="#59D49A"/><View style={{flex:1}}><Text style={styles.successTitle}>Código {result.code} resgatado!</Text><Text style={styles.successText}>{rewardText(result.reward)}</Text>{Number(result.reward.lucky2xUses)>0?<Text style={styles.luckyRemaining}>✨ Lucky disponível: {result.lucky2xRemaining} abertura(s)</Text>:null}</View></View>:null}
        <Pressable disabled={code.trim().length<4||working} onPress={()=>void redeem()} style={[styles.button,{backgroundColor:code.trim().length>=4?colors.yellow:colors.surfaceAlt,opacity:working?.75:1}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="sparkles" size={19} color="#07111F"/>}<Text style={styles.buttonText}>{working?'RESGATANDO...':'RESGATAR RECOMPENSA'}</Text></Pressable>
      </View>
      <View style={[styles.rule,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="shield-checkmark" size={20} color={colors.accent}/><Text style={[styles.ruleText,{color:colors.muted}]}>Cada carga de 2× Lucky vale para 1 booster e é consumida somente quando a abertura é concluída pelo servidor.</Text></View>
    </Screen>
  );
}

function rewardText(reward: RedeemResult['reward']) {
  const parts:string[]=[];
  if(Number(reward.coins)>0) parts.push(`🪙 ${Number(reward.coins).toLocaleString('pt-BR')} Coins`);
  if(Number(reward.diamonds)>0) parts.push(`💎 ${Number(reward.diamonds).toLocaleString('pt-BR')} Diamantes`);
  if(reward.cardId&&Number(reward.cardQuantity)>0) parts.push(`🃏 ${Number(reward.cardQuantity)} carta(s)`);
  if(Number(reward.lucky2xUses)>0) parts.push(`✨ ${Number(reward.lucky2xUses)} abertura(s) com 2× Lucky`);
  return parts.join(' • ')||'Recompensa adicionada à sua conta.';
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},
  hero:{borderRadius:23,borderWidth:1,padding:17,flexDirection:'row',alignItems:'center',gap:13},heroIcon:{width:58,height:58,borderRadius:19,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.3},title:{fontSize:21,fontWeight:'900',marginTop:3},helper:{fontSize:10,lineHeight:15,marginTop:3},
  panel:{borderRadius:21,borderWidth:1,padding:15,gap:11},label:{fontSize:8,fontWeight:'900',letterSpacing:1.1},inputWrap:{minHeight:55,borderRadius:15,borderWidth:1,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},input:{flex:1,minHeight:53,fontSize:16,fontWeight:'900',letterSpacing:1.2},
  error:{borderRadius:13,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  success:{borderRadius:14,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:9},successTitle:{color:'#D9FFEC',fontSize:12,fontWeight:'900'},successText:{color:'#AEF0CC',fontSize:9,marginTop:3},luckyRemaining:{color:'#FFE780',fontSize:9,fontWeight:'900',marginTop:4},
  button:{minHeight:52,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},buttonText:{color:'#07111F',fontSize:10,fontWeight:'900',letterSpacing:.4},
  rule:{borderRadius:17,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:10},ruleText:{flex:1,fontSize:9,lineHeight:14,fontWeight:'700'},
});