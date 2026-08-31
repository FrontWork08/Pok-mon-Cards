import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { Screen } from '@/components/Screen';
import { AuraFrame } from '@/components/AuraFrame';
import { createDeck, deleteDeck, getMyDecks, setDefaultDeck } from '@/services/decks';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function DecksScreen() {
  const router = useRouter();
  const { colors, isLight } = useAppTheme();
  const [decks, setDecks] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setDecks(await getMyDecks()); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível carregar os decks.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try { setWorking(true); const id = await createDeck(trimmed); setName(''); router.push(`/deck/${id}`); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível criar o deck.'); }
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

  return (
    <Screen title="Meus Decks" subtitle="Monte equipes com cards da sua Bag e deixe um deck principal pronto para batalhas.">
      <Pressable style={styles.backRow} onPress={() => goBackOrHome(router)}><Ionicons name="arrow-back" size={18} color={colors.muted} /><Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text></Pressable>
      {notice ? <Pressable style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.border}]} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={colors.yellow} /><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text></Pressable> : null}

      <View style={[styles.createBox,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
        <View style={styles.createCopy}><Text style={[styles.kicker,{color:colors.yellow}]}>NOVO DECK</Text><Text style={[styles.createTitle,{color:colors.text}]}>Prepare sua próxima batalha</Text></View>
        <View style={styles.createRow}><TextInput value={name} onChangeText={setName} onSubmitEditing={create} placeholder="Ex.: Fantasmas" placeholderTextColor={colors.muted} style={[styles.input,{backgroundColor:colors.surface,borderColor:colors.border,color:colors.text}]} /><Pressable style={[styles.createButton,{backgroundColor:colors.yellow}, (!name.trim() || working) && styles.disabled]} onPress={create} disabled={!name.trim() || working}><Ionicons name="add" size={19} color="#07111F" /><Text style={styles.createButtonText}>CRIAR</Text></Pressable></View>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      <View style={styles.list}>
        {decks.map((deck) => {
          const total = (deck.deck_cards ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0);
          const marketValue = (deck.deck_cards ?? []).reduce((sum: number, item: any) => sum + Number(item.cards?.market_price_usd ?? 0) * Number(item.quantity ?? 0), 0);
          const deckStyle = Array.isArray(deck.economy_store_items) ? deck.economy_store_items[0] : deck.economy_store_items;
          const deckBorder = deckStyle
            ? String(deck.style_item_id??'').includes('master') ? '#C493FF'
              : String(deck.style_item_id??'').includes('elite') ? colors.accent
              : colors.yellow
            : deck.is_default ? colors.yellow : colors.border;
          return <AuraFrame key={deck.id} primaryColor={deckBorder} secondaryColor={deckStyle && String(deck.style_item_id??'').includes('master')?'#8EE7FF':colors.yellow} intensity={deckStyle ? (String(deck.style_item_id??'').includes('master')?'master':'premium') : 'soft'} radius={19}><View style={[styles.deck,{backgroundColor:colors.surface,borderColor:deckBorder,borderWidth:deckStyle?2:1}]}>
            <Pressable style={styles.deckMain} onPress={() => router.push(`/deck/${deck.id}`)}>
              <View style={[styles.preview,{backgroundColor:isLight?'#EDF2F7':colors.bg}]}>{(deck.deck_cards ?? []).slice(0, 3).map((item: any, index: number) => item.cards?.image_small ? <Image key={`${item.card_id}-${index}`} source={{ uri: item.cards.image_small }} style={[styles.previewCard, { marginLeft: index ? -25 : 0 }]} /> : null)}{total === 0 ? <Ionicons name="albums-outline" size={34} color={colors.muted} /> : null}</View>
              <View style={styles.deckInfo}><View style={styles.nameRow}><Text style={[styles.deckName,{color:colors.text}]}>{deck.name}</Text>{deck.is_default ? <View style={[styles.defaultBadge,{backgroundColor:colors.yellow}]}><Ionicons name="star" size={11} color="#07111F" /><Text style={styles.defaultText}>PRINCIPAL</Text></View> : null}{deckStyle?<View style={[styles.deckStyleBadge,{backgroundColor:colors.accentSoft,borderColor:deckBorder}]}><Ionicons name={(deckStyle.icon||'albums') as keyof typeof Ionicons.glyphMap} size={11} color={deckBorder}/><Text style={[styles.deckStyleText,{color:deckBorder}]}>{String(deckStyle.name).toUpperCase()}</Text></View>:null}</View><Text style={[styles.deckMeta,{color:colors.muted}]}>{total} cartas • {formatUsd(marketValue)} • toque para editar</Text></View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
            <View style={[styles.deckActions,{borderTopColor:colors.border}]}>{!deck.is_default ? <Pressable style={[styles.secondary,{backgroundColor:colors.surfaceAlt}]} onPress={() => makeDefault(deck.id)} disabled={working}><Ionicons name="star-outline" size={15} color={colors.yellow} /><Text style={[styles.secondaryText,{color:colors.text}]}>TORNAR PRINCIPAL</Text></Pressable> : <View />}{!deck.is_default ? <Pressable style={styles.deleteButton} onPress={() => remove(deck.id)} disabled={working}><Ionicons name="trash-outline" size={16} color="#FF98A8" /></Pressable> : null}</View>
          </View></AuraFrame>;
        })}
      </View>

      {!loading && decks.length === 0 ? <View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}><Ionicons name="albums-outline" size={38} color={colors.accent} /><Text style={[styles.emptyTitle,{color:colors.text}]}>Nenhum deck montado</Text><Text style={[styles.emptyText,{color:colors.muted}]}>Crie um deck acima. O primeiro vira automaticamente seu deck principal.</Text></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},notice:{flexDirection:'row',gap:8,padding:11,borderRadius:14,borderWidth:1},noticeText:{flex:1,fontSize:11,fontWeight:'700'},
  createBox:{gap:11,padding:17,borderRadius:21,borderWidth:1},createCopy:{gap:2},kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.3},createTitle:{fontSize:19,fontWeight:'900'},createRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},input:{flex:1,minWidth:200,height:48,borderRadius:13,borderWidth:1,paddingHorizontal:13},createButton:{height:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:16,borderRadius:13},createButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},disabled:{opacity:.45},
  list:{gap:14},deck:{borderRadius:19,borderWidth:1,overflow:'hidden'},deckMain:{flexDirection:'row',alignItems:'center',gap:12,padding:13},preview:{width:96,height:80,flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:13,overflow:'hidden'},previewCard:{width:48,height:67,borderRadius:5},deckInfo:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},deckName:{fontSize:16,fontWeight:'900'},deckMeta:{fontSize:10,marginTop:4},defaultBadge:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:7,paddingVertical:4,borderRadius:999},defaultText:{color:'#07111F',fontSize:7,fontWeight:'900'},deckStyleBadge:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:4},deckStyleText:{fontSize:6,fontWeight:'900'},deckActions:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:13,paddingVertical:8,borderTopWidth:1},secondary:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:10},secondaryText:{fontSize:8,fontWeight:'900'},deleteButton:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#351A24'},empty:{alignItems:'center',gap:7,padding:28,borderRadius:19,borderWidth:1},emptyTitle:{fontSize:16,fontWeight:'900'},emptyText:{fontSize:11,textAlign:'center',maxWidth:420},
});
