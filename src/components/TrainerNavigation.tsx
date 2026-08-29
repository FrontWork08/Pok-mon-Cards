import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurrencyBar } from '@/components/CurrencyBar';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { isCurrentUserAdmin } from '@/services/market';
import { getUnreadConversationCount } from '@/services/notifications';
import { getMyRankSnapshot, type RankSnapshot } from '@/services/rankStatus';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { getMyProfile } from '@/services/player';
import { getProfileMediaPublicUrl } from '@/services/profileMedia';

type MenuItem = { label: string; description: string; href: string; icon: keyof typeof Ionicons.glyphMap; adminOnly?: boolean };

const MENU_ITEMS: MenuItem[] = [
  { label:'Início', description:'Voltar ao hub principal', href:'/(tabs)', icon:'home' },
  { label:'Inbox', description:'Mensagens, convites e avisos', href:'/inbox', icon:'mail-unread' },
  { label:'Passe de Batalha', description:'Recompensas e missões', href:'/battle-pass', icon:'ribbon' },
  { label:'Temporada & Jornada', description:'Ranque, streak e eventos', href:'/season', icon:'flame' },
  { label:'Card Chase', description:'Wishlist e cartas desejadas', href:'/wishlist', icon:'star' },
  { label:'Vitrine do Perfil', description:'Suas 6 cartas de destaque', href:'/showcase', icon:'sparkles' },
  { label:'Conquistas e Títulos', description:'Progresso e títulos', href:'/achievements', icon:'ribbon' },
  { label:'Ranking de Coleções', description:'Ranking semanal e global', href:'/collection-ranking', icon:'podium' },
  { label:'Guildas', description:'Equipe, missões e ranking coletivo', href:'/guilds', icon:'shield' },
  { label:'Guild Wars', description:'Confrontos entre guildas', href:'/guild-wars', icon:'flash' },
  { label:'Copa Trainer', description:'Torneios com bracket', href:'/tournaments', icon:'trophy' },
  { label:'Cosméticos', description:'Molduras e backgrounds', href:'/cosmetics', icon:'color-wand' },
  { label:'Mercado', description:'Lojas e ofertas em tempo real', href:'/marketplace', icon:'storefront' },
  { label:'Resgatar Código', description:'Códigos e recompensas', href:'/codes', icon:'ticket' },
  { label:'Amigos e Chat', description:'Amizades e conversas', href:'/friends', icon:'people' },
  { label:'Meus Decks', description:'Monte suas equipes', href:'/decks', icon:'albums' },
  { label:'Missões', description:'Objetivos diários e semanais', href:'/missions', icon:'checkbox' },
  { label:'Pokédex', description:'Espécies e cartas descobertas', href:'/pokedex', icon:'book' },
  { label:'Coleções por Set', description:'Progresso de cada coleção', href:'/sets', icon:'layers' },
  { label:'Histórico de Packs', description:'Reveja seus pulls', href:'/history', icon:'time' },
  { label:'Admin Center', description:'Economia, usuários e sistema', href:'/admin', icon:'shield-checkmark', adminOnly:true },
];

