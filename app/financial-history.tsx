import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getMyEconomyLedger, type EconomyLedgerRow } from '@/services/safetyAndAudit';
import { useAppTheme } from '@/theme/ThemeProvider';

function reasonLabel(reason:string){
  const map:Record<string,string>={
    ledger_baseline:'Saldo inicial do histórico',
    system_transaction:'Operação do jogo',
    trainer_journey:'Jornada do Treinador',
    market_purchase:'Compra no Marketplace',
    market_sale:'Venda no Marketplace',
    pack_open:'Abertura de booster',
  };
  return map[reason]??reason.replaceAll('_',' ');
}
export default function FinancialHistoryScreen(){
  const{colors}=useAppTheme();
  const[rows,setRows]=useState<EconomyLedgerRow[]>([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{try{setLoading(true);setError(null);setRows(await getMyEconomyLedger(200));}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o histórico.');}finally{setLoading(false);}},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  return <Screen title="Histórico Financeiro" subtitle="Toda mudança futura de Coins e Diamantes fica registrada com saldo antes e depois.">
    <View style={[styles.info,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="shield-checkmark" size={22} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.infoTitle,{color:colors.text}]}>Auditoria de saldo</Text><Text style={[styles.infoText,{color:colors.muted}]}>O registro começa com um saldo-base no dia em que este sistema foi ativado. Movimentações anteriores continuam disponíveis nos históricos específicos quando existirem.</Text></View></View>
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {error?<Pressable onPress={()=>void load()} style={[styles.error,{borderColor:'#D96575'}]}><Ionicons name="refresh" size={18} color="#FF9EAA"/><Text style={[styles.errorText,{color:colors.text}]}>{error} • tocar para tentar novamente</Text></Pressable>:null}
    <View style={styles.list}>{rows.map(row=>{
      const positive=row.amount>0;
      const zero=row.amount===0;
      const accent=zero?colors.muted:positive?'#65D894':'#FF8290';
      return <View key={row.id} style={[styles.row,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <View style={[styles.icon,{backgroundColor:accent+'1C'}]}><Text style={styles.emoji}>{row.currency==='diamonds'?'💎':'🪙'}</Text></View>
        <View style={{flex:1,minWidth:0}}><Text style={[styles.title,{color:colors.text}]}>{reasonLabel(row.reason)}</Text><Text style={[styles.meta,{color:colors.muted}]}>{new Date(row.createdAt).toLocaleString('pt-BR')}{row.sourceType?' • '+row.sourceType:''}</Text><Text style={[styles.balance,{color:colors.muted}]}>{row.balanceBefore.toLocaleString('pt-BR')} → {row.balanceAfter.toLocaleString('pt-BR')}</Text></View>
        <Text style={[styles.amount,{color:accent}]}>{row.amount>0?'+':''}{row.amount.toLocaleString('pt-BR')}</Text>
      </View>;
    })}</View>
    {!loading&&!rows.length?<Text style={[styles.empty,{color:colors.muted}]}>Nenhuma movimentação registrada ainda.</Text>:null}
  </Screen>;
}
const styles=StyleSheet.create({info:{borderRadius:18,borderWidth:1,padding:12,flexDirection:'row',gap:9,alignItems:'center'},infoTitle:{fontSize:11,fontWeight:'900'},infoText:{fontSize:8,lineHeight:12,marginTop:2},error:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',gap:7,alignItems:'center'},errorText:{fontSize:8.5,flex:1},list:{gap:7},row:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:9},icon:{width:39,height:39,borderRadius:12,alignItems:'center',justifyContent:'center'},emoji:{fontSize:19},title:{fontSize:10,fontWeight:'900',textTransform:'capitalize'},meta:{fontSize:7,marginTop:2},balance:{fontSize:7.5,fontWeight:'800',marginTop:3},amount:{fontSize:13,fontWeight:'900'},empty:{fontSize:9,textAlign:'center',padding:20}});
