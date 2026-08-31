import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { PremiumBackground } from '@/components/PremiumBackground';
import { AuraBanner } from '@/components/AuraBanner';
import { GuildHeadquartersShowcase } from '@/components/GuildHeadquartersShowcase';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getMyBagPage } from '@/services/bag';
import type { OwnedCardEntry } from '@/services/player';
import {
  applyCardEconomyStyle,
  applyDeckEconomyStyle,
  boostMarketListing,
  boostMyMarketShop,
  contributeGlobalProject,
  contributeGuildProject,
  equipEconomyItem,
  getEconomySinkHub,
  placeEconomyAuctionBid,
  purchaseEconomyItem,
  purchaseTrainerPrestige,
  rerollLuxuryShop,
  setCollectionMuseumCard,
  subscribeEconomySinks,
  upgradeCollectionMuseum,
  type EconomySinkHub,
  type EconomyStoreItem,
} from '@/services/economy';
import { useAppTheme } from '@/theme/ThemeProvider';
import { useWallet } from '@/wallet/WalletProvider';

type PickerAction =
  | { mode:'museum'; slot:number }
  | { mode:'card-style'; itemId:string; itemName:string }
  | null;

const QUICK_CONTRIBUTIONS=[10000,50000,100000,250000,1000000];

function coins(value:number|null|undefined){
  return `🪙 ${Math.max(0,Number(value??0)).toLocaleString('pt-BR')}`;
}

function pct(value:number,target:number){
  if(target<=0)return 0;
  return Math.max(0,Math.min(100,value/target*100));
}

function itemVisual(item:EconomyStoreItem){
  const key=`${item.rarity} ${item.id}`.toLowerCase();
  if(item.metadata?.effect==='galaxy'||key.includes('galaxy')) return {primary:'#8B5CFF',secondary:'#55E6FF',tier:5};
  if(key.includes('legend')||key.includes('master')) return {primary:'#C493FF',secondary:'#8EE7FF',tier:4};
  if(key.includes('luxury')||key.includes('auction')) return {primary:'#FFD447',secondary:'#FF9F43',tier:3};
  if(key.includes('epic')) return {primary:'#B982FF',secondary:'#6A7CFF',tier:2};
  if(key.includes('rare')) return {primary:'#55D9FF',secondary:'#6A7CFF',tier:1};
  return {primary:'#65D894',secondary:'#8EE7FF',tier:0};
}

function museumRarityColor(rarity:string|null|undefined){
  const value=(rarity??'').toLowerCase();
  if(/hyper|secret|special illustration|shiny ultra|rainbow|gold/.test(value)) return '#FFD447';
  if(/illustration|ultra|double rare|rare holo|promo/.test(value)) return '#C493FF';
  if(/rare/.test(value)) return '#55D9FF';
  return '#65D894';
}

function categoryLabel(category:EconomyStoreItem['category']){
  const labels:Record<EconomyStoreItem['category'],string>={
    profile_frame:'Moldura',
    profile_background:'Background',
    card_style:'Carta',
    deck_style:'Deck',
    shop_theme:'Loja',
    booster_fx:'Booster',
    title:'Título',
    trophy:'Troféu',
    guild_decor:'Guilda',
  };
  return labels[category];
}