export function TrainerNavigation() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { userId, username, profileIcon } = useWallet();
  const insets = useSafeAreaInsets();
  const [open,setOpen]=useState(false);
  const [isAdmin,setIsAdmin]=useState(false);
  const [unread,setUnread]=useState(0);
  const [rankSnapshot,setRankSnapshot]=useState<RankSnapshot|null>(null);
  const [avatarPath,setAvatarPath]=useState<string|null>(null);

  useEffect(()=>{
    if(!userId)return;
    Promise.all([
      isCurrentUserAdmin().catch(()=>false),
      getUnreadConversationCount().catch(()=>0),
      getMyRankSnapshot().catch(()=>null),
      getMyProfile().catch(()=>null),
    ]).then(([admin,count,snapshot,profile])=>{
      setIsAdmin(admin);
      setUnread(count);
      setRankSnapshot(snapshot);
      setAvatarPath(profile?.avatar_path??null);
    });
  },[userId,open]);

  if(!userId)return null;
  const avatarUrl=getProfileMediaPublicUrl(avatarPath);
  const unreadText=unread>0 ? String(unread)+' aviso'+(unread===1?'':'s')+' novo'+(unread===1?'':'s') : 'Tudo em dia';
  function navigate(href:string){setOpen(false);requestAnimationFrame(()=>router.replace(href as never));}

  return <>
    <View style={styles.shell}>
      <View style={styles.row}>
        <Pressable accessibilityLabel='Abrir menu' onPress={()=>setOpen(true)} style={styles.menuButton}>
          <Ionicons name='menu' size={22} color='#F5D77A'/>
          {unread>0?<View style={styles.unreadDot}/>:null}
        </Pressable>

        <Pressable onPress={()=>router.replace('/(tabs)')} style={styles.brand}>
          <View style={styles.brandMark}><Ionicons name='sparkles' size={18} color='#080B13'/></View>
          <View style={styles.brandCopy}>
            <Text numberOfLines={1} style={styles.brandTitle}>TRAINER COLLECTION</Text>
            <View style={styles.brandMetaRow}>
              <Text style={styles.brandVersion}>VERSION 1.0</Text>
              <View style={styles.brandDot}/>
              <Text numberOfLines={1} style={[styles.brandUser,{color:colors.muted}]}>@{username??'trainer'}</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.walletArea}>
          <CurrencyBar compact/>
          <Pressable accessibilityLabel='Abrir perfil' onPress={()=>router.replace('/(tabs)/profile')} style={styles.avatarPressable}>
            <TrainerAvatar icon={profileIcon} imageUrl={avatarUrl} color='#D9B24C' backgroundColor='#101726' size={42}/>
            {isAdmin?<View style={styles.adminDot}><Ionicons name='shield-checkmark' size={9} color='#fff'/></View>:null}
          </Pressable>
        </View>
      </View>

      {rankSnapshot?<View style={styles.rankStrip}>
        <Pressable onPress={()=>router.replace('/(tabs)/battles')} style={styles.rankCard}>
          <View style={[styles.rankIcon,{backgroundColor:'#362B14'}]}><Ionicons name='trophy' size={14} color='#E8C15A'/></View>
          <View style={styles.rankCopy}><Text style={styles.rankEyebrow}>RANQUEADA</Text><Text style={[styles.rankMain,{color:colors.text}]}>#{rankSnapshot.battle.rank}</Text></View>
          <Text style={[styles.rankSide,{color:colors.muted}]}>{rankSnapshot.battle.rating} ELO</Text>
        </Pressable>
        <Pressable onPress={()=>router.replace('/collection-ranking')} style={styles.rankCard}>
          <View style={[styles.rankIcon,{backgroundColor:'#102D3D'}]}><Ionicons name='diamond' size={14} color='#68D9FF'/></View>
          <View style={styles.rankCopy}><Text style={styles.rankEyebrow}>COLEÇÃO</Text><Text style={[styles.rankMain,{color:colors.text}]}>#{rankSnapshot.collection.rank}</Text></View>
          <Text style={[styles.rankSide,{color:colors.muted}]}>TOP {rankSnapshot.collection.total?Math.max(1,Math.ceil(rankSnapshot.collection.rank/rankSnapshot.collection.total*100)):0}%</Text>
        </Pressable>
      </View>:null}
    </View>

    <Modal visible={open} transparent animationType='fade' onRequestClose={()=>setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={()=>setOpen(false)}/>
        <View style={styles.drawer}>
          <View style={[styles.drawerHeader,{paddingTop:Math.max(insets.top,16)}]}>
            <View style={styles.drawerBrandMark}><Ionicons name='sparkles' size={18} color='#080B13'/></View>
            <View style={styles.headerText}><Text style={styles.drawerKicker}>TRAINER COLLECTION • 1.0</Text><Text numberOfLines={1} style={[styles.username,{color:colors.text}]}>@{username??'Treinador'}</Text></View>
            <Pressable accessibilityLabel='Fechar menu' onPress={()=>setOpen(false)} style={styles.close}><Ionicons name='close' size={24} color={colors.muted}/></Pressable>
          </View>

          <View style={styles.drawerIdentity}>
            <TrainerAvatar icon={profileIcon} imageUrl={avatarUrl} color='#D9B24C' backgroundColor='#101726' size={54}/>
            <View style={{flex:1}}><Text style={styles.drawerIdentityLabel}>TRAINER MENU</Text><Text style={[styles.drawerIdentityText,{color:colors.muted}]}>{isAdmin?'Administrador • ':''}{unreadText}</Text></View>
          </View>

          <ScrollView contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
            {MENU_ITEMS.filter(item=>!item.adminOnly||isAdmin).map(item=><Pressable key={item.href} onPress={()=>navigate(item.href)} style={({pressed})=>[styles.item,item.adminOnly&&styles.itemAdmin,pressed&&styles.pressed]}>
              <View style={[styles.itemIcon,item.adminOnly&&styles.itemIconAdmin]}><Ionicons name={item.icon} size={19} color={item.adminOnly?'#FF8CE1':'#D9B24C'}/></View>
              <View style={styles.itemText}><Text style={[styles.itemLabel,{color:colors.text}]}>{item.label}</Text><Text style={[styles.itemDescription,{color:colors.muted}]}>{item.description}</Text></View>
              {item.href==='/inbox'&&unread>0?<View style={styles.badge}><Text style={styles.badgeText}>{Math.min(unread,99)}</Text></View>:null}
              <Ionicons name='chevron-forward' size={16} color='#7E8799'/>
            </Pressable>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles=StyleSheet.create({
  shell:{width:'100%',maxWidth:1360,alignSelf:'center',paddingHorizontal:12,paddingBottom:9},
  row:{minHeight:58,flexDirection:'row',alignItems:'center',gap:10},
  menuButton:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:'#8A6A26',backgroundColor:'#111827',alignItems:'center',justifyContent:'center'},
  unreadDot:{position:'absolute',right:5,top:5,width:8,height:8,borderRadius:4,backgroundColor:'#FF5D73',borderWidth:1,borderColor:'#fff'},
  brand:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:9},brandMark:{width:38,height:38,borderRadius:12,backgroundColor:'#D9B24C',alignItems:'center',justifyContent:'center',shadowColor:'#D9B24C',shadowOpacity:.26,shadowRadius:10},
  brandCopy:{flex:1,minWidth:0},brandTitle:{color:'#F8E8AC',fontSize:12,fontWeight:'900',letterSpacing:1.35},brandMetaRow:{flexDirection:'row',alignItems:'center',gap:6,marginTop:2},brandVersion:{color:'#D9B24C',fontSize:7,fontWeight:'900',letterSpacing:.9},brandDot:{width:3,height:3,borderRadius:2,backgroundColor:'#6E7788'},brandUser:{fontSize:7.5,fontWeight:'800',maxWidth:130},
  walletArea:{flexDirection:'row',alignItems:'center',gap:8},avatarPressable:{position:'relative'},adminDot:{position:'absolute',right:-3,bottom:-3,width:19,height:19,borderRadius:8,backgroundColor:'#B73E9E',borderWidth:2,borderColor:'#080C15',alignItems:'center',justifyContent:'center'},
  rankStrip:{flexDirection:'row',gap:8},rankCard:{flex:1,minHeight:44,borderRadius:14,borderWidth:1,borderColor:'#2A3349',backgroundColor:'#0D1422',paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8},rankIcon:{width:28,height:28,borderRadius:9,alignItems:'center',justifyContent:'center'},rankCopy:{minWidth:0},rankEyebrow:{color:'#D9B24C',fontSize:6.5,fontWeight:'900',letterSpacing:.75},rankMain:{fontSize:10,fontWeight:'900',marginTop:1},rankSide:{marginLeft:'auto',fontSize:7.5,fontWeight:'800'},
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',flexDirection:'row'},drawer:{width:'88%',maxWidth:400,height:'100%',borderRightWidth:1,borderRightColor:'#4E3D1C',backgroundColor:'#080C15'},drawerHeader:{paddingHorizontal:16,paddingBottom:14,minHeight:84,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:1,borderBottomColor:'#2B2D2F'},drawerBrandMark:{width:42,height:42,borderRadius:13,backgroundColor:'#D9B24C',alignItems:'center',justifyContent:'center'},headerText:{flex:1,minWidth:0},drawerKicker:{color:'#D9B24C',fontSize:7.5,fontWeight:'900',letterSpacing:1.1},username:{fontSize:18,fontWeight:'900',marginTop:2},close:{width:38,height:38,alignItems:'center',justifyContent:'center'},
  drawerIdentity:{margin:12,marginBottom:2,borderRadius:17,borderWidth:1,borderColor:'#4E3D1C',backgroundColor:'#14130E',padding:11,flexDirection:'row',alignItems:'center',gap:10},drawerIdentityLabel:{color:'#E7C65E',fontSize:8,fontWeight:'900',letterSpacing:.8},drawerIdentityText:{fontSize:8.5,marginTop:3,fontWeight:'700'},
  menuList:{padding:12,gap:7,paddingBottom:34},item:{minHeight:61,borderRadius:16,borderWidth:1,borderColor:'#29334A',backgroundColor:'#101725',padding:10,flexDirection:'row',alignItems:'center',gap:10},itemAdmin:{backgroundColor:'#261528',borderColor:'#6F3A70'},pressed:{opacity:.7},itemIcon:{width:39,height:39,borderRadius:12,backgroundColor:'#1A2233',alignItems:'center',justifyContent:'center'},itemIconAdmin:{backgroundColor:'#3A1C3C'},itemText:{flex:1,minWidth:0},itemLabel:{fontSize:11.5,fontWeight:'900'},itemDescription:{fontSize:8,marginTop:2},badge:{minWidth:23,height:23,paddingHorizontal:5,borderRadius:12,backgroundColor:'#E64D66',alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:9,fontWeight:'900'}
});