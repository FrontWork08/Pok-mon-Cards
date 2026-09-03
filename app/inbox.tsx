import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import {
  getConversationInbox,
  getMyNotifications,
  markNotificationRead,
  resolveNotificationRoute,
} from '@/services/notifications';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getActionableActivities, type ActionableActivity } from '@/services/activityCenter';
import { StatusPill } from '@/components/StatusPill';

type ActivityFilter = 'all' | 'action' | 'battle' | 'social' | 'economy' | 'progress';

const FILTERS: Array<{id:ActivityFilter;label:string;icon:keyof typeof Ionicons.glyphMap}> = [
  {id:'all',label:'TUDO',icon:'apps'},
  {id:'action',label:'PRECISA DE AÇÃO',icon:'alert-circle'},
  {id:'battle',label:'BATALHA',icon:'game-controller'},
  {id:'social',label:'SOCIAL',icon:'people'},
  {id:'economy',label:'ECONOMIA',icon:'storefront'},
  {id:'progress',label:'PROGRESSO',icon:'star'},
];

function activityCategory(item:any): Exclude<ActivityFilter,'all'|'action'> {
  const type=String(item?.type??'').toLowerCase();
  if(type.includes('battle')||type.includes('match')||type.includes('tournament'))return'battle';
  if(type.includes('trade')||type.includes('market')||type.includes('store')||type.includes('gift')||type.includes('listing')||type.includes('offer'))return'economy';
  return'social';
}

function activityIcon(item:any): keyof typeof Ionicons.glyphMap {
  const category=activityCategory(item);
  if(category==='battle')return item?.type==='battle_result'?'trophy':'game-controller';
  if(category==='economy')return String(item?.type??'').includes('trade')?'swap-horizontal':'storefront';
  return String(item?.type??'').includes('friend')?'person-add':'notifications';
}

