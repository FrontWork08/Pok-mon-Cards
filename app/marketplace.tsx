import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerAvatar } from '@/components/TrainerAvatar';
import { AuraBanner } from '@/components/AuraBanner';
import { AuraFrame } from '@/components/AuraFrame';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';
import { MarketplaceListingSurface } from '@/components/MarketplaceListingSurface';
import { getMyBagPage } from '@/services/bag';
import { getCardDetail, getOwnedCard, type CardDetailEntry, type OwnedCardEntry } from '@/services/player';
import { buyListing, cancelListing, createListing, createMarketOffer, getMarketplaceHub, saveMyShop, subscribeMarketplace, type MarketplaceHub, type MarketplaceListing, type ShopTheme } from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { formatUsd } from '@/services/market';
import { formatGameIdentifier, getCardGameProfile, type CardGameProfile } from '@/services/cardGameProfile';
import { getScreenPreference, setScreenPreference } from '@/services/screenPreferences';
import { AreaIdentityStrip } from '@/components/AreaIdentityStrip';
import { getCardSellGuidance, type SellGuidance } from '@/services/trainerInsights';

function themeAccent(theme:ShopTheme,fallback:string){
  if(theme==='royal')return '#FFD447';
  if(theme==='neon')return '#45F3FF';
  if(theme==='master')return '#C493FF';
  if(theme==='celestial')return '#8EE7FF';
  if(theme==='galaxy')return '#8B5CFF';
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
  {id:'galaxy',label:'GALAXY FLOW',icon:'sparkles',premium:true},
];

