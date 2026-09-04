import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { listPacks, type OpenedCard, type Pack } from '@/services/packs';
import { autoOpenPacks, getBoosterPerks, type BoosterPerks } from '@/services/boosterPerks';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';
import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';

const PRESETS = [1,5,10,25,50];
const PACK_ROW_HEIGHT = 94;

export default function AutoOpenScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [packs,setPacks]=useState<Pack[]>([]);
  const [perks,setPerks]=useState<BoosterPerks|null>(null);
  const [selectedPackId,setSelectedPackId]=useState<string|null>(null);
  const [quantityText,setQuantityText]=useState('5');
  const [cards,setCards]=useState<OpenedCard[]>([]);
  const [lastSummary,setLastSummary]=useState<{quantity:number;coins:number;diamonds:number;lucky:number}|null>(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [packPickerOpen,setPackPickerOpen]=useState(false);
  const [packSearch,setPackSearch]=useState('');

  const load=useCallback(async()=>{
    try{
      setLoading(true);setError(null);
      const [packRows,perkState]=await Promise.all([listPacks(),getBoosterPerks()]);
      setPacks(packRows);
      setPerks(perkState);
      setSelectedPackId((current)=>current&&packRows.some((pack)=>pack.id===current)?current:packRows[0]?.id??null);
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar a abertura automática.');}
    finally{setLoading(false);}
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  const selectedPack=useMemo(()=>packs.find((pack)=>pack.id===selectedPackId)??null,[packs,selectedPackId]);
  const quantity=useMemo(()=>Math.max(1,Math.min(Number(perks?.maxAutoOpenQuantity??50),Number(quantityText.replace(/[^0-9]/g,''))||1)),[perks?.maxAutoOpenQuantity,quantityText]);
  const total=selectedPack?selectedPack.price*quantity:0;
  const balance=selectedPack?.currency==='diamonds'?wallet.diamonds:wallet.coins;
  const enough=Boolean(selectedPack&&balance>=total);
  const luckyCount=Math.min(perks?.lucky2xUses??0,quantity);

  const filteredPacks=useMemo(()=>{
    const term=packSearch.trim().toLowerCase();
    if(!term)return packs;
    return packs.filter((pack)=>pack.name.toLowerCase().includes(term)||pack.set_id.toLowerCase().includes(term));
  },[packSearch,packs]);

  const summaryCards=useMemo(()=>{
    const map=new Map<string,{card:OpenedCard;quantity:number}>();
    for(const card of cards){const current=map.get(card.id);if(current)current.quantity+=1;else map.set(card.id,{card,quantity:1});}
    return [...map.values()].sort((a,b)=>Number(b.card.marketPriceUsd??0)-Number(a.card.marketPriceUsd??0)).slice(0,60);
  },[cards]);

  async function runAutoOpen(){
    if(!selectedPack||!perks?.autoOpenGamepass||working)return;
    if(!enough){setError(`Saldo insuficiente. O lote custa ${selectedPack.currency==='diamonds'?'💎':'🪙'} ${total.toLocaleString('pt-BR')}.`);return;}
    try{
      setWorking(true);setError(null);setCards([]);setLastSummary(null);
      const result=await autoOpenPacks(selectedPack.id,quantity);
      setCards(result.cards);
      setLastSummary({quantity:result.quantity,coins:result.totalCoinsSpent,diamonds:result.totalDiamondsSpent,lucky:result.lucky2xUsedCount});
      await Promise.all([wallet.refresh(),load()]);
    }catch(e){await wallet.refresh().catch(()=>null);setError(e instanceof Error?e.message:'Não foi possível concluir a abertura automática.');}
    finally{setWorking(false);}
  }

  function confirm(){
    if(!selectedPack||working)return;
    const message=`Abrir ${quantity}x ${selectedPack.name}?\n\nCusto total: ${selectedPack.currency==='diamonds'?'💎':'🪙'} ${total.toLocaleString('pt-BR')}\n2× Lucky usado em até ${luckyCount} abertura(s).\n\nO servidor faz o lote inteiro de uma vez e mostra o resumo no final.`;
    if(Platform.OS==='web'){void runAutoOpen();return;}
    Alert.alert('Confirmar abertura automática',message,[{text:'Cancelar',style:'cancel'},{text:'ABRIR TUDO',onPress:()=>{void runAutoOpen();}}]);
  }

  function selectPack(pack:Pack){
    setSelectedPackId(pack.id);
    setPackPickerOpen(false);
    setPackSearch('');
    setError(null);
  }

  if(loading&&!perks){return <Screen title="Auto Booster" subtitle="Gamepass de abertura automática"><ActivityIndicator size="large" color={colors.yellow}/></Screen>;}

  return (
    <Screen title="Auto Booster" subtitle="Escolha o booster, a quantidade e veja o custo total antes de abrir.">
      <Pressable style={styles.back} onPress={()=>goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted}/><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>

      <View style={[styles.hero,{backgroundColor:colors.surface,borderColor:perks?.autoOpenGamepass?'#59D49A':colors.yellow}]}>
        <View style={[styles.heroIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={perks?.autoOpenGamepass?'flash':'lock-closed'} size={28} color={perks?.autoOpenGamepass?'#59D49A':colors.yellow}/></View>
        <View style={{flex:1}}><Text style={[styles.kicker,{color:colors.yellow}]}>GAMEPASS AUTO BOOSTER</Text><Text style={[styles.title,{color:colors.text}]}>{perks?.autoOpenGamepass?'ATIVA NA SUA CONTA':'GAMEPASS NECESSÁRIA'}</Text><Text style={[styles.helper,{color:colors.muted}]}>{perks?.autoOpenGamepass?'Você pode abrir até 50 boosters por lote.':'Compra somente por dinheiro real. Fale diretamente com '+(perks?.contactOwnerUsername?'@'+perks.contactOwnerUsername:'o dono do jogo')+'; depois da confirmação ele ativa manualmente sua conta.'}</Text></View>
      </View>

      <View style={[styles.perkRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <View style={styles.perk}><Text style={[styles.perkLabel,{color:colors.muted}]}>2× LUCKY</Text><Text style={[styles.perkValue,{color:colors.yellow}]}>✨ {Number(perks?.lucky2xUses??0)}</Text></View>
        <View style={styles.perk}><Text style={[styles.perkLabel,{color:colors.muted}]}>SALDO</Text><Text style={[styles.perkValue,{color:colors.text}]}>🪙 {wallet.coins.toLocaleString('pt-BR')} • 💎 {wallet.diamonds.toLocaleString('pt-BR')}</Text></View>
      </View>

      {error?<Pressable onPress={()=>setError(null)} style={[styles.notice,{backgroundColor:'#351A24',borderColor:'#683243'}]}><Ionicons name="alert-circle" size={18} color="#FF8998"/><Text style={styles.errorText}>{error}</Text></Pressable>:null}

      <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.sectionTitle,{color:colors.text}]}>1. Escolha o booster</Text>
        <Pressable onPress={()=>setPackPickerOpen(true)} style={[styles.selectedPack,{backgroundColor:colors.surfaceAlt,borderColor:colors.accent}]}>
          {selectedPack?.booster_art_url?<Image source={{uri:selectedPack.booster_art_url}} style={styles.selectedPackImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0}/>:<View style={[styles.selectedPackImage,{backgroundColor:colors.bg}]}/>} 
          <View style={{flex:1,minWidth:0}}>
            <Text style={[styles.selectedPackLabel,{color:colors.muted}]}>BOOSTER SELECIONADO</Text>
            <Text numberOfLines={2} style={[styles.selectedPackName,{color:colors.text}]}>{selectedPack?.name??'Escolha um booster'}</Text>
            <Text style={[styles.packPrice,{color:colors.yellow}]}>{selectedPack?(selectedPack.currency==='diamonds'?'💎':'🪙')+' '+selectedPack.price.toLocaleString('pt-BR'):'—'}</Text>
          </View>
          <View style={[styles.changePack,{backgroundColor:colors.accentSoft}]}><Ionicons name="swap-horizontal" size={17} color={colors.accent}/><Text style={[styles.changePackText,{color:colors.accent}]}>TROCAR</Text></View>
        </Pressable>
        <Text style={[styles.serverHint,{color:colors.muted}]}>A lista completa abre em um seletor virtualizado: somente os boosters visíveis ficam renderizados enquanto você arrasta.</Text>
      </View>

      <View style={[styles.panel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
        <Text style={[styles.sectionTitle,{color:colors.text}]}>2. Quantos abrir?</Text>
        <View style={styles.presets}>{PRESETS.map((value)=><Pressable key={value} onPress={()=>setQuantityText(String(value))} style={[styles.preset,{backgroundColor:quantity===value?colors.yellow:colors.surfaceAlt,borderColor:quantity===value?colors.yellow:colors.border}]}><Text style={[styles.presetText,{color:quantity===value?'#07111F':colors.text}]}>{value}x</Text></Pressable>)}</View>
        <TextInput value={quantityText} onChangeText={(value)=>setQuantityText(value.replace(/[^0-9]/g,'').slice(0,2))} keyboardType="number-pad" maxLength={2} style={[styles.quantityInput,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]} placeholder="Quantidade" placeholderTextColor={colors.muted}/>

        <View style={[styles.quote,{backgroundColor:colors.accentSoft,borderColor:enough?colors.accent:'#FF6978'}]}>
          <View><Text style={[styles.quoteLabel,{color:colors.muted}]}>TOTAL DO LOTE</Text><Text style={[styles.quoteValue,{color:enough?colors.yellow:'#FF8998'}]}>{selectedPack?.currency==='diamonds'?'💎':'🪙'} {total.toLocaleString('pt-BR')}</Text></View>
          <View style={{alignItems:'flex-end'}}><Text style={[styles.quoteLabel,{color:colors.muted}]}>LUCKY NESTE LOTE</Text><Text style={[styles.quoteLucky,{color:colors.text}]}>✨ {luckyCount}/{quantity}</Text></View>
        </View>
        <Text style={[styles.serverHint,{color:colors.muted}]}>O custo mostrado usa o preço atual do booster. Antes de abrir, o servidor valida novamente o saldo, a gamepass e os descontos/eventos ativos.</Text>

        <Pressable disabled={!perks?.autoOpenGamepass||!selectedPack||!enough||working} onPress={confirm} style={[styles.openButton,{backgroundColor:perks?.autoOpenGamepass&&enough?colors.yellow:colors.border,opacity:working?.65:1}]}>{working?<ActivityIndicator color="#07111F"/>:<Ionicons name={perks?.autoOpenGamepass?'flash':'lock-closed'} size={20} color="#07111F"/>}<Text style={styles.openButtonText}>{working?'ABRINDO LOTE...':perks?.autoOpenGamepass?`ABRIR ${quantity} BOOSTER(S)`:'FALE COM O DONO PARA COMPRAR'}</Text></Pressable>
        {!perks?.autoOpenGamepass?<Pressable onPress={()=>router.push('/store')} style={[styles.storeLink,{borderColor:colors.accent}]}><Ionicons name="storefront" size={17} color={colors.accent}/><Text style={[styles.storeLinkText,{color:colors.accent}]}>VER GAMEPASS NA TRAINER SHOP</Text></Pressable>:null}
      </View>

      {lastSummary?<View style={[styles.result,{backgroundColor:colors.surface,borderColor:'#59D49A'}]}><Ionicons name="checkmark-circle" size={26} color="#59D49A"/><View style={{flex:1}}><Text style={[styles.resultTitle,{color:colors.text}]}>{lastSummary.quantity} boosters abertos automaticamente</Text><Text style={[styles.resultText,{color:colors.muted}]}>Gasto: {lastSummary.coins>0?'🪙 '+lastSummary.coins.toLocaleString('pt-BR'):''}{lastSummary.coins>0&&lastSummary.diamonds>0?' • ':''}{lastSummary.diamonds>0?'💎 '+lastSummary.diamonds.toLocaleString('pt-BR'):''} • 2× Lucky usado {lastSummary.lucky}x • {cards.length} cartas recebidas</Text></View></View>:null}

      {summaryCards.length?<><Text style={[styles.sectionTitle,{color:colors.text}]}>Resumo das cartas</Text><View style={styles.cardGrid}>{summaryCards.map(({card,quantity:count})=><View key={card.id} style={[styles.resultCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>{card.image?<Image source={{uri:card.image}} style={styles.cardImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0}/>:null}<View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={[styles.cardName,{color:colors.text}]}>{card.name}</Text><Text style={[styles.cardMeta,{color:colors.muted}]}>x{count} • {card.rarity??'Sem raridade'}</Text>{Number(card.marketPriceUsd)>0?<Text style={[styles.cardPrice,{color:colors.yellow}]}>US$ {Number(card.marketPriceUsd).toFixed(2)}</Text>:null}</View></View>)}</View></>:null}

      <Modal visible={packPickerOpen} transparent animationType="fade" onRequestClose={()=>setPackPickerOpen(false)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={()=>setPackPickerOpen(false)}/>
          <View style={[styles.pickerModal,{backgroundColor:colors.bg,borderColor:colors.border}]}>
            <View style={styles.pickerHeader}>
              <View style={{flex:1,minWidth:0}}><Text style={[styles.kicker,{color:colors.yellow}]}>SELETOR OTIMIZADO</Text><Text style={[styles.pickerTitle,{color:colors.text}]}>Escolha o booster</Text><Text style={[styles.helper,{color:colors.muted}]}>{filteredPacks.length.toLocaleString('pt-BR')} booster(s) • renderização virtualizada</Text></View>
              <Pressable onPress={()=>setPackPickerOpen(false)} style={[styles.pickerClose,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="close" size={20} color={colors.text}/></Pressable>
            </View>
            <View style={[styles.pickerSearch,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={packSearch} onChangeText={setPackSearch} placeholder="Buscar booster ou set..." placeholderTextColor={colors.muted} autoCorrect={false} style={[styles.pickerSearchInput,{color:colors.text}]}/>{packSearch?<Pressable onPress={()=>setPackSearch('')}><Ionicons name="close-circle" size={18} color={colors.muted}/></Pressable>:null}</View>
            <FlatList
              {...VIRTUAL_LIST_PERF_PROPS}
              data={filteredPacks}
              keyExtractor={(pack)=>pack.id}
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              getItemLayout={(_,index)=>({length:PACK_ROW_HEIGHT,offset:PACK_ROW_HEIGHT*index,index})}
              ListEmptyComponent={<View style={styles.emptyPicker}><Ionicons name="search" size={28} color={colors.muted}/><Text style={[styles.helper,{color:colors.muted}]}>Nenhum booster encontrado.</Text></View>}
              renderItem={({item:pack})=>{
                const active=pack.id===selectedPackId;
                return <Pressable onPress={()=>selectPack(pack)} style={[styles.packRow,{height:PACK_ROW_HEIGHT,backgroundColor:active?colors.accentSoft:colors.surface,borderColor:active?colors.accent:colors.border}]}>
                  {pack.booster_art_url?<Image source={{uri:pack.booster_art_url}} style={styles.packImage} resizeMode="contain" resizeMethod="resize" fadeDuration={0}/>:<View style={[styles.packImage,{backgroundColor:colors.surfaceAlt}]}/>} 
                  <View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={[styles.packName,{color:colors.text}]}>{pack.name}</Text><Text numberOfLines={1} style={[styles.packSet,{color:colors.muted}]}>{pack.set_id.toUpperCase()}</Text><Text style={[styles.packPrice,{color:active?colors.yellow:colors.muted}]}>{pack.currency==='diamonds'?'💎':'🪙'} {pack.price.toLocaleString('pt-BR')}</Text></View>
                  <Ionicons name={active?'checkmark-circle':'chevron-forward'} size={21} color={active?colors.accent:colors.muted}/>
                </Pressable>;
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles=StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},hero:{borderRadius:22,borderWidth:1,padding:16,flexDirection:'row',alignItems:'center',gap:12},heroIcon:{width:58,height:58,borderRadius:18,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1.1},title:{fontSize:20,fontWeight:'900',marginTop:2},helper:{fontSize:9,lineHeight:14,marginTop:3},
  perkRow:{borderRadius:17,borderWidth:1,padding:12,flexDirection:'row',flexWrap:'wrap',gap:18},perk:{minWidth:120},perkLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8},perkValue:{fontSize:15,fontWeight:'900',marginTop:3},notice:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},errorText:{flex:1,color:'#FFD7DD',fontSize:9,fontWeight:'800'},panel:{borderRadius:19,borderWidth:1,padding:13,gap:10},sectionTitle:{fontSize:17,fontWeight:'900'},
  selectedPack:{minHeight:96,borderRadius:14,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:10},selectedPackImage:{width:58,height:78,borderRadius:7},selectedPackLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8},selectedPackName:{fontSize:12,fontWeight:'900',marginTop:2},changePack:{minHeight:34,borderRadius:10,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},changePackText:{fontSize:7,fontWeight:'900'},
  presets:{flexDirection:'row',flexWrap:'wrap',gap:7},preset:{minWidth:52,minHeight:37,borderRadius:10,borderWidth:1,alignItems:'center',justifyContent:'center'},presetText:{fontSize:10,fontWeight:'900'},quantityInput:{minHeight:45,borderRadius:12,borderWidth:1,paddingHorizontal:12,fontSize:13,fontWeight:'900'},quote:{borderRadius:14,borderWidth:1,padding:12,flexDirection:'row',justifyContent:'space-between',gap:12},quoteLabel:{fontSize:7,fontWeight:'900',letterSpacing:.8},quoteValue:{fontSize:20,fontWeight:'900',marginTop:3},quoteLucky:{fontSize:16,fontWeight:'900',marginTop:3},serverHint:{fontSize:8,lineHeight:13},openButton:{minHeight:50,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},openButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},storeLink:{minHeight:42,borderRadius:12,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},storeLinkText:{fontSize:8,fontWeight:'900'},result:{borderRadius:16,borderWidth:1,padding:12,flexDirection:'row',alignItems:'center',gap:9},resultTitle:{fontSize:13,fontWeight:'900'},resultText:{fontSize:9,lineHeight:14,marginTop:2},cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},resultCard:{flexGrow:1,flexBasis:210,minWidth:200,borderRadius:13,borderWidth:1,padding:8,flexDirection:'row',gap:8,alignItems:'center'},cardImage:{width:58,height:80,borderRadius:6},cardName:{fontSize:10,fontWeight:'900'},cardMeta:{fontSize:8,marginTop:3},cardPrice:{fontSize:9,fontWeight:'900',marginTop:3},
  pickerBackdrop:{flex:1,backgroundColor:'rgba(2,5,12,.82)',padding:14,justifyContent:'center'},pickerModal:{width:'100%',maxWidth:720,height:'86%',alignSelf:'center',borderRadius:22,borderWidth:1,padding:12,gap:10},pickerHeader:{flexDirection:'row',alignItems:'center',gap:10},pickerTitle:{fontSize:19,fontWeight:'900',marginTop:2},pickerClose:{width:38,height:38,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},pickerSearch:{height:46,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},pickerSearchInput:{flex:1,height:'100%',fontSize:12},pickerList:{flex:1},pickerListContent:{gap:6,paddingBottom:8},packRow:{borderRadius:13,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:9,overflow:'hidden'},packImage:{width:54,height:76,borderRadius:6},packName:{fontSize:11,fontWeight:'900'},packSet:{fontSize:7.5,fontWeight:'700',marginTop:2},packPrice:{fontSize:9.5,fontWeight:'900',marginTop:3},emptyPicker:{padding:30,alignItems:'center',gap:7},
});