export default function InboxScreen(){
  const router=useRouter();
  const{colors}=useAppTheme();
  const[conversations,setConversations]=useState<any[]>([]);
  const[notifications,setNotifications]=useState<any[]>([]);
  const[actionable,setActionable]=useState<ActionableActivity[]>([]);
  const[filter,setFilter]=useState<ActivityFilter>('all');
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    try{
      setLoading(true);setError(null);
      const[c,n,a]=await Promise.all([getConversationInbox(),getMyNotifications(60),getActionableActivities().catch(()=>[])]);
      setConversations(c);setNotifications(n);setActionable(a);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível carregar a Central de Atividades.');
    }finally{setLoading(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  async function openNotification(item:any){
    if(!item.read_at)await markNotificationRead(item.id).catch(()=>null);
    router.push(resolveNotificationRoute({...item.metadata,type:item.type}) as never);
    setNotifications(current=>current.map(entry=>entry.id===item.id?{...entry,read_at:entry.read_at??new Date().toISOString()}:entry));
  }

  const unreadMessages=useMemo(()=>conversations.reduce((s,x)=>s+Number(x.unread_count??0),0),[conversations]);
  const unreadAlerts=useMemo(()=>notifications.filter(x=>!x.read_at).length,[notifications]);
  const actionCount=actionable.length+unreadMessages+unreadAlerts;

  const visibleConversations=useMemo(()=>{
    if(filter==='all'||filter==='social')return conversations;
    if(filter==='action')return conversations.filter(item=>Number(item.unread_count??0)>0);
    return[];
  },[conversations,filter]);

  const visibleNotifications=useMemo(()=>{
    if(filter==='all')return notifications;
    if(filter==='action')return notifications.filter(item=>!item.read_at);
    if(filter==='progress')return notifications.filter(item=>{
      const type=String(item?.type??'').toLowerCase();
      return type.includes('mission')||type.includes('pass')||type.includes('reward')||type.includes('rank')||type.includes('season');
    });
    return notifications.filter(item=>activityCategory(item)===filter);
  },[filter,notifications]);

  return <Screen title="Central de Atividades" subtitle="Tudo que precisa da sua atenção em um só lugar: mensagens, batalhas, trocas e recompensas.">
    <Pressable style={styles.back} onPress={()=>goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>

    {error?<View style={styles.error}><Ionicons name="alert-circle" size={19} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></View>:null}

    <View style={styles.summary}>
      <View style={[styles.summaryCard,{backgroundColor:colors.surface,borderColor:actionCount?colors.yellow:colors.border}]}>
        <Ionicons name="flash" size={20} color={colors.yellow}/>
        <Text style={[styles.summaryValue,{color:colors.text}]}>{actionCount}</Text>
        <Text style={[styles.summaryLabel,{color:colors.muted}]}>itens precisam de ação</Text>
      </View>
      <View style={[styles.summaryCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Ionicons name="chatbubbles" size={20} color={colors.accent}/>
        <Text style={[styles.summaryValue,{color:colors.text}]}>{unreadMessages}</Text>
        <Text style={[styles.summaryLabel,{color:colors.muted}]}>mensagens não lidas</Text>
      </View>
      <View style={[styles.summaryCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Ionicons name="notifications" size={20} color="#9B7BFF"/>
        <Text style={[styles.summaryValue,{color:colors.text}]}>{unreadAlerts}</Text>
        <Text style={[styles.summaryLabel,{color:colors.muted}]}>avisos novos</Text>
      </View>
    </View>

    <View style={styles.filters}>
      {FILTERS.map(item=>{
        const active=filter===item.id;
        return <Pressable key={item.id} onPress={()=>setFilter(item.id)} style={[styles.filterChip,{backgroundColor:active?colors.accentSoft:colors.surface,borderColor:active?colors.accent:colors.border}]}>
          <Ionicons name={item.icon} size={14} color={active?colors.accent:colors.muted}/>
          <Text style={[styles.filterText,{color:active?colors.text:colors.muted}]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>

    {loading?<ActivityIndicator size="large" color={colors.yellow}/>:null}

    {(filter==='all'||filter==='action'||filter==='battle'||filter==='social'||filter==='economy'||filter==='progress')&&actionable.filter(item=>filter==='all'||filter==='action'||item.category===filter).length?<>
      <View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle,{color:colors.text}]}>Precisa de atenção</Text><Text style={[styles.actionHint,{color:colors.muted}]}>Pendências reais dos sistemas, mesmo quando não houve push.</Text></View><Text style={[styles.count,{color:colors.yellow}]}>{actionable.filter(item=>filter==='all'||filter==='action'||item.category===filter).length}</Text></View>
      <View style={styles.list}>{actionable.filter(item=>filter==='all'||filter==='action'||item.category===filter).map(item=>{
        const accent=item.category==='battle'?'#FF735C':item.category==='economy'?'#54C78D':item.category==='progress'?'#F0C74E':'#9B7BFF';
        const icon=(item.category==='battle'?'game-controller':item.category==='economy'?'swap-horizontal':item.category==='progress'?'star':'people') as keyof typeof Ionicons.glyphMap;
        return <Pressable key={item.id} onPress={()=>router.push(item.route as never)} style={[styles.actionRow,{backgroundColor:colors.surface,borderColor:accent}]}>
          <View style={[styles.alertIcon,{backgroundColor:`${accent}1C`}]}><Ionicons name={icon} size={20} color={accent}/></View>
          <View style={styles.body}><View style={styles.activityTop}><Text style={[styles.alertTitle,{color:colors.text}]}>{item.title}</Text><StatusPill status={item.status} label={item.status==='needs_action'?'PRECISA DE AÇÃO':item.status==='ready'?'PRONTO':'AGUARDANDO'}/></View><Text numberOfLines={2} style={[styles.alertText,{color:colors.muted}]}>{item.body}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
        </Pressable>;
      })}</View>
    </>:null}

    {visibleConversations.length?<><View style={styles.sectionHeader}><Text style={[styles.sectionTitle,{color:colors.text}]}>Conversas</Text><Text style={[styles.count,{color:colors.muted}]}>{visibleConversations.length}</Text></View>
      <View style={styles.list}>{visibleConversations.map(item=><Pressable key={item.conversation_id} onPress={()=>router.push(`/chat/${item.friend_id}`)} style={[styles.row,{backgroundColor:colors.surface,borderColor:Number(item.unread_count)>0?colors.accent:colors.border}]}>
        <View style={[styles.avatar,{backgroundColor:colors.accentSoft}]}><Text style={[styles.avatarText,{color:colors.accent}]}>{String(item.friend_username??'?').slice(0,1).toUpperCase()}</Text></View>
        <View style={styles.body}><View style={styles.topline}><Text style={[styles.name,{color:colors.text}]}>@{item.friend_username}</Text>{item.last_created_at?<Text style={[styles.time,{color:colors.muted}]}>{new Date(item.last_created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</Text>:null}</View><Text numberOfLines={1} style={[styles.preview,{color:colors.muted}]}>{item.last_body??'Conversa iniciada'}</Text></View>
        {Number(item.unread_count)>0?<View style={styles.badge}><Text style={styles.badgeText}>{item.unread_count}</Text></View>:<Ionicons name="chevron-forward" size={19} color={colors.muted}/>}
      </Pressable>)}</View>
    </>:null}

    <View style={styles.sectionHeader}><Text style={[styles.sectionTitle,{color:colors.text}]}>{filter==='action'?'Pendências':'Atividades'}</Text><Text style={[styles.count,{color:colors.muted}]}>{visibleNotifications.length}</Text></View>
    {!loading&&!visibleNotifications.length&&!visibleConversations.length?<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="checkmark-circle-outline" size={36} color="#65D894"/><Text style={[styles.emptyTitle,{color:colors.text}]}>Tudo em dia</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Não há nada nessa categoria precisando da sua atenção.</Text></View>:null}

    <View style={styles.list}>{visibleNotifications.map(item=>{
      const category=activityCategory(item);
      const accent=category==='battle'?colors.yellow:category==='economy'?'#54C78D':'#9B7BFF';
      return <Pressable key={item.id} onPress={()=>{void openNotification(item);}} style={[styles.alertRow,{backgroundColor:colors.surface,borderColor:item.read_at?colors.border:accent}]}>
        <View style={[styles.alertIcon,{backgroundColor:`${accent}1C`}]}><Ionicons name={activityIcon(item)} size={20} color={accent}/></View>
        <View style={styles.body}><View style={styles.activityTop}><Text style={[styles.alertTitle,{color:colors.text}]}>{item.title}</Text>{!item.read_at?<View style={[styles.newPill,{backgroundColor:`${accent}22`,borderColor:accent}]}><Text style={[styles.newPillText,{color:accent}]}>NOVO</Text></View>:null}</View><Text numberOfLines={2} style={[styles.alertText,{color:colors.muted}]}>{item.body}</Text><Text style={[styles.alertTime,{color:colors.muted}]}>{new Date(item.created_at).toLocaleString('pt-BR')}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted}/>
      </Pressable>;
    })}</View>
  </Screen>;
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},
  error:{flexDirection:'row',alignItems:'center',gap:8,padding:12,borderRadius:14,backgroundColor:'#351A24',borderWidth:1,borderColor:'#683243'},errorText:{flex:1,color:'#FFD7DD',fontSize:11,fontWeight:'700'},
  summary:{flexDirection:'row',gap:9,flexWrap:'wrap'},summaryCard:{flex:1,minWidth:135,borderRadius:18,padding:13,borderWidth:1},summaryValue:{fontSize:25,fontWeight:'900',marginTop:5},summaryLabel:{fontSize:9.5,fontWeight:'800',marginTop:1},
  filters:{flexDirection:'row',gap:7,flexWrap:'wrap'},filterChip:{minHeight:34,borderRadius:999,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},filterText:{fontSize:7.5,fontWeight:'900'},
  sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4,gap:8},sectionTitle:{fontSize:18,fontWeight:'900'},actionHint:{fontSize:7.5,marginTop:2,fontWeight:'700'},count:{fontSize:9,fontWeight:'900'},
  list:{gap:8},row:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:17,borderWidth:1},avatar:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:18,fontWeight:'900'},body:{flex:1,minWidth:0},topline:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},name:{fontSize:13,fontWeight:'900'},time:{fontSize:8},preview:{fontSize:10,marginTop:4},
  badge:{minWidth:25,height:25,borderRadius:13,paddingHorizontal:6,alignItems:'center',justifyContent:'center',backgroundColor:'#D84B64'},badgeText:{color:'#fff',fontSize:9,fontWeight:'900'},
  empty:{padding:24,borderRadius:18,borderWidth:1,alignItems:'center',gap:7},emptyTitle:{fontSize:15,fontWeight:'900'},emptyText:{fontSize:10,textAlign:'center'},
  actionRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:17,borderWidth:1.2},alertRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:17,borderWidth:1},alertIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},activityTop:{flexDirection:'row',alignItems:'center',gap:7},alertTitle:{fontSize:12,fontWeight:'900',flexShrink:1},alertText:{fontSize:10,lineHeight:15,marginTop:3},alertTime:{fontSize:8,marginTop:5},newPill:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:2},newPillText:{fontSize:6,fontWeight:'900'},
});
