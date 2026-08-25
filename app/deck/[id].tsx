import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getMyBag } from '@/services/player';
import { getMyDecks, renameDeck, setDeckCards } from '@/services/decks';
import { gameTheme } from '@/theme/gameTheme';

type Selected = Record<string, number>;

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [deck, setDeck] = useState<any>(null);
  const [bag, setBag] = useState<any[]>([]);
  const [selected, setSelected] = useState<Selected>({});
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [decks, bagData] = await Promise.all([getMyDecks(), getMyBag()]);
      const found = decks.find((d: any) => d.id === id);
      if (!found) throw new Error('Deck não encontrado.');
      setDeck(found); setName(found.name); setBag(bagData ?? []);
      setSelected(Object.fromEntries((found.deck_cards ?? []).map((item: any) => [item.card_id, Number(item.quantity ?? 1)])));
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível carregar o deck.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => Object.values(selected).reduce((a, b) => a + b, 0), [selected]);
  const visible = useMemo(() => { const term = search.trim().toLowerCase(); return bag.filter((entry) => { const c = Array.isArray(entry.cards) ? entry.cards[0] : entry.cards; return c && (!term || String(c.pokemon_name).toLowerCase().includes(term) || String(c.rarity ?? '').toLowerCase().includes(term)); }); }, [bag, search]);
  const tileWidth = width >= 1100 ? '18.8%' : width >= 760 ? '23.5%' : '48.5%';

  function change(cardId: string, owned: number, delta: number) {
    setSelected((current) => {
      const max = Math.min(4, owned);
      const nextQty = Math.max(0, Math.min(max, (current[cardId] ?? 0) + delta));
      const next = { ...current };
      if (!nextQty) delete next[cardId]; else next[cardId] = nextQty;
      return next;
    });
  }

  async function save() {
    if (!id || total > 20) return;
    try {
      setSaving(true);
      if (name.trim() && name.trim() !== deck.name) await renameDeck(id, name.trim());
      await setDeckCards(id, Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })));
      setNotice('Deck salvo! Ele já pode ser usado nas batalhas.');
      await load();
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Não foi possível salvar o deck.'); }
    finally { setSaving(false); }
  }

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title: deck?.name ?? 'Editar Deck', headerStyle: { backgroundColor: '#07111F' }, headerTintColor: '#fff' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {notice ? <Pressable style={styles.notice} onPress={() => setNotice(null)}><Ionicons name="information-circle" size={19} color={gameTheme.colors.yellow} /><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
        {loading ? <ActivityIndicator size="large" color={gameTheme.colors.yellow} /> : <>
          <View style={styles.headerCard}>
            <View style={{ flex: 1 }}><Text style={styles.kicker}>DECK BUILDER</Text><TextInput value={name} onChangeText={setName} maxLength={40} style={styles.nameInput} /></View>
            <View style={[styles.counter, total > 20 && styles.counterError]}><Text style={styles.counterValue}>{total}/20</Text><Text style={styles.counterLabel}>CARTAS</Text></View>
          </View>
          <Text style={styles.helper}>Cada versão de card pode aparecer até 4 vezes, respeitando a quantidade real que existe na sua Bag.</Text>
          <View style={styles.searchBox}><Ionicons name="search" size={18} color="#7890AE" /><TextInput value={search} onChangeText={setSearch} placeholder="Buscar Pokémon ou raridade..." placeholderTextColor="#637895" style={styles.search} /></View>
          <View style={styles.grid}>{visible.map((entry) => { const card = Array.isArray(entry.cards) ? entry.cards[0] : entry.cards; if (!card) return null; const qty = selected[card.id] ?? 0; return <View key={card.id} style={[styles.cardTile, { width: tileWidth as any }, qty > 0 && styles.selectedTile]}>{card.image_small ? <Image source={{ uri: card.image_small }} resizeMode="contain" style={styles.cardImage} /> : <View style={styles.cardImage} />}<Text numberOfLines={1} style={styles.cardName}>{card.pokemon_name}</Text><Text numberOfLines={1} style={styles.cardMeta}>{card.rarity ?? 'Comum'} • Bag x{entry.quantity}</Text><View style={styles.qtyRow}><Pressable style={styles.qtyButton} onPress={() => change(card.id, entry.quantity, -1)}><Text style={styles.qtySign}>−</Text></Pressable><Text style={styles.qty}>{qty}</Text><Pressable style={styles.qtyButton} onPress={() => change(card.id, entry.quantity, 1)}><Text style={styles.qtySign}>+</Text></Pressable></View></View>; })}</View>
          <Pressable style={[styles.saveButton, (saving || total > 20) && styles.disabled]} onPress={save} disabled={saving || total > 20}><Ionicons name="save" size={18} color="#07111F" /><Text style={styles.saveText}>{saving ? 'SALVANDO...' : 'SALVAR DECK'}</Text></Pressable>
          <Pressable style={styles.backButton} onPress={() => router.back()}><Text style={styles.backText}>VOLTAR AOS DECKS</Text></Pressable>
        </>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#07111F'},content:{width:'100%',maxWidth:1180,alignSelf:'center',padding:16,paddingBottom:50,gap:12},notice:{flexDirection:'row',gap:8,padding:11,borderRadius:14,backgroundColor:'#2B2818',borderWidth:1,borderColor:'#5A5125'},noticeText:{flex:1,color:'#F8EFCB',fontSize:11,fontWeight:'700'},
  headerCard:{flexDirection:'row',alignItems:'center',gap:14,padding:16,borderRadius:20,backgroundColor:'#10284B',borderWidth:1,borderColor:'#285A9A'},kicker:{color:gameTheme.colors.yellow,fontSize:9,fontWeight:'900',letterSpacing:1.3},nameInput:{color:'#fff',fontSize:24,fontWeight:'900',paddingVertical:4,borderBottomWidth:1,borderBottomColor:'#315B89'},counter:{width:84,height:70,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#0B1A2D'},counterError:{backgroundColor:'#351A24'},counterValue:{color:'#fff',fontSize:20,fontWeight:'900'},counterLabel:{color:'#7187A4',fontSize:7,fontWeight:'900'},helper:{color:'#8094AF',fontSize:10,lineHeight:15},
  searchBox:{height:50,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:13,borderRadius:15,backgroundColor:'#0D1929',borderWidth:1,borderColor:'#263C59'},search:{flex:1,color:'#fff',height:'100%'},grid:{flexDirection:'row',flexWrap:'wrap',gap:9},cardTile:{padding:7,borderRadius:15,backgroundColor:'#0D1929',borderWidth:1,borderColor:'#263C59'},selectedTile:{borderColor:gameTheme.colors.yellow,backgroundColor:'#1C1D15'},cardImage:{width:'100%',aspectRatio:.72,borderRadius:9},cardName:{color:'#fff',fontSize:11,fontWeight:'900',marginTop:6},cardMeta:{color:'#7186A3',fontSize:8,marginTop:2},qtyRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:8},qtyButton:{width:31,height:31,borderRadius:9,alignItems:'center',justifyContent:'center',backgroundColor:'#1B2C43'},qtySign:{color:'#fff',fontSize:18,fontWeight:'900'},qty:{color:gameTheme.colors.yellow,minWidth:22,textAlign:'center',fontWeight:'900'},
  saveButton:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderRadius:13,backgroundColor:gameTheme.colors.yellow},saveText:{color:'#07111F',fontSize:10,fontWeight:'900'},disabled:{opacity:.45},backButton:{alignItems:'center',padding:12},backText:{color:'#8398B3',fontSize:9,fontWeight:'900'},
});
