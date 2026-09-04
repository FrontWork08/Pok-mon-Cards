import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';
import { CompactTrainerBanner } from '@/components/CompactTrainerBanner';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { createBattle, getMyBattleHistory, rematchBattle, respondToBattle } from '@/services/battles';
import { getMyProfile, getProfileAvatarUrl } from '@/services/player';
import { getMySocial, type SocialPlayer } from '@/services/social';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function TeamBattlesLobbyScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  const[profile,setProfile]=useState<any>(null);
  const[friends,setFriends]=useState<SocialPlayer[]>([]);
  const[history,setHistory]=useState<any[]>([]);
  const[opponent,setOpponent]=useState<SocialPlayer|null>(null);
  const[loading,setLoading]=useState(true);
  const[working,setWorking]=useState<string|null>(null);
  const[notice,setNotice]=useState<string|null>(null);

  const load=useCallback(async()=>{
    try{
      setLoading(true);
      const[p,social,battles]=await Promise.all([getMyProfile(),getMySocial(),getMyBattleHistory(80)]);
      setProfile(p);setFriends(social.friends);setHistory(battles.filter((b:any)=>b.mode==='team3'));
    }catch(e){setNotice(e instanceof Error?e.message:'Não foi possível carregar as batalhas de equipe.');}
    finally{setLoading(false);}
  },[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));

  const incoming=useMemo(()=>history.filter((b:any)=>b.status==='invited'&&b.opponent_id===profile?.id),[history,profile?.id]);
  const active=useMemo(()=>history.filter((b:any)=>['drafting','revealing'].includes(b.status)),[history]);
  const completed=useMemo(()=>history.filter((b:any)=>b.status==='completed'),[history]);

  async function challenge(){
    if(!opponent||working)return;
    try{setWorking('challenge');const id=await createBattle(opponent.id,'team3','none',0,null);setOpponent(null);router.push(('/team-battle/'+id) as never);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível enviar o desafio 3×3.');}
    finally{setWorking(null);}
  }
  async function respond(id:string,accept:boolean){
    try{setWorking(id);await respondToBattle(id,accept);await load();if(accept)router.push(('/team-battle/'+id) as never);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível responder ao desafio.');}
    finally{setWorking(null);}
  }
  async function rematch(id:string){
    try{setWorking(id);const next=await rematchBattle(id);router.push(('/team-battle/'+next) as never);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível criar a revanche 3×3.');}
    finally{setWorking(null);}
  }

  return <Screen title="Batalha de Equipe 3×3" subtitle="Uma batalha contínua: 1 Pokémon ativo, 2 reservas e troca durante os turnos.">
    <AreaIdentityStrip area="competitive"/>
    {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="information-circle" size={18} color={colors.yellow}/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text></Pressable>:null}
    <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
      <Ionicons name="swap-horizontal" size={34} color={colors.yellow}/>
      <View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>GAME_V1 • CASUAL</Text><Text style={[styles.heroTitle,{color:colors.text}]}>Golpear ou Trocar</Text><Text style={[styles.heroText,{color:colors.muted}]}>Leve 3 Pokémon. HP, PP e status persistem quando saem de campo. Trocar zera alterações temporárias de atributos. Após um KO, a substituição é obrigatória e não consome o próximo turno.</Text></View>
    </View>
    <View style={[styles.safety,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="shield-checkmark" size={19} color="#65D894"/><Text style={[styles.safetyText,{color:colors.muted}]}>Nesta primeira versão o 3×3 é apenas entre amigos, Casual e sem aposta. A ranqueada continua nos modos atuais até o sistema acumular testes suficientes.</Text></View>

    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}
    {incoming.length?<><SectionTitle title="Convites recebidos" count={incoming.length}/><View style={styles.list}>{incoming.map((item:any)=>{
      const challenger=Array.isArray(item.challenger)?item.challenger[0]:item.challenger;
      return <CompactTrainerBanner key={item.id} frameId={challenger?.equipped_frame_id} backgroundId={challenger?.equipped_background_id} fallbackColor={colors.yellow}>
        <View style={[styles.invite,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><TrainerAvatar icon={challenger?.profile_icon} avatarUrl={getProfileAvatarUrl(challenger?.avatar_path,challenger?.avatar_updated_at)} size={44} color={colors.yellow} backgroundColor={colors.accentSoft}/><View style={{flex:1}}><Text style={[styles.name,{color:colors.text}]}>@{challenger?.username??'Treinador'}</Text><Text style={[styles.meta,{color:colors.muted}]}>Equipe 3×3 • Casual • troca em batalha</Text></View><Pressable disabled={working===item.id} onPress={()=>void respond(item.id,false)} style={[styles.smallButton,{borderColor:'#D96575'}]}><Text style={styles.reject}>RECUSAR</Text></Pressable><Pressable disabled={working===item.id} onPress={()=>void respond(item.id,true)} style={[styles.smallButton,{backgroundColor:colors.yellow,borderColor:colors.yellow}]}><Text style={styles.accept}>ACEITAR</Text></Pressable></View>
      </CompactTrainerBanner>;
    })}</View></>:null}

    {active.length?<><SectionTitle title="Em andamento" count={active.length}/><View style={styles.list}>{active.map((item:any)=><BattleRow key={item.id} item={item} profileId={profile?.id} onPress={()=>router.push(('/team-battle/'+item.id) as never)}/>)}</View></>:null}

    <SectionTitle title="Desafiar um amigo" count={friends.length}/>
    {friends.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>{friends.map(friend=><CompactTrainerBanner key={friend.id} frameId={friend.equipped_frame_id} backgroundId={friend.equipped_background_id} fallbackColor={colors.accent} style={styles.friendBanner}><Pressable onPress={()=>setOpponent(friend)} style={[styles.friend,{backgroundColor:colors.surface,borderColor:colors.border}]}><TrainerAvatar icon={friend.profile_icon} avatarUrl={getProfileAvatarUrl(friend.avatar_path,friend.avatar_updated_at)} size={50} color={colors.accent} backgroundColor={colors.accentSoft}/><Text numberOfLines={1} style={[styles.friendName,{color:colors.text}]}>@{friend.username}</Text><Text style={[styles.meta,{color:colors.muted}]}>Nível {friend.level}</Text><View style={[styles.challenge,{backgroundColor:colors.yellow}]}><Ionicons name="swap-horizontal" size={14} color="#07111F"/><Text style={styles.challengeText}>3×3</Text></View></Pressable></CompactTrainerBanner>)}</ScrollView>:null}

    {completed.length?<><SectionTitle title="Histórico 3×3" count={completed.length}/><View style={styles.list}>{completed.slice(0,20).map((item:any)=><View key={item.id}><BattleRow item={item} profileId={profile?.id} onPress={()=>router.push(('/team-battle/'+item.id) as never)}/><Pressable disabled={working===item.id} onPress={()=>void rematch(item.id)} style={[styles.rematch,{borderColor:colors.accent}]}><Ionicons name="refresh" size={15} color={colors.accent}/><Text style={[styles.rematchText,{color:colors.accent}]}>REVANCHE 3×3</Text></Pressable></View>)}</View></>:null}

    <Modal visible={Boolean(opponent)} transparent animationType="fade" onRequestClose={()=>setOpponent(null)}><View style={styles.backdrop}><View style={[styles.modal,{backgroundColor:colors.surface,borderColor:colors.border}]}>{opponent?<><View style={styles.modalHead}><TrainerAvatar icon={opponent.profile_icon} avatarUrl={getProfileAvatarUrl(opponent.avatar_path,opponent.avatar_updated_at)} size={48} color={colors.yellow} backgroundColor={colors.accentSoft}/><View style={{flex:1}}><Text style={[styles.modalTitle,{color:colors.text}]}>Desafiar @{opponent.username}</Text><Text style={[styles.meta,{color:colors.muted}]}>Equipe 3×3 • Casual</Text></View><Pressable onPress={()=>setOpponent(null)}><Ionicons name="close" size={23} color={colors.muted}/></Pressable></View><View style={[styles.rules,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Rule icon="albums" text="Escolha 3 Pokémon em segredo; o primeiro será o líder."/><Rule icon="flash" text="Em cada turno escolha Golpear ou Trocar."/><Rule icon="heart" text="HP, PP e status permanecem ao ir para a reserva."/><Rule icon="refresh" text="KO força a entrada de uma reserva sem gastar o próximo turno."/></View><Pressable disabled={working==='challenge'} onPress={()=>void challenge()} style={[styles.send,{backgroundColor:colors.yellow},working==='challenge'&&{opacity:.5}]}>{working==='challenge'?<ActivityIndicator color="#07111F"/>:<Ionicons name="flash" size={19} color="#07111F"/>}<Text style={styles.sendText}>{working==='challenge'?'ENVIANDO…':'ENVIAR DESAFIO 3×3'}</Text></Pressable></>:null}</View></View></Modal>
  </Screen>;
}

function SectionTitle({title,count}:{title:string;count:number}){const{colors}=useAppTheme();return <View style={styles.sectionHead}><Text style={[styles.sectionTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.sectionCount,{color:colors.muted}]}>{count}</Text></View>}
function BattleRow({item,profileId,onPress}:{item:any;profileId:string;onPress:()=>void}){const{colors}=useAppTheme();const mine=item.challenger_id===profileId;const other=mine?(Array.isArray(item.opponent)?item.opponent[0]:item.opponent):(Array.isArray(item.challenger)?item.challenger[0]:item.challenger);const won=item.status==='completed'&&item.winner_id===profileId;return <Pressable onPress={onPress} style={[styles.row,{backgroundColor:colors.surface,borderColor:item.status==='completed'?(won?'#4FB77F':'#D96575'):colors.border}]}><View style={[styles.rowIcon,{backgroundColor:won?'#173528':colors.surfaceAlt}]}><Ionicons name={won?'trophy':'swap-horizontal'} size={20} color={won?'#65D894':colors.accent}/></View><View style={{flex:1}}><Text style={[styles.name,{color:colors.text}]}>{item.status==='completed'?(won?'Vitória':'Derrota'):'Equipe 3×3'} vs @{other?.username??'Treinador'}</Text><Text style={[styles.meta,{color:colors.muted}]}>{item.status==='drafting'?'Montando time':item.status==='revealing'?'Batalha em andamento':item.status==='completed'?'Concluída':'Convite'} • {new Date(item.completed_at??item.created_at).toLocaleString('pt-BR')}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>}
function Rule({icon,text}:{icon:keyof typeof Ionicons.glyphMap;text:string}){const{colors}=useAppTheme();return <View style={styles.rule}><Ionicons name={icon} size={17} color={colors.accent}/><Text style={[styles.ruleText,{color:colors.muted}]}>{text}</Text></View>}

const styles=StyleSheet.create({notice:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:7},noticeText:{flex:1,fontSize:8.5},hero:{borderRadius:20,borderWidth:1,padding:14,flexDirection:'row',alignItems:'center',gap:11},kicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},heroTitle:{fontSize:19,fontWeight:'900',marginTop:2},heroText:{fontSize:8,lineHeight:12,marginTop:3},safety:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:7},safetyText:{flex:1,fontSize:7.5,lineHeight:11},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:4},sectionTitle:{fontSize:18,fontWeight:'900'},sectionCount:{fontSize:9,fontWeight:'900'},list:{gap:7},invite:{borderRadius:16,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:10.5,fontWeight:'900'},meta:{fontSize:7.5,lineHeight:11,marginTop:2},smallButton:{minHeight:34,borderRadius:9,borderWidth:1,paddingHorizontal:7,justifyContent:'center'},reject:{fontSize:6.5,fontWeight:'900',color:'#FF8290'},accept:{fontSize:6.5,fontWeight:'900',color:'#07111F'},friendList:{gap:8,paddingRight:6},friendBanner:{width:154},friend:{width:154,borderRadius:17,borderWidth:1,padding:11},friendName:{fontSize:11,fontWeight:'900',marginTop:7},challenge:{alignSelf:'flex-start',borderRadius:8,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4,marginTop:8},challengeText:{fontSize:7,fontWeight:'900',color:'#07111F'},row:{borderRadius:15,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},rowIcon:{width:38,height:38,borderRadius:11,alignItems:'center',justifyContent:'center'},rematch:{alignSelf:'flex-end',borderRadius:9,borderWidth:1,paddingHorizontal:8,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:4,marginTop:4},rematchText:{fontSize:7,fontWeight:'900'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.76)',justifyContent:'center',padding:14},modal:{width:'100%',maxWidth:540,alignSelf:'center',borderRadius:22,borderWidth:1,padding:14,gap:11},modalHead:{flexDirection:'row',alignItems:'center',gap:9},modalTitle:{fontSize:16,fontWeight:'900'},rules:{borderRadius:15,borderWidth:1,padding:10,gap:8},rule:{flexDirection:'row',alignItems:'flex-start',gap:7},ruleText:{fontSize:8,lineHeight:12,flex:1},send:{minHeight:47,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},sendText:{fontSize:9,fontWeight:'900',color:'#07111F'}});
