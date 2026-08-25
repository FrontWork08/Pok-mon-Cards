import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OpenedCard, Pack } from '@/services/packs';
import { gameTheme } from '@/theme/gameTheme';

type Props = {
  visible: boolean;
  pack: Pack | null;
  onClose: () => void;
  onPurchase: () => Promise<OpenedCard[]>;
  onFinished?: () => void;
};

type Stage = 'sealed' | 'opening' | 'burst' | 'cards' | 'summary';
type RarityTheme = { color: string; soft: string; label: string };

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function rarityTheme(rarity?: string | null): RarityTheme {
  const value = (rarity ?? '').toLowerCase();
  if (value.includes('hyper') || value.includes('secret') || value.includes('special illustration') || value.includes('shiny ultra')) return { color: '#FFD447', soft: '#3A3014', label: 'RARIDADE MÁXIMA' };
  if (value.includes('ultra') || value.includes('illustration') || value.includes('double rare') || value.includes('ace spec') || value.includes('rainbow')) return { color: '#B26CFF', soft: '#29183C', label: 'RARIDADE ESPECIAL' };
  if (value.includes('rare') || value.includes('holo')) return { color: '#4EA5FF', soft: '#132A43', label: 'RARO' };
  if (value.includes('uncommon')) return { color: '#75D2A6', soft: '#153126', label: 'INCOMUM' };
  return { color: '#AAB8C8', soft: '#212A35', label: 'COMUM' };
}

