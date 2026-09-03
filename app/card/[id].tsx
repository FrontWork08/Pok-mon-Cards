import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getCardDetail, type CardDetailEntry } from '@/services/player';
import { setCardFavorite } from '@/services/playerActions';
import { formatUsd } from '@/services/market';
import { getCardPriceHistory, type CardPricePoint } from '@/services/marketplace';
import { useAppTheme } from '@/theme/ThemeProvider';
import { isCardWishlisted, setCardWishlist } from '@/services/retention';
import {
  applyCardEconomyStyle,
  clearCardEconomyStyle,
  getMyCardEconomyStyle,
  getMyVisualStyleOptions,
  type VisualStyleOption,
} from '@/services/economy';
import { AuraFrame } from '@/components/AuraFrame';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';
import { useWallet } from '@/wallet/WalletProvider';
import { formatGameIdentifier, getCardGameProfile, type CardGameProfile } from '@/services/cardGameProfile';
import { getPokemonTypeSymbol } from '@/components/PokemonTypeSymbolFilter';

function economyStylePalette(id:string,accent:string,yellow:string){
  const key=id.toLowerCase();
  if(key.includes('galaxy')) return {primary:'#8B5CFF',secondary:'#55E6FF'};
  if(key.includes('master')) return {primary:'#C493FF',secondary:'#8EE7FF'};
  if(key.includes('celestial')) return {primary:'#55E6FF',secondary:'#D8B8FF'};
  if(key.includes('crimson')||key.includes('crown')) return {primary:'#FF667A',secondary:'#FFB36B'};
  if(key.includes('champion')||key.includes('gold')) return {primary:'#FFD447',secondary:'#FFF0A8'};
  if(key.includes('indigo')) return {primary:'#6A7CFF',secondary:'#55D9FF'};
  if(key.includes('kanto')||key.includes('night')) return {primary:'#8B72FF',secondary:'#6EC8FF'};
  return {primary:accent,secondary:yellow};
}