export default function MarketplaceScreen() {
  const router=useRouter();
  const { sellCardId } = useLocalSearchParams<{ sellCardId?: string }>();
  const {colors}=useAppTheme();
  const wallet=useWallet();
  const [hub,setHub]=useState<MarketplaceHub|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [marketPrefsReady,setMarketPrefsReady]=useState(false);
  const [shopName,setShopName]=useState('');
  const [shopTheme,setShopTheme]=useState<ShopTheme>('guild');
  const [pickerOpen,setPickerOpen]=useState(false);
  const [inventory,setInventory]=useState<OwnedCardEntry[]>([]);
  const [inventorySearch,setInventorySearch]=useState('');
  const [inventoryLoading,setInventoryLoading]=useState(false);
  const [inventoryLoadingMore,setInventoryLoadingMore]=useState(false);
  const [inventoryTotal,setInventoryTotal]=useState(0);
  const [cardPreview,setCardPreview]=useState<CardDetailEntry|null>(null);
  const [cardPreviewLoading,setCardPreviewLoading]=useState(false);
  const [previewSellEntry,setPreviewSellEntry]=useState<OwnedCardEntry|null>(null);
  const [selectedCard,setSelectedCard]=useState<OwnedCardEntry|null>(null);
  const [quantity,setQuantity]=useState('1');
  const [price,setPrice]=useState('1000');
  const [sellGuidance,setSellGuidance]=useState<SellGuidance|null>(null);
  const [guidanceLoading,setGuidanceLoading]=useState(false);
  const [offerListing,setOfferListing]=useState<MarketplaceListing|null>(null);
  const [offerAmount,setOfferAmount]=useState('');
  const [compareItems,setCompareItems]=useState<MarketplaceListing[]>([]);
  const [compareProfiles,setCompareProfiles]=useState<Record<string,CardGameProfile|null>>({});
  const [compareLoading,setCompareLoading]=useState<string|null>(null);
  const [previewGameProfile,setPreviewGameProfile]=useState<CardGameProfile|null>(null);
  const [sellCardHandled,setSellCardHandled]=useState<string|null>(null);
  const loadedOnce=useRef(false);
  const realtimeRefreshTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const inventoryRequestSeq=useRef(0);

  const load=useCallback(async()=>{
    try{
      setError(null);
      const next=await getMarketplaceHub();
      setHub(next);
      setShopName((current)=>current||next.myShop?.name||'');
      setShopTheme(next.myShop?.themeStyle||'guild');
      loadedOnce.current=true;
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível abrir o mercado.');}
    finally{setLoading(false);}
  },[]);
  useFocusEffect(useCallback(()=>{if(!loadedOnce.current)setLoading(true);void load();},[load]));

  useEffect(()=>{
    let active=true;
    void getScreenPreference('marketplace_filters_v1',{search:''}).then((saved)=>{
      if(!active)return;
      setSearch(saved.search??'');
      setMarketPrefsReady(true);
    });
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!marketPrefsReady)return;
    void setScreenPreference('marketplace_filters_v1',{search});
  },[marketPrefsReady,search]);

  useEffect(()=>{
    const cardId=selectedCard?.cards?.id;
    if(!cardId){setSellGuidance(null);return;}
    let active=true;
    setGuidanceLoading(true);
    void getCardSellGuidance(cardId).then((next)=>{if(active)setSellGuidance(next);}).catch(()=>{if(active)setSellGuidance(null);}).finally(()=>{if(active)setGuidanceLoading(false);});
    return()=>{active=false;};
  },[selectedCard?.cards?.id]);

  useEffect(()=>{
    const contextCardId=sellCardId?String(sellCardId):'';
    if(!contextCardId||sellCardHandled===contextCardId)return;
    setSellCardHandled(contextCardId);
    void getOwnedCard(contextCardId)
      .then((entry)=>{
        setSelectedCard(entry);
        setQuantity('1');
        setNotice('Carta carregada da visualização. Defina quantidade e preço para publicar.');
      })
      .catch(()=>setError('Essa carta não está disponível na sua Bag para venda.'));
  },[sellCardHandled,sellCardId]);

  async function toggleCompare(item:MarketplaceListing){
    const exists=compareItems.some((entry)=>entry.id===item.id);
    if(exists){
      setCompareItems((current)=>current.filter((entry)=>entry.id!==item.id));
      return;
    }

    setCompareItems((current)=>current.length>=2?[current[1],item]:[...current,item]);
    if(!(item.card.id in compareProfiles)){
      try{
        setCompareLoading(item.card.id);
        const profile=await getCardGameProfile(item.card.id).catch(()=>null);
        setCompareProfiles((current)=>({...current,[item.card.id]:profile}));
      }finally{
        setCompareLoading(null);
      }
    }
  }
  useEffect(()=>{
    const unsubscribe=subscribeMarketplace(()=>{
      if(realtimeRefreshTimer.current)clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current=setTimeout(()=>{void load();},180);
    });
    return()=>{
      if(realtimeRefreshTimer.current)clearTimeout(realtimeRefreshTimer.current);
      unsubscribe();
    };
  },[load]);

  const loadInventory=useCallback(async(term='',offset=0)=>{
    const requestSeq=++inventoryRequestSeq.current;
    try{
      if(offset===0)setInventoryLoading(true);
      else setInventoryLoadingMore(true);
      const page=await getMyBagPage(offset,60,{search:term,setQuery:'',quickFilter:'all',typeFilter:null,rarityFilter:null,generation:null,sortMode:'value'});
      if(requestSeq!==inventoryRequestSeq.current)return;
      setInventoryTotal(page.totalFiltered);
      setInventory((current)=>{
        if(offset===0)return page.items;
        const merged=new Map(current.map((entry)=>[entry.cards?.id??'',entry]));
        page.items.forEach((entry)=>{if(entry.cards?.id)merged.set(entry.cards.id,entry);});
        return [...merged.values()];
      });
    }catch(e){
      if(requestSeq===inventoryRequestSeq.current)setError(e instanceof Error?e.message:'Não foi possível carregar sua Bag.');
    }finally{
      if(requestSeq===inventoryRequestSeq.current){
        setInventoryLoading(false);
        setInventoryLoadingMore(false);
      }
    }
  },[]);
  useEffect(()=>{
    if(!pickerOpen)return;
    inventoryRequestSeq.current+=1;
    const timer=setTimeout(()=>{void loadInventory(inventorySearch,0);},320);
    return()=>clearTimeout(timer);
  },[pickerOpen,inventorySearch,loadInventory]);

  const loadMoreInventory=useCallback(()=>{
    if(inventoryLoading||inventoryLoadingMore||inventory.length>=inventoryTotal)return;
    void loadInventory(inventorySearch,inventory.length);
  },[inventory.length,inventoryLoading,inventoryLoadingMore,inventorySearch,inventoryTotal,loadInventory]);

  const openInventoryPreview=useCallback(async(entry:OwnedCardEntry)=>{
    if(!entry.cards)return;
    try{
      setPreviewSellEntry(entry);
      setCardPreview(null);
      setPreviewGameProfile(null);
      setCardPreviewLoading(true);
      const [detail,profile]=await Promise.all([
        getCardDetail(entry.cards.id),
        getCardGameProfile(entry.cards.id).catch(()=>null),
      ]);
      setCardPreview(detail);
      setPreviewGameProfile(profile);
    }catch(e){
      setPreviewSellEntry(null);
      setError(e instanceof Error?e.message:'Não foi possível abrir os detalhes desta carta.');
    }finally{
      setCardPreviewLoading(false);
    }
  },[]);

  const openListingPreview=useCallback(async(item:MarketplaceListing)=>{
    try{
      setPreviewSellEntry(null);
      setCardPreview(null);
      setPreviewGameProfile(null);
      setCardPreviewLoading(true);
      const [detail,profile]=await Promise.all([
        getCardDetail(item.card.id),
        getCardGameProfile(item.card.id).catch(()=>null),
      ]);
      setCardPreview(detail);
      setPreviewGameProfile(profile);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível abrir os detalhes desta carta.');
    }finally{
      setCardPreviewLoading(false);
    }
  },[]);

  function selectPreviewForSale(){
    if(!previewSellEntry?.cards)return;
    setSelectedCard(previewSellEntry);
    setQuantity('1');
    setCardPreview(null);
    setPreviewSellEntry(null);
    setPickerOpen(false);
  }

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
      intensity={(['master','celestial','royal','neon','galaxy'] as ShopTheme[]).includes(shopTheme)?'master':'premium'}
      variant={shopTheme==='galaxy'?'galaxy':'energy'}
      badge={(['master','celestial','royal','neon','galaxy'] as ShopTheme[]).includes(shopTheme)?`${shopTheme.toUpperCase()} THEME`:'MARKET LIVE'}
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
        {shopTheme==='galaxy'?<GalaxyFlowOverlay intensity="master" opacity={.82}/>:null}
        <View style={[styles.shopPreviewGlow,{backgroundColor:themeAccent(shopTheme,colors.accent)}]}/>
        <View style={[styles.shopPreviewIcon,{backgroundColor:`${themeAccent(shopTheme,colors.accent)}18`,borderColor:`${themeAccent(shopTheme,colors.accent)}75`}]}><Ionicons name={THEMES.find((item)=>item.id===shopTheme)?.icon??'storefront'} size={22} color={themeAccent(shopTheme,colors.accent)}/></View>
        <View style={{flex:1,zIndex:2}}><Text style={[styles.shopPreviewKicker,{color:themeAccent(shopTheme,colors.accent)}]}>{shopTheme.toUpperCase()} STORE</Text><Text style={[styles.shopPreviewName,{color:colors.text}]}>{shopName.trim()||hub?.myShop?.name||'Sua Trainer Shop'}</Text><Text style={[styles.shopPreviewMeta,{color:colors.muted}]}>Prévia pública • tema {shopTheme}</Text></View>
        {(['royal','neon','master','celestial','galaxy'] as ShopTheme[]).includes(shopTheme)?<View style={[styles.shopPreviewPremium,{backgroundColor:`${colors.yellow}18`,borderColor:`${colors.yellow}60`}]}><Ionicons name="diamond" size={12} color={colors.yellow}/><Text style={[styles.shopPreviewPremiumText,{color:colors.yellow}]}>PREMIUM</Text></View>:null}
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
      {selectedCard?<View style={[styles.priceGuide,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
        <View style={styles.priceGuideHead}><Ionicons name="analytics" size={18} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.priceGuideTitle,{color:colors.text}]}>PREÇO INTELIGENTE</Text><Text style={[styles.priceGuideHint,{color:colors.muted}]}>Referência informativa baseada em anúncios ativos e vendas dos últimos 30 dias. Você continua escolhendo o preço.</Text></View>{guidanceLoading?<ActivityIndicator size="small" color={colors.yellow}/>:null}</View>
        {sellGuidance?<View style={styles.priceGuideMetrics}>
          <GuideMetric label="MENOR ATIVA" value={sellGuidance.lowestActiveCoins==null?'—':'🪙 '+Number(sellGuidance.lowestActiveCoins).toLocaleString('pt-BR')}/>
          <GuideMetric label="MÉDIA VENDIDA" value={sellGuidance.recentSaleAvgCoins==null?'—':'🪙 '+Number(sellGuidance.recentSaleAvgCoins).toLocaleString('pt-BR')}/>
          <GuideMetric label="VENDAS 30D" value={String(sellGuidance.recentSalesCount)}/>
        </View>:null}
        {sellGuidance?.suggestedCoins!=null?<Pressable onPress={()=>setPrice(String(Math.max(1,Math.round(Number(sellGuidance.suggestedCoins)))))} style={[styles.useSuggestion,{borderColor:colors.accent}]}><Ionicons name="sparkles" size={15} color={colors.accent}/><Text style={[styles.useSuggestionText,{color:colors.accent}]}>USAR SUGESTÃO 🪙 {Number(sellGuidance.suggestedCoins).toLocaleString('pt-BR')}</Text></Pressable>:null}
      </View>:null}
      {Number(price)>0?<View style={[styles.feePreview,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="leaf" size={16} color={colors.accent}/><Text style={[styles.feePreviewText,{color:colors.muted}]}>Taxa econômica 8% • você recebe <Text style={{color:colors.yellow,fontWeight:'900'}}>🪙 {marketSellerNet(Number(price)).toLocaleString('pt-BR')}</Text></Text></View>:null}
      <Pressable disabled={!selectedCard||working||Number(quantity)<1||Number(price)<1} onPress={()=>void publish()} style={[styles.primaryButton,{backgroundColor:selectedCard?colors.yellow:colors.surfaceAlt}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="add-circle" size={19} color="#07111F"/>}<Text style={styles.primaryText}>PUBLICAR OFERTA</Text></Pressable>
    </View>

    <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={19} color={colors.muted}/><TextInput value={search} onChangeText={setSearch} placeholder="Buscar carta, loja ou treinador..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>
    {compareItems.length?<MarketplaceComparePanel items={compareItems} profiles={compareProfiles} loadingCardId={compareLoading} onRemove={(listingId)=>setCompareItems((current)=>current.filter((entry)=>entry.id!==listingId))} onClear={()=>setCompareItems([])}/>:null}
    <View style={styles.listTitleRow}><View><Text style={[styles.listTitle,{color:colors.text}]}>Ofertas ao vivo</Text><Text style={[styles.compareHint,{color:colors.muted}]}>Use COMPARAR em até 2 anúncios para ver preço e força lado a lado.</Text></View><Text style={[styles.count,{color:colors.yellow}]}>{visibleListings.length}</Text></View>
  </View>;

  const footer=<View style={styles.footer}><Text style={[styles.listTitle,{color:colors.text}]}>Minhas ofertas</Text>{(hub?.myListings??[]).length===0?<Text style={[styles.emptyText,{color:colors.muted}]}>Você ainda não publicou nenhuma carta.</Text>:(hub?.myListings??[]).map((item)=><View key={item.id} style={[styles.myRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text numberOfLines={1} style={[styles.myName,{color:colors.text}]}>{item.quantity}× {item.card.name}</Text><Text style={[styles.status,{color:item.status==='active'?'#65D894':colors.muted}]}>{item.status==='active'?'ATIVA':item.status==='sold'?'VENDIDA':'REMOVIDA'}</Text>{item.status==='active'?<Pressable disabled={working} onPress={()=>void remove(item)} style={styles.removeButton}><Ionicons name="trash" size={16} color="#FF8A9A"/></Pressable>:null}</View>)}</View>;

  return <SafeAreaView style={[styles.safe,{backgroundColor:colors.bg}]}>
      <AreaIdentityStrip area="economy" /><PremiumBackground/><FlatList data={visibleListings} keyExtractor={(item)=>item.id} ListHeaderComponent={header} ListFooterComponent={footer} contentContainerStyle={styles.content} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} showsVerticalScrollIndicator={false} ListEmptyComponent={loading?<ActivityIndicator size="large" color={colors.yellow}/>:<View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="storefront-outline" size={30} color={colors.muted}/><Text style={[styles.emptyText,{color:colors.muted}]}>Nenhuma oferta encontrada.</Text></View>} renderItem={({item})=><ListingCard item={item} myId={hub?.myId??''} working={working} comparing={compareItems.some((entry)=>entry.id===item.id)} onBuy={confirmBuy} onOffer={openOffer} onPreview={openListingPreview} onCompare={toggleCompare}/>} />

    <Modal visible={Boolean(offerListing)} transparent animationType="fade" onRequestClose={()=>setOfferListing(null)}>
      <View style={styles.offerBackdrop}><View style={[styles.offerModal,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><View style={styles.offerHead}><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>Fazer oferta</Text><Text style={[styles.sectionHint,{color:colors.muted}]}>{offerListing?.card.name} • anúncio 🪙 {offerListing?.price.toLocaleString('pt-BR')} • mercado {offerListing?.card.marketPriceUsd == null ? '—' : formatUsd(offerListing.card.marketPriceUsd * offerListing.quantity)}</Text></View><Pressable onPress={()=>setOfferListing(null)}><Ionicons name="close" size={22} color={colors.muted}/></Pressable></View><Text style={[styles.label,{color:colors.muted}]}>SUA OFERTA EM COINS</Text><TextInput value={offerAmount} onChangeText={(v)=>setOfferAmount(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" autoFocus style={[styles.input,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/><Text style={[styles.offerHint,{color:colors.muted}]}>A oferta vale por 24 horas. As Coins só são debitadas se o vendedor aceitar e você ainda tiver saldo.</Text><Pressable disabled={working||Number(offerAmount)<1} onPress={()=>void submitOffer()} style={[styles.primaryButton,{backgroundColor:colors.yellow}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name="send" size={18} color="#07111F"/>}<Text style={styles.primaryText}>ENVIAR OFERTA</Text></Pressable></View></View>
    </Modal>

    <Modal visible={pickerOpen} animationType="slide" onRequestClose={()=>setPickerOpen(false)}>
      <SafeAreaView style={[styles.pickerSafe,{backgroundColor:colors.bg}]}>
        <PremiumBackground/>
        <View style={styles.pickerHeader}>
          <View style={{flex:1}}>
            <Text style={[styles.pageTitle,{color:colors.text}]}>Escolher carta</Text>
            <Text style={[styles.subtitle,{color:colors.muted}]}>Carregamento por páginas: todas as cartas elegíveis da Bag ficam acessíveis sem pesar a tela.</Text>
          </View>
          <Pressable onPress={()=>setPickerOpen(false)}><Ionicons name="close" size={25} color={colors.text}/></Pressable>
        </View>
        <View style={[styles.searchBox,{marginHorizontal:14,backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="search" size={19} color={colors.muted}/>
          <TextInput value={inventorySearch} onChangeText={setInventorySearch} placeholder="Buscar em toda a Bag..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/>
        </View>
        <Text style={[styles.inventoryCount,{color:colors.muted}]}>{inventory.length} de {inventoryTotal} carta(s) carregadas</Text>
        {inventoryLoading?<ActivityIndicator style={{margin:14}} color={colors.yellow}/>:null}
        <FlatList
          data={inventory}
          keyExtractor={(item,index)=>item.cards?.id??`inventory-${index}`}
          contentContainerStyle={styles.pickerList}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          onEndReached={loadMoreInventory}
          onEndReachedThreshold={0.55}
          ListFooterComponent={inventoryLoadingMore?<ActivityIndicator style={{margin:14}} color={colors.yellow}/>:null}
          renderItem={({item})=>(
            <View style={[styles.inventoryRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Pressable disabled={!item.cards} onPress={()=>openInventoryPreview(item)} style={styles.inventoryPreviewTap}>
                {item.cards?.image_small?<Image source={{uri:item.cards.image_small}} resizeMode="contain" style={styles.inventoryImage}/>:<View style={styles.inventoryImage}/>}
                <View style={{flex:1}}>
                  <Text style={[styles.inventoryName,{color:colors.text}]}>{item.cards?.pokemon_name??'Carta'}</Text>
                  <Text style={[styles.inventoryMeta,{color:colors.muted}]}>{item.cards?.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text>
                  <Text style={[styles.inventoryPreviewHint,{color:colors.accent}]}>TOQUE PARA VER ESTATÍSTICAS</Text>
                </View>
                <Ionicons name="eye" size={20} color={colors.accent}/>
              </Pressable>
              <Pressable disabled={!item.cards} onPress={()=>{setSelectedCard(item);setQuantity('1');setPickerOpen(false);}} style={[styles.inventorySelect,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
                <Ionicons name="add-circle" size={20} color={colors.accent}/>
                <Text style={[styles.inventorySelectText,{color:colors.text}]}>ESCOLHER</Text>
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>

    <MarketplaceCardPreviewModal
      detail={cardPreview}
      gameProfile={previewGameProfile}
      loading={cardPreviewLoading}
      sellEntry={previewSellEntry}
      onOpenFullCard={(cardId)=>{setCardPreview(null);setPreviewSellEntry(null);router.push(('/card/'+cardId) as never);}}
      onClose={()=>{setCardPreview(null);setPreviewSellEntry(null);setPreviewGameProfile(null);}}
      onSelectForSale={selectPreviewForSale}
    />
  </SafeAreaView>;
}


function MarketplaceCardPreviewModal({
  detail,
  gameProfile,
  loading,
  sellEntry,
  onOpenFullCard,
  onClose,
  onSelectForSale,
}:{
  detail:CardDetailEntry|null;
  gameProfile:CardGameProfile|null;
  loading:boolean;
  sellEntry:OwnedCardEntry|null;
  onOpenFullCard:(cardId:string)=>void;
  onClose:()=>void;
  onSelectForSale:()=>void;
}){
  const {colors}=useAppTheme();
  const card=detail?.cards??null;
  const types=gameProfile?.types?.length?gameProfile.types:(Array.isArray(card?.game_types)&&card.game_types.length?card.game_types:Array.isArray(card?.types)?card.types:[]);
  const visible=loading||Boolean(card);

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.previewBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}/>
      <View style={[styles.previewSheet,{backgroundColor:colors.bg,borderColor:colors.border}]}>
        <View style={[styles.previewHeader,{borderBottomColor:colors.border}]}>
          <View style={{flex:1,minWidth:0}}>
            <Text style={[styles.previewKicker,{color:colors.yellow}]}>PRÉVIA RÁPIDA • GAME_V1</Text>
            <Text numberOfLines={1} style={[styles.previewTitle,{color:colors.text}]}>{card?.pokemon_name??'Carregando…'}</Text>
          </View>
          <Pressable onPress={onClose} style={[styles.previewClose,{backgroundColor:colors.surface,borderColor:colors.border}]}>
            <Ionicons name="close" size={22} color={colors.text}/>
          </Pressable>
        </View>

        {loading&&!card?<View style={styles.previewLoading}><ActivityIndicator size="large" color={colors.yellow}/><Text style={[styles.previewLoadingText,{color:colors.muted}]}>Carregando carta e perfil de batalha…</Text></View>:null}

        {card?<ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
          <View style={styles.previewHero}>
            {card.image_large||card.image_small
              ? <Image source={{uri:card.image_large??card.image_small??''}} resizeMode="contain" style={styles.previewCardImage}/>
              : <View style={[styles.previewCardImage,{backgroundColor:colors.surface}]}/>}
            <View style={styles.previewIdentity}>
              <Text style={[styles.previewName,{color:colors.text}]}>{card.pokemon_name}</Text>
              <Text style={[styles.previewMeta,{color:colors.muted}]}>{card.set_name} {card.card_number?'• #'+card.card_number:''}</Text>
              <Text style={[styles.previewMeta,{color:colors.muted}]}>{card.rarity??'Sem raridade'}</Text>
              <View style={styles.previewTypeRow}>{types.map((type)=><View key={String(type)} style={[styles.previewTypeChip,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Text style={[styles.previewTypeText,{color:colors.text}]}>{String(type).toUpperCase()}</Text></View>)}</View>
              <View style={[styles.previewPriceBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                <Text style={[styles.previewPriceLabel,{color:colors.muted}]}>VALOR DE MERCADO</Text>
                <Text style={[styles.previewPriceValue,{color:'#65D894'}]}>{card.market_price_usd==null?'US$ —':formatUsd(Number(card.market_price_usd))}</Text>
                {detail?.owned?<Text style={[styles.previewOwned,{color:colors.muted}]}>Você possui {detail.quantity} cópia(s) na Bag.</Text>:null}
              </View>
            </View>
          </View>

          {gameProfile?<>
            <View style={styles.previewSectionRow}>
              <Text style={[styles.previewSectionTitle,{color:colors.text}]}>Batalha</Text>
              <View style={[styles.engineBadge,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Text style={[styles.engineBadgeText,{color:colors.accent}]}>GAME_V1 • LV {gameProfile.stats.level}</Text></View>
            </View>
            <View style={styles.previewStatsGrid}>
              <PreviewStat label="HP" value={String(gameProfile.stats.hp)} icon="heart" colors={colors}/>
              <PreviewStat label="ATAQUE" value={String(gameProfile.stats.attack)} icon="flash" colors={colors}/>
              <PreviewStat label="DEFESA" value={String(gameProfile.stats.defense)} icon="shield" colors={colors}/>
              <PreviewStat label="SP. ATK" value={String(gameProfile.stats.spAttack)} icon="sparkles" colors={colors}/>
              <PreviewStat label="SP. DEF" value={String(gameProfile.stats.spDefense)} icon="shield-checkmark" colors={colors}/>
              <PreviewStat label="SPEED" value={String(gameProfile.stats.speed)} icon="speedometer" colors={colors}/>
            </View>
            <View style={[styles.previewAbility,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Text style={[styles.previewPriceLabel,{color:colors.muted}]}>HABILIDADE</Text>
              <Text style={[styles.previewAbilityName,{color:colors.text}]}>{gameProfile.ability?formatGameIdentifier(gameProfile.ability):'Nenhuma'}</Text>
            </View>
            <Text style={[styles.previewSectionTitle,{color:colors.text}]}>Golpes</Text>
            <View style={styles.previewMoveGrid}>{gameProfile.moves.map((move)=><View key={move.id} style={[styles.previewMove,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <View style={styles.previewMoveHead}><Text style={[styles.previewMoveName,{color:colors.text}]}>{formatGameIdentifier(move.identifier)}</Text><Text style={[styles.previewDamage,{color:colors.yellow}]}>{move.power??'—'}</Text></View>
              <Text style={[styles.previewMoveCost,{color:colors.accent}]}>{move.type.toUpperCase()} • {String(move.category).toUpperCase()} • PP {move.pp} • Precisão {move.accuracy==null?'—':move.accuracy+'%'}</Text>
            </View>)}</View>
          </>:<View style={[styles.previewDefenseRow,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.previewDefenseText,{color:colors.muted}]}>Esta carta não possui perfil game_v1 disponível.</Text></View>}

          <View style={styles.previewActions}>
            <Pressable onPress={()=>onOpenFullCard(card.id)} style={[styles.previewSecondaryButton,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Ionicons name="open-outline" size={18} color={colors.accent}/>
              <Text style={[styles.previewSecondaryText,{color:colors.text}]}>ABRIR DETALHE COMPLETO</Text>
            </Pressable>
            {sellEntry?<Pressable onPress={onSelectForSale} style={[styles.previewSellButton,{backgroundColor:colors.yellow}]}>
              <Ionicons name="pricetag" size={20} color="#07111F"/>
              <Text style={styles.previewSellText}>ESCOLHER PARA VENDER</Text>
            </Pressable>:null}
          </View>
        </ScrollView>:null}
      </View>
    </View>
  </Modal>;
}

function PreviewStat({label,value,icon,colors}:{label:string;value:string;icon:keyof typeof Ionicons.glyphMap;colors:any}){
  return <View style={[styles.previewStat,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <Ionicons name={icon} size={17} color={colors.accent}/>
    <Text style={[styles.previewStatValue,{color:colors.text}]}>{value}</Text>
    <Text style={[styles.previewStatLabel,{color:colors.muted}]}>{label}</Text>
  </View>;
}

function GuideMetric({label,value}:{label:string;value:string}){const{colors}=useAppTheme();return <View style={styles.priceGuideMetric}><Text style={[styles.priceGuideMetricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.priceGuideMetricValue,{color:colors.text}]}>{value}</Text></View>;}

function MarketplaceComparePanel({
  items,
  profiles,
  loadingCardId,
  onRemove,
  onClear,
}:{
  items:MarketplaceListing[];
  profiles:Record<string,CardGameProfile|null>;
  loadingCardId:string|null;
  onRemove:(listingId:string)=>void;
  onClear:()=>void;
}){
  const {colors}=useAppTheme();
  return <View style={[styles.comparePanel,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
    <View style={styles.compareHead}>
      <View style={{flex:1}}>
        <Text style={[styles.compareKicker,{color:colors.yellow}]}>COMPARAÇÃO RÁPIDA</Text>
        <Text style={[styles.compareTitle,{color:colors.text}]}>{items.length===1?'Escolha mais um anúncio':'Duas cartas lado a lado'}</Text>
      </View>
      <Pressable onPress={onClear} style={[styles.compareClear,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="close" size={16} color={colors.muted}/><Text style={[styles.compareClearText,{color:colors.muted}]}>LIMPAR</Text></Pressable>
    </View>
    <View style={styles.compareGrid}>
      {items.map((item)=>{
        const profile=profiles[item.card.id];
        const marketTotal=item.card.marketPriceUsd==null?null:item.card.marketPriceUsd*item.quantity;
        const coinsPerUsd=marketTotal&&marketTotal>0?Math.round(item.price/marketTotal):null;
        return <View key={item.id} style={[styles.compareCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
          <View style={styles.compareCardHead}>
            {item.card.image?<Image source={{uri:item.card.image}} style={styles.compareImage} resizeMode="contain"/>:<View style={[styles.compareImage,{backgroundColor:colors.surface}]}/>}
            <View style={{flex:1,minWidth:0}}>
              <Text numberOfLines={1} style={[styles.compareName,{color:colors.text}]}>{item.card.name}</Text>
              <Text numberOfLines={1} style={[styles.compareMeta,{color:colors.muted}]}>@{item.sellerName} • {item.quantity}×</Text>
              <Text style={[styles.compareCoins,{color:colors.yellow}]}>🪙 {item.price.toLocaleString('pt-BR')}</Text>
              <Text style={[styles.compareUsd,{color:colors.muted}]}>Mercado {marketTotal==null?'—':formatUsd(marketTotal)}</Text>
            </View>
            <Pressable onPress={()=>onRemove(item.id)} style={styles.compareRemove}><Ionicons name="close-circle" size={20} color={colors.muted}/></Pressable>
          </View>
          {loadingCardId===item.card.id?<ActivityIndicator color={colors.accent}/>:profile?<View style={styles.compareStats}>
            <CompareMetric label="HP" value={profile.stats.hp}/>
            <CompareMetric label="ATK" value={profile.stats.attack}/>
            <CompareMetric label="DEF" value={profile.stats.defense}/>
            <CompareMetric label="SP.ATK" value={profile.stats.spAttack}/>
            <CompareMetric label="SP.DEF" value={profile.stats.spDefense}/>
            <CompareMetric label="SPEED" value={profile.stats.speed}/>
          </View>:<Text style={[styles.compareUnavailable,{color:colors.muted}]}>Perfil game_v1 indisponível.</Text>}
          {coinsPerUsd!=null&&Number.isFinite(coinsPerUsd)?<Text style={[styles.compareSignal,{color:colors.muted}]}>{coinsPerUsd.toLocaleString('pt-BR')} coins por US$ 1 de valor de mercado</Text>:null}
        </View>;
      })}
      {items.length<2?<View style={[styles.comparePlaceholder,{borderColor:colors.border}]}><Ionicons name="add-circle-outline" size={28} color={colors.muted}/><Text style={[styles.comparePlaceholderText,{color:colors.muted}]}>Toque em COMPARAR em outro anúncio.</Text></View>:null}
    </View>
  </View>;
}

function CompareMetric({label,value}:{label:string;value:number}){
  const {colors}=useAppTheme();
  return <View style={[styles.compareMetric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.compareMetricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.compareMetricValue,{color:colors.text}]}>{value}</Text></View>;
}

function ListingCard({item,myId,working,comparing,onBuy,onOffer,onPreview,onCompare}:{item:MarketplaceListing;myId:string;working:boolean;comparing:boolean;onBuy:(item:MarketplaceListing)=>void;onOffer:(item:MarketplaceListing)=>void;onPreview:(item:MarketplaceListing)=>void;onCompare:(item:MarketplaceListing)=>void}){
  const {colors}=useAppTheme();
  const themeColor=
    item.shopTheme==='guild'?(item.guild?.color??colors.accent):
    item.shopTheme==='night'?'#9B7BFF':
    item.shopTheme==='royal'?'#FFD447':
    item.shopTheme==='neon'?'#45F3FF':
    item.shopTheme==='master'?'#C493FF':
    item.shopTheme==='celestial'?'#8EE7FF':
    item.shopTheme==='galaxy'?'#8B5CFF':
    colors.yellow;
  const listingBoosted=Boolean(item.boostedUntil&&new Date(item.boostedUntil).getTime()>Date.now());
  const shopBoosted=Boolean(item.shopHighlightUntil&&new Date(item.shopHighlightUntil).getTime()>Date.now());
  const premiumTheme=['night','royal','neon','master','celestial','galaxy'].includes(item.shopTheme);
  return <AuraFrame primaryColor={listingBoosted?colors.yellow:themeColor} secondaryColor={item.shopTheme==='galaxy'?'#55E6FF':themeColor} intensity={listingBoosted||item.shopTheme==='galaxy'?'premium':'soft'} variant={item.shopTheme==='galaxy'?'galaxy':'energy'} radius={19}>
    <MarketplaceListingSurface theme={item.shopTheme} accent={themeColor} boosted={listingBoosted} style={styles.listingSurface}>
      <View style={[
        styles.listing,
        {
          backgroundColor:item.shopTheme==='galaxy'
            ? 'rgba(23,12,37,.91)'
            : premiumTheme
              ? 'rgba(20,22,34,.94)'
              : colors.surface,
          borderColor:listingBoosted?colors.yellow:themeColor,
          borderWidth:listingBoosted||premiumTheme?1.5:1,
        },
      ]}>
        <View pointerEvents="none" style={[styles.listingThemeGlow,{backgroundColor:themeColor,opacity:premiumTheme?.16:.055}]}/>
        <View pointerEvents="none" style={[styles.listingThemeEdge,{backgroundColor:listingBoosted?colors.yellow:themeColor,opacity:listingBoosted?.95:premiumTheme?.68:.45}]}/>
        <View style={[
          styles.sellerRow,
          premiumTheme&&styles.premiumInnerPanel,
          premiumTheme&&{borderColor:`${themeColor}38`},
        ]}>
          <TrainerAvatar icon={item.sellerIcon} size={38} color={themeColor} backgroundColor={premiumTheme?`${themeColor}18`:colors.surfaceAlt}/>
          <View style={{flex:1}}>
            <View style={styles.shopTitleRow}><Text style={[styles.shopName,{color:colors.text}]}>{item.shopName}</Text>{shopBoosted?<View style={[styles.premiumBadge,{backgroundColor:colors.accentSoft}]}><Ionicons name="sparkles" size={11} color={colors.yellow}/><Text style={[styles.premiumText,{color:colors.yellow}]}>LOJA EM DESTAQUE</Text></View>:null}</View>
            <Text style={[styles.sellerName,{color:colors.muted}]}>@{item.sellerName}{item.guild?` • ${item.guild.name}`:''}</Text>
          </View>
          {listingBoosted?<View style={[styles.boostBadge,{backgroundColor:'#332B11'}]}><Ionicons name="rocket" size={13} color="#FFD447"/><Text style={styles.boostText}>IMPULSIONADO</Text></View>:null}
        </View>

        <Pressable onPress={()=>onPreview(item)} style={[
          styles.cardRow,
          premiumTheme&&styles.premiumCardPanel,
          premiumTheme&&{borderColor:`${themeColor}2F`},
        ]}>
          {item.card.image?<Image source={{uri:item.card.image}} resizeMode="contain" style={[styles.cardImage,premiumTheme&&{borderWidth:1,borderColor:`${themeColor}88`} ]}/>:<View style={[styles.cardImage,{backgroundColor:colors.surfaceAlt}]}/>}
          <View style={{flex:1}}>
            <Text style={[styles.cardName,{color:colors.text}]}>{item.card.name}</Text>
            <Text style={[styles.cardMeta,{color:colors.muted}]}>{item.card.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text>
            <Text style={[styles.price,{color:item.shopTheme==='royal'?themeColor:colors.yellow}]}>🪙 {item.price.toLocaleString('pt-BR')}</Text>
            <Text style={[styles.marketUsd,{color:colors.muted}]}>Mercado USD: {item.card.marketPriceUsd == null ? '—' : formatUsd(item.card.marketPriceUsd * item.quantity)}{item.quantity > 1 && item.card.marketPriceUsd != null ? ` • ${formatUsd(item.card.marketPriceUsd)} cada` : ''}</Text>
            <Text style={[styles.cardPreviewHint,{color:themeColor}]}>TOQUE PARA ABRIR A CARTA E VER ESTATÍSTICAS</Text>
          </View>
          <Ionicons name="expand-outline" size={19} color={themeColor}/>
        </Pressable>

        <View style={styles.listingActions}>
          <Pressable
            disabled={item.sellerId===myId||working}
            onPress={()=>onBuy(item)}
            style={[
              styles.buyButton,
              styles.flexButton,
              item.sellerId===myId
                ? [styles.ownOfferButton,{backgroundColor:`${themeColor}14`,borderColor:`${themeColor}72`}]
                : {backgroundColor:colors.yellow},
            ]}
          >
            <Ionicons name={item.sellerId===myId?'storefront':'cart'} size={18} color={item.sellerId===myId?themeColor:'#07111F'}/>
            <Text style={[styles.buyText,item.sellerId===myId&&{color:themeColor}]}>{item.sellerId===myId?'SUA OFERTA':'COMPRAR'}</Text>
          </Pressable>
          {item.sellerId!==myId?<Pressable disabled={working} onPress={()=>onOffer(item)} style={[styles.buyButton,styles.flexButton,{backgroundColor:premiumTheme?`${themeColor}12`:colors.accentSoft,borderWidth:1,borderColor:premiumTheme?themeColor:colors.accent}]}><Ionicons name="chatbubble-ellipses" size={18} color={premiumTheme?themeColor:colors.accent}/><Text style={[styles.buyText,{color:colors.text}]}>FAZER OFERTA</Text></Pressable>:null}
          <Pressable onPress={()=>void onCompare(item)} style={[styles.compareButton,{backgroundColor:comparing?`${themeColor}22`:colors.surfaceAlt,borderColor:comparing?themeColor:colors.border}]}><Ionicons name={comparing?'checkmark-circle':'git-compare-outline'} size={17} color={comparing?themeColor:colors.muted}/><Text style={[styles.compareButtonText,{color:comparing?themeColor:colors.text}]}>{comparing?'SELECIONADA':'COMPARAR'}</Text></Pressable>
        </View>
      </View>
    </MarketplaceListingSurface>
  </AuraFrame>;
}

const styles=StyleSheet.create({
  priceGuide:{borderRadius:15,borderWidth:1,padding:10,gap:8},priceGuideHead:{flexDirection:'row',alignItems:'center',gap:8},priceGuideTitle:{fontSize:8,fontWeight:'900',letterSpacing:.6},priceGuideHint:{fontSize:6.8,lineHeight:10,marginTop:2},priceGuideMetrics:{flexDirection:'row',flexWrap:'wrap',gap:6},priceGuideMetric:{flexGrow:1,flexBasis:100,minWidth:95},priceGuideMetricLabel:{fontSize:5.8,fontWeight:'900'},priceGuideMetricValue:{fontSize:9,fontWeight:'900',marginTop:2},useSuggestion:{alignSelf:'flex-start',minHeight:34,borderRadius:10,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},useSuggestionText:{fontSize:7,fontWeight:'900'},

  compareHint:{fontSize:7.5,fontWeight:'700',marginTop:2},
  comparePanel:{borderRadius:19,borderWidth:1,padding:12,gap:10},
  compareHead:{flexDirection:'row',alignItems:'center',gap:9},
  compareKicker:{fontSize:7,fontWeight:'900',letterSpacing:.8},
  compareTitle:{fontSize:15,fontWeight:'900',marginTop:2},
  compareClear:{minHeight:34,borderRadius:10,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:4},
  compareClearText:{fontSize:7,fontWeight:'900'},
  compareGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  compareCard:{flexGrow:1,flexBasis:280,minWidth:250,borderRadius:16,borderWidth:1,padding:9,gap:8},
  compareCardHead:{flexDirection:'row',alignItems:'center',gap:8},
  compareImage:{width:50,height:68,borderRadius:6},
  compareName:{fontSize:11.5,fontWeight:'900'},
  compareMeta:{fontSize:7.5,marginTop:2},
  compareCoins:{fontSize:12,fontWeight:'900',marginTop:4},
  compareUsd:{fontSize:7.5,marginTop:2},
  compareRemove:{width:28,height:28,alignItems:'center',justifyContent:'center'},
  compareStats:{flexDirection:'row',flexWrap:'wrap',gap:5},
  compareMetric:{flexGrow:1,flexBasis:62,minWidth:58,borderRadius:9,borderWidth:1,padding:6},
  compareMetricLabel:{fontSize:5.8,fontWeight:'900'},
  compareMetricValue:{fontSize:10.5,fontWeight:'900',marginTop:2},
  compareUnavailable:{fontSize:7.5,fontWeight:'700'},
  compareSignal:{fontSize:7,fontWeight:'800'},
  comparePlaceholder:{flexGrow:1,flexBasis:280,minWidth:250,minHeight:150,borderRadius:16,borderWidth:1,borderStyle:'dashed',alignItems:'center',justifyContent:'center',gap:6,padding:14},
  comparePlaceholderText:{fontSize:8,textAlign:'center',fontWeight:'700'},
  compareButton:{minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  compareButtonText:{fontSize:8,fontWeight:'900'},
  previewBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',alignItems:'center',justifyContent:'center',padding:12},
  previewSheet:{width:'100%',maxWidth:780,maxHeight:'90%',borderRadius:22,borderWidth:1,overflow:'hidden'},
  previewSectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  engineBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:8,paddingVertical:5},
  engineBadgeText:{fontSize:6.5,fontWeight:'900'},
  previewAbility:{borderRadius:13,borderWidth:1,padding:10},
  previewAbilityName:{fontSize:12,fontWeight:'900',marginTop:3},
  previewMoveGrid:{gap:7},
  previewActions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:4},
  previewSecondaryButton:{flexGrow:1,minWidth:190,minHeight:50,borderRadius:14,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
  previewSecondaryText:{fontSize:8,fontWeight:'900'},
  marketUsd:{fontSize:9,fontWeight:'800',marginTop:3},
  safe:{flex:1,overflow:'hidden'},marketNav:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8},offersLink:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},offersLinkText:{fontSize:8,fontWeight:'900'},offerBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.75)',alignItems:'center',justifyContent:'center',padding:15},offerModal:{width:'100%',maxWidth:460,borderRadius:22,borderWidth:1,padding:16,gap:10},offerHead:{flexDirection:'row',alignItems:'center',gap:9},offerHint:{fontSize:8,lineHeight:13},listingActions:{flexDirection:'row',flexWrap:'wrap',gap:7},flexButton:{flexGrow:1,flexBasis:140},content:{width:'100%',maxWidth:1120,alignSelf:'center',paddingHorizontal:14,paddingTop:12,paddingBottom:110,gap:9},marketHeroStats:{flexDirection:'row',flexWrap:'wrap',gap:7},marketHeroStat:{flexGrow:1,minWidth:125,borderRadius:13,borderWidth:1,padding:9},marketHeroValue:{fontSize:13,fontWeight:'900'},marketHeroLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.6,marginTop:2},headerStack:{gap:13,marginBottom:4},top:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',justifyContent:'space-between',gap:10},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5},pageTitle:{fontSize:29,fontWeight:'900',letterSpacing:-.5},subtitle:{fontSize:11,lineHeight:17,marginTop:3},back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:11,fontWeight:'800'},
  notice:{borderRadius:14,borderWidth:1,borderColor:'#4A9B70',backgroundColor:'#142C23',padding:11,flexDirection:'row',alignItems:'center',gap:8},noticeText:{flex:1,color:'#D9FFEC',fontSize:10,fontWeight:'800'},error:{borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  shopPanel:{borderRadius:20,borderWidth:1,padding:14,gap:10},shopPreview:{minHeight:88,borderRadius:16,borderWidth:1,padding:11,position:'relative',overflow:'hidden',flexDirection:'row',alignItems:'center',gap:9},shopPreviewGlow:{position:'absolute',right:-55,top:-75,width:180,height:180,borderRadius:999,opacity:.16},shopPreviewIcon:{width:45,height:45,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center',zIndex:2},shopPreviewKicker:{fontSize:6.5,fontWeight:'900',letterSpacing:.65},shopPreviewName:{fontSize:13,fontWeight:'900',marginTop:2},shopPreviewMeta:{fontSize:7.5,marginTop:2},shopPreviewPremium:{borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4,zIndex:2},shopPreviewPremiumText:{fontSize:6,fontWeight:'900'},sectionHead:{flexDirection:'row',alignItems:'center',gap:10},sectionIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:17,fontWeight:'900'},sectionHint:{fontSize:9,lineHeight:14,marginTop:2},input:{minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:12,fontSize:13,fontWeight:'800'},themeRow:{flexDirection:'row',flexWrap:'wrap',gap:7},themeChip:{borderRadius:11,borderWidth:1,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:5},themeText:{fontSize:8,fontWeight:'900'},secondaryButton:{minHeight:46,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},secondaryText:{fontSize:9,fontWeight:'900'},
  cardSelector:{borderRadius:15,borderWidth:1,minHeight:72,padding:8,flexDirection:'row',alignItems:'center',gap:10},selectorImage:{width:43,height:57},selectorTitle:{fontSize:13,fontWeight:'900'},selectorHint:{fontSize:9,marginTop:3},formRow:{flexDirection:'row',flexWrap:'wrap',gap:8},formField:{flexGrow:1,flexBasis:150,minWidth:140,gap:5},label:{fontSize:7,fontWeight:'900',letterSpacing:.9},feePreview:{minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7},feePreviewText:{fontSize:9,fontWeight:'800',flex:1},primaryButton:{minHeight:51,borderRadius:15,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},primaryText:{color:'#07111F',fontSize:10,fontWeight:'900'},
  searchBox:{minHeight:49,borderRadius:15,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8},searchInput:{flex:1,minHeight:47,fontSize:12},listTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},listTitle:{fontSize:20,fontWeight:'900'},count:{fontSize:14,fontWeight:'900'},
  listingSurface:{marginBottom:9},listing:{borderRadius:19,borderWidth:1,padding:12,gap:10,position:'relative',overflow:'hidden'},listingThemeGlow:{position:'absolute',right:-70,top:-85,width:190,height:190,borderRadius:999},listingThemeEdge:{position:'absolute',left:0,right:0,top:0,height:2},sellerRow:{flexDirection:'row',alignItems:'center',gap:9},premiumInnerPanel:{borderWidth:1,borderRadius:15,padding:9,backgroundColor:'rgba(255,255,255,.025)'},premiumCardPanel:{borderWidth:1,borderRadius:16,padding:9,backgroundColor:'rgba(255,255,255,.018)'},shopTitleRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},shopName:{fontSize:13,fontWeight:'900'},sellerName:{fontSize:8,marginTop:2},premiumBadge:{borderRadius:999,paddingHorizontal:6,paddingVertical:3,flexDirection:'row',alignItems:'center',gap:3},premiumText:{fontSize:6,fontWeight:'900'},boostBadge:{borderRadius:999,paddingHorizontal:7,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4},boostText:{color:'#FFD447',fontSize:6,fontWeight:'900'},cardRow:{flexDirection:'row',alignItems:'center',gap:11},cardImage:{width:65,height:87,borderRadius:7},cardName:{fontSize:16,fontWeight:'900'},cardMeta:{fontSize:9,marginTop:3},price:{fontSize:15,fontWeight:'900',marginTop:8},buyButton:{minHeight:45,borderRadius:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},ownOfferButton:{borderWidth:1.2,overflow:'hidden'},buyText:{color:'#07111F',fontSize:9,fontWeight:'900'},
  footer:{gap:8,marginTop:12},myRow:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:8},myName:{flex:1,fontSize:11,fontWeight:'900'},status:{fontSize:8,fontWeight:'900'},removeButton:{width:32,height:32,borderRadius:10,backgroundColor:'#351A24',alignItems:'center',justifyContent:'center'},empty:{borderRadius:18,borderWidth:1,padding:24,alignItems:'center',gap:8},emptyText:{fontSize:10,lineHeight:15},
  pickerSafe:{flex:1},pickerHeader:{padding:14,flexDirection:'row',alignItems:'center',gap:10},pickerList:{padding:14,gap:8},inventoryRow:{borderRadius:15,borderWidth:1,padding:8,gap:8},inventoryPreviewTap:{flexDirection:'row',alignItems:'center',gap:10},inventoryImage:{width:49,height:66,borderRadius:6},inventoryName:{fontSize:13,fontWeight:'900'},inventoryMeta:{fontSize:9,marginTop:3},inventoryPreviewHint:{fontSize:6.5,fontWeight:'900',letterSpacing:.45,marginTop:5},inventorySelect:{minHeight:38,borderRadius:11,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},inventorySelectText:{fontSize:8,fontWeight:'900'},inventoryCount:{fontSize:8,fontWeight:'800',paddingHorizontal:16,paddingTop:8},cardPreviewHint:{fontSize:6.5,fontWeight:'900',letterSpacing:.4,marginTop:7},
  previewSafe:{flex:1},previewHeader:{minHeight:70,paddingHorizontal:15,paddingVertical:10,borderBottomWidth:1,flexDirection:'row',alignItems:'center',gap:10,zIndex:3},previewKicker:{fontSize:7,fontWeight:'900',letterSpacing:1.2},previewTitle:{fontSize:19,fontWeight:'900',marginTop:3},previewClose:{width:42,height:42,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},previewLoading:{flex:1,alignItems:'center',justifyContent:'center',gap:10},previewLoadingText:{fontSize:10,fontWeight:'800'},previewContent:{width:'100%',maxWidth:760,alignSelf:'center',padding:16,paddingBottom:60,gap:12},previewHero:{flexDirection:'row',flexWrap:'wrap',gap:16,alignItems:'center',justifyContent:'center'},previewCardImage:{width:250,height:350,borderRadius:13},previewIdentity:{flex:1,minWidth:220,maxWidth:390},previewName:{fontSize:26,fontWeight:'900'},previewMeta:{fontSize:10,fontWeight:'700',marginTop:4},previewTypeRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10},previewTypeChip:{borderRadius:999,borderWidth:1,paddingHorizontal:9,paddingVertical:5},previewTypeText:{fontSize:7,fontWeight:'900'},previewPriceBox:{borderRadius:14,borderWidth:1,padding:12,marginTop:12},previewPriceLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8},previewPriceValue:{fontSize:19,fontWeight:'900',marginTop:4},previewOwned:{fontSize:8,fontWeight:'700',marginTop:4},previewSectionTitle:{fontSize:17,fontWeight:'900',marginTop:7},previewStatsGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},previewStat:{flexGrow:1,flexBasis:105,minWidth:105,borderRadius:13,borderWidth:1,padding:10,alignItems:'center',gap:3},previewStatValue:{fontSize:18,fontWeight:'900'},previewStatLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.45,textAlign:'center'},previewRating:{borderRadius:14,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:10},previewRatingValue:{fontSize:26,fontWeight:'900',marginTop:2},previewMiniStat:{fontSize:8,fontWeight:'800',marginVertical:1},previewMove:{borderRadius:14,borderWidth:1,padding:11,gap:5},previewMoveHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},previewMoveName:{fontSize:14,fontWeight:'900',flex:1},previewDamage:{fontSize:17,fontWeight:'900'},previewMoveCost:{fontSize:8,fontWeight:'900'},previewMoveText:{fontSize:9,lineHeight:14,fontWeight:'700'},previewEmptyText:{fontSize:9,lineHeight:14},previewDefenseRow:{borderRadius:14,borderWidth:1,padding:11,gap:6},previewDefenseText:{fontSize:9,fontWeight:'800'},previewSellButton:{minHeight:52,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:6},previewSellText:{color:'#07111F',fontSize:9,fontWeight:'900',textAlign:'center'},
});
