import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AuraBanner } from '@/components/AuraBanner';
import { AuraFrame } from '@/components/AuraFrame';
import {
  buyTrainerStoreItem,
  equipTrainerStoreItem,
  getTrainerShopCatalog,
  type TrainerShopCatalog,
  type TrainerStoreCategory,
  type TrainerStoreItem,
} from '@/services/store';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type FilterKey = 'all'|'profile'|'card'|'deck'|'market'|'booster'|'identity'|'owned';

const FILTERS:Array<{key:FilterKey;label:string;icon:keyof typeof Ionicons.glyphMap}> = [
  {key:'all',label:'Todos',icon:'grid'},
  {key:'profile',label:'Perfil',icon:'person-circle'},
  {key:'card',label:'Cartas',icon:'albums'},
  {key:'deck',label:'Decks',icon:'layers'},
  {key:'market',label:'Mercado',icon:'storefront'},
  {key:'booster',label:'Boosters',icon:'cube'},
  {key:'identity',label:'Títulos',icon:'trophy'},
  {key:'owned',label:'Meus itens',icon:'checkmark-circle'},
];

const CATEGORY_META:Record<TrainerStoreCategory,{label:string;icon:keyof typeof Ionicons.glyphMap}> = {
  profile_frame:{label:'Moldura de Perfil',icon:'scan'},
  profile_background:{label:'Background de Perfil',icon:'image'},
  card_style:{label:'Estilo de Carta',icon:'color-wand'},
  deck_style:{label:'Estilo de Deck',icon:'layers'},
  shop_theme:{label:'Tema de Loja',icon:'storefront'},
  booster_fx:{label:'Efeito de Booster',icon:'sparkles'},
  title:{label:'Título de Trainer',icon:'ribbon'},
  trophy:{label:'Troféu',icon:'trophy'},
  guild_decor:{label:'Decoração de Guilda',icon:'shield'},
};

function matchesFilter(item:TrainerStoreItem,filter:FilterKey){
  if(filter==='all') return true;
  if(filter==='owned') return item.owned;
  if(filter==='profile') return item.category==='profile_frame'||item.category==='profile_background';
  if(filter==='card') return item.category==='card_style';
  if(filter==='deck') return item.category==='deck_style';
  if(filter==='market') return item.category==='shop_theme';
  if(filter==='booster') return item.category==='booster_fx';
  if(filter==='identity') return item.category==='title'||item.category==='trophy';
  return true;
}

function rarityAccent(rarity:string,colors:any){
  const value=rarity.toLowerCase();
  if(value.includes('legend')) return '#8B5CFF';
  if(value.includes('lux')) return '#FFB84D';
  if(value.includes('master')) return '#E468FF';
  if(value.includes('epic')) return '#9E7CFF';
  if(value.includes('rare')) return '#55CFFF';
  return colors.accent;
}