export default function CardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const wallet = useWallet();
  const [entry, setEntry] = useState<CardDetailEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wishlistSaving, setWishlistSaving] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [priceHistory, setPriceHistory] = useState<CardPricePoint[]>([]);
  const [gameProfile, setGameProfile] = useState<CardGameProfile | null>(null);
  const [detailTab, setDetailTab] = useState<'card' | 'battle' | 'market' | 'collection'>('card');
  const [economyStyle, setEconomyStyle] = useState<{id:string;name:string;icon:string;rarity:string}|null>(null);
  const [stylePickerOpen,setStylePickerOpen]=useState(false);
  const [styleOptions,setStyleOptions]=useState<VisualStyleOption[]>([]);
  const [styleOptionsLoading,setStyleOptionsLoading]=useState(false);
  const [styleApplying,setStyleApplying]=useState<string|null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [owned, wanted, history, style, game] = await Promise.all([
        getCardDetail(String(id)),
        isCardWishlisted(String(id)),
        getCardPriceHistory(String(id), 30),
        getMyCardEconomyStyle(String(id)).catch(()=>null),
        getCardGameProfile(String(id)).catch(()=>null),
      ]);
      setEntry(owned);
      setWishlisted(wanted);
      setPriceHistory(history);
      setEconomyStyle(style);
      setGameProfile(game);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar este card.'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function toggleFavorite() {
    if (!entry?.owned || !entry?.cards || saving) return;
    const next = !entry.favorite;
    try { setSaving(true); await setCardFavorite(entry.cards.id, next); setEntry((current) => current ? { ...current, favorite: next } : current); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o favorito.'); }
    finally { setSaving(false); }
  }

  async function toggleWishlist() {
    if (!entry?.cards || wishlistSaving) return;
    const next = !wishlisted;
    try {
      setWishlistSaving(true);
      await setCardWishlist(entry.cards.id, next);
      setWishlisted(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o Card Chase.');
    } finally {
      setWishlistSaving(false);
    }
  }

  async function openStylePicker(){
    if(!entry?.owned||!entry.cards)return;
    setStylePickerOpen(true);
    try{
      setStyleOptionsLoading(true);
      setError(null);
      setStyleOptions(await getMyVisualStyleOptions('card'));
    }catch(err){
      setError(err instanceof Error?err.message:'Não foi possível carregar seus temas.');
    }finally{
      setStyleOptionsLoading(false);
    }
  }

  async function applyVisualStyle(option:VisualStyleOption){
    if(!entry?.cards||styleApplying)return;
    try{
      setStyleApplying(option.id);
      setError(null);
      await applyCardEconomyStyle(entry.cards.id,option.id);
      setEconomyStyle({id:option.id,name:option.name,icon:option.icon,rarity:option.rarity});
      await wallet.refresh();
      setStylePickerOpen(false);
    }catch(err){
      setError(err instanceof Error?err.message:'Não foi possível aplicar este tema.');
    }finally{
      setStyleApplying(null);
    }
  }

  async function removeVisualStyle(){
    if(!entry?.cards||styleApplying)return;
    try{
      setStyleApplying('clear');
      setError(null);
      await clearCardEconomyStyle(entry.cards.id);
      setEconomyStyle(null);
      setStylePickerOpen(false);
    }catch(err){
      setError(err instanceof Error?err.message:'Não foi possível remover o tema.');
    }finally{
      setStyleApplying(null);
    }
  }

  const card = entry?.cards;
  const unitValue = Number(card?.game_value ?? 0);
  const marketPriceUsd = card?.market_price_usd == null ? null : Number(card.market_price_usd);
  const isUnreleasedWithoutMarket = card?.market_price_source === 'unreleased:no_english_market';
  const totalMarketValueUsd = !entry?.owned || marketPriceUsd == null ? null : marketPriceUsd * Number(entry.quantity ?? 0);
  const historyMin = priceHistory.length ? Math.min(...priceHistory.map((point) => point.priceUsd)) : 0;
  const historyMax = priceHistory.length ? Math.max(...priceHistory.map((point) => point.priceUsd)) : 0;
  const historyRange = Math.max(.01, historyMax - historyMin);
  const historyDelta = priceHistory.length > 1 ? priceHistory[priceHistory.length - 1].priceUsd - priceHistory[0].priceUsd : 0;
  const galaxyStyle = Boolean(economyStyle?.id.includes('galaxy'));
  const stylePalette=economyStyle?economyStylePalette(economyStyle.id,colors.accent,colors.yellow):null;
  const stylePrimary = stylePalette?.primary??colors.border;
  const styleSecondary = stylePalette?.secondary??colors.yellow;
  const cardArt = card ? (
    <View style={[
      styles.imagePanel,
      {
        backgroundColor: economyStyle ? '#15111C' : colors.surface,
        borderColor: stylePrimary,
        borderWidth: economyStyle ? 2 : 1,
      },
    ]}>
      {economyStyle ? (
        <>
          <View pointerEvents="none" style={[styles.panelThemeWash,{backgroundColor:stylePrimary}]} />
          <View pointerEvents="none" style={[styles.panelThemeGlowA,{backgroundColor:stylePrimary}]} />
          <View pointerEvents="none" style={[styles.panelThemeGlowB,{backgroundColor:styleSecondary}]} />
        </>
      ) : null}

      {economyStyle ? <View style={[styles.economyStyleBadge,{backgroundColor:'#15111CDD',borderColor:stylePrimary}]}><Ionicons name={(economyStyle.icon||'color-wand') as keyof typeof Ionicons.glyphMap} size={14} color={stylePrimary}/><Text style={[styles.economyStyleBadgeText,{color:colors.text}]}>{economyStyle.name.toUpperCase()}</Text></View> : null}

      <View style={[
        styles.cardImageStage,
        economyStyle && {
          borderColor: stylePrimary,
          backgroundColor: '#09070D',
        },
      ]}>
        {card.image_large || card.image_small ? (
          <Image source={{ uri: card.image_large ?? card.image_small ?? '' }} resizeMode="contain" style={styles.image} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="image-outline" size={56} color={colors.muted} /></View>
        )}

        {economyStyle ? (
          <>
            <View pointerEvents="none" style={[styles.cardThemeWash,{backgroundColor:stylePrimary}]} />
            <View pointerEvents="none" style={[styles.cardThemeEdge,{borderColor:styleSecondary}]} />
            {galaxyStyle ? <GalaxyFlowOverlay intensity="master" opacity={0.70} /> : null}
          </>
        ) : null}
      </View>

      {economyStyle ? <View pointerEvents="none" style={[styles.economyStyleGlow,{borderColor:stylePrimary}]} /> : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <Text style={[styles.topTitle, { color: colors.muted }]}>DETALHES DO CARD</Text>
          <Pressable style={[styles.iconButton, { backgroundColor: entry?.favorite ? '#B73C59' : colors.surface, borderColor: entry?.favorite ? '#E8657F' : colors.border, opacity: entry?.owned ? 1 : .45 }]} onPress={toggleFavorite} disabled={!card || saving || !entry?.owned}><Ionicons name={entry?.favorite ? 'heart' : 'heart-outline'} size={22} color={entry?.favorite ? '#fff' : colors.yellow} /></Pressable>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.yellow} style={{ marginTop: 80 }} /> : null}
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9C9C" /><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && card ? <View style={styles.layout}>
          <View style={styles.imageColumn}>
            {economyStyle ? (
              <AuraFrame
                primaryColor={stylePrimary}
                secondaryColor={styleSecondary}
                intensity={economyStyle.id.includes('master')||economyStyle.id.includes('celestial')||galaxyStyle?'master':'premium'}
                variant={galaxyStyle?'galaxy':'energy'}
                radius={26}
                style={styles.cardAuraShell}
              >
                {cardArt}
              </AuraFrame>
            ) : cardArt}
          </View>
          <View style={[styles.infoPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.kicker, { color: colors.yellow }]}>#{card.pokedex_numbers?.[0] ?? '---'} • {card.set_id.toUpperCase()}</Text>
            <Text style={[styles.name, { color: colors.text }]}>{card.pokemon_name}</Text>
            <Text style={[styles.rarity, { color: colors.muted }]}>{card.rarity ?? 'Sem raridade informada'}</Text>
            {economyStyle ? <View style={[styles.styleInfo,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name={(economyStyle.icon||'color-wand') as keyof typeof Ionicons.glyphMap} size={16} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.styleInfoTitle,{color:colors.text}]}>PERSONALIZAÇÃO ECONOMY 2.1</Text><Text style={[styles.styleInfoText,{color:colors.muted}]}>{economyStyle.name}{galaxyStyle?' • Galaxy Flow com nebulosa e partículas estelares':''} • puramente visual, sem alterar estatísticas ou valor de mercado.</Text></View></View> : null}
            {!entry.owned ? <View style={[styles.previewBadge,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}><Ionicons name="eye" size={15} color={colors.accent}/><View style={{flex:1}}><Text style={[styles.previewBadgeTitle,{color:colors.text}]}>PRÉVIA DA CARTA</Text><Text style={[styles.previewBadgeText,{color:colors.muted}]}>Você ainda não possui esta carta. Veja as estatísticas antes de tentar obtê-la em um booster.</Text></View></View> : null}

            <View style={styles.detailTabs}>
              {([
                ['card','Carta','card-outline'],
                ['battle','Batalha','game-controller-outline'],
                ['market','Mercado','trending-up-outline'],
                ['collection','Coleção','albums-outline'],
              ] as Array<[typeof detailTab,string,keyof typeof Ionicons.glyphMap]>).map(([tab,label,icon])=>{
                const active=detailTab===tab;
                return <Pressable key={tab} onPress={()=>setDetailTab(tab)} style={[styles.detailTab,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?colors.accent:colors.border}]}>
                  <Ionicons name={icon} size={16} color={active?colors.accent:colors.muted}/>
                  <Text style={[styles.detailTabLabel,{color:active?colors.text:colors.muted}]}>{label.toUpperCase()}</Text>
                </Pressable>;
              })}
            </View>

            {detailTab==='card'?<>
              <Text style={[styles.panelSectionTitle,{color:colors.text}]}>Informações da carta</Text>
              <View style={styles.gameTypeRow}>
                {(gameProfile?.types?.length ? gameProfile.types : (card.game_types?.length ? card.game_types : card.types ?? [])).map((type)=>{
                  const visual=getPokemonTypeSymbol(String(type));
                  return <View key={String(type)} style={[styles.gameTypeChip,{backgroundColor:visual.color}]}>
                    <MaterialCommunityIcons name={visual.icon} size={17} color="#FFFFFF"/>
                    <Text style={styles.gameTypeText}>{visual.label}</Text>
                  </View>;
                })}
              </View>
              <View style={styles.statsGrid}>
                <Info label="SET" value={card.set_name}/>
                <Info label="NÚMERO" value={card.card_number??'—'}/>
                <Info label="RARIDADE" value={card.rarity??'—'}/>
                <Info label="ESPÉCIE / FORMA" value={gameProfile?formatGameIdentifier(gameProfile.identifier):card.pokemon_name}/>
              </View>
              <Text style={[styles.battleHint,{color:colors.muted}]}>Os tipos acima são os tipos reais da espécie/forma usados pelo motor game_v1. O tipo impresso do TCG continua preservado nos dados originais da carta.</Text>
            </>:null}

            {detailTab==='battle'?<>
              {gameProfile?<View style={[styles.battlePanel,{backgroundColor:colors.surfaceAlt,borderColor:colors.accent}]}>
                <View style={styles.battlePanelHead}>
                  <View>
                    <Text style={[styles.valueLabel,{color:colors.muted}]}>MOTOR DE BATALHA • GAME_V1 • NÍVEL {gameProfile.stats.level}</Text>
                    <Text style={[styles.battlePower,{color:colors.yellow}]}>{formatGameIdentifier(gameProfile.identifier)}</Text>
                  </View>
                  <Ionicons name="game-controller" size={25} color={colors.accent}/>
                </View>
                <View style={styles.battleStatsGrid}>
                  <BattleStat label="HP" value={gameProfile.stats.hp}/>
                  <BattleStat label="ATAQUE" value={gameProfile.stats.attack}/>
                  <BattleStat label="DEFESA" value={gameProfile.stats.defense}/>
                  <BattleStat label="SP. ATK" value={gameProfile.stats.spAttack}/>
                  <BattleStat label="SP. DEF" value={gameProfile.stats.spDefense}/>
                  <BattleStat label="SPEED" value={gameProfile.stats.speed}/>
                </View>
                <View style={[styles.abilityCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                  <Text style={[styles.valueLabel,{color:colors.muted}]}>HABILIDADE</Text>
                  <Text style={[styles.abilityName,{color:colors.text}]}>{gameProfile.ability?formatGameIdentifier(gameProfile.ability):'Nenhuma'}</Text>
                </View>
                <Text style={[styles.panelSectionTitle,{color:colors.text}]}>Golpes usados no jogo</Text>
                <View style={styles.moveList}>
                  {gameProfile.moves.map((move)=>{
                    const visual=getPokemonTypeSymbol(move.type);
                    const effectParts=[
                      move.ailment&&move.ailment!=='none' ? formatGameIdentifier(move.ailment)+(move.ailmentChance?(' '+move.ailmentChance+'%'):'') : '',
                      move.drain<0 ? 'Recuo '+Math.abs(move.drain)+'%' : move.drain>0 ? 'Drena '+move.drain+'%' : '',
                      move.healing>0 ? 'Cura '+move.healing+'%' : '',
                      move.priority!==0 ? 'Prioridade '+(move.priority>0?'+':'')+move.priority : '',
                    ].filter(Boolean);
                    return <View key={move.id} style={[styles.moveCard,{backgroundColor:colors.surface,borderColor:colors.border}]}>
                      <View style={[styles.moveTypeIcon,{backgroundColor:visual.color}]}><MaterialCommunityIcons name={visual.icon} size={18} color="#FFFFFF"/></View>
                      <View style={styles.moveBody}>
                        <View style={styles.moveTitleRow}><Text style={[styles.moveName,{color:colors.text}]}>{formatGameIdentifier(move.identifier)}</Text><Text style={[styles.moveCategory,{color:visual.color}]}>{String(move.category).toUpperCase()}</Text></View>
                        <Text style={[styles.moveMeta,{color:colors.yellow}]}>Poder {move.power??'—'} • PP {move.pp} • Precisão {move.accuracy==null?'—':move.accuracy+'%'}</Text>
                        {effectParts.length?<Text style={[styles.moveEffect,{color:colors.muted}]}>{effectParts.join(' • ')}</Text>:null}
                      </View>
                    </View>;
                  })}
                </View>
                <Text style={[styles.battleHint,{color:colors.muted}]}>Estas são exatamente as estatísticas e os golpes canônicos consultados pelo game_v1. Não há cartas de Energia neste sistema.</Text>
              </View>:<View style={[styles.previewBadge,{backgroundColor:colors.surfaceAlt,borderColor:'#FF8A8A'}]}><Ionicons name="alert-circle" size={18} color="#FF8A8A"/><Text style={[styles.previewBadgeText,{color:colors.text,flex:1}]}>Esta carta não possui um perfil game_v1 disponível.</Text></View>}
            </>:null}

            {detailTab==='market'?<>
              <View style={[styles.valueHero,{backgroundColor:colors.accentSoft,borderColor:colors.yellow}]}><View style={[styles.valueIcon,{backgroundColor:colors.surface}]}><Ionicons name="cash" size={24} color={colors.yellow}/></View><View style={{flex:1}}><Text style={[styles.valueLabel,{color:colors.muted}]}>VALOR DE MERCADO EM USD</Text><Text style={[styles.valueNumber,{color:colors.yellow}]}>{marketPriceUsd==null?'US$ —':formatUsd(marketPriceUsd)}</Text><Text style={[styles.valueHint,{color:colors.muted}]}>{marketPriceUsd==null?(isUnreleasedWithoutMarket?'Sem cotação — esta versão inglesa nunca foi lançada fisicamente.':'Preço de mercado indisponível para esta carta.'):'Snapshot atual do mercado'}</Text></View></View>
              {priceHistory.length?<View style={[styles.historyPanel,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                <View style={styles.historyHead}><View><Text style={[styles.valueLabel,{color:colors.muted}]}>HISTÓRICO DE PREÇO</Text><Text style={[styles.historyValue,{color:colors.text}]}>{formatUsd(priceHistory[priceHistory.length-1].priceUsd)}</Text></View><Text style={[styles.historyDelta,{color:historyDelta>=0?'#65D894':'#FF8290'}]}>{historyDelta>=0?'+':''}{formatUsd(historyDelta)}</Text></View>
                <View style={styles.chart}>{priceHistory.map((point,index)=>{const height=18+((point.priceUsd-historyMin)/historyRange)*72;return <View key={point.recordedAt+'-'+index} style={styles.barSlot}><View style={[styles.bar,{height,backgroundColor:colors.accent}]}/></View>;})}</View>
                <View style={styles.historyDates}><Text style={[styles.historyDate,{color:colors.muted}]}>{new Date(priceHistory[0].recordedAt).toLocaleDateString('pt-BR')}</Text><Text style={[styles.historyDate,{color:colors.muted}]}>Mín. {formatUsd(historyMin)} • Máx. {formatUsd(historyMax)}</Text><Text style={[styles.historyDate,{color:colors.muted}]}>{new Date(priceHistory[priceHistory.length-1].recordedAt).toLocaleDateString('pt-BR')}</Text></View>
              </View>:<Text style={[styles.battleHint,{color:colors.muted}]}>Ainda não há histórico de preço suficiente para esta carta.</Text>}
              <Pressable onPress={()=>router.push('/marketplace')} style={[styles.contextAction,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="storefront" size={19} color="#54C78D"/><View style={{flex:1}}><Text style={[styles.contextActionTitle,{color:colors.text}]}>Abrir Mercado de Treinadores</Text><Text style={[styles.contextActionText,{color:colors.muted}]}>Compare anúncios e procure oportunidades.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>
            </>:null}

            {detailTab==='collection'?<>
              <Text style={[styles.panelSectionTitle,{color:colors.text}]}>Sua coleção</Text>
              <View style={styles.statsGrid}>
                <Info label="QUANTIDADE" value={entry.owned?'×'+entry.quantity:'Ainda não possui'}/>
                <Info label="VALOR TOTAL EM USD" value={totalMarketValueUsd==null?'—':formatUsd(totalMarketValueUsd)}/>
                <Info label="VALOR NO JOGO" value={unitValue.toLocaleString('pt-BR')+' coins'}/>
                <Info label="OBTIDO" value={entry.first_obtained_at?new Date(entry.first_obtained_at).toLocaleDateString('pt-BR'):'Ainda não está na Bag'}/>
              </View>
              <View style={styles.contextGrid}>
                <Pressable onPress={()=>router.push('/decks')} style={[styles.contextTile,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="albums" size={20} color="#5AA8FF"/><Text style={[styles.contextTileText,{color:colors.text}]}>DECKS</Text></Pressable>
                <Pressable onPress={()=>router.push('/marketplace')} style={[styles.contextTile,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="pricetag" size={20} color="#54C78D"/><Text style={[styles.contextTileText,{color:colors.text}]}>VENDER</Text></Pressable>
                <Pressable onPress={()=>router.push('/(tabs)/trade')} style={[styles.contextTile,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="swap-horizontal" size={20} color="#9B7BFF"/><Text style={[styles.contextTileText,{color:colors.text}]}>TROCAR</Text></Pressable>
                <Pressable onPress={()=>router.push('/(tabs)/battles')} style={[styles.contextTile,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="game-controller" size={20} color="#FF735C"/><Text style={[styles.contextTileText,{color:colors.text}]}>BATALHAR</Text></Pressable>
              </View>
              <View style={styles.cardActions}>
                {entry.owned?<Pressable style={[styles.favoriteButton,styles.flexAction,{backgroundColor:entry.favorite?'#B73C59':colors.yellow}]} onPress={toggleFavorite} disabled={saving}><Ionicons name={entry.favorite?'heart':'heart-outline'} size={19} color={entry.favorite?'#fff':'#07111F'}/><Text style={[styles.favoriteButtonText,entry.favorite&&{color:'#fff'}]}>{saving?'SALVANDO...':entry.favorite?'REMOVER FAVORITO':'FAVORITAR'}</Text></Pressable>:null}
                <Pressable style={[styles.favoriteButton,styles.flexAction,{backgroundColor:wishlisted?'#FFD447':colors.accentSoft,borderWidth:1,borderColor:wishlisted?'#FFD447':colors.accent}]} onPress={toggleWishlist} disabled={wishlistSaving}><Ionicons name={wishlisted?'star':'star-outline'} size={19} color={wishlisted?'#07111F':colors.accent}/><Text style={[styles.favoriteButtonText,{color:wishlisted?'#07111F':colors.text}]}>{wishlistSaving?'SALVANDO...':wishlisted?'NO CARD CHASE':'QUERO ESTA CARTA'}</Text></Pressable>
                {entry.owned?<Pressable style={[styles.favoriteButton,styles.flexAction,{backgroundColor:colors.surfaceAlt,borderWidth:1,borderColor:stylePrimary}]} onPress={()=>{void openStylePicker();}}><Ionicons name="color-wand" size={19} color={stylePrimary===colors.border?colors.accent:stylePrimary}/><Text style={[styles.favoriteButtonText,{color:colors.text}]}>{economyStyle?'TROCAR TEMA':'PERSONALIZAR CARTA'}</Text></Pressable>:null}
              </View>
            </>:null}
          </View>
        </View> : null}
      </ScrollView>

      <Modal visible={stylePickerOpen} transparent animationType="fade" onRequestClose={()=>setStylePickerOpen(false)}>
        <View style={styles.styleBackdrop}>
          <View style={[styles.styleModal,{backgroundColor:colors.surface,borderColor:economyStyle?stylePrimary:colors.accent}]}>
            <View style={styles.styleHeader}>
              <View style={{flex:1}}>
                <Text style={[styles.styleKicker,{color:colors.yellow}]}>TEMAS DA SUA COLEÇÃO</Text>
                <Text style={[styles.styleTitle,{color:colors.text}]}>Personalizar carta</Text>
                <Text style={[styles.styleSubtitle,{color:colors.muted}]}>Molduras e backgrounds premium também aparecem aqui como temas universais.</Text>
              </View>
              <Pressable onPress={()=>setStylePickerOpen(false)} style={[styles.styleClose,{backgroundColor:colors.surfaceAlt}]}><Ionicons name="close" size={19} color={colors.text}/></Pressable>
            </View>

            {styleOptionsLoading?<ActivityIndicator size="large" color={colors.yellow}/>:(
              <ScrollView style={styles.styleList} contentContainerStyle={styles.styleListContent}>
                {economyStyle?<Pressable disabled={Boolean(styleApplying)} onPress={()=>{void removeVisualStyle();}} style={[styles.styleOption,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><View style={[styles.styleOptionIcon,{backgroundColor:colors.surface}]}><Ionicons name="ban-outline" size={20} color={colors.muted}/></View><View style={{flex:1}}><Text style={[styles.styleOptionName,{color:colors.text}]}>Sem tema</Text><Text style={[styles.styleOptionMeta,{color:colors.muted}]}>Remover personalização atual • grátis</Text></View>{styleApplying==='clear'?<ActivityIndicator color={colors.yellow}/>:null}</Pressable>:null}
                {styleOptions.map((option)=>{
                  const palette=economyStylePalette(option.id,colors.accent,colors.yellow);
                  const active=economyStyle?.id===option.id;
                  return <Pressable key={option.id} disabled={Boolean(styleApplying)} onPress={()=>{void applyVisualStyle(option);}} style={[styles.styleOption,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?palette.primary:colors.border}]}>
                    <View style={[styles.styleOptionIcon,{backgroundColor:`${palette.primary}18`,borderColor:palette.primary}]}><Ionicons name={(option.icon||'color-wand') as keyof typeof Ionicons.glyphMap} size={20} color={palette.primary}/></View>
                    <View style={{flex:1,minWidth:0}}>
                      <View style={styles.styleNameRow}><Text numberOfLines={1} style={[styles.styleOptionName,{color:colors.text}]}>{option.name}</Text>{option.universalTheme?<View style={[styles.universalBadge,{borderColor:palette.secondary}]}><Text style={[styles.universalBadgeText,{color:palette.secondary}]}>UNIVERSAL</Text></View>:null}</View>
                      <Text style={[styles.styleOptionMeta,{color:colors.muted}]}>{option.effect==='galaxy'?'GALAXY FLOW • ':''}APLICAÇÃO GRÁTIS • COMPRA ÚNICA</Text>
                    </View>
                    {styleApplying===option.id?<ActivityIndicator color={palette.primary}/>:<Ionicons name={active?'checkmark-circle':'chevron-forward'} size={19} color={active?palette.primary:colors.muted}/>}
                  </Pressable>;
                })}
                {!styleOptions.length?<View style={styles.noStyleOptions}><Ionicons name="color-wand-outline" size={28} color={colors.muted}/><Text style={[styles.styleSubtitle,{color:colors.muted,textAlign:'center'}]}>Você ainda não possui temas compatíveis. Compre molduras, backgrounds ou estilos de carta na Trainer Shop.</Text><Pressable onPress={()=>{setStylePickerOpen(false);router.push('/store');}} style={[styles.goStore,{backgroundColor:colors.yellow}]}><Text style={styles.goStoreText}>ABRIR TRAINER SHOP</Text></Pressable></View>:null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BattleStat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) { const { colors } = useAppTheme(); return <View style={[styles.battleStat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.battleStatLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.battleStatValue,{color:colors.text}]}>{Number(value).toLocaleString('pt-BR')}{suffix}</Text></View>; }

function Info({ label, value }: { label: string; value: string }) { const { colors } = useAppTheme(); return <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}><Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1 }, content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 44, gap: 18 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, topTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, errorBox: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 16, padding: 13, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' }, errorText: { color: '#FFD7D7', fontWeight: '700', flex: 1 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'center' },
  imageColumn:{flexGrow:1,flexBasis:330,maxWidth:480,minWidth:280,width:'100%',alignSelf:'stretch'},
  cardAuraShell:{width:'100%',alignSelf:'stretch'},
  imagePanel:{width:'100%',minHeight:590,borderRadius:26,padding:16,alignItems:'center',justifyContent:'center',borderWidth:1,position:'relative',overflow:'hidden'},
  economyStyleBadge:{position:'absolute',zIndex:20,left:14,top:14,borderRadius:999,borderWidth:1,paddingHorizontal:9,paddingVertical:6,flexDirection:'row',alignItems:'center',gap:5},
  economyStyleBadgeText:{fontSize:7,fontWeight:'900',letterSpacing:.5},
  economyStyleGlow:{position:'absolute',left:8,right:8,top:8,bottom:8,borderRadius:21,borderWidth:2,opacity:.58,zIndex:12},
  panelThemeWash:{...StyleSheet.absoluteFillObject,opacity:.10,zIndex:0},
  panelThemeGlowA:{position:'absolute',width:250,height:250,borderRadius:999,right:-80,top:-95,opacity:.18,zIndex:0},
  panelThemeGlowB:{position:'absolute',width:220,height:220,borderRadius:999,left:-75,bottom:-85,opacity:.14,zIndex:0},
  cardImageStage:{width:'100%',height:570,maxHeight:570,borderRadius:20,borderWidth:1,borderColor:'transparent',overflow:'hidden',position:'relative',alignItems:'center',justifyContent:'center',zIndex:2},
  cardThemeWash:{...StyleSheet.absoluteFillObject,opacity:.065,zIndex:4},
  cardThemeEdge:{...StyleSheet.absoluteFillObject,borderWidth:2,borderRadius:18,opacity:.72,zIndex:6},
  image:{width:'100%',height:'100%'},
  imagePlaceholder:{width:'100%',height:'100%',borderRadius:18,alignItems:'center',justifyContent:'center'},
  infoPanel: { flexGrow: 1, flexBasis: 320, maxWidth: 560, borderRadius: 26, padding: 22, borderWidth: 1 }, kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, name: { fontSize: 34, lineHeight: 40, fontWeight: '900', marginTop: 5 }, rarity: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  cardActions: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:20 },
  flexAction: { flexGrow:1, minWidth:190, marginTop:0 },
  styleInfo:{marginTop:10,borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8},styleInfoTitle:{fontSize:8,fontWeight:'900',letterSpacing:.65},styleInfoText:{fontSize:8,lineHeight:12,marginTop:2},
  previewBadge:{marginTop:12,borderRadius:14,borderWidth:1,padding:10,flexDirection:'row',alignItems:'center',gap:8}, previewBadgeTitle:{fontSize:8,fontWeight:'900',letterSpacing:.8}, previewBadgeText:{fontSize:8,lineHeight:12,marginTop:2},
  battlePanel:{marginTop:12,borderRadius:18,borderWidth:1,padding:13,gap:10},
  battlePanelHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  battlePower:{fontSize:21,fontWeight:'900',marginTop:3},
  battleStatsGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
  battleStat:{flexGrow:1,flexBasis:110,minWidth:100,borderRadius:13,borderWidth:1,padding:9},
  battleStatLabel:{fontSize:7,fontWeight:'900',letterSpacing:.7},
  battleStatValue:{fontSize:14,fontWeight:'900',marginTop:3},
  battleHint:{fontSize:8,lineHeight:13,fontWeight:'700'},
  historyPanel: { marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 12 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  historyValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  historyDelta: { fontSize: 11, fontWeight: '900' },
  chart: { height: 96, marginTop: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minWidth: 2, borderRadius: 3 },
  historyDates: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  historyDate: { fontSize: 7, fontWeight: '700' },
  styleBackdrop:{flex:1,backgroundColor:'#05030ADC',alignItems:'center',justifyContent:'center',padding:16},
  styleModal:{width:'100%',maxWidth:560,maxHeight:'86%',borderRadius:22,borderWidth:1,padding:14,gap:12},
  styleHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  styleKicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},
  styleTitle:{fontSize:21,fontWeight:'900',marginTop:2},
  styleSubtitle:{fontSize:8.5,lineHeight:13,marginTop:3},
  styleClose:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  styleList:{maxHeight:540},
  styleListContent:{gap:7,paddingBottom:2},
  styleOption:{minHeight:67,borderRadius:15,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9},
  styleOptionIcon:{width:44,height:44,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},
  styleOptionName:{fontSize:11,fontWeight:'900'},
  styleOptionMeta:{fontSize:7.5,fontWeight:'700',marginTop:3},
  styleNameRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  universalBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:2},
  universalBadgeText:{fontSize:5.5,fontWeight:'900',letterSpacing:.5},
  noStyleOptions:{padding:24,alignItems:'center',gap:8},
  goStore:{minHeight:40,borderRadius:11,paddingHorizontal:14,alignItems:'center',justifyContent:'center',marginTop:3},
  goStoreText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  valueHero: { marginTop: 16, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, valueIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, valueLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, valueNumber: { fontSize: 24, fontWeight: '900', marginTop: 2 }, valueHint: { fontSize: 8, lineHeight: 12, marginTop: 2 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, badge: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1 }, badgeText: { fontSize: 11, fontWeight: '900' }, statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }, infoCard: { width: '48%', minHeight: 82, borderRadius: 16, padding: 13, borderWidth: 1 }, infoLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }, infoValue: { fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 5 }, favoriteButton: { marginTop: 20, minHeight: 52, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, favoriteButtonText: { color: '#07111F', fontSize: 11, fontWeight: '900', letterSpacing: .4 },
});
