import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OpenedCard, Pack } from '@/services/packs';
import { BoosterPack2D } from '@/components/BoosterPack2D';
import { PremiumBackground } from '@/components/PremiumBackground';
import { formatUsd } from '@/services/market';

type Props = { visible: boolean; pack: Pack | null; onClose: () => void; onPurchase: () => Promise<OpenedCard[]>; onFinished?: () => void };
type Stage = 'sealed' | 'opening' | 'cards' | 'summary';
type RarityTheme = { color: string; soft: string; label: string; tier: number };

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const RAYS = Array.from({ length: 18 }, (_, index) => index * 20);
const SPARKS = Array.from({ length: 20 }, (_, index) => index * 18);
const HIDDEN_COLOR = '#7B8794';
const HIDDEN_SOFT = '#14181D';

function rarityTheme(rarity?: string | null): RarityTheme {
  const value = (rarity ?? '').toLowerCase();
  if (value.includes('hyper') || value.includes('secret') || value.includes('special illustration') || value.includes('shiny ultra')) return { color: '#FFD447', soft: '#2D240A', label: 'RARIDADE MÁXIMA', tier: 5 };
  if (value.includes('ultra') || value.includes('illustration') || value.includes('double rare') || value.includes('ace spec') || value.includes('rainbow')) return { color: '#A970FF', soft: '#211135', label: 'RARIDADE ESPECIAL', tier: 4 };
  if (value.includes('rare') || value.includes('holo')) return { color: '#4EA5FF', soft: '#0E2036', label: 'RARO', tier: 3 };
  if (value.includes('uncommon')) return { color: '#62D39C', soft: '#102A20', label: 'INCOMUM', tier: 2 };
  return { color: '#AAB3BF', soft: '#181B20', label: 'COMUM', tier: 1 };
}
function cardImageCandidates(card: OpenedCard) {
  return [card.imageLarge, card.image, card.imageSmall, card.imageFallbackLarge, card.imageFallback]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

function rarityScore(card: OpenedCard) { return rarityTheme(card.rarity).tier; }
function flashStrength(tier: number) { return tier >= 5 ? .98 : tier === 4 ? .9 : tier === 3 ? .74 : tier === 2 ? .55 : .4; }

export function PackOpeningModal({ visible, pack, onClose, onPurchase, onFinished }: Props) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 620 || height < 730;
  const maxPackWidthByScreen = Math.max(182, width - 132);
  const maxPackWidthByHeight = Math.max(182, (height - insets.top - insets.bottom - 300) / 1.72);
  const openingPackWidth = compact
    ? Math.min(214, maxPackWidthByScreen, maxPackWidthByHeight)
    : Math.min(235, maxPackWidthByHeight);
  const [stage, setStage] = useState<Stage>('sealed');
  const [cards, setCards] = useState<OpenedCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailureLevel, setImageFailureLevel] = useState<Record<string, number>>({});

  const packY = useRef(new Animated.Value(0)).current;
  const packRotate = useRef(new Animated.Value(0)).current;
  const packScale = useRef(new Animated.Value(1)).current;
  const packOpacity = useRef(new Animated.Value(1)).current;
  const seamCharge = useRef(new Animated.Value(0)).current;
  const tear = useRef(new Animated.Value(0)).current;
  const openingFlash = useRef(new Animated.Value(0)).current;
  const openingCore = useRef(new Animated.Value(0)).current;
  const openingShock = useRef(new Animated.Value(0)).current;
  const openingColor = useRef(new Animated.Value(0)).current;
  const floorPulse = useRef(new Animated.Value(0)).current;

  const cardEnter = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const rarityPulse = useRef(new Animated.Value(0)).current;
  const revealBurst = useRef(new Animated.Value(0)).current;
  const screenFlash = useRef(new Animated.Value(0)).current;
  const coreFlash = useRef(new Animated.Value(0)).current;
  const shockwave = useRef(new Animated.Value(0)).current;
  const cardImpact = useRef(new Animated.Value(0)).current;

  function resetOpening() {
    packY.setValue(0); packRotate.setValue(0); packScale.setValue(1); packOpacity.setValue(1); seamCharge.setValue(0); tear.setValue(0); openingFlash.setValue(0); openingCore.setValue(0); openingShock.setValue(0); openingColor.setValue(0); floorPulse.setValue(0);
  }
  function resetReveal() { flip.setValue(0); revealBurst.setValue(0); screenFlash.setValue(0); coreFlash.setValue(0); shockwave.setValue(0); cardImpact.setValue(0); }

  useEffect(() => {
    if (!visible) return;
    setStage('sealed'); setCards([]); setCardIndex(0); setFaceUp(false); setError(null); setImageFailureLevel({}); resetOpening(); resetReveal(); cardEnter.setValue(0); rarityPulse.setValue(0);
    const floating = Animated.loop(Animated.sequence([
      Animated.timing(packY, { toValue: -9, duration: 1350, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(packY, { toValue: 7, duration: 1350, useNativeDriver: USE_NATIVE_DRIVER }),
    ]));
    floating.start();
    return () => floating.stop();
  // Animated values are stable refs; pack id intentionally resets a new opening.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pack?.id]);

  function animateCardIn() {
    cardEnter.setValue(0);
    Animated.spring(cardEnter, { toValue: 1, friction: 8, tension: 62, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }
  function startRarityPulse() {
    rarityPulse.stopAnimation(); rarityPulse.setValue(0);
    Animated.loop(Animated.sequence([
      Animated.timing(rarityPulse, { toValue: 1, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(rarityPulse, { toValue: 0, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
    ]), { iterations: 6 }).start();
  }

  function runOpeningAnimation() {
    resetOpening();
    return new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(seamCharge, { toValue: 1, duration: 620, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.sequence([Animated.timing(packScale, { toValue: .94, duration: 250, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(packScale, { toValue: 1.035, duration: 300, useNativeDriver: USE_NATIVE_DRIVER })]),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(packRotate, { toValue: -1, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(packRotate, { toValue: 1, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: -.85, duration: 48, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(packRotate, { toValue: .85, duration: 48, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(packRotate, { toValue: 0, duration: 50, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
          Animated.timing(packScale, { toValue: 1.08, duration: 260, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(tear, { toValue: 1, duration: 330, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(packScale, { toValue: 1.13, duration: 260, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(floorPulse, { toValue: 1, duration: 310, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(openingFlash, { toValue: 1, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }), Animated.delay(35), Animated.timing(openingFlash, { toValue: .16, duration: 135, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(openingFlash, { toValue: .56, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(openingFlash, { toValue: 0, duration: 270, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
          Animated.sequence([Animated.timing(openingCore, { toValue: 1, duration: 85, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(openingCore, { toValue: 0, duration: 540, useNativeDriver: USE_NATIVE_DRIVER })]),
          Animated.sequence([Animated.delay(45), Animated.timing(openingShock, { toValue: 1, duration: 760, useNativeDriver: USE_NATIVE_DRIVER })]),
          Animated.sequence([Animated.delay(35), Animated.timing(openingColor, { toValue: 1, duration: 160, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(openingColor, { toValue: 0, duration: 650, useNativeDriver: USE_NATIVE_DRIVER })]),
          Animated.sequence([Animated.delay(105), Animated.timing(packOpacity, { toValue: 0, duration: 310, useNativeDriver: USE_NATIVE_DRIVER })]),
          Animated.sequence([Animated.delay(85), Animated.timing(packScale, { toValue: .56, duration: 330, useNativeDriver: USE_NATIVE_DRIVER })]),
        ]),
        Animated.delay(190),
      ]).start(() => resolve());
    });
  }

  async function startOpening() {
    if (!pack || stage !== 'sealed') return;
    setError(null); setStage('opening');
    try {
      const [receivedCards] = await Promise.all([onPurchase(), runOpeningAnimation()]);
      setCards(receivedCards); setCardIndex(0); setFaceUp(false); resetReveal(); setStage('cards');
      requestAnimationFrame(() => { animateCardIn(); startRarityPulse(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir este booster.'); setStage('sealed'); resetOpening();
    }
  }

  function revealCurrent() {
    if (faceUp) return;
    const theme = rarityTheme(cards[cardIndex]?.rarity);
    const high = theme.tier >= 4;
    setFaceUp(true); resetReveal();
    Animated.parallel([
      Animated.spring(flip, { toValue: 1, friction: 7, tension: 72, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.sequence([Animated.delay(45), Animated.timing(screenFlash, { toValue: flashStrength(theme.tier), duration: high ? 68 : 90, useNativeDriver: USE_NATIVE_DRIVER }), Animated.delay(high ? 28 : 12), Animated.timing(screenFlash, { toValue: 0, duration: high ? 250 : 185, useNativeDriver: USE_NATIVE_DRIVER })]),
      Animated.sequence([Animated.delay(35), Animated.timing(coreFlash, { toValue: 1, duration: high ? 82 : 105, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(coreFlash, { toValue: 0, duration: high ? 400 : 310, useNativeDriver: USE_NATIVE_DRIVER })]),
      Animated.sequence([Animated.delay(72), Animated.timing(shockwave, { toValue: 1, duration: high ? 640 : 510, useNativeDriver: USE_NATIVE_DRIVER })]),
      Animated.sequence([Animated.delay(58), Animated.timing(revealBurst, { toValue: 1, duration: high ? 145 : 180, useNativeDriver: USE_NATIVE_DRIVER }), Animated.timing(revealBurst, { toValue: 0, duration: high ? 640 : 510, useNativeDriver: USE_NATIVE_DRIVER })]),
      Animated.sequence([Animated.delay(68), Animated.timing(cardImpact, { toValue: 1, duration: 105, useNativeDriver: USE_NATIVE_DRIVER }), Animated.spring(cardImpact, { toValue: 0, friction: 5, tension: 75, useNativeDriver: USE_NATIVE_DRIVER })]),
    ]).start();
  }

  function nextCard() {
    if (!faceUp) { revealCurrent(); return; }
    if (cardIndex >= cards.length - 1) { setStage('summary'); onFinished?.(); return; }
    setCardIndex((value) => value + 1); setFaceUp(false); resetReveal(); requestAnimationFrame(() => { animateCardIn(); startRarityPulse(); });
  }

  function revealAll() {
    setStage('summary');
    onFinished?.();
  }

  function goToBag() {
    onClose();
    requestAnimationFrame(() => router.replace('/(tabs)/bag'));
  }

  async function buyAnother() {
    if (!pack || stage !== 'summary') return;
    setError(null); setCards([]); setCardIndex(0); setFaceUp(false); setImageFailureLevel({});
    resetOpening(); resetReveal(); cardEnter.setValue(0); rarityPulse.setValue(0); setStage('opening');
    try {
      const [receivedCards] = await Promise.all([onPurchase(), runOpeningAnimation()]);
      setCards(receivedCards); setCardIndex(0); setFaceUp(false); resetReveal(); setStage('cards');
      requestAnimationFrame(() => { animateCardIn(); startRarityPulse(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível comprar outro booster.');
      setStage('summary');
    }
  }

  async function shareBestPull() {
    if (!bestPull || !pack) return;
    try {
      await Share.share({
        message: `Meu melhor pull foi ${bestPull.name} (${bestPull.rarity ?? 'Pokémon Card'}) em ${pack.name}! 🎴✨`,
      });
    } catch {
      // Fechar o compartilhamento não deve interromper a abertura do booster.
    }
  }

  const bestPull = useMemo(() => cards.length ? cards.reduce((best, card) => rarityScore(card) > rarityScore(best) ? card : best, cards[0]) : null, [cards]);
  const pricedCardCount = useMemo(
    () => cards.filter((card) => card.marketPriceUsd != null).length,
    [cards],
  );
  const totalMarketValueUsd = useMemo(
    () => cards.reduce((sum, card) => sum + (card.marketPriceUsd ?? 0), 0),
    [cards],
  );
  const totalMarketValueLabel = pricedCardCount === 0
    ? 'Valor total indisponível'
    : pricedCardCount === cards.length
      ? `Valor total: ${formatUsd(totalMarketValueUsd)}`
      : `Valor conhecido: ${formatUsd(totalMarketValueUsd)} • ${pricedCardCount}/${cards.length} cartas`;
  if (!pack) return null;
  const currentCard = cards[cardIndex];
  const theme = rarityTheme(currentCard?.rarity);
  const revealColor = faceUp ? theme.color : HIDDEN_COLOR;
  const revealSoft = faceUp ? theme.soft : HIDDEN_SOFT;
  const revealLabel = faceUp ? theme.label : 'CARTA OCULTA';
  const highTier = theme.tier >= 4;

  const packRotation = packRotate.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });
  const floorScale = floorPulse.interpolate({ inputRange: [0, 1], outputRange: [.5, 1.9] });
  const openingCoreScale = openingCore.interpolate({ inputRange: [0, 1], outputRange: [.1, 3.8] });
  const openingCoreOpacity = openingCore.interpolate({ inputRange: [0, .25, 1], outputRange: [0, 1, .85] });
  const openingShockScale = openingShock.interpolate({ inputRange: [0, 1], outputRange: [.28, 5.4] });
  const openingShockScaleTwo = openingShock.interpolate({ inputRange: [0, 1], outputRange: [.16, 6.5] });
  const openingShockOpacity = openingShock.interpolate({ inputRange: [0, .12, .6, 1], outputRange: [0, 1, .42, 0] });
  const openingShockOpacityTwo = openingShock.interpolate({ inputRange: [0, .28, .75, 1], outputRange: [0, .82, .22, 0] });
  const openingSparkTravel = openingShock.interpolate({ inputRange: [0, 1], outputRange: [0, -310] });
  const openingSparkOpacity = openingShock.interpolate({ inputRange: [0, .1, .65, 1], outputRange: [0, 1, .5, 0] });
  const openingRayScale = openingColor.interpolate({ inputRange: [0, 1], outputRange: [.1, 3] });
  const openingColorWash = openingColor.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .38, 0] });

  const cardTranslateY = cardEnter.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
  const baseCardScale = cardEnter.interpolate({ inputRange: [0, 1], outputRange: [.9, 1] });
  const impactScale = cardImpact.interpolate({ inputRange: [0, 1], outputRange: [1, highTier ? 1.08 : 1.045] });
  const combinedCardScale = Animated.multiply(baseCardScale, impactScale);
  const auraScale = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [.9, highTier ? 1.22 : 1.12] });
  const auraOpacity = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [theme.tier === 1 ? .16 : .24, theme.tier >= 5 ? .84 : theme.tier === 4 ? .74 : theme.tier === 3 ? .58 : .42] });
  const backScaleX = flip.interpolate({ inputRange: [0, .5, 1], outputRange: [1, 0, 0] });
  const frontScaleX = flip.interpolate({ inputRange: [0, .5, 1], outputRange: [0, 0, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, .49, .5, 1], outputRange: [1, 1, 0, 0] });
  const frontOpacity = flip.interpolate({ inputRange: [0, .49, .5, 1], outputRange: [0, 0, 1, 1] });
  const revealScale = revealBurst.interpolate({ inputRange: [0, 1], outputRange: [.15, highTier ? 3.1 : 2.5] });
  const colorWash = revealBurst.interpolate({ inputRange: [0, .22, 1], outputRange: [0, highTier ? .25 : .14, 0] });
  const coreScale = coreFlash.interpolate({ inputRange: [0, 1], outputRange: [.12, highTier ? 3.3 : 2.7] });
  const coreOpacity = coreFlash.interpolate({ inputRange: [0, .28, 1], outputRange: [0, 1, .95] });
  const shockScale = shockwave.interpolate({ inputRange: [0, 1], outputRange: [.38, highTier ? 4 : 3.2] });
  const shockScaleTwo = shockwave.interpolate({ inputRange: [0, 1], outputRange: [.2, highTier ? 4.9 : 3.9] });
  const shockOpacity = shockwave.interpolate({ inputRange: [0, .12, .55, 1], outputRange: [0, 1, .48, 0] });
  const shockOpacityTwo = shockwave.interpolate({ inputRange: [0, .28, .72, 1], outputRange: [0, highTier ? .84 : .5, .25, 0] });
  const sparkTravel = shockwave.interpolate({ inputRange: [0, 1], outputRange: [0, highTier ? -265 : -210] });
  const sparkOpacity = shockwave.interpolate({ inputRange: [0, .12, .62, 1], outputRange: [0, 1, .55, 0] });
  const rayScale = revealBurst.interpolate({ inputRange: [0, 1], outputRange: [.2, highTier ? 2.45 : 1.8] });

  return <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (stage !== 'opening') onClose(); }}>
    <View style={styles.container}>
      <PremiumBackground />
      <View style={styles.shadeTop} /><View style={styles.shadeBottom} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 17), minHeight: 66 + insets.top }]}><View style={{ flex: 1 }}><Text style={styles.kicker}>PACK OPENING</Text><Text numberOfLines={1} style={styles.title}>{pack.name}</Text></View>{stage !== 'opening' ? <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={21} color="#F4F4F4" /></Pressable> : null}</View>

      {(stage === 'sealed' || stage === 'opening') ? <View style={styles.openingStage}>
        <Animated.View pointerEvents="none" style={[styles.floorHalo, { opacity: floorPulse, transform: [{ scaleX: floorScale }] }]} />
        <Animated.View pointerEvents="none" style={[styles.openingCore, { opacity: openingCoreOpacity, transform: [{ scale: openingCoreScale }] }]} />
        <Animated.View pointerEvents="none" style={[styles.openingShock, { opacity: openingShockOpacity, transform: [{ scale: openingShockScale }] }]} />
        <Animated.View pointerEvents="none" style={[styles.openingShockTwo, { opacity: openingShockOpacityTwo, transform: [{ scale: openingShockScaleTwo }] }]} />
        {RAYS.map((rotation) => <Animated.View pointerEvents="none" key={`or-${rotation}`} style={[styles.openingRay, { opacity: openingColor, transform: [{ rotate: `${rotation}deg` }, { translateY: -210 }, { scaleY: openingRayScale }] }]} />)}
        {SPARKS.map((rotation) => <Animated.View pointerEvents="none" key={`os-${rotation}`} style={[styles.openingSpark, { backgroundColor: rotation % 36 === 0 ? '#fff' : '#FFD447', opacity: openingSparkOpacity, transform: [{ rotate: `${rotation}deg` }, { translateY: openingSparkTravel }] }]} />)}
        <Animated.View style={{ zIndex: 8, opacity: packOpacity, transform: [{ translateY: packY }, { rotate: packRotation }, { scale: packScale }] }}><BoosterPack2D pack={pack} width={openingPackWidth} tear={tear} seamCharge={seamCharge} /></Animated.View>
        <View style={styles.openingCopy}><Text style={styles.stageEyebrow}>{stage === 'sealed' ? 'BOOSTER SELADO' : tear ? 'RASGANDO O LACRE' : 'ABRINDO'}</Text><Text style={styles.stageTitle}>{stage === 'sealed' ? 'Abra o pack.' : 'A energia está saindo de dentro.'}</Text><Text style={styles.stageSubtitle}>{stage === 'sealed' ? `${pack.cards_per_pack} card(s) • ${pack.currency === 'diamonds' ? '💎' : '🪙'} ${pack.price.toLocaleString('pt-BR')}` : 'O lacre foi rompido. Preparando suas recompensas…'}</Text></View>
        {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={19} color="#FF7A82" /><Text style={styles.errorText}>{error}</Text></View> : null}
        {stage === 'sealed' ? <Pressable style={styles.openButton} onPress={startOpening}><View style={styles.openButtonLine} /><Text style={styles.openButtonText}>RASGAR E ABRIR</Text><Ionicons name="chevron-forward" size={18} color="#070707" /></Pressable> : <View style={styles.loadingTrack}><Animated.View style={[styles.loadingSweep, { opacity: seamCharge, transform: [{ scaleX: seamCharge }] }]} /></View>}
      </View> : null}

      {stage === 'cards' && currentCard ? <View style={styles.rewardStage}>
        <View style={styles.rewardHeader}><Text style={styles.rewardCounter}>RECOMPENSA {cardIndex + 1} / {cards.length}</Text><View style={[styles.raritySignal, { borderColor: `${revealColor}80`, backgroundColor: revealSoft }]}><View style={[styles.signalDot, { backgroundColor: revealColor }]} /><Text style={[styles.signalText, { color: revealColor }]}>{revealLabel}</Text></View></View>
        <View style={styles.revealArena}>
          <Animated.View pointerEvents="none" style={[styles.rarityAura, { backgroundColor: revealColor, opacity: faceUp ? auraOpacity : .16, transform: [{ scale: auraScale }] }]} />
          <Animated.View pointerEvents="none" style={[styles.coreFlash, { opacity: coreOpacity, transform: [{ scale: coreScale }] }]} />
          <Animated.View pointerEvents="none" style={[styles.revealFlash, { backgroundColor: revealColor, opacity: revealBurst, transform: [{ scale: revealScale }] }]} />
          <Animated.View pointerEvents="none" style={[styles.shockwave, { borderColor: '#fff', opacity: shockOpacity, transform: [{ scale: shockScale }] }]} />
          <Animated.View pointerEvents="none" style={[styles.shockwaveTwo, { borderColor: revealColor, opacity: shockOpacityTwo, transform: [{ scale: shockScaleTwo }] }]} />
          {RAYS.map((rotation) => <Animated.View pointerEvents="none" key={`rr-${rotation}`} style={[styles.ray, { backgroundColor: revealColor, opacity: revealBurst, transform: [{ rotate: `${rotation}deg` }, { translateY: highTier ? -195 : -170 }, { scaleY: rayScale }] }]} />)}
          {theme.tier >= 3 ? SPARKS.map((rotation) => <Animated.View pointerEvents="none" key={`rs-${rotation}`} style={[styles.spark, { backgroundColor: rotation % 36 === 0 ? '#fff' : revealColor, opacity: sparkOpacity, transform: [{ rotate: `${rotation}deg` }, { translateY: sparkTravel }] }]} />) : null}
          <View style={[styles.pedestal, { borderColor: revealColor }]} /><View style={styles.pedestalBase} />
          <Pressable style={styles.tapArea} onPress={!faceUp ? revealCurrent : undefined}>
            <Animated.View style={[styles.flipScene, compact && styles.flipSceneCompact, { opacity: cardEnter, transform: [{ translateY: cardTranslateY }, { scale: combinedCardScale }] }]}>
              <Animated.View style={[styles.cardFace, styles.cardBack, { opacity: backOpacity, borderColor: HIDDEN_COLOR, transform: [{ scaleX: backScaleX }] }]}><View style={[styles.backGlow, { backgroundColor: HIDDEN_SOFT }]} /><View style={[styles.backRing, { borderColor: HIDDEN_COLOR }]}><Ionicons name="help" size={55} color={HIDDEN_COLOR} /></View><Text style={styles.hiddenTitle}>RECOMPENSA OCULTA</Text><Text style={[styles.hiddenHint, { color: HIDDEN_COLOR }]}>TOQUE PARA REVELAR</Text></Animated.View>
              <Animated.View style={[styles.cardFace, styles.cardFront, { opacity: frontOpacity, borderColor: theme.color, transform: [{ scaleX: frontScaleX }] }]} pointerEvents="none">{(() => {
                const candidates = cardImageCandidates(currentCard);
                const level = imageFailureLevel[currentCard.id] ?? 0;
                const uri = candidates[level] ?? null;
                return uri ? (
                  <Image
                    source={{ uri }}
                    resizeMode="contain"
                    style={styles.rewardImage}
                    onError={() => setImageFailureLevel((value) => ({ ...value, [currentCard.id]: level + 1 }))}
                  />
                ) : (
                  <View style={styles.imageFallback}><Ionicons name="image-outline" size={54} color="#666" /></View>
                );
              })()}<View style={styles.rewardInfo}>
                <View style={styles.pullBadges}>
                  {currentCard.isNew ? <View style={styles.newBadge}><Text style={styles.pullBadgeText}>NEW</Text></View> : null}
                  {currentCard.wishlistHit ? <View style={styles.chaseBadge}><Ionicons name="star" size={11} color="#07111F" /><Text style={styles.chaseBadgeText}>CHASE HIT</Text></View> : null}
                </View>
                <Text style={styles.rewardName}>{currentCard.name}</Text>
                <Text style={[styles.rewardRarity, { color: theme.color }]}>{currentCard.rarity ?? 'Comum'}</Text>
                <View style={styles.rewardPriceRow}>
                  <Ionicons name="cash-outline" size={14} color="#65D894" />
                  <Text style={styles.rewardPrice}>
                    {currentCard.marketPriceUsd == null ? 'Valor indisponível' : formatUsd(currentCard.marketPriceUsd)}
                  </Text>
                </View>
              </View></Animated.View>
            </Animated.View>
          </Pressable>
        </View>
        <View style={styles.actionRow}><Pressable style={[styles.nextButton, { borderColor: `${revealColor}90` }]} onPress={nextCard}><Text style={styles.nextButtonText}>{!faceUp ? 'REVELAR' : cardIndex >= cards.length - 1 ? 'VER RESULTADO' : 'PRÓXIMA CARTA'}</Text><Ionicons name="arrow-forward" size={18} color="#F4F4F4" /></Pressable>{cards.length > 1 ? <Pressable style={styles.revealAllButton} onPress={revealAll}><Ionicons name="albums" size={17} color="#FFD447" /><Text style={styles.revealAllText}>REVELAR TODAS</Text></Pressable> : null}</View>
      </View> : null}

      {stage === 'summary' ? <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}><View style={styles.summaryHero}><Text style={styles.summaryKicker}>PACK FINALIZADO</Text><Text style={styles.summaryTitle}>Coleção atualizada.</Text>{bestPull ? <Text style={styles.bestPull}>Melhor pull: {bestPull.name}</Text> : null}<View style={styles.summaryValuePill}><Ionicons name="cash-outline" size={16} color="#65D894"/><Text style={styles.summaryValueText}>{totalMarketValueLabel}</Text></View><Text style={styles.summarySubtitle}>{pack.currency === 'diamonds' ? 'Sua carta lendária foi enviada para a Bag.' : 'Todos os cards foram enviados para sua Bag • +20 XP'}</Text></View><View style={styles.summaryGrid}>{cards.map((card, index) => { const cardTheme = rarityTheme(card.rarity); const key = `summary-${card.id}-${index}`; return <View key={key} style={[styles.summaryCard, { borderColor: `${cardTheme.color}70` }]}>{(() => {
          const candidates = cardImageCandidates(card);
          const level = imageFailureLevel[key] ?? 0;
          const uri = candidates[level] ?? null;
          return uri ? (
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={styles.summaryImage}
              onError={() => setImageFailureLevel((value) => ({ ...value, [key]: level + 1 }))}
            />
          ) : (
            <View style={styles.summaryFallback}><Ionicons name="image-outline" size={28} color="#555" /></View>
          );
        })()}<View style={styles.summaryBadgeRow}>{card.isNew ? <View style={styles.summaryNewBadge}><Text style={styles.summaryBadgeText}>NEW</Text></View> : null}{card.wishlistHit ? <View style={styles.summaryChaseBadge}><Text style={styles.summaryChaseText}>★ CHASE</Text></View> : null}</View><Text numberOfLines={1} style={styles.summaryName}>{card.name}</Text><Text numberOfLines={1} style={[styles.summaryRarity, { color: cardTheme.color }]}>{card.rarity ?? 'Comum'}</Text><Text numberOfLines={1} style={styles.summaryPrice}>{card.marketPriceUsd == null ? 'US$ —' : formatUsd(card.marketPriceUsd)}</Text></View>; })}</View><View style={styles.summaryActions}>{pack.id !== 'guild-collective' ? <Pressable style={styles.buyAgainButton} onPress={()=>void buyAnother()}><Ionicons name="cube" size={18} color="#07111F"/><Text style={styles.buyAgainText}>COMPRAR OUTRO</Text></Pressable> : null}<Pressable style={styles.summaryButton} onPress={onClose}><Text style={styles.summaryButtonText}>VOLTAR À LOJA</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Abrir Bag" style={styles.summaryBagButton} onPress={goToBag}><Ionicons name="bag-outline" size={22} color="#FFD447" /></Pressable>{bestPull ? <Pressable accessibilityRole="button" accessibilityLabel="Compartilhar melhor pull" style={styles.summaryBagButton} onPress={()=>void shareBestPull()}><Ionicons name="share-social-outline" size={22} color="#FFD447" /></Pressable> : null}</View></ScrollView> : null}

      {stage === 'opening' ? <><Animated.View pointerEvents="none" style={[styles.openingColorWash, { opacity: openingColorWash }]} /><Animated.View pointerEvents="none" style={[styles.fullFlash, { opacity: openingFlash }]} /></> : null}
      {stage === 'cards' && currentCard ? <><Animated.View pointerEvents="none" style={[styles.colorWash, { backgroundColor: revealColor, opacity: colorWash }]} /><Animated.View pointerEvents="none" style={[styles.fullFlash, { opacity: screenFlash }]} /></> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  rewardPriceRow:{marginTop:7,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  rewardPrice:{color:'#65D894',fontSize:13,fontWeight:'900'},
  summaryPrice:{color:'#65D894',fontSize:10,fontWeight:'900',marginTop:4},
  summaryValuePill:{alignSelf:'center',marginTop:8,borderRadius:999,borderWidth:1,borderColor:'#2F6F52',backgroundColor:'#10251C',paddingHorizontal:11,paddingVertical:7,flexDirection:'row',alignItems:'center',gap:6},
  summaryValueText:{color:'#9FE7BE',fontSize:10,fontWeight:'900'},
  actionRow: { flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:8 },
  buyAgainButton:{minHeight:44,borderRadius:12,paddingHorizontal:13,backgroundColor:'#FFD447',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  buyAgainText:{color:'#07111F',fontSize:8,fontWeight:'900'},
  pullBadges: { flexDirection:'row', flexWrap:'wrap', gap:6, justifyContent:'center', marginBottom:5 },
  newBadge: { borderRadius:999, paddingHorizontal:9, paddingVertical:4, backgroundColor:'#4EA5FF' },
  chaseBadge: { borderRadius:999, paddingHorizontal:9, paddingVertical:4, backgroundColor:'#FFD447', flexDirection:'row', alignItems:'center', gap:4 },
  pullBadgeText: { color:'#fff', fontSize:8, fontWeight:'900', letterSpacing:.7 },
  chaseBadgeText: { color:'#07111F', fontSize:8, fontWeight:'900', letterSpacing:.5 },
  summaryBadgeRow: { minHeight:18, flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:4 },
  summaryNewBadge: { borderRadius:7, paddingHorizontal:5, paddingVertical:2, backgroundColor:'#4EA5FF' },
  summaryChaseBadge: { borderRadius:7, paddingHorizontal:5, paddingVertical:2, backgroundColor:'#FFD447' },
  summaryBadgeText: { color:'#fff', fontSize:6, fontWeight:'900' },
  summaryChaseText: { color:'#07111F', fontSize:6, fontWeight:'900' },
  revealAllButton: { minWidth:170, height:48, borderRadius:12, borderWidth:1, borderColor:'#5A4A18', backgroundColor:'#19160C', flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7 },
  revealAllText: { color:'#FFD447', fontSize:9, fontWeight:'900' },
  container: { flex: 1, backgroundColor: '#030303', overflow: 'hidden' }, shadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(0,0,0,.48)' }, shadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(0,0,0,.45)' }, header: { minHeight: 74, paddingHorizontal: 18, paddingTop: 17, flexDirection: 'row', alignItems: 'flex-start', gap: 12, zIndex: 30 }, kicker: { color: '#FFD447', fontSize: 9, fontWeight: '900', letterSpacing: 2 }, title: { color: '#F5F5F5', fontSize: 18, fontWeight: '900', marginTop: 4 }, closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#292929' },
  openingStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 26, overflow: 'hidden' }, floorHalo: { position: 'absolute', bottom: '23%', width: 380, height: 90, borderRadius: 220, backgroundColor: 'rgba(255,212,71,.15)' }, openingCore: { position: 'absolute', width: 280, height: 280, borderRadius: 280, backgroundColor: '#fff', zIndex: 3 }, openingShock: { position: 'absolute', width: 270, height: 270, borderRadius: 270, borderWidth: 5, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,.07)', zIndex: 4 }, openingShockTwo: { position: 'absolute', width: 225, height: 225, borderRadius: 225, borderWidth: 4, borderColor: '#FFD447', backgroundColor: 'rgba(255,212,71,.04)', zIndex: 3 }, openingRay: { position: 'absolute', width: 4, height: 190, top: '50%', left: '50%', borderRadius: 10, backgroundColor: '#FFD447', zIndex: 3 }, openingSpark: { position: 'absolute', width: 6, height: 31, top: '50%', left: '50%', borderRadius: 8, zIndex: 5 }, openingCopy: { alignItems: 'center', marginTop: 16, maxWidth: 520, zIndex: 9 }, stageEyebrow: { color: '#858585', fontSize: 9, fontWeight: '900', letterSpacing: 2 }, stageTitle: { color: '#F7F7F7', fontSize: 23, lineHeight: 29, fontWeight: '900', textAlign: 'center', marginTop: 5 }, stageSubtitle: { color: '#8D8D8D', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 }, openButton: { marginTop: 15, minWidth: 220, height: 52, borderRadius: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#FFD447', overflow: 'hidden', zIndex: 9 }, openButtonLine: { position: 'absolute', top: 0, left: 22, right: 22, height: 2, backgroundColor: 'rgba(255,255,255,.78)' }, openButtonText: { color: '#070707', fontSize: 11, fontWeight: '900', letterSpacing: .8 }, loadingTrack: { marginTop: 20, width: 230, height: 3, borderRadius: 99, overflow: 'hidden', backgroundColor: '#202020', zIndex: 9 }, loadingSweep: { width: '100%', height: '100%', backgroundColor: '#FFD447' }, errorBox: { marginTop: 14, maxWidth: 470, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#5A2528', backgroundColor: '#1A0D0E', zIndex: 9 }, errorText: { color: '#FFB3B7', fontSize: 10, fontWeight: '700', flex: 1 },
  rewardStage: { flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 20 }, rewardHeader: { width: '100%', maxWidth: 760, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 7, marginTop: 6 }, rewardCounter: { color: '#797979', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }, raritySignal: { minHeight: 32, borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', gap: 6, alignItems: 'center' }, signalDot: { width: 7, height: 7, borderRadius: 99 }, signalText: { fontSize: 9, fontWeight: '900' }, revealArena: { flex: 1, width: '100%', maxWidth: 920, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, rarityAura: { position: 'absolute', width: 500, height: 500, borderRadius: 500 }, coreFlash: { position: 'absolute', width: 230, height: 230, borderRadius: 230, backgroundColor: '#fff', zIndex: 3 }, revealFlash: { position: 'absolute', width: 260, height: 260, borderRadius: 260, zIndex: 2 }, shockwave: { position: 'absolute', width: 260, height: 260, borderRadius: 260, borderWidth: 4, zIndex: 4 }, shockwaveTwo: { position: 'absolute', width: 215, height: 215, borderRadius: 215, borderWidth: 3, zIndex: 3 }, ray: { position: 'absolute', width: 3, height: 160, top: '50%', left: '50%', borderRadius: 10, zIndex: 3 }, spark: { position: 'absolute', width: 5, height: 26, top: '50%', left: '50%', borderRadius: 8, zIndex: 5 }, pedestal: { position: 'absolute', bottom: '11%', width: 320, height: 66, borderRadius: 160, borderWidth: 2, opacity: .36 }, pedestalBase: { position: 'absolute', bottom: '8%', width: 260, height: 38, borderRadius: 130, backgroundColor: '#070707' }, tapArea: { zIndex: 10 }, flipScene: { width: 330, height: 460 }, flipSceneCompact: { width: 250, height: 350 }, cardFace: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 2, overflow: 'hidden', backgroundColor: '#090909' }, cardBack: { alignItems: 'center', justifyContent: 'center', gap: 13 }, backGlow: { ...StyleSheet.absoluteFillObject, opacity: .65 }, backRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: 'center', justifyContent: 'center' }, hiddenTitle: { color: '#F4F4F4', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 }, hiddenHint: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, cardFront: { padding: 8 }, rewardImage: { width: '100%', flex: 1 }, imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' }, rewardInfo: { padding: 8, alignItems: 'center' }, rewardName: { color: '#F7F7F7', fontSize: 16, fontWeight: '900' }, rewardRarity: { fontSize: 10, fontWeight: '900', marginTop: 2 }, nextButton: { minWidth: 200, height: 48, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#101010' }, nextButtonText: { color: '#F4F4F4', fontSize: 10, fontWeight: '900' },
  summaryContent: { padding: 20, paddingBottom: 44, alignItems: 'center' }, summaryHero: { alignItems: 'center', marginTop: 25, marginBottom: 20 }, summaryKicker: { color: '#FFD447', fontSize: 9, fontWeight: '900', letterSpacing: 1.8 }, summaryTitle: { color: '#F7F7F7', fontSize: 27, fontWeight: '900', marginTop: 4 }, bestPull: { color: '#FFD447', fontSize: 12, fontWeight: '900', marginTop: 7 }, summarySubtitle: { color: '#888', fontSize: 10, marginTop: 5 }, summaryGrid: { width: '100%', maxWidth: 900, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 9 }, summaryCard: { width: 150, borderRadius: 14, borderWidth: 1, padding: 6, backgroundColor: '#0C0C0C' }, summaryImage: { width: '100%', height: 190 }, summaryFallback: { height: 190, alignItems: 'center', justifyContent: 'center' }, summaryName: { color: '#F4F4F4', fontSize: 10, fontWeight: '900', marginTop: 5 }, summaryRarity: { fontSize: 8, fontWeight: '900', marginTop: 2 }, summaryActions: { marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10 }, summaryButton: { height: 50, minWidth: 210, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD447' }, summaryBagButton: { width: 50, height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#5A4A18', backgroundColor: '#19160C', alignItems: 'center', justifyContent: 'center' }, summaryButtonText: { color: '#070707', fontSize: 10, fontWeight: '900' },
  openingColorWash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFD447', zIndex: 90 }, colorWash: { ...StyleSheet.absoluteFillObject, zIndex: 90 }, fullFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', zIndex: 100 },
});