export default function TrainerStoreScreen(){
  const router=useRouter();
  const {colors}=useAppTheme();
  const wallet=useWallet();
  const [catalog,setCatalog]=useState<TrainerShopCatalog|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<FilterKey>('all');
  const loadedOnce=useRef(false);

  const load=useCallback(async()=>{
    try{
      if(!loadedOnce.current)setLoading(true);
      setError(null);
      const next=await getTrainerShopCatalog();
      setCatalog(next);
      loadedOnce.current=true;
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível abrir a Trainer Shop.');
    }finally{
      setLoading(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  const allItems=useMemo(()=>{
    const normal=catalog?.items??[];
    const luxury=(catalog?.luxury.items??[]).map((item)=>({...item,luxury:true}));
    return [...luxury,...normal];
  },[catalog]);

  const visible=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return allItems.filter((item)=>{
      if(!matchesFilter(item,filter))return false;
      if(!term)return true;
      const category=CATEGORY_META[item.category]?.label??item.category;
      return [item.name,item.description,item.rarity,category].some((value)=>String(value??'').toLowerCase().includes(term));
    });
  },[allItems,filter,search]);

  const categoryCount=useMemo(()=>new Set(allItems.map((item)=>item.category)).size,[allItems]);
  const buyableCount=useMemo(()=>allItems.filter((item)=>!item.owned||item.quantity<item.maxPurchases).length,[allItems]);

  function confirmBuy(item:TrainerStoreItem){
    if(working)return;
    if(!catalog?.live&&!catalog?.adminPreview){
      setError('A Trainer Shop ficará liberada para todos quando a migração 1.0 estiver concluída.');
      return;
    }
    const affordable=wallet.coins>=item.priceCoins;
    if(!affordable){
      setError(`Faltam 🪙 ${Math.max(0,item.priceCoins-wallet.coins).toLocaleString('pt-BR')} para comprar este item.`);
      return;
    }

    Alert.alert(
      item.luxury?'Comprar item de luxo?':'Confirmar compra',
      `${item.name}\n\n🪙 ${item.priceCoins.toLocaleString('pt-BR')}\n\n${item.description}`,
      [
        {text:'Cancelar',style:'cancel'},
        {text:'COMPRAR',onPress:()=>{void buy(item);}},
      ],
    );
  }

  async function buy(item:TrainerStoreItem){
    if(working)return;
    try{
      setWorking(item.id);
      setError(null);
      await buyTrainerStoreItem(item.id);
      await Promise.all([wallet.refresh(),load()]);
      setNotice(`${item.name} foi adicionado à sua coleção.`);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível concluir a compra.');
    }finally{
      setWorking(null);
    }
  }

  async function equip(item:TrainerStoreItem){
    if(working)return;
    try{
      setWorking(item.id);
      setError(null);
      await equipTrainerStoreItem(item.id);
      await Promise.all([wallet.refresh(),load()]);
      setNotice(`${item.name} foi equipado.`);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível equipar este item.');
    }finally{
      setWorking(null);
    }
  }

  function equipped(item:TrainerStoreItem){
    const cosmeticId=String(item.metadata?.cosmeticId??item.id);
    if(item.category==='profile_frame')return catalog?.equipped.frameId===cosmeticId;
    if(item.category==='profile_background')return catalog?.equipped.backgroundId===cosmeticId;
    if(item.category==='booster_fx')return catalog?.equipped.boosterFxId===item.id;
    if(item.category==='title')return catalog?.equipped.economyTitleId===item.id;
    return false;
  }

  function ownedAction(item:TrainerStoreItem){
    if(equipped(item))return {label:'EQUIPADO',icon:'checkmark-circle' as const,disabled:true,onPress:()=>{}};
    if(['profile_frame','profile_background','booster_fx','title','shop_theme'].includes(item.category)){
      return {label:'EQUIPAR',icon:'flash' as const,disabled:false,onPress:()=>{void equip(item);}};
    }
    if(item.category==='card_style')return {label:'USAR EM CARTA',icon:'albums' as const,disabled:false,onPress:()=>router.push('/economy')};
    if(item.category==='deck_style')return {label:'USAR EM DECK',icon:'layers' as const,disabled:false,onPress:()=>router.push('/decks')};
    if(item.category==='trophy')return {label:'NA COLEÇÃO',icon:'trophy' as const,disabled:true,onPress:()=>{}};
    return {label:'COMPRADO',icon:'checkmark' as const,disabled:true,onPress:()=>{}};
  }

  return (
    <Screen title="Trainer Shop" subtitle="Uma loja única para molduras, backgrounds, estilos de carta e deck, temas de mercado, efeitos de booster, títulos e troféus.">
      <AuraBanner
        eyebrow="TRAINER SHOP"
        title="Tudo em um só lugar"
        subtitle="Compre cosméticos permanentes e itens especiais sem precisar procurar em várias telas."
        icon="bag-handle"
        primaryColor={colors.accent}
        secondaryColor={colors.yellow}
        intensity="premium"
        badge="LOJA OFICIAL"
        minHeight={154}
      >
        <View style={styles.heroStats}>
          <Metric label="SEU SALDO" value={`🪙 ${wallet.coins.toLocaleString('pt-BR')}`} />
          <Metric label="TIPOS" value={String(categoryCount)} />
          <Metric label="POSSUÍDOS" value={String(catalog?.ownedCount??0)} />
          <Metric label="DISPONÍVEIS" value={String(buyableCount)} />
        </View>
      </AuraBanner>

      {!catalog?.live&&catalog ? (
        <View style={[styles.gate,{backgroundColor:catalog.adminPreview?'#241D3B':colors.surface,borderColor:catalog.adminPreview?'#8B5CFF':colors.border}]}>
          <Ionicons name={catalog.adminPreview?'eye':'lock-closed'} size={18} color={catalog.adminPreview?'#B88CFF':colors.yellow}/>
          <Text style={[styles.gateText,{color:colors.text}]}>
            {catalog.adminPreview?'Prévia de Admin: compras de teste continuam isoladas e serão limpas no reset.':'Catálogo visível agora. As compras serão liberadas para todos após a migração 1.0.'}
          </Text>
        </View>
      ):null}

      {notice ? <Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:'#183528',borderColor:'#3F9A68'}]}><Ionicons name="checkmark-circle" size={18} color="#65D894"/><Text style={styles.noticeText}>{notice}</Text><Ionicons name="close" size={16} color="#9CCDB1"/></Pressable> : null}
      {error ? <Pressable onPress={()=>setError(null)} style={[styles.notice,{backgroundColor:'#351A24',borderColor:'#683243'}]}><Ionicons name="alert-circle" size={18} color="#FF8998"/><Text style={[styles.noticeText,{color:'#FFD7DD'}]}>{error}</Text><Ionicons name="close" size={16} color="#FF9FAF"/></Pressable> : null}

      {(catalog?.luxury.items.length??0)>0 ? (
        <View style={styles.luxurySection}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={[styles.kicker,{color:'#FFB84D'}]}>ROTAÇÃO SEMANAL</Text>
              <Text style={[styles.sectionTitle,{color:colors.text}]}>Loja de Luxo</Text>
            </View>
            <View style={[styles.luxuryBadge,{borderColor:'#FFB84D'}]}><Ionicons name="diamond" size={14} color="#FFB84D"/><Text style={styles.luxuryBadgeText}>EXCLUSIVOS</Text></View>
          </View>
          <View style={styles.luxuryGrid}>
            {(catalog?.luxury.items??[]).map((item)=>(
              <StoreCard key={item.id} item={{...item,luxury:true}} working={working===item.id} colors={colors} onBuy={confirmBuy} onOwned={ownedAction} equipped={equipped(item)} />
            ))}
          </View>
        </View>
      ):null}

      <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Ionicons name="search" size={19} color={colors.muted}/>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar item, raridade ou categoria..."
          placeholderTextColor={colors.muted}
          style={[styles.searchInput,{color:colors.text}]}
        />
        {search?<Pressable onPress={()=>setSearch('')}><Ionicons name="close-circle" size={19} color={colors.muted}/></Pressable>:null}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((entry)=>{
          const active=filter===entry.key;
          return <Pressable key={entry.key} onPress={()=>setFilter(entry.key)} style={[styles.filter,{backgroundColor:active?colors.accentSoft:colors.surface,borderColor:active?colors.accent:colors.border}]}>
            <Ionicons name={entry.icon} size={14} color={active?colors.yellow:colors.muted}/>
            <Text style={[styles.filterText,{color:active?colors.text:colors.muted}]}>{entry.label}</Text>
          </Pressable>;
        })}
      </View>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={[styles.kicker,{color:colors.yellow}]}>CATÁLOGO PERMANENTE</Text>
          <Text style={[styles.sectionTitle,{color:colors.text}]}>Cosméticos e itens</Text>
        </View>
        <Text style={[styles.resultCount,{color:colors.muted}]}>{visible.length} item(ns)</Text>
      </View>

      {loading&&!catalog ? <ActivityIndicator size="large" color={colors.yellow}/> : null}

      <View style={styles.grid}>
        {visible.map((item)=><StoreCard key={(item.luxury?'lux-':'')+item.id} item={item} working={working===item.id} colors={colors} onBuy={confirmBuy} onOwned={ownedAction} equipped={equipped(item)} />)}
      </View>

      {!loading&&visible.length===0 ? (
        <View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="search-outline" size={30} color={colors.accent}/>
          <Text style={[styles.emptyTitle,{color:colors.text}]}>Nenhum item neste filtro</Text>
          <Text style={[styles.emptyText,{color:colors.muted}]}>Troque a categoria ou limpe a busca para ver o catálogo completo.</Text>
        </View>
      ):null}
    </Screen>
  );
}