export default function EconomyScreen(){
  const router=useRouter();
  const {colors}=useAppTheme();
  const wallet=useWallet();
  const [hub,setHub]=useState<EconomySinkHub|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [auctionBid,setAuctionBid]=useState('');
  const [picker,setPicker]=useState<PickerAction>(null);
  const [bagSearch,setBagSearch]=useState('');
  const [bagCards,setBagCards]=useState<OwnedCardEntry[]>([]);
  const [bagLoading,setBagLoading]=useState(false);

  const load=useCallback(async(silent=false)=>{
    try{
      if(!silent)setLoading(true);
      setError(null);
      setHub(await getEconomySinkHub());
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível carregar a Economy 2.0.');
    }finally{
      if(!silent)setLoading(false);
    }
  },[]);

  useFocusEffect(useCallback(()=>{void load();},[load]));

  useEffect(()=>subscribeEconomySinks(()=>{void load(true);}),[load]);

  useEffect(()=>{
    if(!picker)return;
    const timer=setTimeout(()=>{
      void (async()=>{
        try{
          setBagLoading(true);
          const page=await getMyBagPage(0,60,{
            search:bagSearch.trim(),
            setQuery:'',
            quickFilter:'all',
            typeFilter:null,
            rarityFilter:null,
            generation:null,
            sortMode:'value',
          });
          setBagCards(page.items.filter((x)=>Boolean(x.cards)));
        }catch(e){
          setError(e instanceof Error?e.message:'Não foi possível carregar sua Bag.');
        }finally{
          setBagLoading(false);
        }
      })();
    },bagSearch?250:0);
    return()=>clearTimeout(timer);
  },[picker,bagSearch]);

  async function run(key:string,action:()=>Promise<unknown>,success:string){
    if(busy)return;
    try{
      setBusy(key);setError(null);
      await action();
      setNotice(success);
      await Promise.all([load(true),wallet.refresh()]);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível concluir a ação.');
    }finally{setBusy(null);}
  }

  function confirmSpend(title:string,message:string,key:string,action:()=>Promise<unknown>,success:string){
    Alert.alert(title,message,[
      {text:'Cancelar',style:'cancel'},
      {text:'Confirmar',onPress:()=>{void run(key,action,success);}},
    ]);
  }

  function buy(item:EconomyStoreItem){
    if(item.owned)return;
    confirmSpend(
      'Comprar item?',
      `${item.name}\n\nCusto: ${coins(item.priceCoins)}\n\nO valor será removido permanentemente da economia.`,
      `buy:${item.id}`,
      ()=>purchaseEconomyItem(item.id),
      `${item.name} adquirido.`,
    );
  }

  async function chooseCard(entry:OwnedCardEntry){
    const card=entry.cards;
    if(!card||!picker||busy)return;
    const action=picker;
    setPicker(null);
    setBagSearch('');
    if(action.mode==='museum'){
      await run(
        `museum:${action.slot}`,
        ()=>setCollectionMuseumCard(action.slot,card.id),
        `${card.pokemon_name} foi colocado no Museu.`,
      );
      return;
    }
    await run(
      `card-style:${card.id}`,
      ()=>applyCardEconomyStyle(card.id,action.itemId),
      `${action.itemName} aplicado a ${card.pokemon_name}.`,
    );
  }

  const allPermanentItems=hub?.storeItems??[];
  const galaxyItems=allPermanentItems.filter((item)=>item.metadata?.collection==='galaxy_flow');
  const permanentItems=allPermanentItems.filter((item)=>item.metadata?.collection!=='galaxy_flow');
  const ownedCardStyles=(hub?.ownedItems??[]).filter((x)=>
    x.category==='card_style'
    || (['profile_frame','profile_background'].includes(x.category) && x.metadata?.cardCompatible===true)
  );
  const ownedDeckStyles=(hub?.ownedItems??[]).filter((x)=>
    x.category==='deck_style'
    || (['profile_frame','profile_background'].includes(x.category) && x.metadata?.deckCompatible===true)
  );
  const equipCategories=new Set<EconomyStoreItem['category']>(['profile_frame','profile_background','shop_theme','booster_fx','title']);

  const museumSlots=useMemo(()=>{
    const count=hub?.museum.progress.slots??3;
    return Array.from({length:count},(_,i)=>{
      const slot=i+1;
      return {slot,card:hub?.museum.cards.find((x)=>x.slot===slot)??null};
    });
  },[hub]);

  if(loading&&!hub){
    return <Screen title="Economy 2.1" subtitle="Sinks permanentes e progressão visual de longo prazo."><ActivityIndicator size="large" color={colors.yellow}/></Screen>;
  }

  return (
    <Screen title="Economy 2.1" subtitle="Prestígio, luxo, projetos coletivos e personalização visual sem vantagem competitiva.">
      <View style={styles.topRow}>
        <Pressable onPress={()=>goBackOrHome(router)} style={[styles.back,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="arrow-back" size={18} color={colors.text}/><Text style={[styles.backText,{color:colors.text}]}>Voltar</Text>
        </Pressable>
        <Pressable onPress={()=>void load()} style={[styles.refresh,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
          <Ionicons name="refresh" size={17} color={colors.accent}/><Text style={[styles.refreshText,{color:colors.accent}]}>ATUALIZAR</Text>
        </Pressable>
      </View>

      <AuraBanner
        eyebrow="TRAINER ECONOMY • PREMIUM HUB"
        title="Sua coleção também constrói legado."
        subtitle="Coins viram prestígio visual, museu, sede de guilda, efeitos, leilões e identidade — nunca poder escondido."
        icon="sparkles"
        primaryColor={colors.accent}
        secondaryColor={colors.yellow}
        intensity={(hub?.prestige.level??0)>=5?'master':'premium'}
        badge={(hub?.prestige.level??0)>=5?'MASTER ECONOMY':'ECONOMY 2.1'}
        minHeight={190}
      >
        <View style={styles.bannerStats}>
          <View style={[styles.bannerStat,{borderColor:colors.border,backgroundColor:colors.surface+'D8'}]}>
            <Text style={[styles.bannerStatLabel,{color:colors.muted}]}>SALDO DISPONÍVEL</Text>
            <Text style={[styles.bannerStatValue,{color:colors.yellow}]}>{coins(hub?.wallet.coins)}</Text>
          </View>
          <View style={[styles.bannerStat,{borderColor:colors.border,backgroundColor:colors.surface+'D8'}]}>
            <Text style={[styles.bannerStatLabel,{color:colors.muted}]}>SINKS • 30 DIAS</Text>
            <Text style={[styles.bannerStatValue,{color:'#65D894'}]}>{coins(hub?.mySinks.last30Days)}</Text>
          </View>
          <View style={[styles.bannerStat,{borderColor:colors.border,backgroundColor:colors.surface+'D8'}]}>
            <Text style={[styles.bannerStatLabel,{color:colors.muted}]}>PRESTÍGIO</Text>
            <Text style={[styles.bannerStatValue,{color:colors.text}]}>NV. {hub?.prestige.level??0}{(hub?.prestige.stars??0)>0?` • ★${hub?.prestige.stars}`:''}</Text>
          </View>
        </View>
      </AuraBanner>

      {!hub?.live ? (
        <View style={[styles.launchGate,{backgroundColor:hub?.adminPreview?'#2D2612':colors.surface,borderColor:hub?.adminPreview?'#D9A441':colors.border}]}>
          <Ionicons name={hub?.adminPreview?'construct':'lock-closed'} size={22} color={hub?.adminPreview?'#FFD447':colors.muted}/>
          <View style={{flex:1}}>
            <Text style={[styles.launchTitle,{color:colors.text}]}>{hub?.adminPreview?'PRÉVIA ADMIN LIBERADA':'PRONTO PARA O RESET 1.0'}</Text>
            <Text style={[styles.launchText,{color:colors.muted}]}>
              {hub?.adminPreview
                ? 'Você pode testar os sinks antes do lançamento. Todo progresso econômico de teste será limpo automaticamente no reset para impedir lavagem de Coins do Beta.'
                : 'Compras e contribuições ficam bloqueadas até a conclusão da migração 1.0.'}
            </Text>
          </View>
        </View>
      ):null}

      {notice?<Pressable onPress={()=>setNotice(null)} style={[styles.notice,{backgroundColor:'#153426',borderColor:'#2F9E68'}]}><Ionicons name="checkmark-circle" size={18} color="#65D894"/><Text style={styles.noticeText}>{notice}</Text></Pressable>:null}
      {error?<Pressable onPress={()=>setError(null)} style={styles.error}><Ionicons name="alert-circle" size={18} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></Pressable>:null}

      <View style={styles.metricGrid}>
        <Metric label="SEU SALDO" value={coins(hub?.wallet.coins)} icon="wallet" />
        <Metric label="REMOVIDO • 30 DIAS" value={coins(hub?.mySinks.last30Days)} icon="flame" />
        <Metric label="REMOVIDO • TOTAL" value={coins(hub?.mySinks.lifetime)} icon="analytics" />
        <Metric label="PRESTÍGIO" value={`NÍVEL ${hub?.prestige.level??0} ${(hub?.prestige.stars??0)>0?`★${hub?.prestige.stars}`:''}`} icon="ribbon" />
      </View>

      <Section title="Prestígio de Trainer" icon="ribbon" subtitle="Sink endgame infinito: títulos, troféus e aura de conta sem bônus de batalha.">
        <AuraBanner
          eyebrow={`PRESTÍGIO ${hub?.prestige.level??0}`}
          title={(hub?.prestige.stars??0)>0?`${hub?.prestige.stars} estrela(s) Master`:'Construa seu legado econômico'}
          subtitle={`Total investido: ${coins(hub?.prestige.totalSpentCoins)}. Depois do nível 5, a progressão continua infinitamente com estrelas.`}
          icon={(hub?.prestige.stars??0)>0?'diamond':'ribbon'}
          primaryColor={(hub?.prestige.level??0)>=5?'#C493FF':colors.yellow}
          secondaryColor={(hub?.prestige.level??0)>=5?'#8EE7FF':colors.accent}
          intensity={(hub?.prestige.level??0)>=5?'master':'premium'}
          badge={(hub?.prestige.level??0)>=5?`★ ${hub?.prestige.stars??0} MASTER`:'ENDGAME'}
          minHeight={205}
        >
          <View style={styles.prestigeVisualRow}>
            <View style={styles.prestigeStars}>
              {Array.from({length:5},(_,i)=><View key={i} style={[styles.prestigeStar,{backgroundColor:i<(hub?.prestige.level??0)?((hub?.prestige.level??0)>=5?'#C493FF':colors.yellow):colors.surfaceAlt,borderColor:i<(hub?.prestige.level??0)?((hub?.prestige.level??0)>=5?'#D8B8FF':colors.yellow):colors.border}]}><Ionicons name={i<(hub?.prestige.level??0)?'star':'star-outline'} size={15} color={i<(hub?.prestige.level??0)?'#07111F':colors.muted}/></View>)}
            </View>
            <Pressable
              disabled={Boolean(busy)}
              onPress={()=>confirmSpend('Subir Prestígio?',`Custo do próximo nível: ${coins(hub?.prestige.nextCost)}.`,'prestige',purchaseTrainerPrestige,'Prestígio aumentado.')}
              style={[styles.primary,{backgroundColor:colors.yellow},busy&&styles.disabled]}
            >
              {busy==='prestige'?<ActivityIndicator color="#07111F"/>:<Ionicons name="arrow-up-circle" size={18} color="#07111F"/>}
              <Text style={styles.primaryText}>SUBIR • {coins(hub?.prestige.nextCost)}</Text>
            </Pressable>
          </View>
        </AuraBanner>
      </Section>

      {galaxyItems.length ? <Section title="Coleção Galaxy Flow" icon="planet" subtitle="Linha lendária com nebulosa viva, partículas estelares, órbitas e fluxo cósmico.">
        <AuraBanner
          eyebrow="GALAXY FLOW COLLECTION"
          title="O espaço agora flui pela sua coleção."
          subtitle="Moldura, background, carta, deck, loja, booster e título com identidade galáctica. Os efeitos são visuais e não dão vantagem competitiva."
          icon="planet"
          primaryColor="#8B5CFF"
          secondaryColor="#55E6FF"
          intensity="master"
          variant="galaxy"
          badge="LEGENDARY"
          minHeight={205}
        >
          <View style={styles.galaxyCollectionMeta}>
            <View style={[styles.galaxyCollectionPill,{borderColor:'#8B5CFF',backgroundColor:'#1A1130'}]}><Ionicons name="sparkles" size={13} color="#D8B8FF"/><Text style={styles.galaxyCollectionText}>NEBULOSA VIVA</Text></View>
            <View style={[styles.galaxyCollectionPill,{borderColor:'#55E6FF',backgroundColor:'#0D2430'}]}><Ionicons name="star" size={13} color="#8EE7FF"/><Text style={styles.galaxyCollectionText}>PARTÍCULAS ESTELARES</Text></View>
            <View style={[styles.galaxyCollectionPill,{borderColor:'#E056FD',backgroundColor:'#28112C'}]}><Ionicons name="sync" size={13} color="#F3A5FF"/><Text style={styles.galaxyCollectionText}>FLUXO CÓSMICO</Text></View>
          </View>
        </AuraBanner>
        <View style={styles.storeGrid}>
          {galaxyItems.map((item)=><StoreCard
            key={item.id}
            item={item}
            busy={busy===`buy:${item.id}`||busy===`equip:${item.id}`}
            canEquip={item.owned&&equipCategories.has(item.category)}
            onBuy={()=>buy(item)}
            onEquip={()=>void run(`equip:${item.id}`,()=>equipEconomyItem(item.id),`${item.name} equipado.`)}
          />)}
        </View>
      </Section> : null}

      <Section title="Loja permanente" icon="bag-handle" subtitle="Cosméticos, temas, efeitos, títulos e estilos. Tudo puramente visual.">
        <View style={styles.storeGrid}>
          {permanentItems.map((item)=><StoreCard
            key={item.id}
            item={item}
            busy={busy===`buy:${item.id}`||busy===`equip:${item.id}`}
            canEquip={item.owned&&equipCategories.has(item.category)}
            onBuy={()=>buy(item)}
            onEquip={()=>void run(`equip:${item.id}`,()=>equipEconomyItem(item.id),`${item.name} equipado.`)}
          />)}
        </View>
      </Section>

      <Section title="Loja semanal de luxo" icon="diamond" subtitle="Rotação pessoal de quatro itens. Reroll custa progressivamente mais na mesma semana.">
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.body,{color:colors.muted}]}>Semana {hub?.luxury.weekStart||'—'} • {hub?.luxury.rerollCount??0} reroll(s)</Text>
          <Pressable
            disabled={Boolean(busy)}
            onPress={()=>confirmSpend('Trocar rotação?',`O próximo reroll custa ${coins(hub?.luxury.nextRerollCost)}.`,'luxury-reroll',rerollLuxuryShop,'Loja de Luxo atualizada.')}
            style={[styles.smallButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}
          >
            <Ionicons name="shuffle" size={15} color={colors.accent}/><Text style={[styles.smallText,{color:colors.accent}]}>REROLL {coins(hub?.luxury.nextRerollCost)}</Text>
          </Pressable>
        </View>
        <View style={styles.storeGrid}>
          {(hub?.luxury.items??[]).map((item)=><StoreCard
            key={item.id}
            item={item}
            busy={busy===`buy:${item.id}`||busy===`equip:${item.id}`}
            canEquip={item.owned&&equipCategories.has(item.category)}
            onBuy={()=>buy(item)}
            onEquip={()=>void run(`equip:${item.id}`,()=>equipEconomyItem(item.id),`${item.name} equipado.`)}
          />)}
        </View>
      </Section>

      <Section title="Museu da Coleção" icon="library" subtitle="Expanda sua galeria e exponha cartas favoritas sem alterar a Bag.">
        <View style={[styles.heroCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <View style={{flex:1}}>
            <Text style={[styles.heroTitle,{color:colors.text}]}>Museu nível {hub?.museum.progress.level??0}</Text>
            <Text style={[styles.body,{color:colors.muted}]}>{hub?.museum.progress.slots??3} espaços • investido {coins(hub?.museum.progress.totalSpentCoins)}</Text>
          </View>
          {hub?.museum.progress.nextCost!=null?<Pressable
            disabled={Boolean(busy)}
            onPress={()=>confirmSpend('Expandir Museu?',`Custo: ${coins(hub.museum.progress.nextCost)}.`,'museum-upgrade',upgradeCollectionMuseum,'Museu expandido.')}
            style={[styles.primary,{backgroundColor:colors.yellow}]}
          ><Ionicons name="expand" size={17} color="#07111F"/><Text style={styles.primaryText}>EXPANDIR {coins(hub.museum.progress.nextCost)}</Text></Pressable>:<Text style={[styles.maxed,{color:'#65D894'}]}>NÍVEL MÁXIMO</Text>}
        </View>
        <View style={styles.museumGrid}>
          {museumSlots.map(({slot,card})=>{
            const rarityColor=museumRarityColor(card?.rarity);
            return <Pressable key={slot} onPress={()=>{setBagSearch('');setPicker({mode:'museum',slot});}} style={[styles.museumSlot,{backgroundColor:colors.surface,borderColor:card?rarityColor:colors.border}]}>
              <View style={[styles.museumSlotNumber,{backgroundColor:card?`${rarityColor}20`:colors.surfaceAlt,borderColor:card?rarityColor:colors.border}]}><Text style={[styles.museumSlotNumberText,{color:card?rarityColor:colors.muted}]}>#{slot}</Text></View>
              {card?<View pointerEvents="none" style={[styles.museumCardHalo,{backgroundColor:rarityColor}]}/>:null}
              {card?.image?<Image source={{uri:card.image}} resizeMode="contain" style={styles.museumImage}/>:<View style={[styles.museumEmptyIcon,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="add" size={24} color={colors.muted}/></View>}
              <View style={[styles.museumPedestal,{backgroundColor:card?rarityColor:colors.border}]}/>
              <Text numberOfLines={1} style={[styles.museumName,{color:colors.text}]}>{card?.name??`Espaço ${slot}`}</Text>
              <Text numberOfLines={1} style={[styles.museumMeta,{color:card?rarityColor:colors.muted}]}>{card?.rarity??'Toque para escolher'}</Text>
            </Pressable>;
          })}
        </View>
      </Section>

      <Section title="Personalização de cartas" icon="color-wand" subtitle="Estilos de carta e temas premium de identidade agora podem ser aplicados nas cartas da sua Bag.">
        {ownedCardStyles.length===0?<Text style={[styles.empty,{color:colors.muted}]}>Compre um estilo de carta na loja para começar.</Text>:(
          <View style={styles.storeGrid}>{ownedCardStyles.map((item)=>{
            const applyCost=Number(item.metadata?.applyCardCost??item.metadata?.applyCost??15000);
            return <View key={item.id} style={[styles.simpleCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Ionicons name={(item.icon||'color-wand') as keyof typeof Ionicons.glyphMap} size={22} color={colors.yellow}/>
              <Text style={[styles.simpleTitle,{color:colors.text}]}>{item.name}</Text>
              <Text style={[styles.body,{color:colors.muted}]}>{item.metadata?.universalTheme===true?'TEMA UNIVERSAL • ':''}Aplicação: {coins(applyCost)}</Text>
              <Pressable onPress={()=>{setBagSearch('');setPicker({mode:'card-style',itemId:item.id,itemName:item.name});}} style={[styles.smallButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Text style={[styles.smallText,{color:colors.accent}]}>ESCOLHER CARTA</Text></Pressable>
            </View>;
          })}</View>
        )}
      </Section>

      <Section title="Decks de prestígio" icon="albums" subtitle="Capas de deck e temas premium de identidade também podem ser usados aqui.">
        {ownedDeckStyles.length===0?<Text style={[styles.empty,{color:colors.muted}]}>Compre um estilo de deck na loja para liberar esta área.</Text>:(
          <View style={styles.deckList}>{(hub?.decks??[]).map((deck)=><View key={deck.id} style={[styles.deckRow,{backgroundColor:colors.surface,borderColor:deck.isDefault?colors.yellow:colors.border}]}>
            <View style={{flex:1}}><Text style={[styles.simpleTitle,{color:colors.text}]}>{deck.name}{deck.isDefault?' • PRINCIPAL':''}</Text><Text style={[styles.body,{color:colors.muted}]}>{deck.styleName??'Sem estilo premium'}</Text></View>
            <View style={styles.deckStyleActions}>{ownedDeckStyles.map((style)=>{
              const applyCost=Number(style.metadata?.applyDeckCost??style.metadata?.applyCost??10000);
              return <Pressable key={style.id} disabled={Boolean(busy)} onPress={()=>confirmSpend('Aplicar estilo?',`${style.name} em ${deck.name}\nCusto de aplicação: ${coins(applyCost)}`,`deck:${deck.id}:${style.id}`,()=>applyDeckEconomyStyle(deck.id,style.id),`${style.name} aplicado ao deck.`)} style={[styles.tinyChip,{backgroundColor:deck.styleItemId===style.id?colors.accentSoft:colors.surfaceAlt,borderColor:deck.styleItemId===style.id?colors.accent:colors.border}]}><Text style={[styles.tinyText,{color:colors.text}]}>{style.name}</Text></Pressable>;
            })}</View>
          </View>)}</View>
        )}
      </Section>

      <Section title="Tesouro e Projetos da Guilda" icon="shield" subtitle="Contribuições são destruídas da circulação e evoluem a sede visualmente.">
        {hub?.guild ? <GuildHeadquartersShowcase
          guildName={hub.guild.guildName}
          guildColor={hub.guild.guildColor}
          upgrades={hub.guild.upgrades}
          guildLevel={hub.guild.guildLevel}
        /> : null}
        {hub?.guild?.project?<ProgressSink
          title={hub.guild.project.name}
          subtitle={hub.guild.project.description}
          current={hub.guild.project.contributedCoins}
          target={hub.guild.project.targetCoins}
          my={hub.guild.project.myContribution}
          colors={colors}
          onSpend={(amount)=>confirmSpend('Contribuir com a guilda?',`${coins(amount)} serão removidas do seu saldo e adicionadas ao projeto.`,`guild:${amount}`,()=>contributeGuildProject(amount),'Contribuição registrada na guilda.')}
          busy={Boolean(busy)}
        />:<Text style={[styles.empty,{color:colors.muted}]}>Entre em uma guilda para desbloquear projetos coletivos.</Text>}
        {(hub?.guild?.project?.topContributors?.length??0)>0?<View style={[styles.rankBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[styles.rankTitle,{color:colors.text}]}>MAIORES CONTRIBUIDORES</Text>
          {hub!.guild!.project!.topContributors.map((x,i)=><View key={x.playerId} style={styles.rankRow}><Text style={[styles.rankPos,{color:colors.yellow}]}>#{i+1}</Text><Text style={[styles.rankName,{color:colors.text}]}>@{x.username}</Text><Text style={[styles.rankCoins,{color:colors.muted}]}>{coins(x.coins)}</Text></View>)}
        </View>:null}
      </Section>

      <Section title="Construção Global" icon="construct" subtitle="Projeto de servidor inteiro que transforma Coins em um marco visual da comunidade.">
        {hub?.globalProject?<AuraBanner
          eyebrow="PROJETO GLOBAL"
          title={hub.globalProject.name}
          subtitle={hub.globalProject.description}
          icon={hub.globalProject.completedAt?'checkmark-circle':'construct'}
          primaryColor={hub.globalProject.completedAt?'#65D894':colors.accent}
          secondaryColor={colors.yellow}
          intensity={hub.globalProject.completedAt?'master':'premium'}
          badge={hub.globalProject.completedAt?'CONCLUÍDO':`${pct(hub.globalProject.contributedCoins,hub.globalProject.targetCoins).toFixed(1)}%`}
          minHeight={245}
        >
          <GlobalProjectVisual
            current={hub.globalProject.contributedCoins}
            target={hub.globalProject.targetCoins}
            completed={Boolean(hub.globalProject.completedAt)}
            primary={hub.globalProject.completedAt?'#65D894':colors.accent}
            secondary={colors.yellow}
          />
          <ProgressSink
            title="Construção comunitária"
            subtitle={hub.globalProject.completedAt?'A obra foi concluída e ficará registrada como marco da comunidade.':'Cada contribuição alimenta visualmente a construção até a conclusão.'}
            current={hub.globalProject.contributedCoins}
            target={hub.globalProject.targetCoins}
            my={hub.globalProject.myContribution}
            colors={colors}
            onSpend={(amount)=>confirmSpend('Contribuir com a comunidade?',`${coins(amount)} serão removidas da economia global.`,`global:${amount}`,()=>contributeGlobalProject(hub.globalProject!.id,amount),'Contribuição global registrada.')}
            busy={Boolean(busy)}
          />
        </AuraBanner>:<Text style={[styles.empty,{color:colors.muted}]}>Nenhum projeto global ativo.</Text>}
      </Section>

      <Section title="Trainer Market Premium" icon="storefront" subtitle="Destaques pagos melhoram visibilidade, nunca as estatísticas da carta.">
        <View style={[styles.marketBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[styles.simpleTitle,{color:colors.text}]}>Destaque da sua loja</Text>
          <Text style={[styles.body,{color:colors.muted}]}>Ativo até: {hub?.market.shop?.highlightUntil?new Date(hub.market.shop.highlightUntil).toLocaleString('pt-BR'):'não ativo'}</Text>
          <View style={styles.quickRow}>
            {([['24h',30000],['72h',80000],['168h',180000]] as const).map(([tier,cost])=><Pressable key={tier} disabled={Boolean(busy)} onPress={()=>confirmSpend('Destacar loja?',`${tier} de destaque por ${coins(cost)}.`,`shop:${tier}`,()=>boostMyMarketShop(tier),`Loja destacada por ${tier}.`)} style={[styles.quickChip,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.quickText,{color:colors.text}]}>{tier} • {coins(cost)}</Text></Pressable>)}
          </View>
        </View>
        <View style={styles.deckList}>{(hub?.market.listings??[]).map((listing)=><View key={listing.id} style={[styles.deckRow,{backgroundColor:colors.surface,borderColor:listing.boostedUntil&&new Date(listing.boostedUntil)>new Date()?colors.yellow:colors.border}]}>
          <View style={{flex:1}}><Text style={[styles.simpleTitle,{color:colors.text}]}>{listing.cardName}</Text><Text style={[styles.body,{color:colors.muted}]}>Anúncio {coins(listing.priceCoins)} • {listing.boostedUntil?`boost até ${new Date(listing.boostedUntil).toLocaleString('pt-BR')}`:'sem boost'}</Text></View>
          <View style={styles.quickRow}>
            {([['6h',15000],['24h',50000],['72h',120000]] as const).map(([tier,cost])=><Pressable key={tier} disabled={Boolean(busy)} onPress={()=>confirmSpend('Impulsionar anúncio?',`${listing.cardName}\n${tier} por ${coins(cost)}.`,`listing:${listing.id}:${tier}`,()=>boostMarketListing(listing.id,tier),'Anúncio impulsionado.')} style={[styles.tinyChip,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.tinyText,{color:colors.text}]}>{tier}</Text></Pressable>)}
          </View>
        </View>)}</View>
      </Section>

      <Section title="Leilão oficial" icon="hammer" subtitle="Evento premium: lances superados são devolvidos e só o lance vencedor é destruído.">
        {hub?.auction?<AuraBanner
          eyebrow="MASTER AUCTION"
          title={hub.auction.itemName}
          subtitle={`Maior lance: ${hub.auction.highestBidCoins?coins(hub.auction.highestBidCoins):'nenhum'} ${hub.auction.highestBidderName?`• @${hub.auction.highestBidderName}`:''}`}
          icon={(hub.auction.itemIcon||'trophy') as keyof typeof Ionicons.glyphMap}
          primaryColor={hub.auction.amIHighest?'#65D894':'#C493FF'}
          secondaryColor={colors.yellow}
          intensity="master"
          badge={hub.auction.amIHighest?'VOCÊ ESTÁ NA FRENTE':'LEILÃO OFICIAL'}
          minHeight={255}
        >
          <View style={styles.auctionPedestal}>
            <View style={[styles.auctionOrbit,styles.auctionOrbitOuter,{borderColor:'#C493FF'}]}/>
            <View style={[styles.auctionOrbit,styles.auctionOrbitInner,{borderColor:colors.yellow}]}/>
            <View style={[styles.auctionPrize,{backgroundColor:colors.surfaceAlt,borderColor:hub.auction.amIHighest?'#65D894':'#C493FF'}]}><Ionicons name={(hub.auction.itemIcon||'trophy') as keyof typeof Ionicons.glyphMap} size={34} color={hub.auction.amIHighest?'#65D894':'#C493FF'}/></View>
            <View style={[styles.auctionStatusPill,{backgroundColor:hub.auction.amIHighest?'#153426':'#2A1740',borderColor:hub.auction.amIHighest?'#2F9E68':'#6E43A4'}]}><Ionicons name={hub.auction.amIHighest?'checkmark-circle':'time'} size={13} color={hub.auction.amIHighest?'#65D894':'#D8B8FF'}/><Text style={[styles.auctionStatusText,{color:hub.auction.amIHighest?'#9CEFC1':'#D8B8FF'}]}>{hub.auction.amIHighest?'VOCÊ LIDERA':'DISPUTA ATIVA'}</Text></View>
          </View>
          <View style={[styles.auction,{backgroundColor:colors.surface+'D9',borderColor:hub.auction.amIHighest?'#65D894':colors.yellow}]}>
          <View style={[styles.auctionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={(hub.auction.itemIcon||'trophy') as keyof typeof Ionicons.glyphMap} size={28} color={colors.yellow}/></View>
          <View style={{flex:1,minWidth:200}}>
            <Text style={[styles.heroKicker,{color:colors.yellow}]}>MASTER AUCTION</Text>
            <Text style={[styles.heroTitle,{color:colors.text}]}>{hub.auction.itemName}</Text>
            <Text style={[styles.body,{color:colors.muted}]}>Maior lance: {hub.auction.highestBidCoins?coins(hub.auction.highestBidCoins):'nenhum'} {hub.auction.highestBidderName?`• @${hub.auction.highestBidderName}`:''}</Text>
            <Text style={[styles.body,{color:colors.muted}]}>Encerra em {new Date(hub.auction.endsAt).toLocaleString('pt-BR')} • mínimo agora {coins(hub.auction.minimumNextBid)}</Text>
          </View>
          <View style={styles.bidBox}>
            <TextInput value={auctionBid} onChangeText={(v)=>setAuctionBid(v.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder={String(hub.auction.minimumNextBid)} placeholderTextColor={colors.muted} style={[styles.bidInput,{color:colors.text,backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}/>
            <Pressable disabled={Boolean(busy)||Number(auctionBid)<hub.auction.minimumNextBid} onPress={()=>confirmSpend('Confirmar lance?',`Lance: ${coins(Number(auctionBid))}. Se alguém superar, seu valor é devolvido integralmente.`,'auction',()=>placeEconomyAuctionBid(hub.auction!.id,Number(auctionBid)),'Lance registrado.')} style={[styles.primary,{backgroundColor:colors.yellow},(Number(auctionBid)<hub.auction.minimumNextBid)&&styles.disabled]}><Ionicons name="hammer" size={17} color="#07111F"/><Text style={styles.primaryText}>DAR LANCE</Text></Pressable>
          </View>
          </View>
        </AuraBanner>:<Text style={[styles.empty,{color:colors.muted}]}>Nenhum leilão oficial ativo.</Text>}
      </Section>

      <Section title="Seu impacto econômico" icon="analytics" subtitle="Quanto você já removeu de Coins por categoria de sink.">
        <View style={[styles.breakdown,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          {Object.entries(hub?.mySinks.byType??{}).length?Object.entries(hub!.mySinks.byType).sort((a,b)=>Number(b[1])-Number(a[1])).map(([type,value])=><View key={type} style={styles.breakRow}><Text style={[styles.breakType,{color:colors.text}]}>{type.replaceAll('_',' ').toUpperCase()}</Text><Text style={[styles.breakValue,{color:colors.yellow}]}>{coins(Number(value))}</Text></View>):<Text style={[styles.empty,{color:colors.muted}]}>Nenhum sink permanente utilizado ainda.</Text>}
        </View>
        {!hub?.softCap.enabled?<View style={[styles.softCap,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="shield-checkmark" size={18} color="#65D894"/><Text style={[styles.body,{color:colors.muted,flex:1}]}>Soft cap preparado, mas DESATIVADO. Ele só deve ser ligado se os dados reais mostrarem inflação extrema.</Text></View>:null}
      </Section>

      <Modal visible={Boolean(picker)} animationType="slide" onRequestClose={()=>setPicker(null)}>
        <SafeAreaView style={[styles.pickerSafe,{backgroundColor:colors.bg}]}>
          <PremiumBackground/>
          <View style={styles.pickerHeader}>
            <View style={{flex:1}}><Text style={[styles.pickerTitle,{color:colors.text}]}>{picker?.mode==='museum'?'Escolher carta para o Museu':'Escolher carta para personalizar'}</Text><Text style={[styles.body,{color:colors.muted}]}>Busque até 60 resultados da sua Bag.</Text></View>
            <Pressable onPress={()=>setPicker(null)}><Ionicons name="close" size={26} color={colors.text}/></Pressable>
          </View>
          <View style={[styles.searchBox,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="search" size={18} color={colors.muted}/><TextInput value={bagSearch} onChangeText={setBagSearch} placeholder="Buscar Pokémon..." placeholderTextColor={colors.muted} style={[styles.searchInput,{color:colors.text}]}/></View>
          {bagLoading?<ActivityIndicator style={{margin:14}} color={colors.yellow}/>:null}
          <FlatList
            data={bagCards}
            keyExtractor={(x,i)=>x.cards?.id??`bag-${i}`}
            contentContainerStyle={styles.pickerList}
            renderItem={({item})=>{
              const card=item.cards;
              if(!card)return null;
              return <Pressable onPress={()=>void chooseCard(item)} style={[styles.pickerRow,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                {card.image_small?<Image source={{uri:card.image_small}} resizeMode="contain" style={styles.pickerImage}/>:<View style={styles.pickerImage}/>}
                <View style={{flex:1}}><Text style={[styles.simpleTitle,{color:colors.text}]}>{card.pokemon_name}</Text><Text style={[styles.body,{color:colors.muted}]}>{card.rarity??'Sem raridade'} • {item.quantity} cópia(s)</Text></View>
                <Ionicons name="chevron-forward" size={20} color={colors.accent}/>
              </Pressable>;
            }}
          />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function Section({title,subtitle,icon,children}:{title:string;subtitle:string;icon:keyof typeof Ionicons.glyphMap;children:ReactNode}){
  const {colors}=useAppTheme();
  return <View style={styles.section}><View style={styles.sectionHead}><View style={[styles.sectionIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name={icon} size={21} color={colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.sectionTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.sectionSubtitle,{color:colors.muted}]}>{subtitle}</Text></View></View>{children}</View>;
}

function Metric({label,value,icon}:{label:string;value:string;icon:keyof typeof Ionicons.glyphMap}){
  const {colors}=useAppTheme();
  return <View style={[styles.metric,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name={icon} size={18} color={colors.yellow}/><Text style={[styles.metricLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.metricValue,{color:colors.text}]}>{value}</Text></View>;
}

function StoreCard({item,busy,canEquip,onBuy,onEquip}:{item:EconomyStoreItem;busy:boolean;canEquip:boolean;onBuy:()=>void;onEquip:()=>void}){
  const {colors}=useAppTheme();
  const visual=itemVisual(item);
  const galaxy=item.metadata?.effect==='galaxy'||item.id.includes('galaxy');
  return <View style={[styles.storeCard,{backgroundColor:colors.surface,borderColor:item.owned?visual.primary:visual.tier>=2?`${visual.primary}99`:colors.border,borderWidth:visual.tier>=3?1.5:1}]}>
    {galaxy?<GalaxyFlowOverlay intensity="master" opacity={.78}/>:null}
    <View pointerEvents="none" style={[styles.storeGlow,{backgroundColor:visual.primary,opacity:visual.tier>=3?.18:visual.tier>=1?.10:.05}]}/>
    <View pointerEvents="none" style={[styles.storeEdge,{backgroundColor:visual.secondary,opacity:visual.tier>=3?.75:.28}]}/>
    <View style={styles.storeTop}>
      <View style={[styles.storeIcon,{backgroundColor:`${visual.primary}18`,borderColor:`${visual.primary}70`}]}><Ionicons name={(item.icon||'sparkles') as keyof typeof Ionicons.glyphMap} size={23} color={visual.primary}/></View>
      <View style={[styles.rarityBadge,{backgroundColor:`${visual.primary}15`,borderColor:`${visual.primary}55`}]}><View style={[styles.rarityDot,{backgroundColor:visual.primary}]}/><Text style={[styles.rarityText,{color:visual.primary}]}>{item.rarity.toUpperCase()}</Text></View>
    </View>
    <StorePreview item={item} primary={visual.primary} secondary={visual.secondary} />
    <Text style={[styles.storeName,{color:colors.text}]}>{item.name}</Text>
    <Text style={[styles.storeCategory,{color:visual.primary}]}>{categoryLabel(item.category).toUpperCase()}</Text>
    <Text style={[styles.storeDesc,{color:colors.muted}]}>{item.description}</Text>
    {visual.tier>=3?<View style={styles.premiumSignature}><Ionicons name={galaxy?'planet':'sparkles'} size={12} color={visual.secondary}/><Text style={[styles.premiumSignatureText,{color:visual.secondary}]}>{galaxy?'GALAXY FLOW':'PREMIUM VISUAL'}</Text></View>:null}
    {item.owned?<View style={styles.storeActions}><View style={[styles.ownedBadge,{backgroundColor:'#153426',borderColor:'#2F9E68'}]}><Ionicons name="checkmark" size={13} color="#65D894"/><Text style={styles.ownedText}>ADQUIRIDO</Text></View>{canEquip?<Pressable disabled={busy} onPress={onEquip} style={[styles.equipButton,{borderColor:visual.primary,backgroundColor:`${visual.primary}12`}]}>{busy?<ActivityIndicator size="small" color={visual.primary}/>:<Text style={[styles.equipText,{color:visual.primary}]}>EQUIPAR</Text>}</Pressable>:null}</View>:<Pressable disabled={busy} onPress={onBuy} style={[styles.buyButton,{backgroundColor:visual.tier>=3?visual.primary:colors.yellow}]}>{busy?<ActivityIndicator color="#07111F"/>:<Text style={styles.buyText}>COMPRAR • {coins(item.priceCoins)}</Text>}</Pressable>}
  </View>;
}

function StorePreview({item,primary,secondary}:{item:EconomyStoreItem;primary:string;secondary:string}){
  const {colors}=useAppTheme();
  const galaxy=item.metadata?.effect==='galaxy'||item.id.includes('galaxy');
  const common=<>{galaxy?<GalaxyFlowOverlay intensity="master" opacity={.72}/>:null}<View pointerEvents="none" style={[styles.previewGlow,{backgroundColor:primary}]}/></>;
  if(item.category==='profile_frame'){
    return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
      {common}
      <View style={[styles.previewAvatarFrame,{borderColor:primary}]}>
        <View style={[styles.previewAvatar,{backgroundColor:`${secondary}25`}]}><Ionicons name="person" size={21} color={secondary}/></View>
      </View>
      <Text style={[styles.previewLabel,{color:primary}]}>MOLDURA DE PERFIL</Text>
    </View>;
  }
  if(item.category==='profile_background'){
    return <View style={[styles.storePreview,{backgroundColor:`${primary}12`,borderColor:`${primary}70`}]}>
      {common}
      <View style={[styles.previewPlanet,{backgroundColor:secondary}]}/>
      <View style={[styles.previewHorizon,{borderColor:primary}]}/>
      <Ionicons name="sparkles" size={23} color={primary}/>
      <Text style={[styles.previewLabel,{color:primary}]}>BACKGROUND PREMIUM</Text>
    </View>;
  }
  if(item.category==='card_style'){
    return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
      {common}
      <View style={[styles.previewCard,{borderColor:primary,backgroundColor:colors.surface}]}>
        <Ionicons name="image" size={23} color={secondary}/>
        <View style={[styles.previewCardLine,{backgroundColor:primary}]}/>
      </View>
      <Ionicons name="color-wand" size={18} color={primary}/>
      <Text style={[styles.previewLabel,{color:primary}]}>ESTILO DE CARTA</Text>
    </View>;
  }
  if(item.category==='deck_style'){
    return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
      {common}
      <View style={styles.previewDeck}>
        <View style={[styles.previewDeckCard,styles.previewDeckBack,{borderColor:secondary,backgroundColor:colors.surface}]}/>
        <View style={[styles.previewDeckCard,{borderColor:primary,backgroundColor:colors.surface}]}><Ionicons name="albums" size={20} color={primary}/></View>
      </View>
      <Text style={[styles.previewLabel,{color:primary}]}>CAPA DE DECK</Text>
    </View>;
  }
  if(item.category==='shop_theme'){
    return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
      {common}
      <View style={[styles.previewStore,{borderColor:primary,backgroundColor:colors.surface}]}>
        <View style={[styles.previewStoreAwning,{backgroundColor:primary}]}/>
        <Ionicons name="storefront" size={22} color={secondary}/>
      </View>
      <Text style={[styles.previewLabel,{color:primary}]}>TEMA DE LOJA</Text>
    </View>;
  }
  if(item.category==='booster_fx'){
    return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
      {common}
      <View style={[styles.previewFxRing,{borderColor:primary}]}><View style={[styles.previewFxCore,{backgroundColor:secondary}]}><Ionicons name="cube" size={19} color="#07111F"/></View></View>
      <Ionicons name="flash" size={18} color={primary}/>
      <Text style={[styles.previewLabel,{color:primary}]}>EFEITO DE ABERTURA</Text>
    </View>;
  }
  return <View style={[styles.storePreview,{backgroundColor:colors.surfaceAlt,borderColor:`${primary}70`}]}>
    {common}
    <View style={[styles.previewAward,{backgroundColor:`${primary}18`,borderColor:primary}]}><Ionicons name={(item.icon||'trophy') as keyof typeof Ionicons.glyphMap} size={24} color={primary}/></View>
    <Text style={[styles.previewLabel,{color:primary}]}>{item.category==='title'?'TÍTULO DE PRESTÍGIO':'TROFÉU DE COLEÇÃO'}</Text>
  </View>;
}

function GlobalProjectVisual({current,target,completed,primary,secondary}:{current:number;target:number;completed:boolean;primary:string;secondary:string}){
  const {colors}=useAppTheme();
  const percent=pct(current,target);
  const stages=[20,40,60,80,100];
  return <View style={[styles.globalVisual,{backgroundColor:colors.surface+'D8',borderColor:`${primary}70`}]}>
    <View style={[styles.globalSkyGlow,{backgroundColor:primary}]}/>
    <View style={styles.globalBuildRow}>
      {stages.map((stage,index)=>{
        const active=percent>=stage||completed;
        const height=35+index*12;
        return <View key={stage} style={[styles.globalTower,{height,borderColor:active?primary:colors.border,backgroundColor:active?`${primary}18`:colors.surfaceAlt,opacity:active?1:.5}]}>
          <Ionicons name={index===4?'trophy':index===3?'business':index===2?'shield':'construct'} size={14+index} color={active?(index===4?secondary:primary):colors.muted}/>
          {active?<View style={[styles.globalTowerLight,{backgroundColor:index===4?secondary:primary}]}/>:null}
        </View>;
      })}
    </View>
    <View style={[styles.globalGround,{borderColor:`${primary}55`}]} />
    <View style={styles.globalVisualCopy}>
      <Text style={[styles.globalVisualTitle,{color:colors.text}]}>{completed?'OBRA CONCLUÍDA':'CONSTRUÇÃO EM ANDAMENTO'}</Text>
      <Text style={[styles.globalVisualMeta,{color:completed?'#65D894':primary}]}>{percent.toFixed(1)}% • {coins(current)} investidas pela comunidade</Text>
    </View>
  </View>;
}

function ProgressSink({title,subtitle,current,target,my,colors,onSpend,busy}:{title:string;subtitle:string;current:number;target:number;my:number;colors:any;onSpend:(amount:number)=>void;busy:boolean}){
  return <View style={[styles.progressBox,{backgroundColor:colors.surface,borderColor:colors.border}]}>
    <View style={styles.progressTop}><View style={{flex:1}}><Text style={[styles.simpleTitle,{color:colors.text}]}>{title}</Text><Text style={[styles.body,{color:colors.muted}]}>{subtitle}</Text></View><Text style={[styles.progressPct,{color:colors.yellow}]}>{pct(current,target).toFixed(1)}%</Text></View>
    <View style={[styles.track,{backgroundColor:colors.surfaceAlt}]}><View style={[styles.fill,{width:`${pct(current,target)}%`,backgroundColor:colors.accent}]}/></View>
    <View style={styles.progressNumbers}><Text style={[styles.body,{color:colors.text}]}>{coins(current)} / {coins(target)}</Text><Text style={[styles.body,{color:colors.muted}]}>Você: {coins(my)}</Text></View>
    <View style={styles.quickRow}>{QUICK_CONTRIBUTIONS.map((amount)=><Pressable key={amount} disabled={busy||current>=target} onPress={()=>onSpend(amount)} style={[styles.quickChip,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.quickText,{color:colors.text}]}>{coins(amount)}</Text></Pressable>)}</View>
  </View>;
}

const styles=StyleSheet.create({
  topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'},
  bannerStats:{flexDirection:'row',flexWrap:'wrap',gap:7},
  galaxyCollectionMeta:{flexDirection:'row',flexWrap:'wrap',gap:7},
  galaxyCollectionPill:{minHeight:34,borderRadius:999,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:5},
  galaxyCollectionText:{color:'#F6F8FC',fontSize:6.5,fontWeight:'900',letterSpacing:.5},
  bannerStat:{flexGrow:1,minWidth:135,borderRadius:13,borderWidth:1,padding:10},
  bannerStatLabel:{fontSize:6.5,fontWeight:'900',letterSpacing:.65},
  bannerStatValue:{fontSize:13,fontWeight:'900',marginTop:3},
  prestigeVisualRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  prestigeStars:{flexDirection:'row',gap:6,flexWrap:'wrap'},
  prestigeStar:{width:34,height:34,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center'},
  back:{minHeight:42,borderRadius:13,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:10,fontWeight:'900'},
  refresh:{minHeight:42,borderRadius:13,borderWidth:1,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:7},refreshText:{fontSize:8,fontWeight:'900'},
  launchGate:{borderRadius:18,borderWidth:1,padding:13,flexDirection:'row',gap:10,alignItems:'center'},launchTitle:{fontSize:10,fontWeight:'900',letterSpacing:.5},launchText:{fontSize:8,lineHeight:13,marginTop:3},
  notice:{borderRadius:14,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:7},noticeText:{color:'#AEF0CC',fontSize:9,fontWeight:'800',flex:1},
  error:{borderRadius:14,borderWidth:1,borderColor:'#683243',backgroundColor:'#351A24',padding:11,flexDirection:'row',alignItems:'center',gap:7},errorText:{color:'#FFD7DD',fontSize:9,fontWeight:'800',flex:1},
  metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{flexGrow:1,flexBasis:160,minWidth:145,borderRadius:17,borderWidth:1,padding:12,gap:5},metricLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7},metricValue:{fontSize:16,fontWeight:'900'},
  section:{gap:10},sectionHead:{flexDirection:'row',alignItems:'center',gap:9},sectionIcon:{width:43,height:43,borderRadius:14,alignItems:'center',justifyContent:'center'},sectionTitle:{fontSize:19,fontWeight:'900'},sectionSubtitle:{fontSize:9,lineHeight:14,marginTop:2},
  heroCard:{borderRadius:20,borderWidth:1,padding:14,flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},heroKicker:{fontSize:8,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:2},body:{fontSize:9,lineHeight:14},
  primary:{minHeight:44,borderRadius:13,paddingHorizontal:13,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},primaryText:{color:'#07111F',fontSize:8,fontWeight:'900'},disabled:{opacity:.45},maxed:{fontSize:9,fontWeight:'900'},
  storeGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},storeCard:{flexGrow:1,flexBasis:190,minWidth:180,maxWidth:310,minHeight:220,borderRadius:19,borderWidth:1,padding:12,position:'relative',overflow:'hidden'},storeGlow:{position:'absolute',width:170,height:170,borderRadius:999,right:-72,top:-78},storeEdge:{position:'absolute',left:0,right:0,top:0,height:2},storeTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',zIndex:2},storeIcon:{width:43,height:43,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},rarityBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:4},rarityDot:{width:5,height:5,borderRadius:999},rarityText:{fontSize:6.5,fontWeight:'900'},storePreview:{height:82,borderRadius:14,borderWidth:1,marginTop:10,position:'relative',overflow:'hidden',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:9},previewGlow:{position:'absolute',width:130,height:130,borderRadius:999,right:-55,top:-70,opacity:.13},previewLabel:{position:'absolute',left:8,bottom:5,fontSize:5.5,fontWeight:'900',letterSpacing:.55},previewAvatarFrame:{width:47,height:47,borderRadius:16,borderWidth:2,padding:4,alignItems:'center',justifyContent:'center'},previewAvatar:{width:'100%',height:'100%',borderRadius:11,alignItems:'center',justifyContent:'center'},previewPlanet:{position:'absolute',right:14,top:10,width:36,height:36,borderRadius:999,opacity:.18},previewHorizon:{position:'absolute',left:-15,right:-15,bottom:13,height:35,borderTopWidth:1,borderRadius:999,opacity:.55},previewCard:{width:39,height:54,borderRadius:7,borderWidth:2,alignItems:'center',justifyContent:'center'},previewCardLine:{position:'absolute',left:5,right:5,bottom:6,height:2,borderRadius:999},previewDeck:{width:58,height:56,position:'relative'},previewDeckCard:{position:'absolute',right:3,top:3,width:38,height:51,borderRadius:7,borderWidth:2,alignItems:'center',justifyContent:'center'},previewDeckBack:{left:2,right:undefined,top:0,transform:[{rotate:'-8deg'}],opacity:.65},previewStore:{width:58,height:47,borderRadius:9,borderWidth:1,alignItems:'center',justifyContent:'center',overflow:'hidden'},previewStoreAwning:{position:'absolute',left:0,right:0,top:0,height:9},previewFxRing:{width:52,height:52,borderRadius:999,borderWidth:2,alignItems:'center',justifyContent:'center'},previewFxCore:{width:30,height:30,borderRadius:10,alignItems:'center',justifyContent:'center'},previewAward:{width:52,height:52,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},storeName:{fontSize:14,fontWeight:'900',marginTop:10},storeCategory:{fontSize:7,fontWeight:'900',letterSpacing:.7,marginTop:2},storeDesc:{fontSize:8,lineHeight:12,marginTop:5,flex:1},premiumSignature:{flexDirection:'row',alignItems:'center',gap:4,marginTop:7},premiumSignatureText:{fontSize:6,fontWeight:'900',letterSpacing:.6},buyButton:{minHeight:40,borderRadius:11,alignItems:'center',justifyContent:'center',marginTop:10},buyText:{color:'#07111F',fontSize:8,fontWeight:'900'},storeActions:{flexDirection:'row',gap:6,alignItems:'center',marginTop:10},ownedBadge:{minHeight:36,borderRadius:10,borderWidth:1,paddingHorizontal:9,flexDirection:'row',alignItems:'center',gap:4},ownedText:{color:'#9CEFC1',fontSize:7,fontWeight:'900'},equipButton:{minHeight:36,borderRadius:10,borderWidth:1,paddingHorizontal:10,alignItems:'center',justifyContent:'center'},equipText:{fontSize:7,fontWeight:'900'},
  sectionHeaderRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'},smallButton:{minHeight:38,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},smallText:{fontSize:7,fontWeight:'900'},
  museumGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},museumSlot:{width:122,minHeight:175,borderRadius:17,borderWidth:1,padding:8,alignItems:'center',justifyContent:'flex-end',position:'relative',overflow:'hidden'},museumSlotNumber:{position:'absolute',left:7,top:7,zIndex:3,borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:3},museumSlotNumberText:{fontSize:6,fontWeight:'900'},museumCardHalo:{position:'absolute',width:105,height:105,borderRadius:999,top:18,opacity:.13},museumEmptyIcon:{width:52,height:70,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center',marginBottom:14},museumImage:{width:78,height:108,zIndex:2},museumPedestal:{width:72,height:3,borderRadius:999,opacity:.75,marginTop:2},museumName:{fontSize:9,fontWeight:'900',marginTop:6,maxWidth:102},museumMeta:{fontSize:7,marginTop:2,textAlign:'center',maxWidth:102},
  simpleCard:{flexGrow:1,flexBasis:180,minWidth:170,maxWidth:280,borderRadius:17,borderWidth:1,padding:12,gap:6},simpleTitle:{fontSize:12,fontWeight:'900'},
  deckList:{gap:8},deckRow:{borderRadius:16,borderWidth:1,padding:11,flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},deckStyleActions:{flexDirection:'row',flexWrap:'wrap',gap:5},tinyChip:{minHeight:31,borderRadius:9,borderWidth:1,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},tinyText:{fontSize:6.5,fontWeight:'900'},
  globalVisual:{minHeight:150,borderRadius:18,borderWidth:1,padding:12,position:'relative',overflow:'hidden',justifyContent:'flex-end'},globalSkyGlow:{position:'absolute',right:-65,top:-90,width:220,height:220,borderRadius:999,opacity:.14},globalBuildRow:{minHeight:95,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:6,zIndex:2,paddingBottom:18},globalTower:{width:42,borderRadius:11,borderWidth:1,alignItems:'center',justifyContent:'center',position:'relative'},globalTowerLight:{position:'absolute',width:7,height:7,borderRadius:999,top:7,right:7,opacity:.8},globalGround:{position:'absolute',left:-25,right:-25,bottom:35,height:45,borderTopWidth:1,borderRadius:999},globalVisualCopy:{zIndex:3,alignItems:'center'},globalVisualTitle:{fontSize:9,fontWeight:'900',letterSpacing:.7},globalVisualMeta:{fontSize:7.5,fontWeight:'900',marginTop:3},
  progressBox:{borderRadius:18,borderWidth:1,padding:13,gap:9},progressTop:{flexDirection:'row',alignItems:'flex-start',gap:10},progressPct:{fontSize:14,fontWeight:'900'},track:{height:9,borderRadius:999,overflow:'hidden'},fill:{height:'100%',borderRadius:999},progressNumbers:{flexDirection:'row',justifyContent:'space-between',gap:8,flexWrap:'wrap'},quickRow:{flexDirection:'row',flexWrap:'wrap',gap:6},quickChip:{minHeight:34,borderRadius:10,borderWidth:1,paddingHorizontal:9,alignItems:'center',justifyContent:'center'},quickText:{fontSize:7,fontWeight:'900'},
  rankBox:{borderRadius:16,borderWidth:1,padding:11,gap:6},rankTitle:{fontSize:7,fontWeight:'900',letterSpacing:.7},rankRow:{flexDirection:'row',alignItems:'center',gap:7},rankPos:{width:25,fontSize:8,fontWeight:'900'},rankName:{flex:1,fontSize:9,fontWeight:'900'},rankCoins:{fontSize:8,fontWeight:'800'},
  marketBox:{borderRadius:17,borderWidth:1,padding:12,gap:8},
  auctionPedestal:{minHeight:118,alignItems:'center',justifyContent:'center',position:'relative'},auctionOrbit:{position:'absolute',borderRadius:999,borderWidth:1},auctionOrbitOuter:{width:104,height:104,opacity:.35},auctionOrbitInner:{width:76,height:76,opacity:.6},auctionPrize:{width:66,height:66,borderRadius:22,borderWidth:1.5,alignItems:'center',justifyContent:'center',zIndex:2},auctionStatusPill:{position:'absolute',bottom:0,borderRadius:999,borderWidth:1,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4,zIndex:3},auctionStatusText:{fontSize:6.5,fontWeight:'900'},auction:{borderRadius:20,borderWidth:1,padding:14,flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},auctionIcon:{width:52,height:52,borderRadius:17,alignItems:'center',justifyContent:'center'},bidBox:{minWidth:190,flexGrow:1,gap:7},bidInput:{minHeight:44,borderRadius:12,borderWidth:1,paddingHorizontal:11,fontSize:12,fontWeight:'900'},
  breakdown:{borderRadius:17,borderWidth:1,padding:12,gap:7},breakRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},breakType:{fontSize:8,fontWeight:'900'},breakValue:{fontSize:9,fontWeight:'900'},softCap:{borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},empty:{fontSize:9,lineHeight:14},
  pickerSafe:{flex:1},pickerHeader:{padding:14,flexDirection:'row',alignItems:'center',gap:10},pickerTitle:{fontSize:22,fontWeight:'900'},searchBox:{marginHorizontal:14,minHeight:48,borderRadius:14,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:7},searchInput:{flex:1,minHeight:46,fontSize:12},pickerList:{padding:14,paddingBottom:40,gap:8},pickerRow:{borderRadius:15,borderWidth:1,padding:8,flexDirection:'row',alignItems:'center',gap:10},pickerImage:{width:50,height:68,borderRadius:6},
});
