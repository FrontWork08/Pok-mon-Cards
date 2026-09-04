import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { CardPickerModal, getBattleCardPreview } from '@/components/CardPickerModal';
import { PixelBattleArena, type PixelBattleFighter } from '@/components/PixelBattleArena';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { supabase } from '@/lib/supabase';
import { getMyBag, type OwnedCardEntry } from '@/services/player';
import { cancelBattle, chooseBattleTeamAttack, chooseBattleTeamSwitch, forfeitBattle, getBattle, getBattleTeamState, rematchBattle, resolveBattleTeamTimeout, respondToBattle, setBattleTeam, subscribeToBattle } from '@/services/battles';
import { playBattleSound } from '@/services/soundEffects';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type ActionTab='attack'|'switch';

export default function TeamBattleScreen(){
  const{id}=useLocalSearchParams<{id:string}>();
  const router=useRouter();
  const{colors,settings}=useAppTheme();
  const{userId}=useWallet();
  const[battle,setBattle]=useState<any>(null);
  const[state,setState]=useState<any>(null);
  const[players,setPlayers]=useState<Record<string,any>>({});
  const[bag,setBag]=useState<OwnedCardEntry[]>([]);
  const[teamMap,setTeamMap]=useState<Record<string,number>>({});
  const[teamOrder,setTeamOrder]=useState<string[]>([]);
  const[pickerOpen,setPickerOpen]=useState(false);
  const[actionTab,setActionTab]=useState<ActionTab>('attack');
  const[selectedAttack,setSelectedAttack]=useState<string|null>(null);
  const[selectedSwitch,setSelectedSwitch]=useState<number|null>(null);
  const[remaining,setRemaining]=useState(0);
  const[loading,setLoading]=useState(true);
  const[working,setWorking]=useState(false);
  const[notice,setNotice]=useState<string|null>(null);
  const lastTurnSeen=useRef<number>(0);
  const timeoutKey=useRef<string|null>(null);
  const previousStatus=useRef<string|null>(null);

  const load=useCallback(async(silent=false)=>{
    if(!id||!userId)return;
    try{
      if(!silent)setLoading(true);
      const battleData=await getBattle(String(id));
      if(battleData.mode!=='team3'){
        router.replace(('/battle/'+String(id)) as never);return;
      }
      setBattle(battleData);
      if(!players[battleData.challenger_id]||!players[battleData.opponent_id]){
        const{data}=await supabase.from('players').select('id,username,profile_icon,avatar_path,avatar_updated_at').in('id',[battleData.challenger_id,battleData.opponent_id]);
        setPlayers(Object.fromEntries((data??[]).map((p:any)=>[p.id,p])));
      }
      if(battleData.status!=='invited'){
        const next=await getBattleTeamState(String(id));
        setState(next);
        if(Number(next?.lastTurnNo??0)>lastTurnSeen.current){
          lastTurnSeen.current=Number(next.lastTurnNo);
          if(settings?.battle_sounds??true)void playBattleSound('round');
          if(settings?.battle_vibration??true)Vibration.vibrate([0,45,30,75]);
        }
        if(next?.myForcedSwitch)setActionTab('switch');
        if(next?.myLocked){setSelectedAttack(next.myActionType==='attack'?next.myAttackName:null);setSelectedSwitch(next.myActionType==='switch'?Number(next.mySwitchSlot):null);}
        else{setSelectedAttack(null);setSelectedSwitch(null);}
      }else setState(null);
      if(battleData.status==='drafting'&&!bag.length){
        const items=await getMyBag();setBag(items);
      }
      const prior=previousStatus.current;previousStatus.current=battleData.status;
      if(prior&&prior!==battleData.status&&battleData.status==='completed'&&(settings?.battle_sounds??true))void playBattleSound(battleData.winner_id===userId?'victory':'defeat');
    }catch(e){if(!silent)setNotice(e instanceof Error?e.message:'Não foi possível carregar a batalha 3×3.');}
    finally{if(!silent)setLoading(false);}
  },[bag.length,id,players,router,settings?.battle_sounds,settings?.battle_vibration,userId]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!id)return;return subscribeToBattle(String(id),()=>{void load(true);});},[id,load]);
  useEffect(()=>{
    const deadline=state?.deadline??battle?.selection_deadline;
    if(!deadline||!['drafting','revealing'].includes(String(battle?.status??''))){setRemaining(0);return;}
    const tick=()=>setRemaining(Math.max(0,Math.ceil((new Date(deadline).getTime()-Date.now())/1000)));
    tick();const timer=setInterval(tick,500);return()=>clearInterval(timer);
  },[battle?.selection_deadline,battle?.status,state?.deadline]);
  useEffect(()=>{
    if(!id||remaining!==0||!['drafting','revealing'].includes(String(battle?.status??''))||working)return;
    const deadline=state?.deadline??battle?.selection_deadline;if(!deadline||Date.now()<new Date(deadline).getTime())return;
    const key=`${battle.status}:${state?.turn??0}:${deadline}`;if(timeoutKey.current===key)return;timeoutKey.current=key;
    void (async()=>{try{setWorking(true);await resolveBattleTeamTimeout(String(id));setNotice('O tempo acabou. O servidor escolheu automaticamente para manter a batalha andando.');await load(true);}catch{}finally{setWorking(false);}})();
  },[battle?.selection_deadline,battle?.status,id,load,remaining,state?.deadline,state?.turn,working]);

  const isChallenger=battle?.challenger_id===userId;
  const opponentId=isChallenger?battle?.opponent_id:battle?.challenger_id;
  const me=players[userId??''];const opponent=players[opponentId??''];
  const myTeam:Array<any>=state?.myTeam??[];const opponentTeam:Array<any>=state?.opponentTeam??[];const switchOptions:Array<any>=state?.switchOptions??[];const attacks:Array<any>=state?.attacks??[];
  const myLocked=Boolean(state?.myLocked);const myForced=Boolean(state?.myForcedSwitch);const opponentForced=Boolean(state?.opponentForcedSwitch);
  const waitingOpponentForced=opponentForced&&!myForced;
  const selectedTeamEntries=useMemo(()=>teamOrder.map(cardId=>bag.find(entry=>entry.cards?.id===cardId)).filter(Boolean) as OwnedCardEntry[],[bag,teamOrder]);
  const lastTurn=state?.lastTurn??null;
  const myAction=lastTurn?.firstMove?.playerId===userId?lastTurn.firstMove:lastTurn?.secondMove?.playerId===userId?lastTurn.secondMove:null;
  const rivalAction=lastTurn?.firstMove?.playerId===opponentId?lastTurn.firstMove:lastTurn?.secondMove?.playerId===opponentId?lastTurn.secondMove:null;
  const myFighter:PixelBattleFighter|null=state?.myCardId?{name:state.myCardName??'Pokémon',fallbackImage:state.myCardImage,hp:Number(state.myHp??0),maxHp:Number(state.myMaxHp??1),attackName:myAction?.move??null,damage:Number(myAction?.damage??0),firstPlayer:lastTurn?.firstMove?.playerId===userId,knockedOut:Number(state.myHp??0)<=0}:null;
  const rivalFighter:PixelBattleFighter|null=state?.opponentCardId?{name:state.opponentCardName??'Pokémon',fallbackImage:state.opponentCardImage,hp:Number(state.opponentHp??0),maxHp:Number(state.opponentMaxHp??1),attackName:rivalAction?.move??null,damage:Number(rivalAction?.damage??0),firstPlayer:lastTurn?.firstMove?.playerId===opponentId,knockedOut:Number(state.opponentHp??0)<=0}:null;

  function handleTeamMap(next:Record<string,number>){
    const ids=Object.entries(next).filter(([,q])=>q>0).map(([cardId])=>cardId).slice(0,3);
    setTeamMap(Object.fromEntries(ids.map(cardId=>[cardId,1])));
    setTeamOrder(prev=>[...prev.filter(cardId=>ids.includes(cardId)),...ids.filter(cardId=>!prev.includes(cardId))].slice(0,3));
  }
  function moveTeam(index:number,dir:-1|1){setTeamOrder(prev=>{const next=[...prev];const target=index+dir;if(target<0||target>=next.length)return prev;[next[index],next[target]]=[next[target],next[index]];return next;});}
  async function submitTeam(){
    if(!id||teamOrder.length!==3||working)return;
    try{setWorking(true);await setBattleTeam(String(id),teamOrder);if(settings?.battle_sounds??true)void playBattleSound('confirm');setNotice('Time 3×3 confirmado. O primeiro Pokémon é seu líder.');await load(true);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível confirmar o time.');}finally{setWorking(false);}
  }
  async function confirmAttack(){
    if(!id||!selectedAttack||working||myLocked)return;
    try{setWorking(true);const result=await chooseBattleTeamAttack(String(id),selectedAttack);if(settings?.battle_sounds??true)void playBattleSound('confirm');if(settings?.battle_vibration??true)Vibration.vibrate(55);setNotice(result?.bothActionsLocked?'Turno resolvido.':'Golpe confirmado. Aguardando o adversário.');await load(true);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível confirmar o golpe.');}finally{setWorking(false);}
  }
  async function confirmSwitch(slot:number|null=selectedSwitch){
    if(!id||!slot||working||myLocked)return;
    try{setWorking(true);const result=await chooseBattleTeamSwitch(String(id),slot);if(settings?.battle_sounds??true)void playBattleSound('confirm');if(settings?.battle_vibration??true)Vibration.vibrate(65);setNotice(myForced?(result?.forcedSwitchResolved?'Troca obrigatória concluída. Escolha sua próxima ação.':'Troca obrigatória confirmada.'):result?.bothActionsLocked?'Turno resolvido.':'Troca confirmada. Aguardando o adversário.');await load(true);}
    catch(e){setNotice(e instanceof Error?e.message:'Não foi possível trocar de Pokémon.');}finally{setWorking(false);}
  }
  async function respond(accept:boolean){if(!id||working)return;try{setWorking(true);await respondToBattle(String(id),accept);if(!accept){goBackOrHome(router);return;}await load();}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível responder.');}finally{setWorking(false);}}
  async function leaveBeforeStart(){if(!id||working)return;try{setWorking(true);await cancelBattle(String(id));goBackOrHome(router);}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível cancelar.');}finally{setWorking(false);}}
  function confirmForfeit(){Alert.alert('Desistir da batalha?','Depois que seu time foi confirmado, a desistência dá a vitória ao adversário.',[{text:'Voltar',style:'cancel'},{text:'Desistir',style:'destructive',onPress:()=>void doForfeit()}]);}
  async function doForfeit(){if(!id)return;try{setWorking(true);await forfeitBattle(String(id));await load(true);}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível desistir.');}finally{setWorking(false);}}
  async function rematch(){if(!id||working)return;try{setWorking(true);const next=await rematchBattle(String(id));router.replace(('/team-battle/'+next) as never);}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível criar a revanche.');}finally{setWorking(false);}}

  return <Screen title="Equipe 3×3" subtitle="Batalha contínua com troca de Pokémon durante os turnos.">
    <Pressable onPress={()=>goBackOrHome(router)} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
    {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="information-circle" size={18} color={colors.yellow}/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text></Pressable>:null}
    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}

    {battle?<View style={[styles.header,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={{flex:1}}><Text style={[styles.kicker,{color:colors.accent}]}>GAME_V1 • EQUIPE 3×3</Text><Text style={[styles.headerTitle,{color:colors.text}]}>@{me?.username??'Você'} × @{opponent?.username??'Adversário'}</Text><Text style={[styles.headerMeta,{color:colors.muted}]}>{battle.status==='invited'?'Convite':battle.status==='drafting'?'Montagem privada dos times':battle.status==='revealing'?`Turno ${state?.turn??1}`:battle.status==='completed'?'Batalha concluída':battle.status}</Text></View>{['drafting','revealing'].includes(battle.status)&&remaining>0?<View style={[styles.timer,{borderColor:remaining<=10?'#D96575':colors.border}]}><Ionicons name="time" size={16} color={remaining<=10?'#FF8290':colors.yellow}/><Text style={[styles.timerText,{color:remaining<=10?'#FF8290':colors.text}]}>{remaining}s</Text></View>:null}</View>:null}

    {battle?.status==='invited'?<View style={[styles.invite,{backgroundColor:colors.surface,borderColor:colors.yellow}]}>{isChallenger?<><Ionicons name="hourglass" size={30} color={colors.yellow}/><Text style={[styles.inviteTitle,{color:colors.text}]}>Aguardando @{opponent?.username??'adversário'}</Text><Text style={[styles.inviteText,{color:colors.muted}]}>O time só será escolhido depois que o desafio for aceito.</Text><Pressable disabled={working} onPress={()=>void leaveBeforeStart()} style={[styles.outlineButton,{borderColor:'#D96575'}]}><Text style={styles.dangerText}>CANCELAR DESAFIO</Text></Pressable></>:<><Ionicons name="swap-horizontal" size={34} color={colors.yellow}/><Text style={[styles.inviteTitle,{color:colors.text}]}>Desafio Equipe 3×3</Text><Text style={[styles.inviteText,{color:colors.muted}]}>Monte três Pokémon em segredo. Depois, a cada turno, escolha Golpear ou Trocar.</Text><View style={styles.inviteActions}><Pressable disabled={working} onPress={()=>void respond(false)} style={[styles.outlineButton,{borderColor:'#D96575'}]}><Text style={styles.dangerText}>RECUSAR</Text></Pressable><Pressable disabled={working} onPress={()=>void respond(true)} style={[styles.primaryButton,{backgroundColor:colors.yellow}]}><Text style={styles.primaryText}>ACEITAR 3×3</Text></Pressable></View></>}</View>:null}

    {battle?.status==='drafting'?<View style={[styles.setup,{backgroundColor:colors.surface,borderColor:colors.border}]}><View style={styles.setupHead}><View style={[styles.setupIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="albums" size={24} color={colors.accent}/></View><View style={{flex:1}}><Text style={[styles.setupTitle,{color:colors.text}]}>Monte seu time</Text><Text style={[styles.setupText,{color:colors.muted}]}>Escolha exatamente 3 Pokémon. A ordem é importante: o slot 1 entra como líder. O time do adversário fica oculto até a batalha começar.</Text></View></View>{state?.myTeamLocked?<View style={[styles.waiting,{backgroundColor:colors.surfaceAlt,borderColor:colors.yellow}]}><ActivityIndicator size="small" color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.waitTitle,{color:colors.text}]}>SEU TIME ESTÁ CONFIRMADO</Text><Text style={[styles.setupText,{color:colors.muted}]}>{state?.opponentTeamLocked?'Os dois times foram confirmados. Iniciando…':'Aguardando o adversário confirmar o time.'}</Text></View></View>:<><Pressable onPress={()=>setPickerOpen(true)} style={[styles.chooseTeam,{backgroundColor:colors.surfaceAlt,borderColor:teamOrder.length===3?colors.accent:colors.border}]}><Ionicons name="add-circle" size={21} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.chooseTitle,{color:colors.text}]}>{teamOrder.length}/3 Pokémon escolhidos</Text><Text style={[styles.setupText,{color:colors.muted}]}>Toque para escolher ou trocar os membros.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable><View style={styles.orderList}>{selectedTeamEntries.map((entry,index)=>{const card=entry.cards!;const preview=getBattleCardPreview(card);return <View key={card.id} style={[styles.orderCard,{backgroundColor:colors.surfaceAlt,borderColor:index===0?colors.yellow:colors.border}]}>{card.image_small?<Image source={{uri:card.image_small}} style={styles.orderImage} resizeMode="contain"/>:null}<View style={{flex:1}}><Text style={[styles.slotLabel,{color:index===0?colors.yellow:colors.accent}]}>{index===0?'LÍDER • SLOT 1':`RESERVA • SLOT ${index+1}`}</Text><Text numberOfLines={1} style={[styles.orderName,{color:colors.text}]}>{card.pokemon_name}</Text><Text style={[styles.orderStats,{color:colors.muted}]}>HP {preview.hp} • ATK {preview.maxDamage} • VEL {preview.speedScore}</Text></View><View style={styles.reorder}><Pressable disabled={index===0} onPress={()=>moveTeam(index,-1)}><Ionicons name="chevron-up" size={20} color={index===0?colors.border:colors.muted}/></Pressable><Pressable disabled={index===teamOrder.length-1} onPress={()=>moveTeam(index,1)}><Ionicons name="chevron-down" size={20} color={index===teamOrder.length-1?colors.border:colors.muted}/></Pressable></View></View>})}</View><Pressable disabled={teamOrder.length!==3||working} onPress={()=>void submitTeam()} style={[styles.primaryButton,{backgroundColor:colors.yellow},(teamOrder.length!==3||working)&&{opacity:.4}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="lock-closed" size={18} color="#07111F"/>}<Text style={styles.primaryText}>CONFIRMAR TIME 3×3</Text></Pressable></>}</View>:null}

    {battle?.status==='revealing'&&state?<><TeamStrip title="Seu time" team={myTeam} activeSlot={Number(state.myActiveSlot)} mine/><PixelBattleArena my={myFighter} rival={rivalFighter} resultKey={state.lastTurnNo??0} winner={lastTurn?.winnerId===userId?'me':lastTurn?.winnerId===opponentId?'rival':null} title="ARENA • EQUIPE 3×3" subtitle="Golpear ou Trocar • HP, PP e status persistem" turnOnly/><TeamStrip title={'Time de @'+(opponent?.username??'adversário')} team={opponentTeam} activeSlot={Number(state.opponentActiveSlot)}/>
      {waitingOpponentForced?<View style={[styles.waiting,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><ActivityIndicator size="small" color={colors.yellow}/><View style={{flex:1}}><Text style={[styles.waitTitle,{color:colors.text}]}>AGUARDANDO TROCA OBRIGATÓRIA</Text><Text style={[styles.setupText,{color:colors.muted}]}>O Pokémon adversário foi nocauteado. O próximo turno começa depois que uma reserva entrar.</Text></View></View>:myLocked?<View style={[styles.waiting,{backgroundColor:colors.surface,borderColor:colors.accent}]}><Ionicons name="checkmark-circle" size={22} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.waitTitle,{color:colors.text}]}>AÇÃO CONFIRMADA</Text><Text style={[styles.setupText,{color:colors.muted}]}>{state.myActionType==='switch'?`Troca para ${myTeam.find((m:any)=>m.slot===Number(state.mySwitchSlot))?.name??'reserva'}`:`Golpe: ${state.myAttackName??'confirmado'}`} • aguardando o adversário.</Text></View></View>:<View style={[styles.actions,{backgroundColor:colors.surface,borderColor:myForced?'#D96575':colors.border}]}>{myForced?<View style={styles.forcedHead}><Ionicons name="warning" size={24} color="#FF8290"/><View style={{flex:1}}><Text style={[styles.forcedTitle,{color:'#FF9EAA'}]}>ESCOLHA O PRÓXIMO POKÉMON</Text><Text style={[styles.setupText,{color:colors.muted}]}>Seu Pokémon foi nocauteado. Esta troca não gasta o próximo turno.</Text></View></View>:<View style={styles.tabs}><Pressable onPress={()=>setActionTab('attack')} style={[styles.tab,{backgroundColor:actionTab==='attack'?colors.accentSoft:colors.surfaceAlt,borderColor:actionTab==='attack'?colors.accent:colors.border}]}><Ionicons name="flash" size={17} color={actionTab==='attack'?colors.accent:colors.muted}/><Text style={[styles.tabText,{color:colors.text}]}>GOLPES</Text></Pressable><Pressable onPress={()=>setActionTab('switch')} style={[styles.tab,{backgroundColor:actionTab==='switch'?colors.accentSoft:colors.surfaceAlt,borderColor:actionTab==='switch'?colors.accent:colors.border}]}><Ionicons name="swap-horizontal" size={17} color={actionTab==='switch'?colors.accent:colors.muted}/><Text style={[styles.tabText,{color:colors.text}]}>TROCAR</Text></Pressable></View>}
        {!myForced&&actionTab==='attack'?<><Text style={[styles.actionTitle,{color:colors.text}]}>Escolha um golpe</Text><View style={styles.attackList}>{attacks.map((attack:any)=>{const disabled=Number(attack.pp??0)<=0;const selected=selectedAttack===attack.identifier;return <Pressable key={attack.identifier} disabled={disabled} onPress={()=>setSelectedAttack(attack.identifier)} style={[styles.attack,{backgroundColor:selected?colors.accentSoft:colors.surfaceAlt,borderColor:selected?colors.accent:colors.border},disabled&&{opacity:.4}]}><View style={{flex:1}}><Text style={[styles.attackName,{color:colors.text}]}>{attack.name}</Text><Text style={[styles.attackMeta,{color:colors.muted}]}>{String(attack.type??'normal').toUpperCase()} • {String(attack.category??'').toUpperCase()} • Poder {attack.power??'—'} • Precisão {attack.accuracy??'—'}%</Text></View><Text style={[styles.pp,{color:disabled?'#FF8290':colors.yellow}]}>PP {attack.pp}/{attack.maxPp}</Text></Pressable>})}</View><Pressable disabled={!selectedAttack||working} onPress={()=>void confirmAttack()} style={[styles.primaryButton,{backgroundColor:colors.yellow},(!selectedAttack||working)&&{opacity:.4}]}><Ionicons name="flash" size={18} color="#07111F"/><Text style={styles.primaryText}>CONFIRMAR GOLPE</Text></Pressable></>:null}
        {(myForced||actionTab==='switch')?<><Text style={[styles.actionTitle,{color:colors.text}]}>{myForced?'Reserva disponível':'Escolha quem entra em campo'}</Text><View style={styles.switchList}>{switchOptions.map((member:any)=>{const selected=selectedSwitch===Number(member.slot);return <Pressable key={member.slot} onPress={()=>setSelectedSwitch(Number(member.slot))} style={[styles.switchCard,{backgroundColor:selected?colors.accentSoft:colors.surfaceAlt,borderColor:selected?colors.accent:colors.border}]}>{member.image?<Image source={{uri:member.image}} style={styles.switchImage} resizeMode="contain"/>:null}<View style={{flex:1}}><Text style={[styles.switchName,{color:colors.text}]}>{member.name}</Text><Text style={[styles.switchMeta,{color:colors.muted}]}>HP {member.remainingHp}/{member.hp} • {(member.types??[]).join(' / ').toUpperCase()}{member.status?' • '+String(member.status).toUpperCase():''}</Text><HpBar current={Number(member.remainingHp)} max={Number(member.hp)}/></View>{selected?<Ionicons name="checkmark-circle" size={21} color={colors.accent}/>:null}</Pressable>})}</View><Pressable disabled={!selectedSwitch||working} onPress={()=>void confirmSwitch()} style={[styles.primaryButton,{backgroundColor:myForced?'#FF8290':colors.yellow},(!selectedSwitch||working)&&{opacity:.4}]}><Ionicons name="swap-horizontal" size={18} color="#07111F"/><Text style={styles.primaryText}>{myForced?'ENTRAR EM CAMPO':'CONFIRMAR TROCA'}</Text></Pressable></>:null}
      </View>}
      <Pressable disabled={working} onPress={confirmForfeit} style={[styles.forfeit,{borderColor:'#D96575'}]}><Ionicons name="flag" size={15} color="#FF8290"/><Text style={styles.dangerText}>DESISTIR DA BATALHA</Text></Pressable>
    </>:null}

    {battle?.status==='completed'?<View style={[styles.completed,{backgroundColor:colors.surface,borderColor:battle.winner_id===userId?'#4FB77F':'#D96575'}]}><Ionicons name={battle.winner_id===userId?'trophy':'shield'} size={40} color={battle.winner_id===userId?'#65D894':'#FF8290'}/><Text style={[styles.completedTitle,{color:colors.text}]}>{battle.winner_id===userId?'Vitória 3×3!':'Batalha encerrada'}</Text><Text style={[styles.completedText,{color:colors.muted}]}>{battle.winner_id===userId?'Você derrotou os três Pokémon adversários.':`@${opponent?.username??'O adversário'} venceu a batalha de equipe.`}</Text><View style={styles.completedActions}><Pressable onPress={()=>router.push(('/battle-replay/'+String(id)) as never)} style={[styles.outlineButton,{borderColor:colors.yellow}]}><Ionicons name="play-back" size={16} color={colors.yellow}/><Text style={[styles.outlineText,{color:colors.yellow}]}>REPLAY</Text></Pressable><Pressable disabled={working} onPress={()=>void rematch()} style={[styles.primaryButton,{backgroundColor:colors.yellow}]}><Ionicons name="refresh" size={17} color="#07111F"/><Text style={styles.primaryText}>REVANCHE 3×3</Text></Pressable></View></View>:null}

    <CardPickerModal visible={pickerOpen} title="Seu time 3×3" subtitle="Escolha 3 Pokémon distintos. Depois você poderá ordenar líder e reservas." bag={bag} mode="quantity" selectedMap={teamMap} maxPerCard={1} maxTotal={3} displayMode="battle" gameStyle enableCombatSort enableTypeFilter onSelectedMapChange={handleTeamMap} onClose={()=>setPickerOpen(false)} onConfirm={()=>setPickerOpen(false)} confirmLabel="USAR ESTES 3 POKÉMON"/>
  </Screen>;
}

function HpBar({current,max}:{current:number;max:number}){const{colors}=useAppTheme();const pct=Math.max(0,Math.min(100,current/Math.max(1,max)*100));return <View style={[styles.hpTrack,{backgroundColor:colors.border}]}><View style={[styles.hpFill,{width:`${pct}%`,backgroundColor:pct>50?'#65D894':pct>20?'#F0C74E':'#FF8290'}]}/></View>}
function TeamStrip({title,team,activeSlot,mine=false}:{title:string;team:any[];activeSlot:number;mine?:boolean}){const{colors}=useAppTheme();return <View style={[styles.teamStrip,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.teamTitle,{color:colors.text}]}>{title}</Text><View style={styles.teamMembers}>{team.map(member=>{const active=Number(member.slot)===activeSlot;const fainted=Number(member.remainingHp)<=0;return <View key={member.slot} style={[styles.member,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.accent:fainted?'#D96575':colors.border,opacity:fainted?.55:1}]}>{member.image?<Image source={{uri:member.image}} style={styles.memberImage} resizeMode="contain"/>:null}<View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={[styles.memberName,{color:colors.text}]}>{member.name}</Text><Text style={[styles.memberMeta,{color:fainted?'#FF8290':colors.muted}]}>{fainted?'Nocauteado':active?'ATIVO':mine?'Reserva':'Disponível'} • HP {member.remainingHp}/{member.hp}</Text><HpBar current={Number(member.remainingHp)} max={Number(member.hp)}/></View></View>})}</View></View>}

const styles=StyleSheet.create({back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6},backText:{fontSize:9,fontWeight:'900'},notice:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:7},noticeText:{flex:1,fontSize:8.5},header:{borderRadius:17,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},kicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.8},headerTitle:{fontSize:15,fontWeight:'900',marginTop:2},headerMeta:{fontSize:8,marginTop:2},timer:{borderRadius:10,borderWidth:1,paddingHorizontal:9,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:5},timerText:{fontSize:11,fontWeight:'900'},invite:{borderRadius:19,borderWidth:1,padding:18,alignItems:'center',gap:8},inviteTitle:{fontSize:17,fontWeight:'900',textAlign:'center'},inviteText:{fontSize:9,lineHeight:14,textAlign:'center'},inviteActions:{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'center'},outlineButton:{minHeight:40,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},outlineText:{fontSize:8,fontWeight:'900'},primaryButton:{minHeight:44,borderRadius:12,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},primaryText:{fontSize:8.5,fontWeight:'900',color:'#07111F'},dangerText:{fontSize:7.5,fontWeight:'900',color:'#FF8290'},setup:{borderRadius:18,borderWidth:1,padding:12,gap:10},setupHead:{flexDirection:'row',alignItems:'center',gap:9},setupIcon:{width:44,height:44,borderRadius:13,alignItems:'center',justifyContent:'center'},setupTitle:{fontSize:15,fontWeight:'900'},setupText:{fontSize:8,lineHeight:12,marginTop:2},chooseTeam:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},chooseTitle:{fontSize:10,fontWeight:'900'},orderList:{gap:6},orderCard:{borderRadius:14,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},orderImage:{width:52,height:68},slotLabel:{fontSize:6.5,fontWeight:'900'},orderName:{fontSize:10,fontWeight:'900',marginTop:2},orderStats:{fontSize:7,marginTop:2},reorder:{gap:2},waiting:{borderRadius:15,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},waitTitle:{fontSize:9,fontWeight:'900'},teamStrip:{borderRadius:16,borderWidth:1,padding:9,gap:7},teamTitle:{fontSize:11,fontWeight:'900'},teamMembers:{flexDirection:'row',flexWrap:'wrap',gap:6},member:{flexGrow:1,flexBasis:185,minWidth:165,borderRadius:12,borderWidth:1,padding:6,flexDirection:'row',alignItems:'center',gap:6},memberImage:{width:42,height:52},memberName:{fontSize:8.5,fontWeight:'900'},memberMeta:{fontSize:6.5,marginTop:2},hpTrack:{height:4,borderRadius:999,overflow:'hidden',marginTop:4},hpFill:{height:'100%',borderRadius:999},actions:{borderRadius:17,borderWidth:1,padding:11,gap:9},tabs:{flexDirection:'row',gap:7},tab:{flex:1,minHeight:42,borderRadius:11,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},tabText:{fontSize:8,fontWeight:'900'},forcedHead:{flexDirection:'row',alignItems:'center',gap:8},forcedTitle:{fontSize:11,fontWeight:'900'},actionTitle:{fontSize:12,fontWeight:'900'},attackList:{gap:6},attack:{borderRadius:13,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:8},attackName:{fontSize:9.5,fontWeight:'900'},attackMeta:{fontSize:6.8,lineHeight:10,marginTop:2},pp:{fontSize:8,fontWeight:'900'},switchList:{gap:6},switchCard:{borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:8},switchImage:{width:48,height:58},switchName:{fontSize:9.5,fontWeight:'900'},switchMeta:{fontSize:7,lineHeight:10,marginTop:2},forfeit:{alignSelf:'flex-end',minHeight:36,borderRadius:10,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},completed:{borderRadius:20,borderWidth:1,padding:18,alignItems:'center',gap:7},completedTitle:{fontSize:19,fontWeight:'900'},completedText:{fontSize:9,textAlign:'center'},completedActions:{flexDirection:'row',gap:8,flexWrap:'wrap',justifyContent:'center'}});
