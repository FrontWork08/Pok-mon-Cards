import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import { getAdminPlayers, getMyAdminAccess, type AdminPlayer } from '@/services/admin';
import { grantOwnerCard, searchOwnerCards, type OwnerCardCatalogItem } from '@/services/adminCardGrant';
import { VIRTUAL_LIST_PERF_PROPS } from '@/performance/scrollPerformance';
import { useAppTheme } from '@/theme/ThemeProvider';

const PAGE_SIZE = 80;

export default function AdminCardGrantScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [card, setCard] = useState<OwnerCardCatalogItem | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [cards, setCards] = useState<OwnerCardCatalogItem[]>([]);
  const [cardTotal, setCardTotal] = useState(0);
  const [playerPicker, setPlayerPicker] = useState(false);
  const [cardPicker, setCardPicker] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogMore, setCatalogMore] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const access = await getMyAdminAccess();
      if (!access.isOwner) throw new Error('OWNER_ONLY: somente o Criador pode adicionar qualquer carta às contas.');
      const rows = await getAdminPlayers();
      setPlayers(rows);
      setTargetId((current) => current && rows.some((row) => row.id === current) ? current : access.playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a central de cartas do Criador.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const target = useMemo(() => players.find((row) => row.id === targetId) ?? null, [players, targetId]);
  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return players.filter((row) => !q || row.username.toLowerCase().includes(q) || row.id.toLowerCase().includes(q));
  }, [playerSearch, players]);

  const loadCards = useCallback(async (reset: boolean) => {
    const requestId = ++requestRef.current;
    try {
      reset ? setCatalogLoading(true) : setCatalogMore(true);
      setError(null);
      const offset = reset ? 0 : cards.length;
      const page = await searchOwnerCards(cardSearch.trim(), offset, PAGE_SIZE);
      if (requestId !== requestRef.current) return;
      setCardTotal(page.total);
      setCards((current) => {
        if (reset) return page.items;
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
    } catch (e) {
      if (requestId === requestRef.current) setError(e instanceof Error ? e.message : 'Não foi possível buscar as cartas.');
    } finally {
      if (requestId === requestRef.current) {
        setCatalogLoading(false);
        setCatalogMore(false);
      }
    }
  }, [cardSearch, cards.length]);

  useEffect(() => {
    if (!cardPicker) return;
    const timer = setTimeout(() => { void loadCards(true); }, 260);
    return () => clearTimeout(timer);
  }, [cardPicker, cardSearch]);

  const qty = Math.max(0, Number(quantity.replace(/[^0-9]/g, '')) || 0);

  async function executeGrant() {
    if (working) return;
    if (!target) { setError('Escolha a conta que vai receber a carta.'); return; }
    if (!card) { setError('Escolha a carta que será adicionada.'); return; }
    if (qty < 1 || qty > 100) { setError('Escolha uma quantidade entre 1 e 100.'); return; }
    try {
      setWorking(true);
      setError(null);
      const result = await grantOwnerCard(target.id, card.id, qty, note);
      setNotice(`${result.quantityAdded}x ${result.card.name} adicionada(s) para @${result.username}. Quantidade: ${result.quantityBefore} → ${result.quantityAfter}.`);
      setQuantity('1');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar a carta.');
    } finally {
      setWorking(false);
    }
  }

  function confirmGrant() {
    setError(null);
    setNotice(null);
    if (!target) {
      setError('Escolha a conta que vai receber a carta.');
      return;
    }
    if (!card) {
      setError('Escolha a carta que será adicionada.');
      return;
    }
    if (qty < 1 || qty > 100) {
      setError('Escolha uma quantidade entre 1 e 100.');
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <Screen title="Adicionar Carta" subtitle="Ferramenta exclusiva do Criador para colocar qualquer carta em qualquer conta.">
      <Pressable style={styles.back} onPress={() => goBackOrHome(router)}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText, { color: colors.muted }]}>Voltar</Text>
      </Pressable>

      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.yellow }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="add-circle" size={30} color={colors.yellow} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.yellow }]}>OWNER ONLY • NÃO DELEGÁVEL</Text>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Carta direta para qualquer conta</Text>
          <Text style={[styles.helper, { color: colors.muted }]}>Você escolhe o treinador, a carta exata e a quantidade. Outros admins não recebem esta permissão, mesmo com acesso total às opções delegáveis.</Text>
        </View>
      </View>

      {notice ? <Pressable onPress={() => setNotice(null)} style={[styles.notice, { backgroundColor: '#15392A', borderColor: '#59D49A' }]}><Ionicons name="checkmark-circle" size={18} color="#59D49A" /><Text style={styles.noticeText}>{notice}</Text></Pressable> : null}
      {error ? <Pressable onPress={() => setError(null)} style={[styles.notice, { backgroundColor: '#351A24', borderColor: '#683243' }]}><Ionicons name="alert-circle" size={18} color="#FF8998" /><Text style={[styles.noticeText, { color: '#FFD7DD' }]}>{error}</Text></Pressable> : null}
      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}

      {!loading ? <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>1. CONTA QUE VAI RECEBER</Text>
        <Pressable onPress={() => setPlayerPicker(true)} style={[styles.selector, { backgroundColor: colors.surfaceAlt, borderColor: colors.accent }]}>
          <Ionicons name="person-circle" size={24} color={colors.accent} />
          <View style={{ flex: 1 }}><Text style={[styles.selectorName, { color: colors.text }]}>{target ? `@${target.username}` : 'Escolher conta'}</Text><Text style={[styles.meta, { color: colors.muted }]}>Sua conta ou qualquer amigo/jogador</Text></View>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>

        <Text style={[styles.label, { color: colors.muted }]}>2. CARTA EXATA</Text>
        <Pressable onPress={() => setCardPicker(true)} style={[styles.selector, { backgroundColor: colors.surfaceAlt, borderColor: card ? colors.yellow : colors.border }]}>
          {card?.image ? <Image source={{ uri: card.image }} style={styles.thumb} resizeMode="contain" /> : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="albums" size={22} color={colors.muted} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.selectorName, { color: colors.text }]}>{card?.name ?? 'Escolher qualquer carta do catálogo'}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{card ? `${card.setName ?? card.setId} • #${card.number ?? '—'} • ${card.rarity ?? 'Sem raridade'}` : 'Busca por nome, ID, set ou número'}</Text></View>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>

        <Text style={[styles.label, { color: colors.muted }]}>3. QUANTIDADE</Text>
        <TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={3} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: qty >= 1 && qty <= 100 ? colors.border : '#8B3D4E' }]} placeholder="1" placeholderTextColor={colors.muted} />

        <Text style={[styles.label, { color: colors.muted }]}>4. NOTA DE AUDITORIA (OPCIONAL)</Text>
        <TextInput value={note} onChangeText={setNote} maxLength={500} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} placeholder="Ex.: presente, correção, teste..." placeholderTextColor={colors.muted} />

        <Pressable disabled={working} onPress={confirmGrant} style={[styles.primary, { backgroundColor: colors.yellow }, working && styles.disabled]}>
          {working ? <ActivityIndicator color="#07111F" /> : <Ionicons name="gift" size={20} color="#07111F" />}
          <Text style={styles.primaryText}>{working ? 'ADICIONANDO…' : 'ADICIONAR CARTA À CONTA'}</Text>
        </Pressable>
      </View> : null}

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => { if (!working) setConfirmOpen(false); }}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} disabled={working} onPress={() => setConfirmOpen(false)} />
          <View style={[styles.confirmCard, { backgroundColor: colors.bg, borderColor: colors.yellow }]}>
            <View style={[styles.confirmIcon, { backgroundColor: colors.accentSoft }]}><Ionicons name="gift" size={28} color={colors.yellow} /></View>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>Adicionar carta à conta?</Text>
            <Text style={[styles.confirmBody, { color: colors.muted }]}>{card && target ? `Adicionar ${qty}x ${card.name} (${card.setName ?? card.setId} #${card.number ?? '—'}) para @${target.username}?` : ''}</Text>
            <Text style={[styles.confirmAudit, { color: colors.muted }]}>A ação é exclusiva do Criador e ficará registrada na auditoria.</Text>
            <View style={styles.confirmActions}>
              <Pressable disabled={working} onPress={() => setConfirmOpen(false)} style={[styles.confirmSecondary, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.confirmSecondaryText, { color: colors.text }]}>CANCELAR</Text></Pressable>
              <Pressable disabled={working} onPress={() => { setConfirmOpen(false); void executeGrant(); }} style={[styles.confirmPrimary, { backgroundColor: colors.yellow }, working && styles.disabled]}>{working ? <ActivityIndicator color="#07111F" /> : <Ionicons name="add-circle" size={18} color="#07111F" />}<Text style={styles.confirmPrimaryText}>{working ? 'ADICIONANDO…' : 'ADICIONAR'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={playerPicker} transparent animationType="fade" onRequestClose={() => setPlayerPicker(false)}>
        <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={() => setPlayerPicker(false)} /><View style={[styles.picker, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={styles.pickerHead}><Text style={[styles.pickerTitle, { color: colors.text }]}>Escolher conta</Text><Pressable onPress={() => setPlayerPicker(false)}><Ionicons name="close" size={23} color={colors.text} /></Pressable></View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={playerSearch} onChangeText={setPlayerSearch} placeholder="Buscar jogador..." placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View>
          <FlatList {...VIRTUAL_LIST_PERF_PROPS} data={filteredPlayers} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable onPress={() => { setTargetId(item.id); setPlayerPicker(false); setPlayerSearch(''); }} style={[styles.row, { backgroundColor: colors.surface, borderColor: item.id === targetId ? colors.accent : colors.border }]}><Ionicons name="person" size={18} color={colors.accent} /><Text style={[styles.rowName, { color: colors.text }]}>@{item.username}</Text>{item.id === targetId ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}</Pressable>} />
        </View></View>
      </Modal>

      <Modal visible={cardPicker} transparent animationType="fade" onRequestClose={() => setCardPicker(false)}>
        <View style={styles.overlay}><Pressable style={StyleSheet.absoluteFill} onPress={() => setCardPicker(false)} /><View style={[styles.cardPicker, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={styles.pickerHead}><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.yellow }]}>CATÁLOGO COMPLETO</Text><Text style={[styles.pickerTitle, { color: colors.text }]}>{cardTotal.toLocaleString('pt-BR')} carta(s)</Text></View><Pressable onPress={() => setCardPicker(false)}><Ionicons name="close" size={23} color={colors.text} /></Pressable></View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.muted} /><TextInput autoFocus value={cardSearch} onChangeText={setCardSearch} placeholder="Nome, set, número ou ID..." placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View>
          {catalogLoading ? <ActivityIndicator color={colors.yellow} /> : null}
          <FlatList {...VIRTUAL_LIST_PERF_PROPS} data={cards} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} onEndReachedThreshold={0.35} onEndReached={() => { if (!catalogLoading && !catalogMore && cards.length < cardTotal) void loadCards(false); }} ListFooterComponent={catalogMore ? <ActivityIndicator color={colors.yellow} /> : null} renderItem={({ item }) => <Pressable onPress={() => { setCard(item); setCardPicker(false); }} style={[styles.cardRow, { backgroundColor: colors.surface, borderColor: item.id === card?.id ? colors.yellow : colors.border }]}>{item.imageSmall || item.image ? <Image source={{ uri: item.imageSmall ?? item.image ?? '' }} style={styles.cardThumb} resizeMode="contain" /> : <View style={[styles.cardThumb, styles.thumbPlaceholder]} />}<View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.rowName, { color: colors.text }]}>{item.name}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{item.setName ?? item.setId} • #{item.number ?? '—'} • {item.rarity ?? 'Sem raridade'}</Text><Text numberOfLines={1} style={[styles.cardId, { color: colors.accent }]}>{item.id}</Text></View>{item.marketPriceUsd != null ? <Text style={[styles.price, { color: colors.yellow }]}>${Number(item.marketPriceUsd).toFixed(2)}</Text> : null}</Pressable>} />
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},backText:{fontSize:12,fontWeight:'800'},hero:{borderRadius:20,borderWidth:1,padding:15,flexDirection:'row',gap:11,alignItems:'center'},heroIcon:{width:58,height:58,borderRadius:18,alignItems:'center',justifyContent:'center'},kicker:{fontSize:8,fontWeight:'900',letterSpacing:1},heroTitle:{fontSize:18,fontWeight:'900',marginTop:2},helper:{fontSize:9,lineHeight:14,marginTop:3},notice:{borderRadius:13,borderWidth:1,padding:10,flexDirection:'row',gap:8,alignItems:'center'},noticeText:{flex:1,color:'#D9FFEC',fontSize:9,lineHeight:14,fontWeight:'800'},panel:{borderRadius:18,borderWidth:1,padding:13,gap:9},label:{fontSize:8,fontWeight:'900',letterSpacing:.8,marginTop:3},selector:{minHeight:58,borderRadius:13,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:9},selectorName:{fontSize:11,fontWeight:'900'},meta:{fontSize:7.5,lineHeight:11,marginTop:2},thumb:{width:42,height:55,borderRadius:6},thumbPlaceholder:{alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.04)'},input:{minHeight:46,borderWidth:1,borderRadius:12,paddingHorizontal:11,fontSize:10},primary:{minHeight:50,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:4},primaryText:{color:'#07111F',fontSize:9,fontWeight:'900'},disabled:{opacity:.45},overlay:{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'center',padding:16},picker:{height:'70%',borderWidth:1,borderRadius:20,padding:12},cardPicker:{height:'88%',borderWidth:1,borderRadius:20,padding:12},pickerHead:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},pickerTitle:{fontSize:18,fontWeight:'900'},searchBox:{height:46,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},searchInput:{flex:1,fontSize:11},list:{gap:7,paddingBottom:18},row:{minHeight:50,borderWidth:1,borderRadius:12,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:8},rowName:{fontSize:10,fontWeight:'900',flex:1},cardRow:{minHeight:86,borderWidth:1,borderRadius:13,padding:8,flexDirection:'row',alignItems:'center',gap:9},cardThumb:{width:50,height:70,borderRadius:5},cardId:{fontSize:6.8,fontWeight:'800',marginTop:3},price:{fontSize:9,fontWeight:'900'},confirmCard:{width:'100%',maxWidth:470,alignSelf:'center',borderWidth:1,borderRadius:20,padding:18,alignItems:'center',gap:9},confirmIcon:{width:56,height:56,borderRadius:18,alignItems:'center',justifyContent:'center'},confirmTitle:{fontSize:18,fontWeight:'900',textAlign:'center'},confirmBody:{fontSize:10,lineHeight:15,textAlign:'center'},confirmAudit:{fontSize:7.5,lineHeight:11,textAlign:'center'},confirmActions:{width:'100%',flexDirection:'row',gap:8,marginTop:4},confirmSecondary:{flex:1,minHeight:46,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},confirmSecondaryText:{fontSize:8,fontWeight:'900'},confirmPrimary:{flex:1,minHeight:46,borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},confirmPrimaryText:{fontSize:8,fontWeight:'900',color:'#07111F'}
});
