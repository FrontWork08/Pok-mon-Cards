import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurrencyBar } from '@/components/CurrencyBar';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getProfileAvatarUrl } from '@/services/player';
import { isCurrentUserAdmin } from '@/services/market';
import { getUnreadConversationCount } from '@/services/notifications';
import { getMyRankSnapshot, type RankSnapshot } from '@/services/rankStatus';
import {
  getTrainerNavigationPreferences,
  recordTrainerNavigationVisit,
  toggleTrainerNavigationFavorite,
  type TrainerNavigationPreferences,
} from '@/services/navigationPreferences';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type MenuGroupId = 'collection' | 'competitive' | 'social' | 'progress' | 'economy' | 'system';
type MenuItem = { label:string; description:string; href:string; icon:keyof typeof Ionicons.glyphMap; group:MenuGroupId; adminOnly?:boolean };
type MenuGroup = { id:MenuGroupId; label:string; subtitle:string; icon:keyof typeof Ionicons.glyphMap; color:string };

const GROUPS: MenuGroup[] = [
  { id:'collection', label:'Coleção', subtitle:'Cartas, Pokédex, decks e sets', icon:'albums', color:'#5AA8FF' },
  { id:'competitive', label:'Competitivo', subtitle:'Batalhas, Copa e guerras', icon:'game-controller', color:'#FF735C' },
  { id:'social', label:'Social', subtitle:'Amigos, chat e guildas', icon:'people', color:'#9B7BFF' },
  { id:'progress', label:'Progresso', subtitle:'Passe, missões e conquistas', icon:'star', color:'#F0C74E' },
  { id:'economy', label:'Loja & Economia', subtitle:'Mercado, cosméticos e códigos', icon:'storefront', color:'#54C78D' },
  { id:'system', label:'Sistema', subtitle:'Início, configurações e utilidades', icon:'settings', color:'#8E9AA6' },
];

const MENU_ITEMS: MenuItem[] = [
  { label:'Início', description:'Voltar para o painel do treinador', href:'/(tabs)', icon:'home', group:'system' },
  { label:'Busca Global', description:'Encontre cartas, treinadores, guildas e funções', href:'/search', icon:'search', group:'system' },
  { label:'Central de Atividades', description:'Mensagens, convites e avisos que precisam de atenção', href:'/inbox', icon:'notifications', group:'social' },
  { label:'Passe de Batalha', description:'50 níveis, recompensas grátis, VIP e missões', href:'/battle-pass', icon:'ribbon', group:'progress' },
  { label:'Temporada & Jornada', description:'Ranque, streak, eventos e recompensas', href:'/season', icon:'flame', group:'progress' },
  { label:'Card Chase', description:'Wishlist e alertas de cartas desejadas', href:'/wishlist', icon:'star', group:'collection' },
  { label:'Vitrine do Perfil', description:'Escolha suas 6 cartas de destaque', href:'/showcase', icon:'sparkles', group:'collection' },
  { label:'Conquistas e Títulos', description:'Progresso e títulos equipáveis', href:'/achievements', icon:'medal', group:'progress' },
  { label:'Ranking de Coleções', description:'Coleções com maior valor de mercado', href:'/collection-ranking', icon:'podium', group:'collection' },
  { label:'Guildas Pokémon', description:'Equipe, missões e ranking coletivo', href:'/guilds', icon:'shield', group:'social' },
  { label:'Guild Wars', description:'Confrontos semanais entre guildas', href:'/guild-wars', icon:'flash', group:'competitive' },
  { label:'Copa Trainer', description:'Torneio com bracket e prêmio acumulado', href:'/tournaments', icon:'trophy', group:'competitive' },
  { label:'Trainer Shop', description:'Cosméticos e itens compráveis', href:'/store', icon:'bag-handle', group:'economy' },
  { label:'Cosméticos', description:'Molduras, fundos e temas desbloqueáveis', href:'/cosmetics', icon:'color-wand', group:'economy' },
  { label:'Mercado de Treinadores', description:'Lojas e ofertas em tempo real', href:'/marketplace', icon:'storefront', group:'economy' },
  { label:'Economia', description:'Conversões e visão geral da economia', href:'/economy', icon:'cash', group:'economy' },
  { label:'Vender Repetidas', description:'Venda cópias extras da sua coleção', href:'/sell-duplicates', icon:'pricetag', group:'economy' },
  { label:'Resgatar Código', description:'Recompensas únicas por conta', href:'/codes', icon:'ticket', group:'economy' },
  { label:'Amigos e Chat', description:'Amizades, presença e conversas', href:'/friends', icon:'people', group:'social' },
  { label:'QR de amizade', description:'Mostre seu Trainer Link para adicionar amigos', href:'/friend-qr', icon:'qr-code', group:'social' },
  { label:'Meus Decks', description:'Monte suas equipes de batalha', href:'/decks', icon:'albums', group:'collection' },
  { label:'Missões', description:'Objetivos diários e semanais', href:'/missions', icon:'checkbox', group:'progress' },
  { label:'Pokédex', description:'Espécies e cartas descobertas', href:'/pokedex', icon:'book', group:'collection' },
  { label:'Coleções por Set', description:'Acompanhe o progresso dos sets', href:'/sets', icon:'layers', group:'collection' },
  { label:'Histórico de Packs', description:'Reveja seus melhores pulls', href:'/history', icon:'time', group:'collection' },
  { label:'Configurações', description:'Aparência, batalha, notificações e privacidade', href:'/settings', icon:'settings', group:'system' },
  { label:'Admin Center', description:'Economia, usuários e sistema', href:'/admin', icon:'shield-checkmark', group:'system', adminOnly:true },
];

