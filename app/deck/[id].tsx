import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
import { PokemonTypeSymbolFilter } from '@/components/PokemonTypeSymbolFilter';
import { goBackOrHome } from '@/navigation/goBackOrHome';
import {
  getDeckBuilderPage,
  getMyDeck,
  renameDeck,
  setDeckCards,
  type DeckBuilderCardEntry,
  type DeckBuilderSortMode,
} from '@/services/decks';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';
import {
  applyDeckEconomyStyle,
  clearDeckEconomyStyle,
  getMyVisualStyleOptions,
  type VisualStyleOption,
} from '@/services/economy';
import { useWallet } from '@/wallet/WalletProvider';

type Selected = Record<string, number>;
type PriceMap = Record<string, number | null>;

const PAGE_SIZE = 36;

function deckStylePalette(id:string,accent:string,yellow:string){
  const key=id.toLowerCase();
  if(key.includes('galaxy'))return {primary:'#8B5CFF',secondary:'#55E6FF'};
  if(key.includes('master'))return {primary:'#C493FF',secondary:'#8EE7FF'};
  if(key.includes('celestial'))return {primary:'#55E6FF',secondary:'#D8B8FF'};
  if(key.includes('crimson')||key.includes('crown'))return {primary:'#FF667A',secondary:'#FFB36B'};
  if(key.includes('champion')||key.includes('gold'))return {primary:'#FFD447',secondary:'#FFF0A8'};
  if(key.includes('indigo'))return {primary:'#6A7CFF',secondary:'#55D9FF'};
  if(key.includes('kanto')||key.includes('night'))return {primary:'#8B72FF',secondary:'#6EC8FF'};
  if(key.includes('elite'))return {primary:accent,secondary:'#55D9FF'};
  return {primary:accent,secondary:yellow};
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const wallet = useWallet();

  const [deck, setDeck] = useState<any>(null);
  const [cards, setCards] = useState<DeckBuilderCardEntry[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [selected, setSelected] = useState<Selected>({});
  const [prices, setPrices] = useState<PriceMap>({});
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<DeckBuilderSortMode>('name');
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [availableRarities, setAvailableRarities] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState<DeckBuilderCardEntry | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stylePickerOpen,setStylePickerOpen]=useState(false);
  const [styleOptions,setStyleOptions]=useState<VisualStyleOption[]>([]);
  const [styleOptionsLoading,setStyleOptionsLoading]=useState(false);
  const [styleApplying,setStyleApplying]=useState<string|null>(null);

  const pageRequestId = useRef(0);
  const loadingMoreRef = useRef(false);

  const builderFilters = useMemo(() => ({
    search,
    typeFilter,
    rarityFilter,
    sortMode,
  }), [rarityFilter, search, sortMode, typeFilter]);

  const mergePrices = useCallback((rows: DeckBuilderCardEntry[]) => {
    setPrices((current) => {
      let changed = false;
      const next = { ...current };
      for (const row of rows) {
        const card = row.cards;
        if (!card) continue;
        const value = card.market_price_usd == null ? null : Number(card.market_price_usd);
        if (!(card.id in next) || next[card.id] !== value) {
          next[card.id] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const loadDeck = useCallback(async () => {
    if (!id) return;
    try {
      setLoadingDeck(true);
      const found = await getMyDeck(id);
      setDeck(found);
      setName(String(found.name ?? ''));

      const nextSelected: Selected = {};
      const nextPrices: PriceMap = {};
      for (const item of (found.deck_cards ?? []) as any[]) {
        const card = relationOne<any>(item.cards);
        nextSelected[String(item.card_id)] = Number(item.quantity ?? 1);
        if (card?.id) {
          nextPrices[String(card.id)] = card.market_price_usd == null ? null : Number(card.market_price_usd);
        }
      }
      setSelected(nextSelected);
      setPrices((current) => ({ ...current, ...nextPrices }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar o deck.');
    } finally {
      setLoadingDeck(false);
    }
  }, [id]);

  const loadFirstPage = useCallback(async () => {
    const currentRequest = ++pageRequestId.current;
    try {
      setLoadingCards(true);
      const page = await getDeckBuilderPage(0, PAGE_SIZE, builderFilters);
      if (currentRequest !== pageRequestId.current) return;
      setCards(page.items);
      setTotalCards(page.total);
      setAvailableTypes(page.availableTypes);
      setAvailableRarities(page.availableRarities);
      mergePrices(page.items);
    } catch (err) {
      if (currentRequest !== pageRequestId.current) return;
      setCards([]);
      setTotalCards(0);
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar as cartas da Bag.');
    } finally {
      if (currentRequest === pageRequestId.current) setLoadingCards(false);
    }
  }, [builderFilters, mergePrices]);

  useEffect(() => {
    void loadDeck();
  }, [loadDeck]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadFirstPage();
    }, search.trim() ? 220 : 40);
    return () => clearTimeout(timer);
  }, [loadFirstPage, search]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loadingCards || cards.length >= totalCards) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const currentRequest = pageRequestId.current;
    try {
      const page = await getDeckBuilderPage(cards.length, PAGE_SIZE, builderFilters);
      if (currentRequest !== pageRequestId.current) return;
      setCards((current) => {
        const known = new Set(current.map((item) => item.cards?.id));
        return [...current, ...page.items.filter((item) => !known.has(item.cards?.id))];
      });
      setTotalCards(page.total);
      mergePrices(page.items);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível carregar mais cartas.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [builderFilters, cards.length, loadingCards, mergePrices, totalCards]);

  const total = useMemo(
    () => Object.values(selected).reduce((sum, qty) => sum + qty, 0),
    [selected],
  );

  const totalValue = useMemo(
    () => Object.entries(selected).reduce(
      (sum, [cardId, qty]) => sum + Number(prices[cardId] ?? 0) * qty,
      0,
    ),
    [prices, selected],
  );

  const change = useCallback((cardId: string, owned: number, delta: number) => {
    setSelected((current) => {
      const max = Math.min(4, Number(owned ?? 0));
      const nextQty = Math.max(0, Math.min(max, (current[cardId] ?? 0) + delta));
      if ((current[cardId] ?? 0) === nextQty) return current;
      const next = { ...current };
      if (!nextQty) delete next[cardId];
      else next[cardId] = nextQty;
      return next;
    });
  }, []);

  async function save() {
    if (!id || total > 20 || saving) return;
    try {
      setSaving(true);
      const nextName = name.trim();
      if (nextName && nextName !== deck?.name) {
        await renameDeck(id, nextName);
      }
      await setDeckCards(
        id,
        Object.entries(selected).map(([card_id, quantity]) => ({ card_id, quantity })),
      );
      setDeck((current: any) => current ? { ...current, name: nextName || current.name } : current);
      setNotice('Deck salvo! Ele já pode ser usado nas batalhas.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível salvar o deck.');
    } finally {
      setSaving(false);
    }
  }

  async function openDeckStylePicker(){
    setStylePickerOpen(true);
    try{
      setStyleOptionsLoading(true);
      setStyleOptions(await getMyVisualStyleOptions('deck'));
    }catch(err){
      setNotice(err instanceof Error?err.message:'Não foi possível carregar seus temas.');
    }finally{
      setStyleOptionsLoading(false);
    }
  }

  async function applyDeckStyle(option:VisualStyleOption){
    if(!id||styleApplying)return;
    try{
      setStyleApplying(option.id);
      await applyDeckEconomyStyle(id,option.id);
      setDeck((current:any)=>current?{
        ...current,
        style_item_id:option.id,
        economy_store_items:{name:option.name,icon:option.icon,rarity:option.rarity},
      }:current);
      await wallet.refresh();
      setStylePickerOpen(false);
      setNotice(`${option.name} aplicado ao deck.`);
    }catch(err){
      setNotice(err instanceof Error?err.message:'Não foi possível aplicar o tema.');
    }finally{
      setStyleApplying(null);
    }
  }

  async function removeDeckStyle(){
    if(!id||styleApplying)return;
    try{
      setStyleApplying('clear');
      await clearDeckEconomyStyle(id);
      setDeck((current:any)=>current?{...current,style_item_id:null,economy_store_items:null}:current);
      setStylePickerOpen(false);
      setNotice('Tema removido do deck.');
    }catch(err){
      setNotice(err instanceof Error?err.message:'Não foi possível remover o tema.');
    }finally{
      setStyleApplying(null);
    }
  }

  const columns = width >= 1100 ? 5 : width >= 760 ? 4 : 2;
  const horizontalPadding = width >= 760 ? 18 : 12;
  const usableWidth = Math.min(width, 1180) - horizontalPadding * 2;
  const tileWidth = Math.max(142, (usableWidth - (columns - 1) * 9) / columns);

  const header = (
    <View style={styles.headerContent}>
      <TrainerPageHeader
        title={deck?.name ?? 'Deck Builder'}
        subtitle="Monte sua equipe, filtre por tipo/raridade e compare estatísticas antes de salvar."
        icon="albums"
        compact
      />
      {notice ? (
        <Pressable
          style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.yellow }]}
          onPress={() => setNotice(null)}
        >
          <Ionicons name="information-circle" size={19} color={colors.yellow} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{notice}</Text>
          <Ionicons name="close" size={17} color={colors.muted} />
        </Pressable>
      ) : null}

      {loadingDeck ? (
        <View style={styles.deckLoading}>
          <ActivityIndicator size="small" color={colors.yellow} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando deck...</Text>
        </View>
      ) : (
        <>
          <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
            <View style={styles.grow}>
              <Text style={[styles.kicker, { color: colors.yellow }]}>DECK BUILDER</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={40}
                style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
              />
              <Text style={[styles.deckValue, { color: colors.yellow }]}>Valor fixo do deck: {formatUsd(totalValue)}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={()=>{void openDeckStylePicker();}} style={[styles.themeButton,{backgroundColor:colors.accentSoft,borderColor:deck?.style_item_id?deckStylePalette(String(deck.style_item_id),colors.accent,colors.yellow).primary:colors.accent}]}>
                <Ionicons name="color-wand" size={17} color={deck?.style_item_id?deckStylePalette(String(deck.style_item_id),colors.accent,colors.yellow).primary:colors.accent}/>
                <Text style={[styles.themeButtonText,{color:colors.text}]}>{deck?.style_item_id?'TROCAR TEMA':'TEMA DO DECK'}</Text>
              </Pressable>
              <View style={[styles.counter, { backgroundColor: colors.surfaceAlt }, total > 20 && styles.counterError]}>
                <Text style={[styles.counterValue, { color: colors.text }]}>{total}/20</Text>
                <Text style={[styles.counterLabel, { color: colors.muted }]}>CARTAS</Text>
              </View>
            </View>
          </View>

          <Text style={[styles.helper, { color: colors.muted }]}>
            Cada versão pode aparecer até 4 vezes. A lista carrega aos poucos para manter o editor rápido.
          </Text>
        </>
      )}

      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar Pokémon, raridade ou set..."
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={[styles.search, { color: colors.text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={19} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => setShowFilters((value) => !value)}
        style={[styles.filterToggle,{backgroundColor:colors.surface,borderColor:showFilters?colors.accent:colors.border}]}
      >
        <Ionicons name="options" size={17} color={showFilters?colors.accent:colors.muted}/>
        <Text style={[styles.filterToggleText,{color:colors.text}]}>FILTROS E ORDENAÇÃO</Text>
        {(typeFilter || rarityFilter || sortMode !== 'name') ? <View style={[styles.activeFilterDot,{backgroundColor:colors.yellow}]}/> : null}
        <Ionicons name={showFilters?'chevron-up':'chevron-down'} size={17} color={colors.muted}/>
      </Pressable>

      {showFilters ? (
        <View style={[styles.filterPanel,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[styles.filterLabel,{color:colors.muted}]}>ORDENAR</Text>
          <View style={styles.filterChips}>
            {([
              ['name','A–Z'],['damage','MAIOR DANO'],['hp','MAIOR HP'],['value','MAIOR VALOR'],['quantity','MAIS CÓPIAS'],
            ] as Array<[DeckBuilderSortMode,string]>).map(([value,label]) => (
              <Pressable key={value} onPress={() => setSortMode(value)} style={[styles.filterChip,{backgroundColor:sortMode===value?colors.accentSoft:colors.surfaceAlt,borderColor:sortMode===value?colors.accent:colors.border}]}>
                <Text style={[styles.filterChipText,{color:sortMode===value?colors.text:colors.muted}]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <PokemonTypeSymbolFilter
            types={availableTypes}
            selectedType={typeFilter}
            onChange={setTypeFilter}
            title="TIPO"
          />

          <Text style={[styles.filterLabel,{color:colors.muted}]}>RARIDADE</Text>
          <View style={styles.filterChips}>
            <Pressable onPress={() => setRarityFilter(null)} style={[styles.filterChip,{backgroundColor:!rarityFilter?colors.accentSoft:colors.surfaceAlt,borderColor:!rarityFilter?colors.accent:colors.border}]}>
              <Text style={[styles.filterChipText,{color:!rarityFilter?colors.text:colors.muted}]}>TODAS</Text>
            </Pressable>
            {availableRarities.map((rarity) => (
              <Pressable key={rarity} onPress={() => setRarityFilter(rarityFilter===rarity?null:rarity)} style={[styles.filterChip,{backgroundColor:rarityFilter===rarity?colors.accentSoft:colors.surfaceAlt,borderColor:rarityFilter===rarity?colors.accent:colors.border}]}>
                <Text style={[styles.filterChipText,{color:rarityFilter===rarity?colors.text:colors.muted}]}>{rarity.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          {(typeFilter || rarityFilter || sortMode!=='name') ? (
            <Pressable onPress={() => {setTypeFilter(null);setRarityFilter(null);setSortMode('name');}} style={[styles.clearFilters,{backgroundColor:colors.surfaceAlt}]}>
              <Ionicons name="refresh" size={15} color={colors.muted}/>
              <Text style={[styles.clearFiltersText,{color:colors.muted}]}>LIMPAR FILTROS</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.resultsRow}>
        <Text style={[styles.resultsTitle, { color: colors.text }]}>Cartas disponíveis</Text>
        <Text style={[styles.resultsCount, { color: colors.muted }]}>{totalCards.toLocaleString('pt-BR')}</Text>
      </View>

      {loadingCards ? (
        <View style={styles.cardsLoading}>
          <ActivityIndicator size="large" color={colors.yellow} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Buscando cartas...</Text>
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {loadingMore ? <ActivityIndicator size="small" color={colors.yellow} /> : null}
      {!loadingCards && cards.length > 0 && cards.length >= totalCards ? (
        <Text style={[styles.endText, { color: colors.muted }]}>Todas as cartas carregadas.</Text>
      ) : null}
      {!loadingDeck ? (
        <Pressable style={styles.backButton} onPress={() => goBackOrHome(router)}>
          <Text style={[styles.backText, { color: colors.muted }]}>VOLTAR AOS DECKS</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.safe, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumBackground />
      <FlatList
        key={`deck-builder-${columns}`}
        data={loadingCards ? [] : cards}
        numColumns={columns}
        keyExtractor={(item) => item.cards.id}
        renderItem={({ item }) => (
          <DeckCardTile
            entry={item}
            width={tileWidth}
            selectedQty={selected[item.cards.id] ?? 0}
            onChange={change}
            onPreview={setPreview}
          />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={!loadingCards ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="albums-outline" size={30} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhuma carta encontrada</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Tente outro nome, raridade ou set.</Text>
          </View>
        ) : null}
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}
        columnWrapperStyle={columns > 1 ? styles.column : undefined}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.65}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={60}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {!loadingDeck ? (
        <View pointerEvents="box-none" style={styles.saveDock}>
          <View
            style={[
              styles.saveDockInner,
              {
                width: usableWidth,
                backgroundColor: colors.surface,
                borderColor: total > 20 ? '#FF566B' : colors.border,
              },
            ]}
          >
            <View style={styles.saveDockSummary}>
              <Text style={[styles.saveDockCount, { color: total > 20 ? '#FF8792' : colors.text }]}>{total}/20</Text>
              <Text style={[styles.saveDockMeta, { color: colors.muted }]}>
                {total > 20 ? 'Remova cartas para salvar' : `Deck • ${formatUsd(totalValue)}`}
              </Text>
            </View>
            <Pressable
              style={[styles.saveDockButton, { backgroundColor: colors.yellow }, (saving || total > 20) && styles.disabled]}
              onPress={() => void save()}
              disabled={saving || total > 20}
            >
              {saving ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="save" size={19} color="#07111F" />}
              <Text style={styles.saveText}>{saving ? 'SALVANDO...' : 'SALVAR DECK'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewBackdrop}>
          {preview ? (
            <View style={[styles.previewModal,{backgroundColor:colors.surface,borderColor:colors.accent}]}>
              <View style={styles.previewHeader}>
                <View style={{flex:1}}>
                  <Text style={[styles.previewKicker,{color:colors.yellow}]}>ESTATÍSTICAS DE BATALHA • REGRA V4</Text>
                  <Text numberOfLines={1} style={[styles.previewTitle,{color:colors.text}]}>{preview.cards.pokemon_name}</Text>
                  <Text style={[styles.previewMeta,{color:colors.muted}]}>{preview.cards.rarity ?? 'Sem raridade'} • {preview.cards.set_name}</Text>
                </View>
                <Pressable onPress={() => setPreview(null)} style={[styles.previewClose,{backgroundColor:colors.surfaceAlt}]}><Ionicons name="close" size={20} color={colors.text}/></Pressable>
              </View>
              <View style={styles.previewBody}>
                {preview.cards.image_small ? <Image source={{uri:preview.cards.image_small}} resizeMode="contain" style={styles.previewImage}/> : null}
                <View style={styles.previewStats}>
                  <PreviewStat label="PWR" value={preview.cards.battle_profile?.battleRating ?? 0} suffix="/1000"/>
                  <PreviewStat label="HP" value={preview.cards.battle_profile?.hp ?? 0}/>
                  <PreviewStat label="DANO" value={preview.cards.battle_profile?.maxDamage ?? 0}/>
                  <PreviewStat label="ENERGIA" value={preview.cards.battle_profile?.bestEnergy ?? 0}/>
                  <PreviewStat label="EFICIÊNCIA" value={preview.cards.battle_profile?.efficiencyScore ?? 0} suffix="/100"/>
                  <PreviewStat label="VELOCIDADE" value={preview.cards.battle_profile?.speedScore ?? 0} suffix="/100"/>
                  <PreviewStat label="TÉCNICA" value={preview.cards.battle_profile?.techniqueScore ?? 0} suffix="/100"/>
                </View>
              </View>
              <View style={styles.previewFooter}>
                <Text style={[styles.previewPrice,{color:colors.yellow}]}>{preview.cards.market_price_usd!=null?formatUsd(Number(preview.cards.market_price_usd)):'US$ —'}</Text>
                <Text style={[styles.previewTypes,{color:colors.muted}]}>{(preview.cards.types ?? []).join(' • ') || 'Sem tipo'}</Text>
              </View>
              <Pressable onPress={() => setPreview(null)} style={[styles.previewDone,{backgroundColor:colors.yellow}]}><Text style={styles.previewDoneText}>VOLTAR AO DECK</Text></Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={stylePickerOpen} transparent animationType="fade" onRequestClose={()=>setStylePickerOpen(false)}>
        <View style={styles.themeBackdrop}>
          <View style={[styles.themeModal,{backgroundColor:colors.surface,borderColor:deck?.style_item_id?deckStylePalette(String(deck.style_item_id),colors.accent,colors.yellow).primary:colors.accent}]}>
            <View style={styles.themeHeader}>
              <View style={{flex:1}}>
                <Text style={[styles.themeKicker,{color:colors.yellow}]}>TEMAS DA SUA COLEÇÃO</Text>
                <Text style={[styles.themeTitle,{color:colors.text}]}>Personalizar deck</Text>
                <Text style={[styles.themeSubtitle,{color:colors.muted}]}>Molduras e backgrounds premium também funcionam como temas universais de deck.</Text>
              </View>
              <Pressable onPress={()=>setStylePickerOpen(false)} style={[styles.previewClose,{backgroundColor:colors.surfaceAlt}]}><Ionicons name="close" size={20} color={colors.text}/></Pressable>
            </View>
            {styleOptionsLoading?<ActivityIndicator size="large" color={colors.yellow}/>:(
              <FlatList
                data={styleOptions}
                keyExtractor={(item)=>item.id}
                style={styles.themeList}
                contentContainerStyle={styles.themeListContent}
                ListHeaderComponent={deck?.style_item_id?(
                  <Pressable disabled={Boolean(styleApplying)} onPress={()=>{void removeDeckStyle();}} style={[styles.themeOption,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}>
                    <View style={[styles.themeOptionIcon,{backgroundColor:colors.surface}]}><Ionicons name="ban-outline" size={20} color={colors.muted}/></View>
                    <View style={{flex:1}}><Text style={[styles.themeOptionName,{color:colors.text}]}>Sem tema</Text><Text style={[styles.themeOptionMeta,{color:colors.muted}]}>Remover personalização atual • grátis</Text></View>
                    {styleApplying==='clear'?<ActivityIndicator color={colors.yellow}/>:null}
                  </Pressable>
                ):null}
                renderItem={({item:option})=>{
                  const palette=deckStylePalette(option.id,colors.accent,colors.yellow);
                  const active=deck?.style_item_id===option.id;
                  return <Pressable disabled={Boolean(styleApplying)} onPress={()=>{void applyDeckStyle(option);}} style={[styles.themeOption,{backgroundColor:active?colors.accentSoft:colors.surfaceAlt,borderColor:active?palette.primary:colors.border}]}>
                    <View style={[styles.themeOptionIcon,{backgroundColor:`${palette.primary}18`,borderColor:palette.primary}]}><Ionicons name={(option.icon||'albums') as keyof typeof Ionicons.glyphMap} size={20} color={palette.primary}/></View>
                    <View style={{flex:1,minWidth:0}}>
                      <View style={styles.themeNameRow}><Text numberOfLines={1} style={[styles.themeOptionName,{color:colors.text}]}>{option.name}</Text>{option.universalTheme?<View style={[styles.themeUniversal,{borderColor:palette.secondary}]}><Text style={[styles.themeUniversalText,{color:palette.secondary}]}>UNIVERSAL</Text></View>:null}</View>
                      <Text style={[styles.themeOptionMeta,{color:colors.muted}]}>{option.effect==='galaxy'?'GALAXY FLOW • ':''}APLICAÇÃO GRÁTIS • COMPRA ÚNICA</Text>
                    </View>
                    {styleApplying===option.id?<ActivityIndicator color={palette.primary}/>:<Ionicons name={active?'checkmark-circle':'chevron-forward'} size={19} color={active?palette.primary:colors.muted}/>}
                  </Pressable>;
                }}
                ListEmptyComponent={<View style={styles.themeEmpty}><Ionicons name="color-wand-outline" size={28} color={colors.muted}/><Text style={[styles.themeSubtitle,{color:colors.muted,textAlign:'center'}]}>Você ainda não possui temas compatíveis. Eles podem ser comprados na Trainer Shop.</Text><Pressable onPress={()=>{setStylePickerOpen(false);router.push('/store');}} style={[styles.themeStoreButton,{backgroundColor:colors.yellow}]}><Text style={styles.themeStoreText}>ABRIR TRAINER SHOP</Text></Pressable></View>}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PreviewStat({label,value,suffix=''}:{label:string;value:number;suffix?:string}) {
  const {colors}=useAppTheme();
  return <View style={[styles.previewStat,{backgroundColor:colors.surfaceAlt,borderColor:colors.border}]}><Text style={[styles.previewStatLabel,{color:colors.muted}]}>{label}</Text><Text style={[styles.previewStatValue,{color:colors.text}]}>{Number(value).toLocaleString('pt-BR')}{suffix}</Text></View>;
}

const DeckCardTile = memo(function DeckCardTile({
  entry,
  width,
  selectedQty,
  onChange,
  onPreview,
}: {
  entry: DeckBuilderCardEntry;
  width: number;
  selectedQty: number;
  onChange: (cardId: string, owned: number, delta: number) => void;
  onPreview: (entry: DeckBuilderCardEntry) => void;
}) {
  const { colors, isLight } = useAppTheme();
  const card = entry.cards;

  return (
    <View
      style={[
        styles.cardTile,
        {
          width,
          backgroundColor: selectedQty > 0 ? colors.accentSoft : colors.surface,
          borderColor: selectedQty > 0 ? colors.yellow : colors.border,
        },
      ]}
    >
      <Pressable onPress={() => onPreview(entry)} style={[styles.imageWrap, { backgroundColor: isLight ? '#E6EDF6' : colors.surfaceAlt }]}>
        {card.image_small ? (
          <Image
            source={{ uri: card.image_small }}
            resizeMode="contain"
            resizeMethod="resize"
            fadeDuration={0}
            style={styles.cardImage}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Ionicons name="image-outline" size={28} color={colors.muted} />
          </View>
        )}
        <View style={styles.valueBadge}>
          <Text style={[styles.valueText, { color: colors.yellow }]}>
            {card.market_price_usd != null ? formatUsd(Number(card.market_price_usd)) : 'US$ —'}
          </Text>
        </View>
        <View style={styles.statsBadge}><Ionicons name="stats-chart" size={11} color="#fff"/><Text style={styles.statsBadgeText}>STATS</Text></View>
      </Pressable>

      <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>{card.pokemon_name}</Text>
      <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.muted }]}>
        {card.rarity ?? 'Comum'} • Bag ×{entry.quantity}
      </Text>
      <Pressable onPress={() => onPreview(entry)} style={styles.inlineStats}>
        <Text style={[styles.inlineStatsText,{color:colors.accent}]}>⚔ PWR {card.battle_profile?.battleRating ?? 0} • HP {card.battle_profile?.hp ?? 0} • DANO {card.battle_profile?.maxDamage ?? 0}</Text>
      </Pressable>
      {selectedQty > 0 ? (
        <Text style={[styles.selectedValue, { color: colors.yellow }]}>
          No deck: {card.market_price_usd != null ? formatUsd(Number(card.market_price_usd) * selectedQty) : 'US$ —'}
        </Text>
      ) : null}

      <View style={styles.qtyRow}>
        <Pressable
          disabled={selectedQty <= 0}
          style={[styles.qtyButton, { backgroundColor: colors.surfaceAlt }, selectedQty <= 0 && styles.qtyDisabled]}
          onPress={() => onChange(card.id, entry.quantity, -1)}
        >
          <Text style={[styles.qtySign, { color: colors.text }]}>−</Text>
        </Pressable>
        <Text style={[styles.qty, { color: colors.yellow }]}>{selectedQty}</Text>
        <Pressable
          disabled={selectedQty >= Math.min(4, Number(entry.quantity ?? 0))}
          style={[
            styles.qtyButton,
            { backgroundColor: colors.surfaceAlt },
            selectedQty >= Math.min(4, Number(entry.quantity ?? 0)) && styles.qtyDisabled,
          ]}
          onPress={() => onChange(card.id, entry.quantity, 1)}
        >
          <Text style={[styles.qtySign, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingTop: 12, paddingBottom: 154 },
  headerContent: { gap: 12, marginBottom: 10 },
  grow: { flex: 1, minWidth: 0 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 14, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 11, fontWeight: '700' },
  deckLoading: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { fontSize: 9, fontWeight: '700' },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1 },
  headerActions:{alignItems:'flex-end',gap:7},
  themeButton:{minHeight:36,borderRadius:11,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:6},
  themeButtonText:{fontSize:7.5,fontWeight:'900'},
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  nameInput: { fontSize: 24, fontWeight: '900', paddingVertical: 4, borderBottomWidth: 1 },
  deckValue: { fontSize: 11, fontWeight: '900', marginTop: 7 },
  counter: { width: 84, height: 70, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  counterError: { backgroundColor: '#351A24' },
  counterValue: { fontSize: 20, fontWeight: '900' },
  counterLabel: { fontSize: 7, fontWeight: '900' },
  helper: { fontSize: 10, lineHeight: 15 },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderRadius: 15, borderWidth: 1 },
  search: { flex: 1, height: '100%' },
  filterToggle:{minHeight:44,borderRadius:13,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},
  filterToggleText:{flex:1,fontSize:9,fontWeight:'900'},
  activeFilterDot:{width:8,height:8,borderRadius:4},
  filterPanel:{borderRadius:16,borderWidth:1,padding:11,gap:8},
  filterLabel:{fontSize:7,fontWeight:'900',letterSpacing:.9,marginTop:2},
  filterChips:{flexDirection:'row',flexWrap:'wrap',gap:6},
  filterChip:{borderRadius:999,borderWidth:1,paddingHorizontal:9,paddingVertical:6},
  filterChipText:{fontSize:7,fontWeight:'900'},
  clearFilters:{alignSelf:'flex-start',borderRadius:10,paddingHorizontal:9,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:5,marginTop:2},
  clearFiltersText:{fontSize:7,fontWeight:'900'},
  resultsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultsTitle: { fontSize: 16, fontWeight: '900' },
  resultsCount: { fontSize: 10, fontWeight: '800' },
  cardsLoading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9 },
  column: { gap: 9 },
  cardTile: { padding: 7, borderRadius: 15, borderWidth: 1, marginBottom: 9 },
  imageWrap: { position: 'relative', width: '100%', aspectRatio: .72, borderRadius: 9, overflow: 'hidden' },
  cardImage: { width: '100%', height: '100%' },
  cardPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  valueBadge: { position: 'absolute', left: 5, bottom: 5, backgroundColor: '#050505E6', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 999 },
  valueText: { fontSize: 8, fontWeight: '900' },
  statsBadge:{position:'absolute',right:5,bottom:5,borderRadius:999,backgroundColor:'#6A3FA8E8',paddingHorizontal:6,paddingVertical:4,flexDirection:'row',alignItems:'center',gap:3},
  statsBadgeText:{color:'#fff',fontSize:6,fontWeight:'900'},
  cardName: { fontSize: 11, fontWeight: '900', marginTop: 6 },
  cardMeta: { fontSize: 8, marginTop: 2 },
  inlineStats:{marginTop:4},
  inlineStatsText:{fontSize:7,fontWeight:'900'},
  selectedValue: { fontSize: 8, fontWeight: '900', marginTop: 3 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  qtyButton: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  qtyDisabled: { opacity: .35 },
  qtySign: { fontSize: 18, fontWeight: '900' },
  qty: { minWidth: 22, textAlign: 'center', fontWeight: '900' },
  footer: { gap: 10, paddingTop: 8 },
  endText: { textAlign: 'center', fontSize: 8, fontWeight: '700', paddingVertical: 4 },
  saveDock: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center', zIndex: 40, elevation: 20 },
  saveDockInner: { minHeight: 68, borderRadius: 18, borderWidth: 1, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: .28, shadowRadius: 16, shadowOffset: { width: 0, height: 7 } },
  saveDockSummary: { flex: 1, minWidth: 0, paddingLeft: 7 },
  saveDockCount: { fontSize: 17, fontWeight: '900' },
  saveDockMeta: { fontSize: 8, fontWeight: '800', marginTop: 2 },
  saveDockButton: { minHeight: 50, minWidth: 150, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 },
  saveText: { color: '#07111F', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .45 },
  backButton: { alignItems: 'center', padding: 12 },
  backText: { fontSize: 9, fontWeight: '900' },
  empty: { marginTop: 8, borderRadius: 18, borderWidth: 1, padding: 26, alignItems: 'center', gap: 7 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyText: { fontSize: 9, textAlign: 'center' },
  themeBackdrop:{flex:1,backgroundColor:'#05030ADC',alignItems:'center',justifyContent:'center',padding:16},
  themeModal:{width:'100%',maxWidth:560,maxHeight:'86%',borderRadius:22,borderWidth:1,padding:14,gap:12},
  themeHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  themeKicker:{fontSize:7,fontWeight:'900',letterSpacing:.9},
  themeTitle:{fontSize:21,fontWeight:'900',marginTop:2},
  themeSubtitle:{fontSize:8.5,lineHeight:13,marginTop:3},
  themeList:{maxHeight:540},
  themeListContent:{gap:7,paddingBottom:2},
  themeOption:{minHeight:67,borderRadius:15,borderWidth:1,padding:9,flexDirection:'row',alignItems:'center',gap:9,marginBottom:7},
  themeOptionIcon:{width:44,height:44,borderRadius:13,borderWidth:1,alignItems:'center',justifyContent:'center'},
  themeOptionName:{fontSize:11,fontWeight:'900'},
  themeOptionMeta:{fontSize:7.5,fontWeight:'700',marginTop:3},
  themeNameRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  themeUniversal:{borderRadius:999,borderWidth:1,paddingHorizontal:6,paddingVertical:2},
  themeUniversalText:{fontSize:5.5,fontWeight:'900',letterSpacing:.5},
  themeEmpty:{padding:24,alignItems:'center',gap:8},
  themeStoreButton:{minHeight:40,borderRadius:11,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},
  themeStoreText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  previewBackdrop:{flex:1,backgroundColor:'#05030AD9',alignItems:'center',justifyContent:'center',padding:18},
  previewModal:{width:'100%',maxWidth:660,borderRadius:22,borderWidth:1,padding:14,gap:12},
  previewHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  previewKicker:{fontSize:7,fontWeight:'900',letterSpacing:.8},
  previewTitle:{fontSize:22,fontWeight:'900',marginTop:3},
  previewMeta:{fontSize:9,marginTop:2},
  previewClose:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  previewBody:{flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'flex-start'},
  previewImage:{width:150,height:210,borderRadius:10},
  previewStats:{flex:1,minWidth:230,flexDirection:'row',flexWrap:'wrap',gap:7},
  previewStat:{flexGrow:1,flexBasis:100,borderRadius:12,borderWidth:1,padding:9},
  previewStatLabel:{fontSize:6,fontWeight:'900',letterSpacing:.7},
  previewStatValue:{fontSize:14,fontWeight:'900',marginTop:2},
  previewFooter:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
  previewPrice:{fontSize:14,fontWeight:'900'},
  previewTypes:{fontSize:8,fontWeight:'800',textAlign:'right'},
  previewDone:{minHeight:46,borderRadius:13,alignItems:'center',justifyContent:'center'},
  previewDoneText:{color:'#07111F',fontSize:9,fontWeight:'900'},
});
