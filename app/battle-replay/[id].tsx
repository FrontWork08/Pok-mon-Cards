import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getBattleReplay, type BattleReplay } from '@/services/battleReplay';
import { useAppTheme } from '@/theme/ThemeProvider';

function moveSummary(move:any){
  if(!move)return null;
  if(move.acted===false)return {title:'Não agiu',meta:String(move.reason??'sem ação'),accent:'#8F9AAA'};
  const eff=Number(move.effectiveness??1);
  const accent=move.critical?'#F0C74E':eff>1?'#65D894':eff===0?'#8F9AAA':eff<1?'#FF9A78':'#5AA8FF';
  const flags=[
    move.critical?'CRÍTICO':null,
    eff===0?'NÃO AFETA':eff>1?'SUPER EFETIVO':eff<1?'POUCO EFETIVO':null,
    move.statusApplied?String(move.statusApplied).toUpperCase():null,
    move.recoil?('RECOIL '+move.recoil):null,
    move.healed?('CURA '+move.healed):null,
  ].filter(Boolean).join(' • ');
  return {
    title:String(move.move??move.identifier??'Golpe'),
    meta:`Dano ${Number(move.damage??0)} • PP ${move.ppAfter??'—'}${flags?' • '+flags:''}`,
    accent,
  };
}

