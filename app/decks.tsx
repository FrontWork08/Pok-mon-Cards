import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { AuraFrame } from '@/components/AuraFrame';
import { copyDeck, createDeck, deleteDeck, getMyDecks, setDefaultDeck } from '@/services/decks';
import { getMyGamepasses, hasGamepass } from '@/services/gamepasses';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function DecksScreen() {
  const router = useRouter();
  const { colors, isLight } = useAppTheme();
  const [decks, setDecks] = useState<any[]>([]);
  const [deckPro, setDeckPro] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewingDeck, setViewingDeck] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [deckRows, passes] = await Promise.all([getMyDecks(), getMyGamepasses().catch(()=>null)]);
      setDecks(deckRows);
      setDeckPro(hasGamepass(passes, 'deck_pro'));
    }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível carregar os decks.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try { setWorking(true); const id = await createDeck(trimmed); setName(''); router.push(`/deck/${id}`); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível criar o deck.'); }
    finally { setWorking(false); }
  }

  async function duplicate(deckId:string) {
    if (!deckPro) { router.push('/gamepasses'); return; }
    try {
      setWorking(true);
      const id = await copyDeck(deckId);
      setNotice('Deck copiado com o Deck Pro. A cópia já está pronta para editar.');
      await load();
      router.push(`/deck/${id}`);
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível copiar o deck.'); }
    finally { setWorking(false); }
  }

  async function makeDefault(deckId: string) {
    try { setWorking(true); await setDefaultDeck(deckId); await load(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível definir o deck principal.'); }
    finally { setWorking(false); }
  }

  async function remove(deckId: string) {
    try { setWorking(true); await deleteDeck(deckId); await load(); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível remover o deck.'); }
    finally { setWorking(false); }
  }

  const viewedDeckCards = viewingDeck?.deck_cards ?? [];
  const viewedDeckTotal = viewedDeckCards.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0);
  const viewedDeckValue = viewedDeckCards.reduce((sum: number, item: any) => sum + Number(item.cards?.market_price_usd ?? 0) * Number(item.quantity ?? 0), 0);

  return (
    <Screen title="Meus Decks" subtitle="Monte equipes com cards da sua Bag e deixe um deck principal pronto para batalhas.">
      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
      {notice ? <Pressable style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={colors.yellow} /><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text></Pressable> : null}

      <View style={[styles.createBox,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={styles.createCopy}><View style={styles.proTitleRow}><Text style={[styles.kicker,{color:colors.yellow}]}>NOVO DECK</Text><Pressable onPress={()=>router.push('/gamepasses')} style={[styles.proBadge,{borderColor:deckPro?'#59D49A':colors.border}]}><Ionicons name={deckPro?'checkmark-circle':'lock-closed'} size={11} color={deckPro?'#59D49A':colors.muted}/><Text style={[styles.proBadgeText,{color:deckPro?'#79E6AE':colors.muted}]}>DECK PRO {deckPro?'ATIVO':'OPCIONAL'}</Text></Pressable></View><Text style={[styles.createTitle,{color:colors.text}]}>Prepare sua próxima batalha</Text></View>
        <View style={styles.createRow}><TextInput value={name} onChangeText={setName} onSubmitEditing={create} placeholder="Ex.: Fantasmas" placeholderTextColor={colors.muted} style={[styles.input,{backgroundColor:colors.surface,borderColor:colors.border,color:colors.text}]} /><Pressable style={[styles.createButton,{backgroundColor:colors.yellow}, (!name.trim() || working) && styles.disabled]} onPress={create} disabled={!name.trim() || working}><Ionicons name="add" size={19} color="#07111F" /><Text style={styles.createButtonText}>CRIAR</Text></Pressable></View>
        <Text style={[styles.proHint,{color:colors.muted}]}>{deckPro?'Deck Pro ativo: use COPIAR em qualquer deck para duplicar cartas e estilo em um toque.':'Deck Pro não limita seus decks atuais. Ele adiciona ferramentas rápidas como copiar decks sem remontar carta por carta.'}</Text>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      <View style={styles.list}>
        {decks.map((deck) => {
          const total = (deck.deck_cards ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0);
          const marketValue = (deck.deck_cards ?? []).reduce((sum: number, item: any) => sum + Number(item.cards?.market_price_usd ?? 0) * Number(item.quantity ?? 0), 0);
          const deckStyle = Array.isArray(deck.economy_store_items) ? deck.economy_store_items[0] : deck.economy_store_items;
          const styleId=String(deck.style_item_id??'');
          const galaxyDeck=styleId.includes('galaxy');
          const deckBorder = deckStyle
            ? galaxyDeck ? '#8B5CFF'
              : styleId.includes('master') ? '#C493FF'
              : styleId.includes('celestial') ? '#55E6FF'
              : styleId.includes('crimson') || styleId.includes('crown') ? '#FF667A'
              : styleId.includes('champion') || styleId.includes('gold') ? '#FFD447'
              : styleId.includes('indigo') ? '#6A7CFF'
              : styleId.includes('kanto') || styleId.includes('night') ? '#8B72FF'
              : styleId.includes('elite') ? colors.accent
              : colors.yellow
            : deck.is_default ? colors.yellow : colors.border;
          const deckSecond = galaxyDeck ? '#55E6FF'
            : styleId.includes('master') ? '#8EE7FF'
            : styleId.includes('celestial') ? '#D8B8FF'
            : styleId.includes('crimson') || styleId.includes('crown') ? '#FFB36B'
            : styleId.includes('champion') || styleId.includes('gold') ? '#FFF0A8'
            : styleId.includes('indigo') ? '#55D9FF'
            : styleId.includes('kanto') || styleId.includes('night') ? '#6EC8FF'
            : colors.yellow;
          return <AuraFrame key={deck.id} primaryColor={deckBorder} secondaryColor={deckSecond} intensity={deckStyle ? (galaxyDeck||styleId.includes('master')||styleId.includes('celestial')?'master':'premium') : 'soft'} variant={galaxyDeck?'galaxy':'energy'} radius={19}><View style={[styles.deck,{backgroundColor:colors.surface,borderColor:deckBorder,borderWidth:deckStyle?2:1}]}>
            <Pressable style={styles.deckMain} onPress={() => setViewingDeck(deck)}>
              <View style={[styles.preview,{backgroundColor:isLight?'#EDF2F7':colors.bg}]}>{(deck.deck_cards ?? []).slice(0, 3).map((item: any, index: number) => item.cards?.image_small ? <Image key={`${item.card_id}-${index}`} source={{ uri: item.cards.image_small }} style={[styles.previewCard, { marginLeft: index ? -25 : 0 }]} /> : null)}{total === 0 ? <Ionicons name="albums-outline" size={34} color={colors.muted} /> : null}</View>
              <View style={styles.deckInfo}><View style={styles.nameRow}><Text style={[styles.deckName,{color:colors.text}]}>{deck.name}</Text>{deck.is_default ? <View style={[styles.defaultBadge,{backgroundColor:colors.yellow}]}><Ionicons name="star" size={11} color="#07111F" /><Text style={styles.defaultText}>PRINCIPAL</Text></View> : null}{deckStyle?<View style={[styles.deckStyleBadge,{backgroundColor:colors.accentSoft,borderColor:deckBorder}]}><Ionicons name={(deckStyle.icon||'albums') as keyof typeof Ionicons.glyphMap} size={11} color={deckBorder}/><Text style={[styles.deckStyleText,{color:deckBorder}]}>{String(deckStyle.name).toUpperCase()}</Text></View>:null}</View><Text style={[styles.deckMeta,{color:colors.muted}]}>{total} cartas • {formatUsd(marketValue)} • toque para ver o deck</Text></View>
              <Ionicons name="eye-outline" size={20} color={galaxyDeck?'#55E6FF':colors.muted} />
            </Pressable>
            <View style={[styles.deckActions,{borderTopColor:colors.border}]}>
              <View style={styles.deckActionGroup}>
                <Pressable style={[styles.secondary,{backgroundColor:colors.accentSoft}]} onPress={() => router.push(`/deck/${deck.id}`)} disabled={working}><Ionicons name="create-outline" size={15} color={colors.accent}/><Text style={[styles.secondaryText,{color:colors.text}]}>EDITAR / ADICIONAR</Text></Pressable>
                {!deck.is_default ? <Pressable style={[styles.secondary,{backgroundColor:colors.surfaceAlt}]} onPress={() => makeDefault(deck.id)} disabled={working}><Ionicons name="star-outline" size={15} color={colors.yellow} /><Text style={[styles.secondaryText,{color:colors.text}]}>PRINCIPAL</Text></Pressable> : null}
                <Pressable style={[styles.secondary,{backgroundColor:deckPro?'#15392A':colors.surfaceAlt}]} onPress={()=>void duplicate(deck.id)} disabled={working}><Ionicons name={deckPro?'copy':'lock-closed'} size={15} color={deckPro?'#59D49A':colors.muted}/><Text style={[styles.secondaryText,{color:deckPro?'#79E6AE':colors.muted}]}>{deckPro?'COPIAR':'DECK PRO'}</Text></Pressable>
              </View>
              {!deck.is_default ? <Pressable style={styles.deleteButton} onPress={() => remove(deck.id)} disabled={working}><Ionicons name="trash-outline" size={16} color="#FF98A8" /></Pressable> : null}
            </View>
          </View></AuraFrame>;
        })}
      </View>

      {!loading && decks.length === 0 ? <View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="albums-outline" size={38} color={colors.accent} /><Text style={[styles.emptyTitle,{color:colors.text}]}>Nenhum deck montado</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Crie um deck acima. O primeiro vira automaticamente seu deck principal.</Text></View> : null}

      <Modal visible={Boolean(viewingDeck)} transparent animationType="slide" onRequestClose={() => setViewingDeck(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.deckViewer,{backgroundColor:colors.surface,borderColor:colors.border}]}>
            <View style={styles.viewerHeader}>
              <View style={styles.viewerHeaderCopy}>
                <Text style={[styles.viewerKicker,{color:colors.yellow}]}>CARTAS DO DECK</Text>
                <Text numberOfLines={1} style={[styles.viewerTitle,{color:colors.text}]}>{viewingDeck?.name ?? 'Deck'}</Text>
                <Text style={[styles.viewerMeta,{color:colors.muted}]}>{viewedDeckTotal} cartas • {viewedDeckCards.length} diferentes • {formatUsd(viewedDeckValue)}</Text>
              </View>
              <Pressable accessibilityLabel="Fechar cartas do deck" onPress={() => setViewingDeck(null)} style={[styles.viewerClose,{backgroundColor:colors.surfaceAlt}]}><Ionicons name="close" size={21} color={colors.text}/></Pressable>
            </View>

            {viewedDeckCards.length ? (
              <ScrollView style={styles.viewerScroll} contentContainerStyle={styles.viewerGrid} showsVerticalScrollIndicator={false}>
                {viewedDeckCards.map((item: any) => {
                  const card = item.cards;
                  const quantity = Number(item.quantity ?? 1);
                  if (!card) return null;
                  return <View key={item.card_id} style={[styles.viewerCard,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                    <View style={styles.viewerImageWrap}>
                      {card.image_large || card.image_small ? <Image source={{uri:card.image_large || card.image_small}} resizeMode="contain" style={styles.viewerImage}/> : <View style={[styles.viewerImageFallback,{backgroundColor:colors.bg}]}><Ionicons name="image-outline" size={30} color={colors.muted}/></View>}
                      {quantity > 1 ? <View style={[styles.quantityBadge,{backgroundColor:colors.yellow}]}><Text style={styles.quantityText}>×{quantity}</Text></View> : null}
                    </View>
                    <Text numberOfLines={2} style={[styles.viewerCardName,{color:colors.text}]}>{card.pokemon_name || 'Carta'}</Text>
                    <Text numberOfLines={1} style={[styles.viewerCardSet,{color:colors.muted}]}>{card.set_name || card.rarity || 'Sem coleção'}</Text>
                    <View style={styles.viewerCardFooter}>
                      <Text numberOfLines={1} style={[styles.viewerCardRarity,{color:colors.muted}]}>{card.rarity || '—'}</Text>
                      <Text style={[styles.viewerCardPrice,{color:colors.yellow}]}>{formatUsd(Number(card.market_price_usd ?? 0))}</Text>
                    </View>
                  </View>;
                })}
              </ScrollView>
            ) : (
              <View style={[styles.viewerEmpty,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Ionicons name="albums-outline" size={42} color={colors.muted}/><Text style={[styles.viewerEmptyTitle,{color:colors.text}]}>Este deck ainda está vazio</Text><Text style={[styles.viewerEmptyText,{color:colors.muted}]}>Use o botão abaixo para escolher as cartas da sua Bag.</Text></View>
            )}

            <View style={[styles.viewerActions,{borderTopColor:colors.border}]}>
              <Pressable style={[styles.viewerSecondary,{backgroundColor:colors.surfaceAlt}]} onPress={() => setViewingDeck(null)}><Text style={[styles.viewerSecondaryText,{color:colors.text}]}>FECHAR</Text></Pressable>
              <Pressable style={[styles.viewerEdit,{backgroundColor:colors.yellow}]} onPress={() => { const deckId = viewingDeck?.id; setViewingDeck(null); if (deckId) router.push(`/deck/${deckId}`); }}><Ionicons name="add-circle" size={18} color="#07111F"/><Text style={styles.viewerEditText}>EDITAR / ADICIONAR CARTAS</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},notice:{flexDirection:'row',gap:8,padding:11,borderRadius:14,borderWidth:1},noticeText:{flex:1,fontSize:11,fontWeight:'700'},
  createBox:{gap:11,padding:17,borderRadius:21,borderWidth:1},createCopy:{gap:2},proTitleRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.3},proBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:7,paddingVertical:4,flexDirection:'row',gap:4,alignItems:'center'},proBadgeText:{fontSize:6.5,fontWeight:'900'},createTitle:{fontSize:19,fontWeight:'900'},createRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},input:{flex:1,minWidth:200,height:48,borderRadius:13,borderWidth:1,paddingHorizontal:13},createButton:{height:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:16,borderRadius:13},createButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},proHint:{fontSize:8,lineHeight:12},disabled:{opacity:.45},
  list:{gap:14},deck:{borderRadius:19,borderWidth:1,overflow:'hidden'},deckMain:{flexDirection:'row',alignItems:'center',gap:12,padding:13},preview:{width:96,height:80,flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:13,overflow:'hidden'},previewCard:{width:48,height:67,borderRadius:5},deckInfo:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},deckName:{fontSize:16,fontWeight:'900'},deckMeta:{fontSize:10,marginTop:4},defaultBadge:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:7,paddingVertical:4,borderRadius:999},defaultText:{color:'#07111F',fontSize:7,fontWeight:'900'},deckStyleBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:4},deckStyleText:{fontSize:6,fontWeight:'900'},deckActions:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:13,paddingVertical:8,borderTopWidth:1},deckActionGroup:{flexDirection:'row',gap:6,flexWrap:'wrap',flex:1},secondary:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:10},secondaryText:{fontSize:8,fontWeight:'900'},deleteButton:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#351A24'},empty:{alignItems:'center',gap:7,padding:28,borderRadius:19,borderWidth:1},emptyTitle:{fontSize:16,fontWeight:'900'},emptyText:{fontSize:11,textAlign:'center',maxWidth:420},
  modalBackdrop:{flex:1,backgroundColor:'rgba(3,7,14,.82)',justifyContent:'flex-end',paddingTop:28},deckViewer:{maxHeight:'92%',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,overflow:'hidden'},viewerHeader:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:17,paddingTop:17,paddingBottom:12},viewerHeaderCopy:{flex:1,minWidth:0},viewerKicker:{fontSize:8,fontWeight:'900',letterSpacing:1.2},viewerTitle:{fontSize:21,fontWeight:'900',marginTop:2},viewerMeta:{fontSize:9,fontWeight:'700',marginTop:4},viewerClose:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},viewerScroll:{flexGrow:0},viewerGrid:{paddingHorizontal:12,paddingBottom:18,flexDirection:'row',flexWrap:'wrap',gap:9},viewerCard:{width:'48%',minWidth:145,borderRadius:15,borderWidth:1,padding:9,gap:5},viewerImageWrap:{position:'relative',width:'100%',aspectRatio:.72,alignItems:'center',justifyContent:'center'},viewerImage:{width:'100%',height:'100%',borderRadius:8},viewerImageFallback:{width:'100%',height:'100%',borderRadius:8,alignItems:'center',justifyContent:'center'},quantityBadge:{position:'absolute',right:5,top:5,minWidth:29,height:25,paddingHorizontal:6,borderRadius:999,alignItems:'center',justifyContent:'center'},quantityText:{color:'#07111F',fontSize:10,fontWeight:'900'},viewerCardName:{fontSize:11,fontWeight:'900',lineHeight:14},viewerCardSet:{fontSize:8,fontWeight:'700'},viewerCardFooter:{flexDirection:'row',alignItems:'center',gap:6,justifyContent:'space-between'},viewerCardRarity:{fontSize:7,fontWeight:'700',flex:1},viewerCardPrice:{fontSize:9,fontWeight:'900'},viewerEmpty:{marginHorizontal:14,marginBottom:16,padding:28,borderRadius:17,borderWidth:1,alignItems:'center',gap:6},viewerEmptyTitle:{fontSize:15,fontWeight:'900'},viewerEmptyText:{fontSize:10,textAlign:'center'},viewerActions:{flexDirection:'row',alignItems:'center',gap:8,padding:12,borderTopWidth:1},viewerSecondary:{height:46,paddingHorizontal:16,borderRadius:13,alignItems:'center',justifyContent:'center'},viewerSecondaryText:{fontSize:9,fontWeight:'900'},viewerEdit:{height:46,flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:13},viewerEditText:{color:'#07111F',fontSize:8,fontWeight:'900'},
});