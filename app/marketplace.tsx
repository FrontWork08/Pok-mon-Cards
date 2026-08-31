import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { AuraBanner } from '@/components/AuraBanner';
import { AuraFrame } from '@/components/AuraFrame';
import { getMyBagPage } from '@/services/bag';
import type { OwnedCardEntry } from '@/services/player';
import { buyListing, cancelListing, createListing, createMarketOffer, getMarketplaceHub, saveMyShop, subscribeMarketplace, type MarketplaceHub, type MarketplaceListing, type ShopTheme } from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { formatUsd } from '@/services/market';

function themeAccent(theme:ShopTheme,fallback:string){
  if(theme==='royal')return '#FFD447';
  if(theme==='neon')return '#45F3FF';
  if(theme==='master')return '#C493FF';
  if(theme==='celestial')return '#8EE7FF';
  if(theme==='night')return '#9B7BFF';
  return fallback;
}

function marketSellerNet(gross:number){
  if(!Number.isFinite(gross)||gross<=0)return 0;
  const fee=Math.min(gross,Math.max(1,Math.ceil(gross*.08)));
  return Math.max(0,gross-fee);
}

const THEMES: Array<{id:ShopTheme;label:string;icon:keyof typeof Ionicons.glyphMap;premium?:boolean}> = [
  {id:'guild',label:'GUILDA',icon:'shield'},
  {id:'classic',label:'CLÁSSICO',icon:'radio-button-on'},
  {id:'night',label:'NOTURNO',icon:'moon'},
  {id:'royal',label:'ROYAL',icon:'trophy',premium:true},
  {id:'neon',label:'NEON',icon:'flash',premium:true},
  {id:'master',label:'MASTER',icon:'diamond',premium:true},
  {id:'celestial',label:'CELESTIAL',icon:'planet',premium:true},
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
  const [offerListing,setOfferListing]=useState<MarketplaceListing|null>(null);
  const [offerAmount,setOfferAmount]=useState('');

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
    const marketTotal = item.card.marketPriceUsd == null ? null : item.card.marketPriceUsd * item.quantity;
    Alert.alert('Confirmar compra',`Comprar ${item.quantity}× ${item.card.name} por 🪙 ${item.price.toLocaleString('pt-BR')}?\n\nValor de mercado: ${marketTotal == null ? '—' : formatUsd(marketTotal)}${item.quantity > 1 && item.card.marketPriceUsd != null ? ` (${formatUsd(item.card.marketPriceUsd)} por carta)` : ''}`,[
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
  function openOffer(item:MarketplaceListing){
    setOfferListing(item);
    setOfferAmount(String(Math.max(1, Math.round(item.price * .9))));
  }
  async function submitOffer(){
    const item=offerListing;const amount=Number(offerAmount);
    if(!item||!Number.isSafeInteger(amount)||amount<1||working)return;
    try{
      setWorking(true);setError(null);
      await createMarketOffer(item.id,amount);
      setNotice('Oferta enviada para @'+item.sellerName+'.');
      setOfferListing(null);setOfferAmount('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível enviar a oferta.');}
    finally{setWorking(false);}
  }

  async function remove(item:MarketplaceListing){
    if(working)return;
    try{setWorking(true);await cancelListing(item.id);setNotice('Oferta removida. A carta voltou para sua Bag.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível remover a oferta.');}
    finally{setWorking(false);}
  }

  const header=<View style={styles.headerStack}>
<AuraBanner
      eyebrow="TRAINER MARKET"
      title="Mercado de Treinadores"
      subtitle="Lojas ao vivo, cartas em custódia segura, temas premium e anúncios impulsionados — com taxa econômica transparente."
      icon="storefront"
      primaryColor={themeAccent(shopTheme,colors.accent)}
      secondaryColor={colors.yellow}
      intensity={(['master','celestial','royal','neon'] as ShopTheme[]).includes(shopTheme)?'master':'premium'}
      badge={(['master','celestial','royal','neon'] as ShopTheme[]).includes(shopTheme)?`${shopTheme.toUpperCase()} THEME`:'MARKET LIVE'}
      minHeight={190}
    >
      <View style={styles.marketHeroStats}>
        <View style={[styles.marketHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.marketHeroValue,{color:colors.text}]}>{visibleListings.length}</Text><Text style={[styles.marketHeroLabel,{color:colors.muted}]}>OFERTAS AO VIVO</Text></View>
        <View style={[styles.marketHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.marketHeroValue,{color:colors.yellow}]}>8%</Text><Text style={[styles.marketHeroLabel,{color:colors.muted}]}>TAXA ECONÔMICA</Text></View>
        <View style={[styles.marketHeroStat,{backgroundColor:colors.surface+'D8',borderColor:colors.border}]}><Text style={[styles.marketHeroValue,{color:themeAccent(shopTheme,colors.accent)}]}>{shopTheme.toUpperCase()}</Text><Text style={[styles.marketHeroLabel,{color:colors.muted}]}>TEMA DA LOJA</Text></View>
      </View>
    </AuraBanner>
    <View style={styles.marketNav}><Pressable style={styles.back} onPress={()=>goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable><Pressable onPress={()=>router.push('/market-offers')} style={[styles.offersLink,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="chatbubbles" size={16} color={colors.accent}/><Text style={[styles.offersLinkText,{color:colors.text}]}>CENTRAL DE OFERTAS</Text></Pressable></View>
    {notice?<View style={styles.notice}><Ionicons name="checkmark-circle" size={19} color="#65D894"/><Text style={styles.noticeText}>{notice}</Text><Pressable onPress={()=>setNotice(null)}><Ionicons name="close" size={18} color="#AEF0CC"/></Pressable></View>:null}
    {error?<Pressable style={styles.error} onPress={()=>setError(null)}><Ionicons name="alert-circle" size={19} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></Pressable>:null}

    <View style={[styles.shopPanel,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
      <View style={styles.sectionHead}><View style={[styles.sectionIcon,{backgroundColor:`${themeAccent(shopTheme,colors.accent)}18`}]}><Ionicons name="storefront" size={22} color={themeAccent(shopTheme,colors.accent)}/></View><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Minha loja</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>A cor GUILD acompanha automaticamente sua guilda. Temas premium mudam o destaque visual público da loja.</Text></View></View>
      <View style={[styles.shopPreview,{borderColor:themeAccent(shopTheme,colors.accent),backgroundColor:colors.surfaceAlt}]}>
        <View style={[styles.shopPreviewGlow,{backgroundColor:themeAccent(shopTheme,colors.accent)}]}/>
        <View style={[styles.shopPreviewIcon,{backgroundColor:`${themeAccent(shopTheme,colors.accent)}18`,borderColor:`${themeAccent(shopTheme,colors.accent)}75`}]}><Ionicons name={THEMES.find((item)=>item.id===shopTheme)?.icon??'storefront'} size={22} color={themeAccent(shopTheme,colors.accent)}/></View>
        <View style={{flex:1,zIndex:2}}><Text style={[styles.shopPreviewKicker,{color:themeAccent(shopTheme,colors.accent)}]}>{shopTheme.toUpperCase()} STORE</Text><Text style={[styles.shopPreviewName,{color:colors.text}]}>{shopName.trim()||hub?.myShop?.name||'Sua Trainer Shop'}</Text><Text style={[styles.shopPreviewMeta,{color:colors.muted}]}>Prévia pública • tema {shopTheme}</Text></View>
        {(['royal','neon','master','celestial'] as ShopTheme[]).includes(shopTheme)?<View style={[styles.shopPreviewPremium,{backgroundColor:`${colors.yellow}18`,borderColor:`${colors.yellow}60`}]}><Ionicons name="diamond" size={12} color={colors.yellow}/><Text style={[styles.shopPreviewPremiumText,{color:colors.yellow}]}>PREMIUM</Text></View>:null}
      </View>
      <TextInput value={shopName} onChangeText={setShopName} maxLength={32} placeholder="Nome da sua loja" placeholderTextColor={colors.muted} style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
      <View style={styles.themeRow}>{THEMES.filter((item)=>!item.premium||(hub?.ownedShopThemes??[]).includes(item.id)||shopTheme===item.id).map((item)=><Pressable key={item.id} onPress={()=>setShopTheme(item.id)} style={[styles.themeChip,{backgroundColor:shopTheme===item.id?colors.accentSoft:colors.surfaceAlt,borderColor:shopTheme===item.id?colors.accent:colors.border}]}><Ionicons name={item.icon} size={15} color={shopTheme===item.id?colors.accent:colors.muted}/><Text style={[styles.themeText,{color:colors.text}]}>{item.label}</Text>{item.premium?<Ionicons name="diamond" size={11} color={colors.yellow}/>:null}</Pressable>)}</View>
      {(hub?.ownedShopThemes.length??0)>0?<Text style={[styles.sectionHint,{color:colors.muted}]}>Temas premium comprados na Economy 2.1 aparecem aqui automaticamente.</Text>:null}
      <Pressable disabled={shopName.trim().length<3||working} onPress={()=>void saveShop()} style={[styles.secondaryButton,{borderColor:colors.accent,backgroundColor:colors.accentSoft}]}><Ionicons name="save" size={17} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>SALVAR LOJA</Text></Pressable>
    </View>

    <View style={[styles.shopPanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
      <View style={styles.sectionHead}><View style={[styles.sectionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="pricetag" size={22} color={colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Colocar carta à venda</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>A carta sai da Bag enquanto a oferta estiver ativa. Em uma venda concluída, 8% das Coins saem da economia e você recebe 92%.</Text></View></View>
      <Pressable onPress={()=>setPickerOpen(true)} style={[styles.cardSelector,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
        {selectedCard?.cards?.image_small?<Image source={{uri:selectedCard.cards.image_small}} resizeMode="contain" style={styles.selectorImage}/>:<Ionicons name="albums" size={28} color={colors.muted}/>}
        <View style={{flex:1}}><Text style={[styles.selectorTitle,{color:colors.text}]}>{selectedCard?.cards?.pokemon_name??'Escolher carta da Bag'}</Text><Text style={[styles.selectorHint,{color:colors.muted}]}>{selectedCard? `${selectedCard.quantity} cópia(s) disponíveis`:'Busque sem carregar a coleção inteira'}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted}/>
      </Pressable>
      <View style={styles.formRow}><View style={styles.formField}><Text style={[styles.label,{color:colors.muted}]}>QUANTIDADE</Text><TextInput value={quantity} onChangeText={(v)=>setQuantity(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View><View style={styles.formField}><Text style={[styles.label,{color:colors.muted}]}>PREÇO TOTAL EM COINS</Text><TextInput value={price} onChangeText={(v)=>setPrice(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/></View></View>
      {Number(price)>0?<View style={[styles.feePreview,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="leaf" size={16} color={colors.accent}/><Text style={[styles.feePreviewText,{color:colors.muted}]}>Taxa econômica 8% • você recebe <Text style={{color:colors.yellow,fontWeight:'900'}}>🪙 {marketSellerNet(Number(price)).toLocaleString('pt-BR')}</Text></Text></View>:null}
      <Pressable disabled={!selectedCard||working||Number(quantity)<1||Number(price)<1} onPress={()=>void publish()} style={[styles.primaryButton,{backgroundColor:selectedCard?colors.yellow:colors.surfaceAlt}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="add-circle" size={19} color="#07111F"/>}<Text style={styles.primaryText}>PUBLICAR OFERTA</Text></Pressable>
    </View>

    <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Buscar carta, loja ou treinador..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>
    <View style={styles.listTitleRow}><Text style={[styles.listTitle,{color:colors.text}]}>Ofertas ao vivo</Text><Text style={[styles.count,{color:colors.yellow}]}>{visibleListings.length}</Text></View>
  </View>;

  const footer=<View style={styles.footer}><Text style={[styles.listTitle,{color:colors.text}]}>Minhas ofertas</Text>{(hub?.myListings??[]).length===0?<Text style={[styles.emptyText,{color:colors.muted}]}>Você ainda não publicou nenhuma carta.</Text>:(hub?.myListings??[]).map((item)=><View key={item.id} style={[styles.myRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.myName,{color:colors.text}]}>{item.quantity}× {item.card.name}</Text><Text style={[styles.status,{color:item.status==='active'?'#65D894':colors.muted}]}>{item.status==='active'?'ATIVA':item.status==='sold'?'VENDIDA':'REMOVIDA'}</Text>{item.status==='active'?<Pressable disabled={working} onPress={()=>void remove(item)} style={styles.removeButton}><Ionicons name="trash" size={16} color="#FF8A9A"/></Pressable>:null}</View>)}</View>;

  return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}><PremiumBackground/><FlatList data={visibleListings} keyExtractor={(item)=>item.id} ListHeaderComponent={header} ListFooterComponent={footer} contentContainerStyle={styles.content} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} showsVerticalScrollIndicator={false} ListEmptyComponent={loading?<ActivityIndicator size="large" color={colors.yellow}/>:<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="storefront-outline" size={30} color={colors.muted}/><Text style={[styles.emptyText,{color:colors.muted}]}>Nenhuma oferta encontrada.</Text></View>} renderItem={({item})=><ListingCard item={item} myId={hub?.myId??''} working={working} onBuy={confirmBuy} onOffer={openOffer}/>}/>

    <Modal visible={Boolean(offerListing)} transparent animationType="fade" onRequestClose={()=>setOfferListing(null)}>
      <View style={styles.offerBackdrop}><View style={[styles.offerModal,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><View style={styles.offerHead}><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Fazer oferta</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>{offerListing?.card.name} • anúncio 🪙 {offerListing?.price.toLocaleString('pt-BR')} • mercado {offerListing?.card.marketPriceUsd == null ? '—' : formatUsd(offerListing.card.marketPriceUsd * offerListing.quantity)}</Text></View><Pressable onPress={()=>setOfferListing(null)}><Ionicons name="close" size={22} color={colors.muted}/></Pressable></View><Text style={[styles.label,{color:colors.muted}]}>SUA OFERTA EM COINS</Text><TextInput value={offerAmount} onChangeText={(v)=>setOfferAmount(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" autoFocus style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/><Text style={[styles.offerHint,{color:colors.muted}]}>A oferta vale por 24 horas. As Coins só são debitadas se o vendedor aceitar e você ainda tiver saldo.</Text><Pressable disabled={working||Number(offerAmount)<1} onPress={()=>void submitOffer()} style={[styles.primaryButton,{backgroundColor:colors.yellow}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="send" size={18} color="#07111F"/>}<Text style={styles.primaryText}>ENVIAR OFERTA</Text></Pressable></View></View>
    </Modal>

    <Modal visible={pickerOpen} animationType="slide" onRequestClose={()=>setPickerOpen(false)}>
      <SafeAreaView style={[styles.pickerSafe,{backgroundColor:colors.bg}]}><PremiumBackground/><View style={styles.pickerHeader}><View style={{flex:1}}><Text style={[styles.pageTitle,{color:colors.text}]}>Escolher carta</Text><Text style={[styles.subtitle,{color:colors.muted}]}>Até 60 resultados por busca para manter a tela leve.</Text></View><Pressable onPress={()=>setPickerOpen(false)}><Ionicons name="close" size={25} color={colors.text}/></Pressable></View><View style={[styles.searchBox,{marginHorizontal:14,backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={inventorySearch} onChangeText={setInventorySearch} placeholder="Buscar na Bag..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>{inventoryLoading?<ActivityIndicator style={{margin:14}} color={colors.yellow}/>:null}<FlatList data={inventory} keyExtractor={(item,index)=>item.cards?.id??`inventory-${index}`} contentContainerStyle={styles.pickerList} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} renderItem={({item})=><Pressable disabled={!item.cards} onPress={()=>{setSelectedCard(item);setQuantity('1');setPickerOpen(false);}} style={[styles.inventoryRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>{item.cards?.image_small?<Image source={{uri:item.cards.image_small}} resizeMode="contain" style={styles.inventoryImage}/>:<View style={styles.inventoryImage}/>}<View style={{flex:1}}><Text style={[styles.inventoryName,{color:colors.text}]}>{item.cards?.pokemon_name??'Carta'}</Text><Text style={[styles.inventoryMeta,{color:colors.muted}]}>{item.cards?.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text></View><Ionicons name="add-circle" size={23} color={colors.accent}/></Pressable>}/></SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function ListingCard({item,myId,working,onBuy,onOffer}:{item:MarketplaceListing;myId:string;working:boolean;onBuy:(item:MarketplaceListing)=>void;onOffer:(item:MarketplaceListing)=>void}){
  const {colors}=useAppTheme();
  const themeColor=
    item.shopTheme==='guild'?(item.guild?.color??colors.accent):
    item.shopTheme==='night'?'#9B7BFF':
    item.shopTheme==='royal'?'#FFD447':
    item.shopTheme==='neon'?'#45F3FF':
    item.shopTheme==='master'?'#C493FF':
    item.shopTheme==='celestial'?'#8EE7FF':
    colors.yellow;
  const listingBoosted=Boolean(item.boostedUntil&&new Date(item.boostedUntil).getTime()>Date.now());
  const shopBoosted=Boolean(item.shopHighlightUntil&&new Date(item.shopHighlightUntil).getTime()>Date.now());
  return <AuraFrame primaryColor={listingBoosted?colors.yellow:themeColor} secondaryColor={themeColor} intensity={listingBoosted?'premium':'soft'} radius={19}><View style={[styles.listing,{backgroundColor:colors.surface,borderColor:listingBoosted?colors.yellow:themeColor,borderWidth:listingBoosted||['royal','neon','master','celestial'].includes(item.shopTheme)?1.5:1}]}>
    <View pointerEvents="none" style={[styles.listingThemeGlow,{backgroundColor:themeColor,opacity:['royal','neon','master','celestial'].includes(item.shopTheme)?.13:.055}]}/>
    <View pointerEvents="none" style={[styles.listingThemeEdge,{backgroundColor:listingBoosted?colors.yellow:themeColor,opacity:listingBoosted?.9:.45}]}/>
    <View style={styles.sellerRow}>
      <TrainerAvatar icon={item.sellerIcon} size={38} color={themeColor} backgroundColor={colors.surfaceAlt}/>
      <View style={{flex:1}}>
        <View style={styles.shopTitleRow}><Text style={[styles.shopName,{color:colors.text}]}>{item.shopName}</Text>{shopBoosted?<View style={[styles.premiumBadge,{backgroundColor:colors.accentSoft}]}><Ionicons name="sparkles" size={11} color={colors.yellow}/><Text style={[styles.premiumText,{color:colors.yellow}]}>LOJA EM DESTAQUE</Text></View>:null}</View>
        <Text style={[styles.sellerName,{color:colors.muted}]}>@{item.sellerName}{item.guild?` • ${item.guild.name}`:''}</Text>
      </View>
      {listingBoosted?<View style={[styles.boostBadge,{backgroundColor:'#332B11'}]}><Ionicons name="rocket" size={13} color="#FFD447"/><Text style={styles.boostText}>IMPULSIONADO</Text></View>:null}
    </View>
    <View style={styles.cardRow}>{item.card.image?<Image source={{uri:item.card.image}} resizeMode="contain" style={styles.cardImage}/>:<View style={[styles.cardImage,{backgroundColor:colors.surfaceAlt}]}/>}<View style={{flex:1}}><Text style={[styles.cardName,{color:colors.text}]}>{item.card.name}</Text><Text style={[styles.cardMeta,{color:colors.muted}]}>{item.card.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text><Text style={[styles.price,{color:colors.yellow}]}>🪙 {item.price.toLocaleString('pt-BR')}</Text><Text style={[styles.marketUsd,{color:colors.muted}]}>Mercado USD: {item.card.marketPriceUsd == null ? '—' : formatUsd(item.card.marketPriceUsd * item.quantity)}{item.quantity > 1 && item.card.marketPriceUsd != null ? ` • ${formatUsd(item.card.marketPriceUsd)} cada` : ''}</Text></View></View>
    <View style={styles.listingActions}><Pressable disabled={item.sellerId===myId||working} onPress={()=>onBuy(item)} style={[styles.buyButton,styles.flexButton,{backgroundColor:item.sellerId===myId?colors.surfaceAlt:colors.yellow}]}><Ionicons name={item.sellerId===myId?'storefront':'cart'} size={18} color={item.sellerId===myId?colors.muted:'#07111F'}/><Text style={[styles.buyText,item.sellerId===myId&&{color:colors.muted}]}>{item.sellerId===myId?'SUA OFERTA':'COMPRAR'}</Text></Pressable>{item.sellerId!==myId?<Pressable disabled={working} onPress={()=>onOffer(item)} style={[styles.buyButton,styles.flexButton,{backgroundColor:colors.accentSoft,borderWidth:1,borderColor:colors.accent}]}><Ionicons name="chatbubble-ellipses" size={18} color={colors.accent}/><Text style={[styles.buyText,{color:colors.text}]}>FAZER OFERTA</Text></Pressable>:null}</View>
  </View></AuraFrame>;
}

const styles=StyleSheet.create({
  marketUsd:{fontSize:9,fontWeight:'800',marginTop:3},
  safe:{flex:1,overflow:'hidden'},marketNav:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8},offersLink:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},offersLinkText:{fontSize:8,fontWeight:'900'},offerBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.75)',alignItems:'center',justifyContent:'center',padding:15},offerModal:{width:'100%',maxWidth:460,borderRadius:22,borderWidth:1,padding:16,gap:10},offerHead:{flexDirection:'row',alignItems:'center',gap:9},offerHint:{fontSize:8,lineHeight:13},listingActions:{flexDirection:'row',flexWrap:'wrap',gap:7},flexButton:{flexGrow:1,flexBasis:140},content:{width:'100%',maxWidth:1120,alignSelf:'center',paddingHorizontal:14,paddingTop:12,paddingBottom:110,gap:9},marketHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7},marketHeroStat:{flexGrow:1,minWidth:125,borderRadius:13,borderWidth:1,padding:9},marketHeroValue:{fontSize:13,fontWeight:'900'},marketHeroLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.6,marginTop:2},headerStack:{gap:13,marginBottom:4},top:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',justifyContent:'space-between',gap:10},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5},pageTitle:{fontSize:29,fontWeight:'900',letterSpacing:-.5},subtitle:{fontSize:11,lineHeight:17,marginTop:3},back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:11,fontWeight:'800'},
  notice:{borderRadius:14,borderWidth:1,borderColor:'#4A9B70',backgroundColor:'#142C23',padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,color:'#D9FFEC',fontSize:10,fontWeight:'800'},error:{borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  shopPanel:{borderRadius:20,borderWidth:1,padding:14,gap:10},shopPreview:{minHeight:88,borderRadius:16,borderWidth:1,padding:11,position:'relative',overflow:'hidden',flexDirection:'row',alignItems:'center',gap:9},shopPreviewGlow:{position:'absolute',right:-55,top:-75,width:180,height:180,borderRadius:999,opacity:.16},shopPreviewIcon:{width:45,height:45,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',zIndex:2},shopPreviewKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.65},shopPreviewName:{fontSize:13,fontWeight:'900',marginTop:2},shopPreviewMeta:{fontSize:7.5,marginTop:2},shopPreviewPremium:{borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4,zIndex:2},shopPreviewPremiumText:{fontSize:6,fontWeight:'900'},sectionHead:{flexDirection:'row',alignItems:'center',gap:10},sectionIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:17,fontWeight:'900'},sectionHint:{fontSize:9,lineHeight:14,marginTop:2},input:{minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:12,fontSize:13,fontWeight:'800'},themeRow:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{borderRadius:11,borderWidth:1,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:5},themeText:{fontSize:8,fontWeight:'900'},secondaryButton:{minHeight:46,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},secondaryText:{fontSize:9,fontWeight:'900'},
  cardSelector:{borderRadius:15,borderWidth:1,minHeight:72,padding:8,flexDirection:'row',alignItems:'center',gap:10},selectorImage:{width:43,height:57},selectorTitle:{fontSize:13,fontWeight:'900'},selectorHint:{fontSize:9,marginTop:3},formRow:{flexDirection:'row',flexWrap:'wrap',gap:8},formField:{flexGrow:1,flexBasis:150,minWidth:140,gap:5},label:{fontSize:7,fontWeight:'900',letterSpacing:.9},feePreview:{minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},feePreviewText:{fontSize:9,fontWeight:'800',flex:1},primaryButton:{minHeight:51,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},primaryText:{color:'#07111F',fontSize:10,fontWeight:'900'},
  searchBox:{minHeight:49,borderRadius:15,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,minHeight:47,fontSize:12},listTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},listTitle:{fontSize:20,fontWeight:'900'},count:{fontSize:14,fontWeight:'900'},
  listing:{borderRadius:19,borderWidth:1,padding:12,gap:10,marginBottom:9,position:'relative',overflow:'hidden'},listingThemeGlow:{position:'absolute',right:-70,top:-85,width:190,height:190,borderRadius:999},listingThemeEdge:{position:'absolute',left:0,right:0,top:0,height:2},sellerRow:{flexDirection:'row',alignItems:'center',gap:9},shopTitleRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},shopName:{fontSize:13,fontWeight:'900'},sellerName:{fontSize:8,marginTop:2},premiumBadge:{borderRadius:999,paddingHorizontal:6,paddingVertical:3,flexDirection:'row',alignItems:'center',gap:3},premiumText:{fontSize:6,fontWeight:'900'},boostBadge:{borderRadius:999,paddingHorizontal:7,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4},boostText:{color:'#FFD447',fontSize:6,fontWeight:'900'},cardRow:{flexDirection:'row',alignItems:'center',gap:11},cardImage:{width:65,height:87,borderRadius:7},cardName:{fontSize:16,fontWeight:'900'},cardMeta:{fontSize:9,marginTop:3},price:{fontSize:15,fontWeight:'900',marginTop:8},buyButton:{minHeight:45,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},buyText:{color:'#07111F',fontSize:9,fontWeight:'900'},
  footer:{gap:8,marginTop:12},myRow:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},myName:{flex:1,fontSize:11,fontWeight:'900'},status:{fontSize:8,fontWeight:'900'},removeButton:{width:32,height:32,borderRadius:10,backgroundColor:'#351A24',alignItems:'center',justifyContent:'center'},empty:{borderRadius:18,borderWidth:1,padding:24,alignItems:'center',gap:8},emptyText:{fontSize:10,lineHeight:15},
  pickerSafe:{flex:1},pickerHeader:{padding:14,flexDirection:'row',alignItems:'center',gap:10},pickerList:{padding:14,gap:8},inventoryRow:{borderRadius:15,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:10},inventoryImage:{width:49,height:66,borderRadius:6},inventoryName:{fontSize:13,fontWeight:'900'},inventoryMeta:{fontSize:9,marginTop:3},
});
