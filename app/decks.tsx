import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { createDeck, deleteDeck, getMyDecks, setDefaultDeck } from '@/services/decks';
import { gameTheme } from '@/theme/gameTheme';

export default function DecksScreen() {
  const router = useRouter();
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
      <Pressable style={styles.backRow} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color="#A9BDD7" /><Text style={styles.backText}>Voltar</Text></Pressable>
      {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}

      <View style={styles.createBox}>
        <View style={styles.createCopy}><Text style={styles.kicker}>NOVO DECK</Text><Text style={styles.createTitle}>Prepare sua próxima batalha</Text></View>
        <View style={styles.createRow}><TextInput value={name} onChangeText={setName} onSubmitEditing={create} placeholder="Ex.: Fantasmas" placeholderTextColor="#6E819D" style={styles.input} /><Pressable style={[styles.createButton, (!name.trim() || working) && styles.disabled]} onPress={create} disabled={!name.trim() || working}><Ionicons name="add" size={19} color="#07111F" /><Text style={styles.createButtonText}>CRIAR</Text></Pressable></View>
      </View>

      {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : null}

      <View style={styles.list}>
        {decks.map((deck) => {
          const total = (deck.deck_cards ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0);
          return <View key={deck.id} style={[styles.deck, deck.is_default && styles.defaultDeck]}>
            <Pressable style={styles.deckMain} onPress={() => router.push(`/deck/${deck.id}`)}>
              <View style={styles.preview}>{(deck.deck_cards ?? []).slice(0, 3).map((item: any, index: number) => item.cards?.image_small ? <Image key={`${item.card_id}-${index}`} source={{ uri: item.cards.image_small }} style={[styles.previewCard, { marginLeft: index ? -25 : 0 }]} /> : null)}{total === 0 ? <Ionicons name="albums-outline" size={34} color="#617A9C" /> : null}</View>
              <View style={styles.deckInfo}><View style={styles.nameRow}><Text style={styles.deckName}>{deck.name}</Text>{deck.is_default ? <View style={styles.defaultBadge}><Ionicons name="star" size={11} color="#07111F" /><Text style={styles.defaultText}>PRINCIPAL</Text></View> : null}</View><Text style={styles.deckMeta}>{total} cartas • toque para editar</Text></View>
              <Ionicons name="chevron-forward" size={20} color="#607894" />
            </Pressable>
            <View style={styles.deckActions}>{!deck.is_default ? <Pressable style={styles.secondary} onPress={() => makeDefault(deck.id)} disabled={working}><Ionicons name="star-outline" size={15} color="#C8D8EC" /><Text style={styles.secondaryText}>TORNAR PRINCIPAL</Text></Pressable> : <View />}{!deck.is_default ? <Pressable style={styles.deleteButton} onPress={() => remove(deck.id)} disabled={working}><Ionicons name="trash-outline" size={16} color="#FF98A8" /></Pressable> : null}</View>
          </View>;
        })}
      </View>

      {!loading && decks.length === 0 ? <View style={styles.empty}><Ionicons name="albums-outline" size={38} color="#617A9C" /><Text style={styles.emptyTitle}>Nenhum deck montado</Text><Text style={styles.emptyText}>Crie um deck acima. O primeiro vira automaticamente seu deck principal.</Text></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{color:'#A9BDD7',fontSize:12,fontWeight:'800'},notice:{flexDirection:'row',gap:8,padding:11,borderRadius:14,backgroundColor:'#2B2818',borderWidth:1,borderColor:'#5A5125'},noticeText:{flex:1,color:'#F8EFCB',fontSize:11,fontWeight:'700'},
  createBox:{gap:11,padding:17,borderRadius:21,backgroundColor:'#10284B',borderWidth:1,borderColor:'#285A9A'},createCopy:{gap:2},kicker:{color:gameTheme.colors.yellow,fontSize:9,fontWeight:'900',letterSpacing:1.3},createTitle:{color:'#fff',fontSize:19,fontWeight:'900'},createRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},input:{flex:1,minWidth:200,height:48,borderRadius:13,backgroundColor:'#091729',borderWidth:1,borderColor:'#294567',paddingHorizontal:13,color:'#fff'},createButton:{height:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:16,borderRadius:13,backgroundColor:gameTheme.colors.yellow},createButtonText:{color:'#07111F',fontSize:9,fontWeight:'900'},disabled:{opacity:.45},
  list:{gap:10},deck:{borderRadius:19,backgroundColor:'#101D30',borderWidth:1,borderColor:'#263E5C',overflow:'hidden'},defaultDeck:{borderColor:'#75651F'},deckMain:{flexDirection:'row',alignItems:'center',gap:12,padding:13},preview:{width:96,height:80,flexDirection:'row',alignItems:'center',justifyContent:'center',borderRadius:13,backgroundColor:'#091524',overflow:'hidden'},previewCard:{width:48,height:67,borderRadius:5},deckInfo:{flex:1},nameRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},deckName:{color:'#fff',fontSize:16,fontWeight:'900'},deckMeta:{color:'#7F93AD',fontSize:10,marginTop:4},defaultBadge:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:7,paddingVertical:4,borderRadius:999,backgroundColor:gameTheme.colors.yellow},defaultText:{color:'#07111F',fontSize:7,fontWeight:'900'},deckActions:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:13,paddingVertical:8,borderTopWidth:1,borderTopColor:'#1D314B'},secondary:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:10,backgroundColor:'#18283D'},secondaryText:{color:'#C8D8EC',fontSize:8,fontWeight:'900'},deleteButton:{width:34,height:34,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#351A24'},empty:{alignItems:'center',gap:7,padding:28,borderRadius:19,backgroundColor:'#0D1929',borderWidth:1,borderColor:'#203551'},emptyTitle:{color:'#fff',fontSize:16,fontWeight:'900'},emptyText:{color:'#7F93AD',fontSize:11,textAlign:'center',maxWidth:420},
});
