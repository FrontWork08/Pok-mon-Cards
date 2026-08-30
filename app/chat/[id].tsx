import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getMessages, getOrCreateConversation, markConversationRead, sendMessage, subscribeToMessages } from '@/services/chat';
import { createBattle, type BattleMode, type BattleStakeType } from '@/services/battles';
import { getMyBag, getProfileAvatarUrl } from '@/services/player';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

const WAGERS=[100,250,500,1000,2500];

export default function ChatScreen() {
  const { id: friendId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isLight } = useAppTheme();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [friend, setFriend] = useState<any>(null);
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [battleSetup,setBattleSetup]=useState(false);
  const [battleMode,setBattleMode]=useState<BattleMode>('mystery');
  const [stakeType,setStakeType]=useState<BattleStakeType>('none');
  const [wager,setWager]=useState(500);
  const [bag,setBag]=useState<any[]>([]);
  const [stakeCardId,setStakeCardId]=useState<string|null>(null);
  const [bagLoading,setBagLoading]=useState(false);

  const loadMessages = useCallback(async (cid: string) => {
    const list = await getMessages(cid);
    setMessages(list);
    await markConversationRead(cid).catch(() => null);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!friendId) return;
      try {
        setLoading(true);
        const [{ data: auth }, { data: player }, cid] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('players').select('id,username,level,battle_rating,profile_icon,avatar_path,avatar_updated_at').eq('id', friendId).single(),
          getOrCreateConversation(friendId),
        ]);
        setUserId(auth.user?.id ?? '');
        setFriend(player);
        setConversationId(cid);
        await loadMessages(cid);
        cleanup = subscribeToMessages(cid, (message) => {
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== auth.user?.id) markConversationRead(cid).catch(() => null);
        });
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Não foi possível abrir a conversa.');
      } finally {
        setLoading(false);
      }
    })();
    return () => cleanup?.();
  }, [friendId, loadMessages]);

  async function submit() {
    const message = text.trim();
    if (!conversationId || !message || sending) return;
    try {
      setSending(true);
      setText('');
      await sendMessage(conversationId, message);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Mensagem não enviada.');
      setText(message);
    } finally {
      setSending(false);
    }
  }

  async function openBattleSetup(){
    setBattleSetup(true);
    setStakeCardId(null);
    if(!bag.length){
      try{
        setBagLoading(true);
        setBag(await getMyBag());
      } catch(e) {
        setNotice(e instanceof Error?e.message:'Não foi possível carregar sua Bag.');
      } finally {
        setBagLoading(false);
      }
    }
  }

  async function challenge() {
    if (!friendId || sending) return;
    if(stakeType==='card'&&!stakeCardId){
      setNotice('Escolha a carta que ficará em aposta.');
      return;
    }
    try {
      setSending(true);
      const battleId = await createBattle(friendId,battleMode,stakeType,stakeType==='coins'?wager:0,stakeType==='card'?stakeCardId:null);
      setBattleSetup(false);
      router.push(`/battle/${battleId}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível criar a batalha.');
    } finally {
      setSending(false);
    }
  }

  const title = useMemo(() => friend?.username ? `@${friend.username}` : 'Chat', [friend]);

  return (
    <View style={[styles.safe,{backgroundColor:colors.bg}]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.challengeBar,{backgroundColor:colors.surface,borderBottomColor:colors.border}]}>
        <View style={styles.friendMeta}>
          <TrainerAvatar
            icon={friend?.profile_icon}
            avatarUrl={getProfileAvatarUrl(friend?.avatar_path, friend?.avatar_updated_at)}
            color={colors.accent}
            backgroundColor={colors.accentSoft}
            size={38}
          />
          <View>
            <Text style={[styles.friendName,{color:colors.text}]}>{title}</Text>
            <View style={styles.friendPresence}>
              <View style={[styles.onlineDot,{backgroundColor:'#65D894'}]}/>
              <Text style={[styles.friendRating,{color:colors.muted}]}>ELO {friend?.battle_rating??1000}</Text>
            </View>
          </View>
        </View>
        <Pressable style={[styles.challengeMystery,{backgroundColor:colors.accent}]} onPress={openBattleSetup} disabled={sending}>
          <Ionicons name="game-controller" size={17} color="#fff" />
          <Text style={styles.challengeMysteryText}>DESAFIAR</Text>
        </Pressable>
      </View>

      {notice ? (
        <Pressable style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]} onPress={() => setNotice(null)}>
          <Ionicons name="information-circle" size={18} color={colors.yellow} />
          <Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.yellow} /></View>
      ) : (
        <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
          {messages.map((message) => {
            const mine = message.sender_id === userId;
            const battleId = message.kind === 'battle_invite' ? message.metadata?.battleId : null;
            return (
              <Pressable
                key={message.id}
                style={[styles.bubbleWrap,mine?styles.mineWrap:styles.theirWrap]}
                onPress={() => battleId && router.push(`/battle/${battleId}`)}
              >
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? [styles.mine,{backgroundColor:colors.accent}]
                      : [styles.their,{backgroundColor:colors.surface,borderColor:colors.border}],
                    message.kind==='battle_invite'&&[styles.battleBubble,{backgroundColor:colors.accentSoft,borderColor:colors.accent}],
                  ]}
                >
                  {message.kind==='battle_invite' ? (
                    <View style={styles.battleLabel}>
                      <Ionicons name="game-controller" size={14} color={colors.yellow}/>
                      <Text style={[styles.battleLabelText,{color:colors.yellow}]}>DESAFIO DE BATALHA</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.messageText,{color:mine?'#fff':colors.text}]}>{message.body}</Text>
                  {battleId ? <Text style={[styles.openBattle,{color:colors.accent}]}>TOQUE PARA ABRIR O DESAFIO →</Text> : null}
                  <Text style={[styles.time,{color:mine?'#D9E6FF':colors.muted}]}>
                    {new Date(message.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.composer,{backgroundColor:colors.surface,borderTopColor:colors.border}]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="Mensagem..."
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}
        />
        <Pressable
          style={[styles.send,{backgroundColor:colors.accent},(!text.trim()||sending)&&styles.sendDisabled]}
          onPress={submit}
          disabled={!text.trim()||sending}
        >
          <Ionicons name="send" size={18} color="#fff"/>
        </Pressable>
      </View>

      <Modal visible={battleSetup} transparent animationType="slide" onRequestClose={()=>setBattleSetup(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalKicker,{color:colors.yellow}]}>NOVO DESAFIO</Text>
                <Text style={[styles.modalTitle,{color:colors.text}]}>Batalhar com @{friend?.username??'amigo'}</Text>
              </View>
              <Pressable onPress={()=>setBattleSetup(false)}><Ionicons name="close" size={24} color={colors.text}/></Pressable>
            </View>

            <Text style={[styles.optionTitle,{color:colors.muted}]}>MODO</Text>
            <View style={styles.optionRow}>
              <Option active={battleMode==='quick'} label="Quick • 1 carta" onPress={()=>setBattleMode('quick')}/>
              <Option active={battleMode==='mystery'} label="Mystery • BO3" onPress={()=>setBattleMode('mystery')}/>
              <Option active={battleMode==='draft3'} label="Draft 3 • 3×3" onPress={()=>setBattleMode('draft3')}/>
            </View>

            <Text style={[styles.optionTitle,{color:colors.muted}]}>APOSTA</Text>
            <View style={styles.optionRow}>
              <Option active={stakeType==='none'} label="Casual" onPress={()=>setStakeType('none')}/>
              <Option active={stakeType==='coins'} label="Moedas" onPress={()=>setStakeType('coins')}/>
              <Option active={stakeType==='card'} label="🎴 Carta" onPress={()=>setStakeType('card')}/>
            </View>

            {stakeType==='coins' ? (
              <>
                <Text style={[styles.optionTitle,{color:colors.muted}]}>MOEDAS DE CADA LADO</Text>
                <View style={styles.wagerRow}>
                  {WAGERS.map(v=>(
                    <Pressable
                      key={v}
                      style={[
                        styles.wagerChip,
                        {backgroundColor:wager===v?colors.accentSoft:colors.surfaceAlt,borderColor:wager===v?colors.yellow:colors.border},
                      ]}
                      onPress={()=>setWager(v)}
                    >
                      <Text style={[styles.wagerText,{color:wager===v?colors.yellow:colors.muted}]}>🪙 {v.toLocaleString('pt-BR')}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {stakeType==='card' ? (
              <>
                <Text style={[styles.optionTitle,{color:colors.muted}]}>SUA CARTA EM ESCROW</Text>
                <Text style={[styles.cardHelp,{color:colors.muted}]}>
                  Ao enviar o desafio, 1 unidade desta carta fica bloqueada. Se o desafio for recusado/cancelado ela volta automaticamente.
                </Text>
                {bagLoading ? (
                  <ActivityIndicator color={colors.yellow}/>
                ) : (
                  <ScrollView style={styles.cardScroller} contentContainerStyle={styles.cardGrid}>
                    {bag.map(entry=>{
                      const card=Array.isArray(entry.cards)?entry.cards[0]:entry.cards;
                      if(!card)return null;
                      const active=stakeCardId===card.id;
                      return (
                        <Pressable
                          key={card.id}
                          style={[
                            styles.stakeCard,
                            {backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.yellow:colors.border},
                          ]}
                          onPress={()=>setStakeCardId(card.id)}
                        >
                          {card.image_small ? <Image source={{uri:card.image_small}} resizeMode="contain" style={styles.stakeImage}/> : <View style={styles.stakeImage}/>}
                          <Text numberOfLines={1} style={[styles.stakeName,{color:colors.text}]}>{card.pokemon_name}</Text>
                          <Text style={[styles.stakeMeta,{color:colors.muted}]}>{card.rarity??'Comum'} • x{entry.quantity}</Text>
                          {active ? <View style={[styles.check,{backgroundColor:colors.yellow}]}><Ionicons name="checkmark" size={14} color="#07111F"/></View> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            ) : null}

            <Pressable
              style={[styles.createBattle,{backgroundColor:colors.yellow},(stakeType==='card'&&!stakeCardId)&&styles.sendDisabled]}
              onPress={challenge}
              disabled={sending||(stakeType==='card'&&!stakeCardId)}
            >
              <Ionicons name="flash" size={18} color="#07111F"/>
              <Text style={styles.createBattleText}>{sending?'CRIANDO...':'ENVIAR DESAFIO'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Option({active,label,onPress}:{active:boolean;label:string;onPress:()=>void}){
  const {colors}=useAppTheme();
  return (
    <Pressable
      style={[styles.option,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.accent:colors.border}]}
      onPress={onPress}
    >
      <Text style={[styles.optionText,{color:active?colors.text:colors.muted}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1},
  center:{flex:1,alignItems:'center',justifyContent:'center'},
  challengeBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,paddingHorizontal:12,paddingVertical:9,borderBottomWidth:1},
  friendMeta:{flexDirection:'row',alignItems:'center',gap:9},
  chatAvatar:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  friendName:{fontSize:13,fontWeight:'900'},
  friendPresence:{flexDirection:'row',alignItems:'center',gap:5,marginTop:2},
  onlineDot:{width:7,height:7,borderRadius:99},
  challengeMystery:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:10,borderRadius:11},
  challengeMysteryText:{color:'#fff',fontSize:10,fontWeight:'900'},
  friendRating:{fontSize:9,fontWeight:'900'},
  notice:{margin:10,flexDirection:'row',gap:8,padding:11,borderRadius:13,borderWidth:1},
  noticeText:{flex:1,fontSize:11,fontWeight:'700'},
  messages:{flex:1},
  messagesContent:{padding:14,gap:8},
  bubbleWrap:{width:'100%',flexDirection:'row'},
  mineWrap:{justifyContent:'flex-end'},
  theirWrap:{justifyContent:'flex-start'},
  bubble:{maxWidth:'82%',minWidth:80,borderRadius:17,paddingHorizontal:12,paddingVertical:9},
  mine:{borderBottomRightRadius:5},
  their:{borderBottomLeftRadius:5,borderWidth:1},
  battleBubble:{borderWidth:1},
  battleLabel:{flexDirection:'row',alignItems:'center',gap:5,marginBottom:5},
  battleLabelText:{fontSize:8,fontWeight:'900',letterSpacing:.8},
  messageText:{fontSize:13,lineHeight:18},
  openBattle:{fontSize:8,fontWeight:'900',marginTop:7},
  time:{fontSize:8,textAlign:'right',marginTop:5},
  composer:{flexDirection:'row',alignItems:'flex-end',gap:8,padding:10,borderTopWidth:1},
  input:{flex:1,minHeight:44,maxHeight:120,borderRadius:15,paddingHorizontal:13,paddingVertical:11,borderWidth:1},
  send:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center'},
  sendDisabled:{opacity:.4},
  modalBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'#0009'},
  modalCard:{maxHeight:'88%',borderTopLeftRadius:25,borderTopRightRadius:25,padding:16,gap:11,borderWidth:1},
  modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  modalKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2},
  modalTitle:{fontSize:20,fontWeight:'900',marginTop:2},
  optionTitle:{fontSize:8,fontWeight:'900',letterSpacing:1.2,marginTop:3},
  optionRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  option:{paddingHorizontal:12,paddingVertical:9,borderRadius:10,borderWidth:1},
  optionText:{fontSize:9,fontWeight:'900'},
  wagerRow:{flexDirection:'row',flexWrap:'wrap',gap:6},
  wagerChip:{paddingHorizontal:10,paddingVertical:8,borderRadius:999,borderWidth:1},
  wagerText:{fontSize:9,fontWeight:'900'},
  cardHelp:{fontSize:9,lineHeight:14},
  cardScroller:{maxHeight:300},
  cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,paddingBottom:4},
  stakeCard:{width:'31.8%',padding:6,borderRadius:12,borderWidth:1,position:'relative'},
  stakeImage:{width:'100%',aspectRatio:.72,borderRadius:7},
  stakeName:{fontSize:9,fontWeight:'900',marginTop:5},
  stakeMeta:{fontSize:7,marginTop:2},
  check:{position:'absolute',top:8,right:8,width:23,height:23,borderRadius:12,alignItems:'center',justifyContent:'center'},
  createBattle:{minHeight:49,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:13,marginTop:3},
  createBattleText:{color:'#07111F',fontSize:10,fontWeight:'900'}
});
