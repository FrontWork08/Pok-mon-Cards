import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { CurrencyBar } from '@/components/CurrencyBar';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { getMyBagPage } from '@/services/bag';
import type { OwnedCardEntry } from '@/services/player';
import { buyListing, cancelListing, createListing, getMarketplaceHub, saveMyShop, subscribeMarketplace, type MarketplaceHub, type MarketplaceListing, type ShopTheme } from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

const THEMES: Array<{id:ShopTheme;label:string;icon:keyof typeof Ionicons.glyphMap}> = [
  {id:'guild',label:'GUILDA',icon:'shield'},{id:'classic',label:'CLÁSSICO',icon:'radio-button-on'},{id:'night',label:'NOTURNO',icon:'moon'},
];

export default function MarketplaceScreen() {
  const router=useRouter();
  const {colors}=useAppTheme();
  const wallet=useWallet();
  const [hub,setHub]=useState<MarketplaceHub|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [shopName,setShopName]=useState('');
  const [shopTheme,setShopTheme]=useState<ShopTheme>('guild');
  const [pickerOpen,setPickerOpen]=useState(false);
  const [inventory,setInventory]=useState<OwnedCardEntry[]>([]);
  const [inventorySearch,setInventorySearch]=useState('');
  const [inventoryLoading,setInventoryLoading]=useState(false);
  const [selectedCard,setSelectedCard]=useState<OwnedCardEntry|null>(null);
  const [quantity,setQuantity]=useState('1');
  const [price,setPrice]=useState('1000');

  const load=useCallback(async()=>{
    try{
      setError(null);
      const next=await getMarketplaceHub();
      setHub(next);
      setShopName((current)=>current||next.myShop?.name||'');
      setShopTheme(next.myShop?.themeStyle||'guild');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir o mercado.');}
    finally{setLoading(false);}
  },[]);
  useFocusEffect(useCallback(()=>{setLoading(true);void load();},[load]));
  useEffect(()=>subscribeMarketplace(()=>{void load();}),[load]);

  const loadInventory=useCallback(async(term='')=>{
    try{
      setInventoryLoading(true);
      const page=await getMyBagPage(0,60,{search:term,setQuery:'',quickFilter:'all',typeFilter:null,rarityFilter:null,generation:null,sortMode:'value'});
      setInventory(page.items);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar sua Bag.');}
    finally{setInventoryLoading(false);}
  },[]);
  useEffect(()=>{
    if(!pickerOpen)return;
    const timer=setTimeout(()=>{void loadInventory(inventorySearch);},320);
    return()=>clearTimeout(timer);
  },[pickerOpen,inventorySearch,loadInventory]);

  const visibleListings=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return hub?.listings??[];
    return (hub?.listings??[]).filter((item)=>item.card.name.toLowerCase().includes(q)||item.sellerName.toLowerCase().includes(q)||item.shopName.toLowerCase().includes(q));
  },[hub?.listings,search]);

  async function saveShop(){
    if(shopName.trim().length<3||working)return;
    try{setWorking(true);setError(null);await saveMyShop(shopName,shopTheme);setNotice('Sua loja foi atualizada em tempo real.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar sua loja.');}
    finally{setWorking(false);}
  }
  async function publish(){
    const card=selectedCard?.cards;const qty=Number(quantity);const coinPrice=Number(price);
    if(!card||!Number.isInteger(qty)||qty<1||qty>Number(selectedCard?.quantity)||!Number.isSafeInteger(coinPrice)||coinPrice<1||working)return;
    try{setWorking(true);setError(null);await createListing(card.id,qty,coinPrice);setNotice(`${card.pokemon_name} foi colocado à venda.`);setSelectedCard(null);setQuantity('1');await load();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível criar a oferta.');}
    finally{setWorking(false);}
  }
  function confirmBuy(item:MarketplaceListing){
    Alert.alert('Confirmar compra',`Comprar ${item.quantity}× ${item.card.name} por 🪙 ${item.price.toLocaleString('pt-BR')}?`,[
      {text:'Cancelar',style:'cancel'},
      {text:'Comprar',onPress:()=>{void performBuy(item);}},
    ]);
  }
  async function performBuy(item:MarketplaceListing){
    if(working)return;
    try{setWorking(true);setError(null);await buyListing(item.id);setNotice('Compra concluída. A carta já está na sua Bag.');await Promise.all([load(),wallet.refresh()]);}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível comprar a carta.');}
    finally{setWorking(false);}
  }
  async function remove(item:MarketplaceListing){
    if(working)return;
    try{setWorking(true);await cancelListing(item.id);setNotice('Oferta removida. A carta voltou para sua Bag.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível remover a oferta.');}
    finally{setWorking(false);}
  }

  const header=<View style={styles.headerStack}>
    <View style={styles.top}><View style={{flex:1,minWidth:220}}><Text style={[styles.eyebrow,{color:colors.yellow}]}>TRAINER MARKET</Text><Text style={[styles.pageTitle,{color:colors.text}]}>Mercado de Treinadores</Text><Text style={[styles.subtitle,{color:colors.muted}]}>Lojas ao vivo, cartas em custódia segura e pagamento em Coins.</Text></View><CurrencyBar compact/></View>
    <Pressable style={styles.back} onPress={()=>router.back()}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
    {notice?<View style={styles.notice}><Ionicons name="checkmark-circle" size={19} color="#65D894"/><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={()=>setNotice(null)}><Ionicons name="close" size={18} color="#AEF0CC"/></Pressable></View>:null}
    {error?<Pressable style={styles.error} onPress={()=>setError(null)}><Ionicons name="alert-circle" size={19} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></Pressable>:null}

    <View style={[styles.shopPanel,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
      <View style={styles.sectionHead}><View style={[styles.sectionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="storefront" size={22} color={colors.accent}/></View><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Minha loja</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>A cor GUILD acompanha automaticamente sua guilda.</Text></View></View>
      <TextInput value={shopName} onChangeText={setShopName} maxLength={32} placeholder="Nome da sua loja" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
      <View style={styles.themeRow}>{THEMES.map((item)=><Pressable key={item.id} onPress={()=>setShopTheme(item.id)} style={[styles.themeChip,{backgroundColor:shopTheme===item.id?colors.accentSoft:colors.surfaceAlt,borderColor:shopTheme===item.id?colors.accent:colors.border}]}><Ionicons name={item.icon} size={15} color={shopTheme===item.id?colors.accent:colors.muted}/><Text style={[styles.themeText,{color:colors.text}]}>{item.label}</Text></Pressable>)}</View>
      <Pressable disabled={shopName.trim().length<3||working} onPress={()=>void saveShop()} style={[styles.secondaryButton,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name="save" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>SALVAR LOJA</Text></Pressable>
    </View>

    <View style={[styles.shopPanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.sectionHead}><View style={[styles.sectionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="pricetag" size={22} color={colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Colocar carta à venda</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>A carta sai da Bag enquanto a oferta estiver ativa e volta se você remover.</Text></View></View>
      <Pressable onPress={()=>setPickerOpen(true)} style={[styles.cardSelector,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
        {selectedCard?.cards?.image_small?<Image source={{uri:selectedCard.cards.image_small}} resizeMode="contain" style={styles.selectorImage}/>:<Ionicons name="albums" size={28} color={colors.muted}/>}
        <View style={{flex:1}}><Text style={[styles.selectorTitle,{color:colors.text}]}>{selectedCard?.cards?.pokemon_name??'Escolher carta da Bag'}</Text><Text style={[styles.selectorHint,{color:colors.muted}]}>{selectedCard? `${selectedCard.quantity} cópia(s) disponíveis`:'Busque sem carregar a coleção inteira'}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted}/>
      </Pressable>
      <View style={styles.formRow}><View style={styles.formField}><Text style={[styles.label,{color:colors.muted}]}>QUANTIDADE</Text><TextInput value={quantity} onChangeText={(v)=>setQuantity(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View><View style={styles.formField}><Text style={[styles.label,{color:colors.muted}]}>PREÇO TOTAL EM COINS</Text><TextInput value={price} onChangeText={(v)=>setPrice(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View></View>
      <Pressable disabled={!selectedCard||working||Number(quantity)<1||Number(price)<1} onPress={()=>void publish()} style={[styles.primaryButton,{backgroundColor:selectedCard?colors.yellow:colors.surfaceAlt}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="add-circle" size={19} color="#07111F"/>}<Text style={styles.primaryText}>PUBLICAR OFERTA</Text></Pressable>
    </View>

    <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Buscar carta, loja ou treinador..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>
    <View style={styles.listTitleRow}><Text style={[styles.listTitle,{color:colors.text}]}>Ofertas ao vivo</Text><Text style={[styles.count,{color:colors.yellow}]}>{visibleListings.length}</Text></View>
  </View>;

  const footer=<View style={styles.footer}><Text style={[styles.listTitle,{color:colors.text}]}>Minhas ofertas</Text>{(hub?.myListings??[]).length===0?<Text style={[styles.emptyText,{color:colors.muted}]}>Você ainda não publicou nenhuma carta.</Text>:(hub?.myListings??[]).map((item)=><View key={item.id} style={[styles.myRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.myName,{color:colors.text}]}>{item.quantity}× {item.card.name}</Text><Text style={[styles.status,{color:item.status==='active'?'#65D894':colors.muted}]}>{item.status==='active'?'ATIVA':item.status==='sold'?'VENDIDA':'REMOVIDA'}</Text>{item.status==='active'?<Pressable disabled={working} onPress={()=>void remove(item)} style={styles.removeButton}><Ionicons name="trash" size={16} color="#FF8A9A"/></Pressable>:null}</View>)}</View>;

  return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><PremiumBackground/><FlatList data={visibleListings} keyExtractor={(item)=>item.id} ListHeaderComponent={header} ListFooterComponent={footer} contentContainerStyle={styles.content} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} showsVerticalScrollIndicator={false} ListEmptyComponent={loading?<ActivityIndicator size="large" color={colors.yellow}/>:<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="storefront-outline" size={30} color={colors.muted}/><Text style={[styles.emptyText,{color:colors.muted}]}>Nenhuma oferta encontrada.</Text></View>} renderItem={({item})=><ListingCard item={item} myId={hub?.myId??''} working={working} onBuy={confirmBuy}/>}/>

    <Modal visible={pickerOpen} animationType="slide" onRequestClose={()=>setPickerOpen(false)}>
      <SafeAreaView style={[styles.pickerSafe,{backgroundColor:colors.bg}]}><PremiumBackground/><View style={styles.pickerHeader}><View style={{flex:1}}><Text style={[styles.pageTitle,{color:colors.text}]}>Escolher carta</Text><Text style={[styles.subtitle,{color:colors.muted}]}>Até 60 resultados por busca para manter a tela leve.</Text></View><Pressable onPress={()=>setPickerOpen(false)}><Ionicons name="close" size={25} color={colors.text}/></Pressable></View><View style={[styles.searchBox,{marginHorizontal:14,backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={inventorySearch} onChangeText={setInventorySearch} placeholder="Buscar na Bag..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>{inventoryLoading?<ActivityIndicator style={{margin:14}} color={colors.yellow}/>:null}<FlatList data={inventory} keyExtractor={(item,index)=>item.cards?.id??`inventory-${index}`} contentContainerStyle={styles.pickerList} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} renderItem={({item})=><Pressable disabled={!item.cards} onPress={()=>{setSelectedCard(item);setQuantity('1');setPickerOpen(false);}} style={[styles.inventoryRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>{item.cards?.image_small?<Image source={{uri:item.cards.image_small}} resizeMode="contain" style={styles.inventoryImage}/>:<View style={styles.inventoryImage}/>}<View style={{flex:1}}><Text style={[styles.inventoryName,{color:colors.text}]}>{item.cards?.pokemon_name??'Carta'}</Text><Text style={[styles.inventoryMeta,{color:colors.muted}]}>{item.cards?.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text></View><Ionicons name="add-circle" size={23} color={colors.accent}/></Pressable>}/></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function ListingCard({item,myId,working,onBuy}:{item:MarketplaceListing;myId:string;working:boolean;onBuy:(item:MarketplaceListing)=>void}){
  const {colors}=useAppTheme();
  const themeColor=item.shopTheme==='guild'?(item.guild?.color??colors.accent):item.shopTheme==='night'?'#9B7BFF':colors.yellow;
  return <View style={[styles.listing,{backgroundColor:colors.surface,borderColor:themeColor}]}><View style={styles.sellerRow}><TrainerAvatar icon={item.sellerIcon} size={38} color={themeColor} backgroundColor={colors.surfaceAlt}/><View style={{flex:1}}><Text style={[styles.shopName,{color:colors.text}]}>{item.shopName}</Text><Text style={[styles.sellerName,{color:colors.muted}]}>@{item.sellerName}{item.guild?` • ${item.guild.name}`:''}</Text></View></View><View style={styles.cardRow}>{item.card.image?<Image source={{uri:item.card.image}} resizeMode="contain" style={styles.cardImage}/>:<View style={[styles.cardImage,{backgroundColor:colors.surfaceAlt}]}/>}<View style={{flex:1}}><Text style={[styles.cardName,{color:colors.text}]}>{item.card.name}</Text><Text style={[styles.cardMeta,{color:colors.muted}]}>{item.card.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text><Text style={[styles.price,{color:colors.yellow}]}>🪙 {item.price.toLocaleString('pt-BR')}</Text></View></View><Pressable disabled={item.sellerId===myId||working} onPress={()=>onBuy(item)} style={[styles.buyButton,{backgroundColor:item.sellerId===myId?colors.surfaceAlt:colors.yellow}]}><Ionicons name={item.sellerId===myId?'storefront':'cart'} size={18} color={item.sellerId===myId?colors.muted:'#07111F'}/><Text style={[styles.buyText,item.sellerId===myId&&{color:colors.muted}]}>{item.sellerId===myId?'SUA OFERTA':'COMPRAR'}</Text></Pressable></View>;
}

const styles=StyleSheet.create({
  safe:{flex:1,overflow:'hidden'},content:{width:'100%',maxWidth:1120,alignSelf:'center',paddingHorizontal:14,paddingTop:12,paddingBottom:110,gap:9},headerStack:{gap:13,marginBottom:4},top:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',justifyContent:'space-between',gap:10},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5},pageTitle:{fontSize:29,fontWeight:'900',letterSpacing:-.5},subtitle:{fontSize:11,lineHeight:17,marginTop:3},back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:11,fontWeight:'800'},
  notice:{borderRadius:14,borderWidth:1,borderColor:'#4A9B70',backgroundColor:'#142C23',padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,color:'#D9FFEC',fontSize:10,fontWeight:'800'},error:{borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  shopPanel:{borderRadius:20,borderWidth:1,padding:14,gap:10},sectionHead:{flexDirection:'row',alignItems:'center',gap:10},sectionIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:17,fontWeight:'900'},sectionHint:{fontSize:9,lineHeight:14,marginTop:2},input:{minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:12,fontSize:13,fontWeight:'800'},themeRow:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{borderRadius:11,borderWidth:1,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:5},themeText:{fontSize:8,fontWeight:'900'},secondaryButton:{minHeight:46,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},secondaryText:{fontSize:9,fontWeight:'900'},
  cardSelector:{borderRadius:15,borderWidth:1,minHeight:72,padding:8,flexDirection:'row',alignItems:'center',gap:10},selectorImage:{width:43,height:57},selectorTitle:{fontSize:13,fontWeight:'900'},selectorHint:{fontSize:9,marginTop:3},formRow:{flexDirection:'row',flexWrap:'wrap',gap:8},formField:{flexGrow:1,flexBasis:150,minWidth:140,gap:5},label:{fontSize:7,fontWeight:'900',letterSpacing:.9},primaryButton:{minHeight:51,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},primaryText:{color:'#07111F',fontSize:10,fontWeight:'900'},
  searchBox:{minHeight:49,borderRadius:15,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,minHeight:47,fontSize:12},listTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},listTitle:{fontSize:20,fontWeight:'900'},count:{fontSize:14,fontWeight:'900'},
  listing:{borderRadius:19,borderWidth:1,padding:12,gap:10,marginBottom:9},sellerRow:{flexDirection:'row',alignItems:'center',gap:9},shopName:{fontSize:13,fontWeight:'900'},sellerName:{fontSize:8,marginTop:2},cardRow:{flexDirection:'row',alignItems:'center',gap:11},cardImage:{width:65,height:87,borderRadius:7},cardName:{fontSize:16,fontWeight:'900'},cardMeta:{fontSize:9,marginTop:3},price:{fontSize:15,fontWeight:'900',marginTop:8},buyButton:{minHeight:45,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},buyText:{color:'#07111F',fontSize:9,fontWeight:'900'},
  footer:{gap:8,marginTop:12},myRow:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},myName:{flex:1,fontSize:11,fontWeight:'900'},status:{fontSize:8,fontWeight:'900'},removeButton:{width:32,height:32,borderRadius:10,backgroundColor:'#351A24',alignItems:'center',justifyContent:'center'},empty:{borderRadius:18,borderWidth:1,padding:24,alignItems:'center',gap:8},emptyText:{fontSize:10,lineHeight:15},
  pickerSafe:{flex:1},pickerHeader:{padding:14,flexDirection:'row',alignItems:'center',gap:10},pickerList:{padding:14,gap:8},inventoryRow:{borderRadius:15,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:10},inventoryImage:{width:49,height:66,borderRadius:6},inventoryName:{fontSize:13,fontWeight:'900'},inventoryMeta:{fontSize:9,marginTop:3},
});
