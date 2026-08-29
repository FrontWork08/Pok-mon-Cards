import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { CardPickerModal } from '@/components/CardPickerModal';
import { getMyBag, getMyProfile, type OwnedCardEntry } from '@/services/player';
import {
  confirmLegacySelection,
  getActiveReleaseCampaign,
  getLegacySelection,
  saveLegacySelection,
  type LegacySelectionSubmission,
  type ReleaseCampaign,
} from '@/services/releaseCampaign';
import { formatUsd } from '@/services/market';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

type SelectionMap = Record<string, number>;

function toSelectionMap(cardIds: string[]): SelectionMap {
  return Object.fromEntries(cardIds.map((cardId) => [cardId, 1]));
}

export default function LegacySelectionScreen() {
  const router = useRouter();
  const { colors, themeName } = useAppTheme();
  const themeVisual = getThemeVisual(themeName);
  const [campaign, setCampaign] = useState<ReleaseCampaign | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [bag, setBag] = useState<OwnedCardEntry[]>([]);
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<SelectionMap>({});
  const [submission, setSubmission] = useState<LegacySelectionSubmission | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [profile, owned] = await Promise.all([getMyProfile(), getMyBag()]);
        const result = await getActiveReleaseCampaign(profile.id);
        if (disposed) return;
        setPlayerId(profile.id);
        setBag(owned ?? []);
        setCampaign(result.campaign);

        if (result.campaign) {
          const legacy = await getLegacySelection(result.campaign.id, profile.id);
          if (disposed) return;
          setSavedCardIds(legacy.cardIds);
          setDraft(toSelectionMap(legacy.cardIds));
          setSubmission(legacy.submission);
        }
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : 'Não foi possível carregar seu legado.');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, []);

  const selectedEntries = useMemo(
    () => savedCardIds
      .map((cardId) => bag.find((entry) => entry.cards?.id === cardId))
      .filter((entry): entry is OwnedCardEntry => Boolean(entry?.cards)),
    [bag, savedCardIds],
  );

  const selectedValue = useMemo(
    () => selectedEntries.reduce((sum, entry) => sum + Number(entry.cards?.market_price_usd ?? 0), 0),
    [selectedEntries],
  );

  const limit = Math.max(1, Number(campaign?.legacy_card_limit ?? 10));
  const selectionOpen = Boolean(
    campaign?.active
    && campaign.phase === 'legacy_selection'
    && campaign.legacy_selection_enabled,
  );
  const locked = Boolean(submission);
  const draftCount = Object.values(draft).reduce((sum, value) => sum + Number(value), 0);

  function openPicker() {
    if (!selectionOpen || locked) return;
    setDraft(toSelectionMap(savedCardIds));
    setNotice('');
    setError('');
    setConfirmArmed(false);
    setPickerOpen(true);
  }

  function closePicker() {
    setDraft(toSelectionMap(savedCardIds));
    setPickerOpen(false);
  }

  async function saveDraft() {
    if (!campaign || !playerId || locked || working) return;
    const cardIds = Object.entries(draft).filter(([, qty]) => qty > 0).map(([cardId]) => cardId);
    if (cardIds.length < 1) {
      setError('Escolha pelo menos uma carta para salvar.');
      return;
    }
    if (cardIds.length > limit) {
      setError(`Você pode preservar no máximo ${limit} cartas.`);
      return;
    }

    try {
      setWorking(true);
      setError('');
      const result = await saveLegacySelection(campaign.id, playerId, cardIds);
      setSavedCardIds(result.cardIds);
      setDraft(toSelectionMap(result.cardIds));
      setSubmission(result.submission);
      setPickerOpen(false);
      setConfirmArmed(false);
      setNotice(`Seleção salva: ${result.cardIds.length}/${limit} cartas. Você ainda pode alterar antes da confirmação final.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a seleção.');
    } finally {
      setWorking(false);
    }
  }

  async function confirmSelection() {
    if (!campaign || !playerId || locked || !savedCardIds.length || working) return;
    if (!confirmArmed) {
      setConfirmArmed(true);
      setNotice('');
      return;
    }

    try {
      setWorking(true);
      setError('');
      const result = await confirmLegacySelection(campaign.id, playerId);
      setSubmission(result);
      setConfirmArmed(false);
      setNotice(`Legado confirmado: ${result.selected_count} carta(s) protegida(s) para a transição 1.0.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar seu legado.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Screen title="Legado Beta" subtitle="Escolha as cartas que atravessarão com sua conta para o novo começo da Trainer Collection 1.0.">
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color={colors.muted} />
        <Text style={[styles.backText,{color:colors.muted}]}>Voltar</Text>
      </Pressable>

      {loading ? <ActivityIndicator size="large" color={colors.yellow} /> : null}
      {error ? <Pressable onPress={() => setError('')} style={styles.error}><Ionicons name="alert-circle" size={18} color="#FF9FAF"/><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {notice ? <Pressable onPress={() => setNotice('')} style={[styles.notice,{backgroundColor:colors.surface,borderColor:colors.yellow}]}><Ionicons name="checkmark-circle" size={18} color={colors.yellow}/><Text style={[styles.noticeText,{color:colors.text}]}>{notice}</Text></Pressable> : null}

      {!loading && !campaign ? (
        <View style={[styles.closed,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Ionicons name="calendar-outline" size={28} color={colors.muted}/>
          <Text style={[styles.closedTitle,{color:colors.text}]}>Nenhuma transição ativa</Text>
          <Text style={[styles.closedText,{color:colors.muted}]}>Quando uma campanha de migração estiver ativa, sua seleção aparecerá aqui.</Text>
        </View>
      ) : null}

      {campaign ? (
        <>
          <View style={[styles.hero,{backgroundColor:colors.accentSoft,borderColor:locked ? '#65D894' : colors.accent}]}>
            <View style={[styles.heroGlow,{backgroundColor:locked ? '#65D894' : colors.accent}]} />
            <Image source={{uri:themeVisual.image}} resizeMode="contain" style={styles.heroPokemon}/>
            <View style={styles.heroCopy}>
              <Text style={[styles.kicker,{color:colors.yellow}]}>BETA LEGACY VAULT</Text>
              <Text style={[styles.heroTitle,{color:colors.text}]}>{locked ? 'Seu legado está confirmado.' : `Preserve até ${limit} cartas.`}</Text>
              <Text style={[styles.heroText,{color:colors.muted}]}>
                {locked
                  ? 'A seleção está bloqueada. O sistema protege pelo menos uma cópia de cada carta confirmada durante a janela de migração.'
                  : selectionOpen
                    ? 'Escolha as cartas que você mais quer manter. Salvar não bloqueia a lista; a confirmação final é permanente.'
                    : 'A fase de escolha ainda não foi liberada pelo servidor. Sua coleção continua funcionando normalmente.'}
              </Text>
              <View style={styles.heroStats}>
                <View style={[styles.stat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.statValue,{color:colors.text}]}>{savedCardIds.length}/{limit}</Text><Text style={[styles.statLabel,{color:colors.muted}]}>ESCOLHIDAS</Text></View>
                <View style={[styles.stat,{backgroundColor:colors.surface,borderColor:colors.border}]}><Text style={[styles.statValue,{color:colors.yellow}]}>{formatUsd(selectedValue)}</Text><Text style={[styles.statLabel,{color:colors.muted}]}>VALOR</Text></View>
                <View style={[styles.stat,{backgroundColor:colors.surface,borderColor:locked ? '#2F9E68' : colors.border}]}><Text style={[styles.statValue,{color:locked ? '#65D894' : colors.text}]}>{locked ? 'TRAVADO' : selectionOpen ? 'ABERTO' : 'AGUARDE'}</Text><Text style={[styles.statLabel,{color:colors.muted}]}>STATUS</Text></View>
              </View>
            </View>
          </View>

          <View style={[styles.reward,{backgroundColor:colors.surface,borderColor:colors.border}]}>
            <View style={[styles.rewardIcon,{backgroundColor:colors.accentSoft}]}><Ionicons name="gift" size={22} color={colors.yellow}/></View>
            <View style={{flex:1}}>
              <Text style={[styles.rewardTitle,{color:colors.text}]}>Recompensa de veterano</Text>
              <Text style={[styles.rewardValue,{color:colors.yellow}]}>🪙 {campaign.reward_coins.toLocaleString('pt-BR')} + 💎 {campaign.reward_diamonds}</Text>
              <Text style={[styles.rewardHint,{color:colors.muted}]}>A confirmação destas cartas não executa o reset. Ela apenas registra e protege sua escolha.</Text>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <View>
              <Text style={[styles.sectionTitle,{color:colors.text}]}>Cartas preservadas</Text>
              <Text style={[styles.sectionHint,{color:colors.muted}]}>{locked ? 'Seleção final confirmada.' : 'Você pode editar enquanto a fase estiver aberta.'}</Text>
            </View>
            {!locked && selectionOpen ? (
              <Pressable onPress={openPicker} style={[styles.editButton,{backgroundColor:colors.accentSoft,borderColor:colors.accent}]}>
                <Ionicons name="albums" size={16} color={colors.accent}/>
                <Text style={[styles.editText,{color:colors.accent}]}>{savedCardIds.length ? 'EDITAR' : 'ESCOLHER'}</Text>
              </Pressable>
            ) : null}
          </View>

          {selectedEntries.length ? (
            <View style={styles.cardGrid}>
              {selectedEntries.map((entry, index) => (
                <View key={entry.cards!.id} style={[styles.card,{backgroundColor:colors.surface,borderColor:locked ? '#2F9E68' : colors.border}]}>
                  <View style={[styles.slot,{backgroundColor:locked ? '#173A2F' : colors.accentSoft}]}><Text style={[styles.slotText,{color:locked ? '#65D894' : colors.yellow}]}>#{index + 1}</Text></View>
                  {entry.cards?.image_small ? <Image source={{uri:entry.cards.image_small}} resizeMode="contain" style={styles.cardImage}/> : <View style={[styles.cardImage,{backgroundColor:colors.surfaceAlt}]}/>}
                  <Text numberOfLines={1} style={[styles.cardName,{color:colors.text}]}>{entry.cards?.pokemon_name}</Text>
                  <Text numberOfLines={1} style={[styles.cardMeta,{color:colors.muted}]}>{entry.cards?.rarity ?? 'Sem raridade'}</Text>
                  <Text style={[styles.cardValue,{color:colors.yellow}]}>{entry.cards?.market_price_usd != null ? formatUsd(Number(entry.cards.market_price_usd)) : 'US$ —'}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.empty,{backgroundColor:colors.surface,borderColor:colors.border}]}>
              <Ionicons name="albums-outline" size={31} color={colors.muted}/>
              <Text style={[styles.emptyTitle,{color:colors.text}]}>{selectionOpen ? 'Nenhuma carta escolhida' : 'Seleção ainda fechada'}</Text>
              <Text style={[styles.emptyText,{color:colors.muted}]}>{selectionOpen ? `Escolha de 1 a ${limit} cartas da sua Bag.` : 'O administrador liberará esta etapa antes da migração.'}</Text>
            </View>
          )}

          {!locked && selectionOpen && savedCardIds.length ? (
            <View style={[styles.confirmPanel,{backgroundColor:confirmArmed ? '#351A24' : colors.surface,borderColor:confirmArmed ? '#A84250' : colors.border}]}>
              <Ionicons name={confirmArmed ? 'warning' : 'lock-closed'} size={22} color={confirmArmed ? '#FF8A9A' : colors.yellow}/>
              <View style={{flex:1}}>
                <Text style={[styles.confirmTitle,{color:colors.text}]}>{confirmArmed ? 'Confirmação permanente' : 'Pronto para fechar seu legado?'}</Text>
                <Text style={[styles.confirmHint,{color:colors.muted}]}>{confirmArmed ? 'Depois deste botão você não poderá trocar as cartas selecionadas. O reset ainda NÃO será executado.' : 'Revise a lista antes da confirmação final.'}</Text>
              </View>
              <Pressable disabled={working} onPress={() => { void confirmSelection(); }} style={[styles.confirmButton,{backgroundColor:confirmArmed ? '#C74658' : colors.yellow}]}>
                {working ? <ActivityIndicator size="small" color={confirmArmed ? '#fff' : '#07111F'}/> : <Ionicons name={confirmArmed ? 'shield-checkmark' : 'lock-closed'} size={17} color={confirmArmed ? '#fff' : '#07111F'}/>}
                <Text style={[styles.confirmButtonText,{color:confirmArmed ? '#fff' : '#07111F'}]}>{confirmArmed ? `SIM, CONFIRMAR ${savedCardIds.length}` : 'REVISAR E BLOQUEAR'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      <CardPickerModal
        visible={pickerOpen}
        title="Escolha seu legado"
        subtitle={`Selecione até ${limit} cartas únicas. Cada escolha preserva 1 cópia.`}
        bag={bag}
        mode="quantity"
        selectedMap={draft}
        maxPerCard={1}
        maxTotal={limit}
        onSelectedMapChange={setDraft}
        onClose={closePicker}
        onConfirm={saveDraft}
        confirmLabel={`SALVAR ${draftCount}/${limit}`}
        working={working}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:7},
  backText:{fontSize:11,fontWeight:'800'},
  error:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:15,padding:12,backgroundColor:'#351A24',borderWidth:1,borderColor:'#683243'},
  errorText:{flex:1,color:'#FFD7DD',fontSize:10,fontWeight:'800'},
  notice:{flexDirection:'row',alignItems:'center',gap:8,borderRadius:15,padding:12,borderWidth:1},
  noticeText:{flex:1,fontSize:10,fontWeight:'800'},
  hero:{minHeight:205,borderRadius:28,borderWidth:1,padding:17,overflow:'hidden',position:'relative'},
  heroGlow:{position:'absolute',right:-75,top:-100,width:290,height:290,borderRadius:999,opacity:.14},
  heroPokemon:{position:'absolute',right:-25,bottom:-48,width:215,height:230,opacity:.22,transform:[{rotate:'6deg'}]},
  heroCopy:{maxWidth:680,zIndex:2},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.25},
  heroTitle:{fontSize:25,fontWeight:'900',marginTop:3},
  heroText:{fontSize:10,lineHeight:15,marginTop:4,maxWidth:490},
  heroStats:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:14,paddingRight:90},
  stat:{minWidth:88,borderRadius:13,borderWidth:1,paddingHorizontal:10,paddingVertical:8},
  statValue:{fontSize:15,fontWeight:'900'},
  statLabel:{fontSize:7,fontWeight:'900',letterSpacing:.6,marginTop:1},
  reward:{borderRadius:20,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:10},
  rewardIcon:{width:45,height:45,borderRadius:14,alignItems:'center',justifyContent:'center'},
  rewardTitle:{fontSize:13,fontWeight:'900'},
  rewardValue:{fontSize:16,fontWeight:'900',marginTop:2},
  rewardHint:{fontSize:8,lineHeight:12,marginTop:3},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},
  sectionTitle:{fontSize:20,fontWeight:'900'},
  sectionHint:{fontSize:9,marginTop:2},
  editButton:{minHeight:40,borderRadius:12,borderWidth:1,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:6},
  editText:{fontSize:8,fontWeight:'900'},
  cardGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},
  card:{flexGrow:1,flexBasis:130,maxWidth:185,minWidth:125,borderRadius:18,borderWidth:1,padding:8,position:'relative'},
  slot:{position:'absolute',top:7,left:7,zIndex:2,minWidth:28,height:28,borderRadius:999,alignItems:'center',justifyContent:'center'},
  slotText:{fontSize:8,fontWeight:'900'},
  cardImage:{width:'100%',height:170,borderRadius:11},
  cardName:{fontSize:11,fontWeight:'900',marginTop:6},
  cardMeta:{fontSize:8,marginTop:2},
  cardValue:{fontSize:9,fontWeight:'900',marginTop:4},
  empty:{borderRadius:20,borderWidth:1,padding:24,alignItems:'center',gap:7},
  emptyTitle:{fontSize:15,fontWeight:'900'},
  emptyText:{fontSize:10,textAlign:'center'},
  confirmPanel:{borderRadius:20,borderWidth:1,padding:13,flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},
  confirmTitle:{fontSize:12,fontWeight:'900'},
  confirmHint:{fontSize:8,lineHeight:12,marginTop:2,maxWidth:480},
  confirmButton:{minHeight:44,borderRadius:12,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  confirmButtonText:{fontSize:8,fontWeight:'900'},
  closed:{borderRadius:20,borderWidth:1,padding:26,alignItems:'center',gap:7},
  closedTitle:{fontSize:16,fontWeight:'900'},
  closedText:{fontSize:10,textAlign:'center',maxWidth:420},
});