export default function BattleReplayScreen(){
  const{id}=useLocalSearchParams<{id:string}>();
  const router=useRouter();
  const{colors}=useAppTheme();
  const[replay,setReplay]=useState<BattleReplay|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    if(!id)return;
    try{setLoading(true);setError(null);setReplay(await getBattleReplay(String(id)));}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o replay.');}
    finally{setLoading(false);}
  },[id]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const players=useMemo(()=>Object.fromEntries((replay?.players??[]).map(p=>[p.id,p])),[replay?.players]);

  return <Screen title="Replay de Batalha" subtitle="Revise cada turno do game_v1: golpe, dano, PP, efetividade, crítico e HP.">
    <Pressable onPress={()=>router.back()} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {error?<View style={[styles.error,{borderColor:'#D96575'}]}><Ionicons name="alert-circle" size={18} color="#FF9EAA"/><Text style={[styles.errorText,{color:colors.text}]}>{error}</Text></View>:null}

    {replay?<><View style={[styles.hero,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
      <View><Text style={[styles.kicker,{color:colors.accent}]}>GAME_V1 • {replay.battle.mode.toUpperCase()}</Text><Text style={[styles.score,{color:colors.text}]}>{replay.battle.challengerScore} × {replay.battle.opponentScore}</Text><Text style={[styles.meta,{color:colors.muted}]}>{new Date(replay.battle.createdAt).toLocaleString('pt-BR')}</Text></View>
      <View style={styles.heroPlayers}>
        {[replay.battle.challengerId,replay.battle.opponentId].map(pid=><View key={pid} style={[styles.playerChip,{backgroundColor:colors.surfaceAlt,borderColor:replay.battle.winnerId===pid?colors.yellow:colors.border}]}><Ionicons name={replay.battle.winnerId===pid?'trophy':'person'} size={15} color={replay.battle.winnerId===pid?colors.yellow:colors.accent}/><Text numberOfLines={1} style={[styles.playerName,{color:colors.text}]}>@{players[pid]?.username??'Treinador'}</Text></View>)}
      </View>
    </View>

    {!replay.turns.length?<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="time-outline" size={30} color={colors.muted}/><Text style={[styles.emptyTitle,{color:colors.text}]}>Sem turnos game_v1 registrados</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Batalhas históricas antigas podem ter sido resolvidas antes do sistema de replay detalhado.</Text></View>:null}

    <View style={styles.turnList}>{replay.turns.map(turn=>{
      const r=turn.result??{};
      const first=moveSummary(r.firstMove);
      const second=moveSummary(r.secondMove);
      return <View key={turn.round+'-'+turn.turn} style={[styles.turnCard,{backgroundColor:colors.surface,borderColor:r.knockout?colors.yellow:colors.border}]}>
        <View style={styles.turnHead}><View><Text style={[styles.turnKicker,{color:colors.accent}]}>RODADA {turn.round} • TURNO {turn.turn}</Text><Text style={[styles.turnTitle,{color:colors.text}]}>{r.knockout?'Nocaute neste turno':'Turno resolvido'}</Text></View>{r.winnerId?<Ionicons name="trophy" size={21} color={colors.yellow}/>:null}</View>

        <View style={styles.fighterRow}>
          {[r.challenger,r.opponent].filter(Boolean).map((f:any)=><View key={f.playerId} style={[styles.fighter,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
            {f.image?<Image source={{uri:f.image}} style={styles.fighterImage} resizeMode="contain"/>:null}
            <View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.fighterName,{color:colors.text}]}>{f.name}</Text><Text style={[styles.fighterHp,{color:Number(f.remainingHp??0)<=0?'#FF8290':'#65D894'}]}>HP {Math.max(0,Number(f.remainingHp??0))}/{f.hp}</Text><Text numberOfLines={1} style={[styles.fighterMeta,{color:colors.muted}]}>{Array.isArray(f.types)?f.types.join(' / ').toUpperCase():''}{f.status?' • '+String(f.status).toUpperCase():''}</Text></View>
          </View>)}
        </View>

        {[first,second].filter(Boolean).map((move:any,index)=><View key={index} style={[styles.moveRow,{backgroundColor:colors.surfaceAlt,borderColor:move.accent}]}><View style={[styles.moveIcon,{backgroundColor:move.accent+'1C'}]}><Ionicons name="flash" size={17} color={move.accent}/></View><View style={{flex:1,minWidth:0}}><Text style={[styles.moveTitle,{color:colors.text}]}>{move.title}</Text><Text style={[styles.moveMeta,{color:colors.muted}]}>{move.meta}</Text></View></View>)}

        {r.residual&&(Number(r.residual.challenger??0)||Number(r.residual.opponent??0))?<Text style={[styles.residual,{color:colors.muted}]}>Dano residual: você/adversário conforme os lados da partida • {JSON.stringify(r.residual)}</Text>:null}
      </View>;
    })}</View>
    </>:null}
  </Screen>;
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6},backText:{fontSize:10,fontWeight:'900'},
  error:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',gap:8,alignItems:'center'},errorText:{flex:1,fontSize:9},
  hero:{borderRadius:20,borderWidth:1,padding:14,gap:10},kicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},score:{fontSize:28,fontWeight:'900',marginTop:2},meta:{fontSize:8,marginTop:2},heroPlayers:{flexDirection:'row',flexWrap:'wrap',gap:7},playerChip:{flexGrow:1,minWidth:150,borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:6},playerName:{fontSize:9,fontWeight:'900',flex:1},
  turnList:{gap:9},turnCard:{borderRadius:18,borderWidth:1,padding:11,gap:9},turnHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},turnKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.8},turnTitle:{fontSize:13,fontWeight:'900',marginTop:2},
  fighterRow:{flexDirection:'row',flexWrap:'wrap',gap:7},fighter:{flexGrow:1,flexBasis:230,minWidth:200,borderRadius:13,borderWidth:1,padding:7,flexDirection:'row',alignItems:'center',gap:7},fighterImage:{width:45,height:45},fighterName:{fontSize:9.5,fontWeight:'900'},fighterHp:{fontSize:8,fontWeight:'900',marginTop:2},fighterMeta:{fontSize:6.7,marginTop:2},
  moveRow:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},moveIcon:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center'},moveTitle:{fontSize:9.5,fontWeight:'900'},moveMeta:{fontSize:7.2,lineHeight:11,marginTop:2},residual:{fontSize:6.8},
  empty:{borderRadius:17,borderWidth:1,padding:22,alignItems:'center',gap:6},emptyTitle:{fontSize:12,fontWeight:'900'},emptyText:{fontSize:8,textAlign:'center',lineHeight:12},
});