const EMPTY_PREFERENCES: TrainerNavigationPreferences = { favorites:[], recents:[] };
const normalizeSearch = (value:string) => value.trim().toLocaleLowerCase('pt-BR');

export function TrainerNavigation() {
  const router=useRouter();
  const pathname=usePathname();
  const {colors}=useAppTheme();
  const {userId,username,profileIcon,avatarPath,avatarUpdatedAt}=useWallet();
  const avatarUrl=getProfileAvatarUrl(avatarPath,avatarUpdatedAt);
  const insets=useSafeAreaInsets();
  const[open,setOpen]=useState(false);
  const[isAdmin,setIsAdmin]=useState(false);
  const[unread,setUnread]=useState(0);
  const[rankSnapshot,setRankSnapshot]=useState<RankSnapshot|null>(null);
  const[search,setSearch]=useState('');
  const[expanded,setExpanded]=useState<MenuGroupId|null>(null);
  const[preferences,setPreferences]=useState<TrainerNavigationPreferences>(EMPTY_PREFERENCES);

  const visibleItems=useMemo(()=>MENU_ITEMS.filter(item=>!item.adminOnly||isAdmin),[isAdmin]);
  const itemByHref=useMemo(()=>new Map(visibleItems.map(item=>[item.href,item])),[visibleItems]);
  const searchResults=useMemo(()=>{
    const term=normalizeSearch(search);
    if(!term)return[];
    return visibleItems.filter(item=>{
      const group=GROUPS.find(entry=>entry.id===item.group);
      return[item.label,item.description,group?.label??''].some(value=>normalizeSearch(value).includes(term));
    });
  },[search,visibleItems]);
  const quickItems=useMemo(()=>{
    const seen=new Set<string>();
    return[...preferences.favorites,...preferences.recents]
      .filter(href=>{if(seen.has(href)||!itemByHref.has(href))return false;seen.add(href);return true;})
      .slice(0,5).map(href=>itemByHref.get(href)!).filter(Boolean);
  },[itemByHref,preferences]);

  useEffect(()=>{
    if(!userId){setIsAdmin(false);setUnread(0);setRankSnapshot(null);setPreferences(EMPTY_PREFERENCES);return;}
    Promise.all([
      isCurrentUserAdmin().catch(()=>false),
      getUnreadConversationCount().catch(()=>0),
      getMyRankSnapshot().catch(()=>null),
      getTrainerNavigationPreferences().catch(()=>EMPTY_PREFERENCES),
    ]).then(([admin,count,snapshot,prefs])=>{setIsAdmin(admin);setUnread(count);setRankSnapshot(snapshot);setPreferences(prefs);});
  },[userId]);

  useEffect(()=>{
    if(!userId||!open)return;
    void Promise.all([
      getUnreadConversationCount().catch(()=>0),
      getTrainerNavigationPreferences().catch(()=>EMPTY_PREFERENCES),
    ]).then(([count,prefs])=>{setUnread(count);setPreferences(prefs);});
  },[open,userId]);

  if(!userId)return null;

  function navigate(href:string){
    setOpen(false);setSearch('');
    void recordTrainerNavigationVisit(href).then(setPreferences).catch(()=>null);
    requestAnimationFrame(()=>router.replace(href as never));
  }

  async function toggleFavorite(href:string){
    const next=await toggleTrainerNavigationFavorite(href).catch(()=>null);
    if(next)setPreferences(next);
  }

  function renderMenuItem(item:MenuItem,compact=false){
    const group=GROUPS.find(entry=>entry.id===item.group)!;
    const active=pathname===item.href||(item.href!=='/(tabs)'&&pathname.startsWith(item.href));
    const favorite=preferences.favorites.includes(item.href);
    const activity=item.href==='/inbox'&&unread>0;
    return <View key={item.href} style={[
      compact?styles.quickItem:styles.item,
      {backgroundColor:active?group.color+'18':colors.surface,borderColor:active?group.color:colors.border},
    ]}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.label} onPress={()=>navigate(item.href)} style={({pressed})=>[styles.itemMain,pressed&&styles.pressed]}>
        <View style={[styles.itemAccent,{backgroundColor:group.color}]}/>
        <View style={[styles.itemIcon,{backgroundColor:group.color+'18'}]}><Ionicons name={item.icon} size={compact?18:20} color={item.adminOnly?'#FF5CCF':group.color}/></View>
        <View style={styles.itemText}><Text numberOfLines={1} style={[styles.itemLabel,{color:colors.text}]}>{item.label}</Text>{!compact?<Text numberOfLines={1} style={[styles.itemDescription,{color:colors.muted}]}>{item.description}</Text>:null}</View>
        {activity?<View style={styles.badge}><Text style={styles.badgeText}>{Math.min(unread,99)}</Text></View>:null}
        <Ionicons name="chevron-forward" size={16} color={colors.muted}/>
      </Pressable>
      {!item.adminOnly?<Pressable accessibilityLabel={favorite?`Desafixar ${item.label}`:`Fixar ${item.label}`} hitSlop={6} onPress={()=>{void toggleFavorite(item.href);}} style={styles.favoriteButton}><Ionicons name={favorite?'star':'star-outline'} size={16} color={favorite?colors.yellow:colors.muted}/></Pressable>:null}
    </View>;
  }

  return <>
    <View style={styles.row}>
      <Pressable accessibilityLabel="Abrir menu do treinador" onPress={()=>setOpen(true)} style={[styles.menuButton,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="menu" size={24} color={colors.text}/>{unread>0?<View style={styles.unreadDot}/>:null}</Pressable>
      <View style={styles.currency}><CurrencyBar compact/></View>
      <Pressable accessibilityLabel="Abrir perfil" onPress={()=>router.replace('/(tabs)/profile')}><TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={40}/></Pressable>
    </View>
    {rankSnapshot?<View style={styles.rankStrip}>
      <Pressable onPress={()=>router.replace('/(tabs)/battles')} style={[styles.rankPill,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="trophy" size={14} color={colors.yellow}/><Text style={[styles.rankPillText,{color:colors.text}]}>RANQUEADA #{rankSnapshot.battle.rank}</Text><Text style={[styles.rankPillSub,{color:colors.muted}]}>ELO {rankSnapshot.battle.rating}</Text></Pressable>
      <Pressable onPress={()=>router.replace('/collection-ranking')} style={[styles.rankPill,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="diamond" size={14} color="#68D9FF"/><Text style={[styles.rankPillText,{color:colors.text}]}>COLEÇÃO #{rankSnapshot.collection.rank}</Text><Text style={[styles.rankPillSub,{color:colors.muted}]}>TOP {rankSnapshot.collection.total?Math.max(1,Math.ceil(rankSnapshot.collection.rank/rankSnapshot.collection.total*100)):0}%</Text></Pressable>
    </View>:null}

    <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={()=>setOpen(false)}/>
        <View style={[styles.drawer,{backgroundColor:colors.bg,borderColor:colors.border}]}>
          <View style={[styles.drawerHeader,{borderBottomColor:colors.border,paddingTop:Math.max(insets.top,16)}]}>
            <TrainerAvatar icon={profileIcon} avatarUrl={avatarUrl} color={colors.accent} backgroundColor={colors.surface} size={48}/>
            <View style={styles.headerText}><Text style={[styles.kicker,{color:colors.yellow}]}>MENU DO TREINADOR</Text><Text numberOfLines={1} style={[styles.username,{color:colors.text}]}>@{username??'Treinador'}</Text></View>
            <Pressable accessibilityLabel="Fechar menu" onPress={()=>setOpen(false)} style={styles.close}><Ionicons name="close" size={24} color={colors.muted}/></Pressable>
          </View>

          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:search?colors.accent:colors.border}]}>
            <Ionicons name="search" size={18} color={search?colors.accent:colors.muted}/>
            <TextInput value={search} onChangeText={setSearch} placeholder="Buscar função..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]} autoCapitalize="none" autoCorrect={false}/>
            {search?<Pressable accessibilityLabel="Limpar busca" onPress={()=>setSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>:null}
          </View>

          <ScrollView contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
            {search?<View style={styles.section}>
              <View style={styles.sectionTitleRow}><Text style={[styles.sectionTitle,{color:colors.text}]}>Resultados</Text><Text style={[styles.sectionCount,{color:colors.muted}]}>{searchResults.length}</Text></View>
              {searchResults.length?searchResults.map(item=>renderMenuItem(item)):<View style={[styles.emptySearch,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search-outline" size={24} color={colors.muted}/><Text style={[styles.emptySearchTitle,{color:colors.text}]}>Nada encontrado</Text><Text style={[styles.emptySearchText,{color:colors.muted}]}>Tente coleção, guilda, passe, loja, rank ou outra função.</Text></View>}
            </View>:<>
              {quickItems.length?<View style={styles.section}><View style={styles.sectionTitleRow}><Text style={[styles.sectionTitle,{color:colors.text}]}>Acesso rápido</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>favoritos + recentes</Text></View><View style={styles.quickList}>{quickItems.map(item=>renderMenuItem(item,true))}</View></View>:null}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle,{color:colors.text}]}>Categorias</Text>
                <View style={styles.groupList}>{GROUPS.map(group=>{
                  const groupItems=visibleItems.filter(item=>item.group===group.id&&!item.adminOnly);
                  const isExpanded=expanded===group.id;
                  return <View key={group.id} style={[styles.groupCard,{backgroundColor:colors.surface,borderColor:isExpanded?group.color:colors.border}]}>
                    <Pressable onPress={()=>setExpanded(isExpanded?null:group.id)} style={({pressed})=>[styles.groupHeader,pressed&&styles.pressed]}>
                      <View style={[styles.groupIcon,{backgroundColor:group.color+'1C'}]}><Ionicons name={group.icon} size={21} color={group.color}/></View>
                      <View style={styles.groupText}><Text style={[styles.groupLabel,{color:colors.text}]}>{group.label}</Text><Text style={[styles.groupSubtitle,{color:colors.muted}]}>{group.subtitle}</Text></View>
                      <View style={[styles.groupCount,{borderColor:group.color+'66'}]}><Text style={[styles.groupCountText,{color:group.color}]}>{groupItems.length}</Text></View>
                      <Ionicons name={isExpanded?'chevron-up':'chevron-down'} size={18} color={colors.muted}/>
                    </Pressable>
                    {isExpanded?<View style={[styles.groupBody,{borderTopColor:colors.border}]}>{groupItems.map(item=>renderMenuItem(item))}</View>:null}
                  </View>;
                })}</View>
              </View>
              {isAdmin?<View style={styles.section}><Text style={[styles.sectionTitle,{color:'#FF7ACF'}]}>Administração</Text>{renderMenuItem(MENU_ITEMS.find(item=>item.adminOnly)!)}</View>:null}
            </>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const styles=StyleSheet.create({
  row:{width:'100%',flexDirection:'row',alignItems:'center',gap:8},rankStrip:{width:'100%',flexDirection:'row',gap:6,marginTop:6},rankPill:{flex:1,minHeight:30,borderRadius:10,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},rankPillText:{fontSize:7,fontWeight:'900'},rankPillSub:{fontSize:7,fontWeight:'700',marginLeft:'auto'},
  menuButton:{width:40,height:40,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},unreadDot:{position:'absolute',right:5,top:5,width:8,height:8,borderRadius:4,backgroundColor:'#FF5D73',borderWidth:1,borderColor:'#fff'},currency:{flex:1,alignItems:'flex-end'},
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',flexDirection:'row'},drawer:{width:'91%',maxWidth:410,height:'100%',borderRightWidth:1},drawerHeader:{paddingHorizontal:16,paddingBottom:12,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1},headerText:{flex:1,minWidth:0},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.3},username:{fontSize:18,fontWeight:'900',marginTop:2},close:{width:38,height:38,alignItems:'center',justifyContent:'center'},
  searchBox:{marginHorizontal:12,marginTop:10,minHeight:46,borderRadius:15,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,minWidth:0,fontSize:12,fontWeight:'800',paddingVertical:8},
  menuList:{padding:10,gap:14,paddingBottom:30},section:{gap:8},sectionTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:2},sectionTitle:{fontSize:11,fontWeight:'900',letterSpacing:.35},sectionCount:{fontSize:9,fontWeight:'900'},sectionHint:{fontSize:7.5,fontWeight:'800'},quickList:{gap:6},groupList:{gap:7},
  groupCard:{borderRadius:17,borderWidth:1,overflow:'hidden'},groupHeader:{minHeight:64,padding:10,flexDirection:'row',alignItems:'center',gap:10},groupIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},groupText:{flex:1,minWidth:0},groupLabel:{fontSize:13,fontWeight:'900'},groupSubtitle:{fontSize:8,marginTop:2,fontWeight:'700'},groupCount:{minWidth:28,height:25,borderRadius:13,borderWidth:1,paddingHorizontal:6,alignItems:'center',justifyContent:'center'},groupCountText:{fontSize:8,fontWeight:'900'},groupBody:{borderTopWidth:1,padding:7,gap:6},
  item:{minHeight:55,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'stretch',overflow:'hidden'},quickItem:{minHeight:48,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'stretch',overflow:'hidden'},itemMain:{flex:1,minWidth:0,paddingVertical:7,paddingLeft:7,paddingRight:4,flexDirection:'row',alignItems:'center',gap:9},itemAccent:{width:3,alignSelf:'stretch',borderRadius:99},itemIcon:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center'},itemText:{flex:1,minWidth:0},itemLabel:{fontSize:11.5,fontWeight:'900'},itemDescription:{fontSize:7.6,marginTop:2,fontWeight:'700'},favoriteButton:{width:37,alignItems:'center',justifyContent:'center'},pressed:{opacity:.68},
  badge:{minWidth:23,height:23,paddingHorizontal:5,borderRadius:12,backgroundColor:'#E64D66',alignItems:'center',justifyContent:'center'},badgeText:{color:'#fff',fontSize:9,fontWeight:'900'},emptySearch:{minHeight:120,borderRadius:16,borderWidth:1,padding:18,alignItems:'center',justifyContent:'center',gap:5},emptySearchTitle:{fontSize:13,fontWeight:'900'},emptySearchText:{fontSize:8.5,lineHeight:13,textAlign:'center',maxWidth:280},
});