export function PackOpeningModal({ visible, pack, onClose, onPurchase, onFinished }: Props) {
  const { width, height } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>('sealed');
  const [cards, setCards] = useState<OpenedCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packY = useRef(new Animated.Value(0)).current;
  const packRotate = useRef(new Animated.Value(0)).current;
  const packScale = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const beam = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const rarityPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setStage('sealed');
    setCards([]);
    setCardIndex(0);
    setFaceUp(false);
    setError(null);
    packY.setValue(0);
    packRotate.setValue(0);
    packScale.setValue(1);
    burst.setValue(0);
    beam.setValue(0);
    rarityPulse.setValue(0);

    const floating = Animated.loop(Animated.sequence([
      Animated.timing(packY, { toValue: -10, duration: 1100, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(packY, { toValue: 7, duration: 1100, useNativeDriver: USE_NATIVE_DRIVER }),
    ]));
    floating.start();
    return () => floating.stop();
  }, [beam, burst, pack?.id, packRotate, packScale, packY, rarityPulse, visible]);

  function animateCardIn() {
    cardScale.setValue(0.84);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 75, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }

  function startRarityPulse() {
    rarityPulse.setValue(0);
    Animated.loop(Animated.sequence([
      Animated.timing(rarityPulse, { toValue: 1, duration: 650, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(rarityPulse, { toValue: 0, duration: 650, useNativeDriver: USE_NATIVE_DRIVER }),
    ]), { iterations: 3 }).start();
  }

  function runOpeningAnimation() {
    packRotate.setValue(0);
    packScale.setValue(1);
    burst.setValue(0);
    beam.setValue(0);

    return new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.sequence([
            Animated.timing(packRotate, { toValue: -1, duration: 80, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 1, duration: 80, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: -1, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 1, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 0, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
          Animated.sequence([
            Animated.timing(packScale, { toValue: 1.08, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packScale, { toValue: 0.96, duration: 130, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packScale, { toValue: 1.15, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(packScale, { toValue: 0.02, duration: 210, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(burst, { toValue: 1, duration: 240, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(beam, { toValue: 1, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.delay(330),
      ]).start(() => resolve());
    });
  }

  async function startOpening() {
    if (!pack || stage !== 'sealed') return;
    setError(null);
    setStage('opening');

    try {
      const purchasePromise = onPurchase();
      await new Promise((resolve) => setTimeout(resolve, 480));
      setStage('burst');
      const [, receivedCards] = await Promise.all([runOpeningAnimation(), purchasePromise]);
      setCards(receivedCards);
      setCardIndex(0);
      setFaceUp(false);
      setStage('cards');
      requestAnimationFrame(() => { animateCardIn(); startRarityPulse(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir este booster.');
      setStage('sealed');
      packScale.setValue(1);
      packRotate.setValue(0);
      burst.setValue(0);
      beam.setValue(0);
    }
  }

  function revealCurrent() {
    if (faceUp) return;
    setFaceUp(true);
    requestAnimationFrame(animateCardIn);
  }

  function nextCard() {
    if (!faceUp) return revealCurrent();
    if (cardIndex >= cards.length - 1) {
      setStage('summary');
      onFinished?.();
      return;
    }
    setCardIndex((value) => value + 1);
    setFaceUp(false);
    requestAnimationFrame(() => { animateCardIn(); startRarityPulse(); });
  }

  if (!pack) return null;

  const currentCard = cards[cardIndex];
  const theme = rarityTheme(currentCard?.rarity);
  const compact = width < 620 || height < 720;
  const rotation = packRotate.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.2, 5] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.92, 0] });
  const beamScaleY = beam.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1.4] });
  const pulseScale = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const pulseOpacity = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.58] });

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (stage !== 'opening' && stage !== 'burst') onClose(); }}>
      <View style={styles.container}>
        <View style={[styles.vignetteTop, styles.noPointerEvents]} />
        <View style={[styles.vignetteBottom, styles.noPointerEvents]} />

        <View style={styles.header}>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>PACK OPENING</Text><Text numberOfLines={1} style={styles.title}>{pack.name}</Text></View>
          {stage !== 'opening' && stage !== 'burst' ? <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={23} color="#fff" /></Pressable> : null}
        </View>

        {stage === 'sealed' || stage === 'opening' || stage === 'burst' ? (
          <View style={styles.openingStage}>
            <View style={[styles.floorLight, styles.noPointerEvents]} />
            <Animated.View style={[styles.burstRing, styles.noPointerEvents, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
            <Animated.View style={[styles.lightBeam, styles.noPointerEvents, { opacity: beam, transform: [{ scaleY: beamScaleY }] }]} />

            <Animated.View style={{ transform: [{ translateY: packY }, { rotate: rotation }, { scale: packScale }] }}>
              <FoilBooster pack={pack} compact={compact} />
            </Animated.View>

            <View style={styles.openingCopy}>
              <Text style={styles.stageEyebrow}>{stage === 'sealed' ? 'PACOTE SELADO' : stage === 'opening' ? 'ROMPENDO LACRE' : 'RECOMPENSAS LIBERADAS'}</Text>
              <Text style={styles.stageTitle}>{stage === 'sealed' ? 'Pronto para abrir?' : stage === 'opening' ? 'Preparando abertura...' : 'Impacto!'}</Text>
              <Text style={styles.stageSubtitle}>{stage === 'sealed' ? `${pack.cards_per_pack} cards • 🪙 ${pack.price}` : stage === 'opening' ? 'Validando a compra e carregando as recompensas.' : 'O booster foi rompido. Preparando o primeiro card.'}</Text>
            </View>

            {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={20} color="#FF9A9A" /><Text style={styles.errorText}>{error}</Text></View> : null}

            {stage === 'sealed' ? (
              <Pressable style={styles.openButton} onPress={startOpening}><View style={styles.openButtonAccent} /><Ionicons name="flash" size={19} color="#111820" /><Text style={styles.openButtonText}>ABRIR PACOTE</Text></Pressable>
            ) : <View style={styles.loadingLine}><Animated.View style={[styles.loadingFill, { opacity: beam }]} /></View>}
          </View>
        ) : null}

        {stage === 'cards' && currentCard ? (
          <View style={styles.rewardStage}>
            <Text style={styles.rewardCounter}>RECOMPENSA {cardIndex + 1} / {cards.length}</Text>
            <Animated.View style={[styles.rarityAura, styles.noPointerEvents, { backgroundColor: theme.color, opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
            <View style={[styles.rarityBar, { borderColor: theme.color, backgroundColor: theme.soft }]}><View style={[styles.rarityDot, { backgroundColor: theme.color }]} /><Text style={[styles.rarityBarText, { color: theme.color }]}>{theme.label}</Text></View>

            <Pressable style={styles.rewardTapArea} onPress={!faceUp ? revealCurrent : undefined}>
              <Animated.View style={[styles.rewardCard, compact && styles.rewardCardCompact, { opacity: cardOpacity, borderColor: theme.color, transform: [{ scale: cardScale }] }]}>
                {faceUp ? (
                  <>
                    <View style={[styles.rewardTopLine, { backgroundColor: theme.color }]} />
                    {currentCard.image ? <Image source={{ uri: currentCard.image }} resizeMode="contain" style={[styles.rewardImage, compact && styles.rewardImageCompact]} /> : <View style={[styles.rewardPlaceholder, compact && styles.rewardImageCompact]}><Ionicons name="image-outline" size={58} color="#7B94B5" /></View>}
                    <View style={styles.rewardInfo}><Text style={styles.rewardName}>{currentCard.name}</Text><Text style={[styles.rewardRarity, { color: theme.color }]}>{currentCard.rarity ?? 'Comum'}</Text></View>
                  </>
                ) : (
                  <View style={[styles.rewardBack, { borderColor: theme.color }]}><View style={[styles.rewardBackGlow, { backgroundColor: theme.soft }]} /><View style={[styles.rewardGlyph, { borderColor: theme.color }]}><Ionicons name="help" size={58} color={theme.color} /></View><Text style={styles.rewardUnknown}>RECOMPENSA OCULTA</Text><Text style={[styles.rewardHint, { color: theme.color }]}>TOQUE PARA REVELAR</Text></View>
                )}
              </Animated.View>
            </Pressable>

            <Pressable style={[styles.nextButton, { borderColor: theme.color }]} onPress={nextCard}><Text style={styles.nextButtonText}>{!faceUp ? 'REVELAR' : cardIndex >= cards.length - 1 ? 'VER TUDO' : 'PRÓXIMA RECOMPENSA'}</Text><Ionicons name="chevron-forward" size={19} color="#fff" /></Pressable>
          </View>
        ) : null}

        {stage === 'summary' ? (
          <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryHero}><Ionicons name="checkmark-circle" size={42} color="#65D894" /><Text style={styles.summaryTitle}>Booster aberto!</Text><Text style={styles.summarySubtitle}>Todos os cards já estão na sua Bag. Você também ganhou +20 XP.</Text></View>
            <View style={styles.summaryGrid}>{cards.map((card, index) => { const cardTheme = rarityTheme(card.rarity); return <View key={`${card.id}-${index}`} style={[styles.summaryCard, { borderColor: cardTheme.color }]}>{card.image ? <Image source={{ uri: card.image }} resizeMode="contain" style={styles.summaryImage} /> : <View style={styles.summaryPlaceholder} />}<Text numberOfLines={1} style={styles.summaryName}>{card.name}</Text><Text numberOfLines={1} style={[styles.summaryRarity, { color: cardTheme.color }]}>{card.rarity ?? 'Comum'}</Text></View>; })}</View>
            <Pressable style={styles.summaryButton} onPress={onClose}><Text style={styles.summaryButtonText}>VOLTAR À LOJA</Text></Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function FoilBooster({ pack, compact }: { pack: Pack; compact: boolean }) {
  return (
    <View style={[styles.foilPack, compact && styles.foilPackCompact]}>
      <View style={styles.foilTop} />
      <View style={styles.foilSlashOne} />
      <View style={styles.foilSlashTwo} />
      <Text style={styles.foilBrand}>POKÉMON TCG</Text>
      {pack.image_url ? <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.foilLogo} /> : <View style={styles.foilPlaceholder}><Ionicons name="cube" size={58} color="#89A8D0" /><Text style={styles.foilPlaceholderText}>BOOSTER</Text></View>}
      <Text style={styles.foilSet}>{pack.set_id.toUpperCase()}</Text>
      <Text style={styles.foilCards}>{pack.cards_per_pack} CARDS</Text>
      <View style={styles.foilBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#040A12', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 22, overflow: 'hidden' },
  noPointerEvents: { pointerEvents: 'none' } as any,
  vignetteTop: { position: 'absolute', top: -130, left: '10%', right: '10%', height: 300, borderRadius: 300, backgroundColor: '#173B6D', opacity: 0.25 },
  vignetteBottom: { position: 'absolute', bottom: -180, left: '18%', right: '18%', height: 330, borderRadius: 330, backgroundColor: '#3A1F4F', opacity: 0.22 },
  header: { width: '100%', maxWidth: 1180, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 20 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101C2C', borderWidth: 1, borderColor: '#253A55' },
  openingStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, position: 'relative' },
  floorLight: { position: 'absolute', bottom: '18%', width: 360, height: 55, borderRadius: 180, backgroundColor: '#2B5D94', opacity: 0.2 },
  burstRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 9, borderColor: '#DCEBFF', backgroundColor: '#FFFFFF44' },
  lightBeam: { position: 'absolute', width: 90, height: 520, backgroundColor: '#CFE7FF', opacity: 0.5 },
  foilPack: { width: 230, height: 345, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#142C4D', borderWidth: 2, borderColor: '#426E9F' },
  foilPackCompact: { width: 165, height: 245, borderRadius: 16 },
  foilTop: { position: 'absolute', top: 0, width: '100%', height: 18, backgroundColor: '#D6B540' },
  foilBottom: { position: 'absolute', bottom: 0, width: '100%', height: 18, backgroundColor: '#D6B540' },
  foilSlashOne: { position: 'absolute', width: 360, height: 80, backgroundColor: '#326CAC', opacity: 0.24, transform: [{ rotate: '-28deg' }] },
  foilSlashTwo: { position: 'absolute', width: 330, height: 38, backgroundColor: '#8B4FB0', opacity: 0.14, transform: [{ rotate: '32deg' }] },
  foilBrand: { position: 'absolute', top: 28, color: '#DCE9FA', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  foilLogo: { width: '86%', height: '58%' },
  foilPlaceholder: { alignItems: 'center', gap: 8 },
  foilPlaceholderText: { color: '#9EB8D8', fontSize: 9, fontWeight: '900' },
  foilSet: { position: 'absolute', bottom: 38, color: '#C4D3E8', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  foilCards: { position: 'absolute', bottom: 26, color: '#768EAD', fontSize: 7, fontWeight: '800' },
  openingCopy: { alignItems: 'center', maxWidth: 420, marginTop: 5 },
  stageEyebrow: { color: '#7994B7', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  stageTitle: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  stageSubtitle: { color: '#879DB9', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 3 },
  errorBox: { width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: 14, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243' },
  errorText: { flex: 1, color: '#FFD6D6', fontSize: 11, fontWeight: '700' },
  openButton: { minWidth: 220, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 4, backgroundColor: gameTheme.colors.yellow, overflow: 'hidden', marginTop: 5 },
  openButtonAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, backgroundColor: '#FFF1A0' },
  openButtonText: { color: '#111820', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  loadingLine: { width: 250, height: 4, borderRadius: 999, backgroundColor: '#1B2A3D', overflow: 'hidden', marginTop: 8 },
  loadingFill: { width: '100%', height: '100%', backgroundColor: '#D5E9FF' },
  rewardStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11, position: 'relative' },
  rewardCounter: { color: '#7389A6', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  rarityAura: { position: 'absolute', width: 420, height: 420, borderRadius: 210 },
  rarityBar: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  rarityBarText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  rewardTapArea: { alignItems: 'center', justifyContent: 'center' },
  rewardCard: { width: 310, minHeight: 445, borderRadius: 19, overflow: 'hidden', backgroundColor: '#0B1522', borderWidth: 2 },
  rewardCardCompact: { width: 225, minHeight: 325 },
  rewardTopLine: { height: 5, width: '100%' },
  rewardImage: { width: '100%', height: 390 },
  rewardImageCompact: { height: 278 },
  rewardPlaceholder: { width: '100%', height: 390, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111F31' },
  rewardInfo: { paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  rewardName: { color: '#fff', fontSize: 17, fontWeight: '900' },
  rewardRarity: { fontSize: 10, fontWeight: '900', marginTop: 3 },
  rewardBack: { flex: 1, minHeight: 440, alignItems: 'center', justifyContent: 'center', gap: 16, borderWidth: 2, backgroundColor: '#080F18', position: 'relative', overflow: 'hidden' },
  rewardBackGlow: { position: 'absolute', width: 300, height: 300, borderRadius: 150, opacity: 0.5 },
  rewardGlyph: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 3, backgroundColor: '#07111F' },
  rewardUnknown: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  rewardHint: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  nextButton: { minWidth: 225, minHeight: 47, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17, borderRadius: 4, backgroundColor: '#101A28', borderWidth: 1 },
  nextButtonText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  summaryContent: { width: '100%', maxWidth: 1050, alignSelf: 'center', paddingVertical: 28, gap: 17 },
  summaryHero: { alignItems: 'center', gap: 5 },
  summaryTitle: { color: '#fff', fontSize: 27, fontWeight: '900' },
  summarySubtitle: { color: '#8399B5', fontSize: 11, textAlign: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9 },
  summaryCard: { width: 145, padding: 6, borderRadius: 12, backgroundColor: '#0D1928', borderWidth: 1 },
  summaryImage: { width: '100%', aspectRatio: 0.72 },
  summaryPlaceholder: { width: '100%', aspectRatio: 0.72, borderRadius: 7, backgroundColor: '#162538' },
  summaryName: { color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 5 },
  summaryRarity: { fontSize: 8, fontWeight: '900', marginTop: 2 },
  summaryButton: { alignSelf: 'center', minWidth: 220, minHeight: 49, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: gameTheme.colors.yellow, marginTop: 5 },
  summaryButtonText: { color: '#111820', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
});