function Metric({label,value}:{label:string;value:string}){
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function StoreCard({
  item,working,colors,onBuy,onOwned,equipped,
}:{
  item:TrainerStoreItem;
  working:boolean;
  colors:any;
  onBuy:(item:TrainerStoreItem)=>void;
  onOwned:(item:TrainerStoreItem)=>{label:string;icon:keyof typeof Ionicons.glyphMap;disabled:boolean;onPress:()=>void};
  equipped:boolean;
}){
  const accent=rarityAccent(item.rarity,colors);
  const category=CATEGORY_META[item.category]??{label:item.category,icon:'sparkles' as const};
  const canBuy=!item.owned||item.quantity<item.maxPurchases;
  const ownedAction=onOwned(item);
  const galaxy=String(item.metadata?.effect??'')==='galaxy'||item.id.includes('galaxy');
  const card=(
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:equipped?accent:colors.border}]}>
      <View style={styles.cardTop}>
        <View style={[styles.itemIcon,{backgroundColor:colors.accentSoft,borderColor:accent}]}>
          <Ionicons name={(item.icon||category.icon) as keyof typeof Ionicons.glyphMap} size={24} color={accent}/>
        </View>
        <View style={{flex:1,minWidth:0}}>
          <View style={styles.badgeRow}>
            <Text style={[styles.category,{color:colors.muted}]}>{category.label.toUpperCase()}</Text>
            {item.luxury?<Text style={styles.luxTag}>LUXO</Text>:null}
            {galaxy?<Text style={styles.galaxyTag}>GALAXY</Text>:null}
          </View>
          <Text numberOfLines={1} style={[styles.itemName,{color:colors.text}]}>{item.name}</Text>
          <Text style={[styles.rarity,{color:accent}]}>{item.rarity.toUpperCase()}</Text>
        </View>
      </View>

      <Text numberOfLines={3} style={[styles.description,{color:colors.muted}]}>{item.description||'Item permanente da sua coleção.'}</Text>

      {item.category==='card_style'||item.category==='deck_style' ? (
        <View style={[styles.applyHint,{backgroundColor:colors.surfaceAlt}]}>
          <Ionicons name="flash-outline" size={13} color={colors.yellow}/>
          <Text style={[styles.applyHintText,{color:colors.muted}]}>
            Taxa de aplicação: 🪙 {Number(item.metadata?.applyCost??0).toLocaleString('pt-BR')}
          </Text>
        </View>
      ):null}

      <View style={styles.cardFooter}>
        <View>
          <Text style={[styles.priceLabel,{color:colors.muted}]}>{item.owned?'ITEM POSSUÍDO':'PREÇO'}</Text>
          <Text style={[styles.price,{color:item.owned?accent:colors.yellow}]}>{item.owned?'✓ NA COLEÇÃO':`🪙 ${item.priceCoins.toLocaleString('pt-BR')}`}</Text>
        </View>
        {canBuy ? (
          <Pressable disabled={working} onPress={()=>onBuy(item)} style={[styles.buyButton,{backgroundColor:colors.yellow},working&&styles.disabled]}>
            {working?<ActivityIndicator size="small" color="#07111F"/>:<Ionicons name="bag-add" size={16} color="#07111F"/>}
            <Text style={styles.buyText}>{item.owned?'COMPRAR +1':'COMPRAR'}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={working||ownedAction.disabled} onPress={ownedAction.onPress} style={[styles.ownedButton,{backgroundColor:equipped?'#1D4432':colors.surfaceAlt,borderColor:equipped?'#4FA877':colors.border},(working||ownedAction.disabled)&&styles.disabled]}>
            {working?<ActivityIndicator size="small" color={accent}/>:<Ionicons name={ownedAction.icon} size={15} color={equipped?'#65D894':accent}/>}
            <Text style={[styles.ownedButtonText,{color:equipped?'#BCEFD0':colors.text}]}>{ownedAction.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (item.luxury||galaxy) ? (
    <AuraFrame style={styles.cell} primaryColor={galaxy?'#8B5CFF':accent} secondaryColor={galaxy?'#55E6FF':'#FFB84D'} intensity={galaxy?'master':'premium'} variant={galaxy?'galaxy':'energy'} radius={20}>
      {card}
    </AuraFrame>
  ) : <View style={styles.cell}>{card}</View>;
}

const styles=StyleSheet.create({
  heroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},
  metric:{minWidth:94,borderRadius:12,borderWidth:1,borderColor:'rgba(255,255,255,.12)',backgroundColor:'rgba(0,0,0,.16)',paddingHorizontal:10,paddingVertical:8},
  metricLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8,color:'#B8B9C7'},
  metricValue:{fontSize:13,fontWeight:'900',color:'#FFF',marginTop:2},
  gate:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},
  gateText:{flex:1,fontSize:9,lineHeight:14,fontWeight:'800'},
  notice:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},
  noticeText:{flex:1,color:'#D9FFE8',fontSize:9,lineHeight:14,fontWeight:'800'},
  luxurySection:{gap:9},
  sectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2},
  sectionTitle:{fontSize:20,fontWeight:'900',marginTop:2},
  luxuryBadge:{minHeight:31,borderRadius:999,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},
  luxuryBadgeText:{color:'#FFB84D',fontSize:7,fontWeight:'900',letterSpacing:.7},
  luxuryGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  searchBox:{height:48,borderRadius:16,borderWidth:1,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9},
  searchInput:{flex:1,height:'100%',fontSize:12},
  filters:{flexDirection:'row',flexWrap:'wrap',gap:6},
  filter:{minHeight:34,borderRadius:999,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:5},
  filterText:{fontSize:8,fontWeight:'900'},
  resultCount:{fontSize:9,fontWeight:'800'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  cell:{flexGrow:1,flexBasis:265,minWidth:250,maxWidth:590},
  card:{minHeight:226,borderRadius:20,borderWidth:1,padding:13,gap:10,overflow:'hidden'},
  cardTop:{flexDirection:'row',gap:10,alignItems:'center'},
  itemIcon:{width:48,height:48,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center'},
  badgeRow:{flexDirection:'row',alignItems:'center',gap:5,flexWrap:'wrap'},
  category:{fontSize:7,fontWeight:'900',letterSpacing:.8},
  luxTag:{fontSize:6,fontWeight:'900',color:'#1A1205',backgroundColor:'#FFB84D',borderRadius:999,paddingHorizontal:6,paddingVertical:2},
  galaxyTag:{fontSize:6,fontWeight:'900',color:'#D9CAFF',backgroundColor:'#2A1749',borderRadius:999,paddingHorizontal:6,paddingVertical:2},
  itemName:{fontSize:15,fontWeight:'900',marginTop:2},
  rarity:{fontSize:7,fontWeight:'900',letterSpacing:1,marginTop:2},
  description:{fontSize:9,lineHeight:14,minHeight:42},
  applyHint:{minHeight:31,borderRadius:10,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},
  applyHintText:{fontSize:7,fontWeight:'800'},
  cardFooter:{marginTop:'auto',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  priceLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8},
  price:{fontSize:13,fontWeight:'900',marginTop:2},
  buyButton:{minHeight:39,borderRadius:11,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  buyText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  ownedButton:{minHeight:39,borderRadius:11,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  ownedButtonText:{fontSize:8,fontWeight:'900'},
  disabled:{opacity:.48},
  empty:{borderRadius:18,borderWidth:1,padding:24,alignItems:'center',gap:7},
  emptyTitle:{fontSize:16,fontWeight:'900'},
  emptyText:{fontSize:9,lineHeight:14,textAlign:'center'},
});
