import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OpenedCard, Pack } from '@/services/packs';
import { PremiumBackground } from '@/components/PremiumBackground';

type Props = {
  visible: boolean;
  pack: Pack | null;
  onClose: () => void;
  onPurchase: () => Promise<OpenedCard[]>;
  onFinished?: () => void;
};

type Stage = 'sealed' | 'opening' | 'burst' | 'cards' | 'summary';
type RarityTheme = { color: string; soft: string; label: string; tier: number };

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const RAYS = Array.from({ length: 16 }, (_, index) => index * 22.5);
const SPARKS = Array.from({ length: 18 }, (_, index) => index * 20);

function rarityTheme(rarity?: string | null): RarityTheme {
  const value = (rarity ?? '').toLowerCase();
  if (value.includes('hyper') || value.includes('secret') || value.includes('special illustration') || value.includes('shiny ultra')) {
    return { color: '#FFD447', soft: '#2D240A', label: 'RARIDADE MÁXIMA', tier: 5 };
  }
  if (value.includes('ultra') || value.includes('illustration') || value.includes('double rare') || value.includes('ace spec') || value.includes('rainbow')) {
    return { color: '#A970FF', soft: '#211135', label: 'RARIDADE ESPECIAL', tier: 4 };
  }
  if (value.includes('rare') || value.includes('holo')) {
    return { color: '#4EA5FF', soft: '#0E2036', label: 'RARO', tier: 3 };
  }
  if (value.includes('uncommon')) {
    return { color: '#62D39C', soft: '#102A20', label: 'INCOMUM', tier: 2 };
  }
  return { color: '#AAB3BF', soft: '#181B20', label: 'COMUM', tier: 1 };
}

function rarityScore(card: OpenedCard) {
  return rarityTheme(card.rarity).tier;
}

function flashStrengthForTier(tier: number) {
  if (tier >= 5) return 0.96;
  if (tier === 4) return 0.88;
  if (tier === 3) return 0.72;
  if (tier === 2) return 0.54;
  return 0.38;
}

export function PackOpeningModal({ visible, pack, onClose, onPurchase, onFinished }: Props) {
  const { width, height } = useWindowDimensions();
  const compact = width < 620 || height < 730;

  const [stage, setStage] = useState<Stage>('sealed');
  const [cards, setCards] = useState<OpenedCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const packY = useRef(new Animated.Value(0)).current;
  const packRotate = useRef(new Animated.Value(0)).current;
  const packScale = useRef(new Animated.Value(1)).current;
  const packOpacity = useRef(new Animated.Value(1)).current;
  const seamCharge = useRef(new Animated.Value(0)).current;
  const tear = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const beam = useRef(new Animated.Value(0)).current;
  const floorPulse = useRef(new Animated.Value(0)).current;

  const cardEnter = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const rarityPulse = useRef(new Animated.Value(0)).current;
  const revealBurst = useRef(new Animated.Value(0)).current;
  const screenFlash = useRef(new Animated.Value(0)).current;
  const coreFlash = useRef(new Animated.Value(0)).current;
  const shockwave = useRef(new Animated.Value(0)).current;
  const cardImpact = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setStage('sealed');
    setCards([]);
    setCardIndex(0);
    setFaceUp(false);
    setError(null);
    setFailedImages({});

    packY.setValue(0);
    packRotate.setValue(0);
    packScale.setValue(1);
    packOpacity.setValue(1);
    seamCharge.setValue(0);
    tear.setValue(0);
    burst.setValue(0);
    beam.setValue(0);
    floorPulse.setValue(0);
    cardEnter.setValue(0);
    flip.setValue(0);
    rarityPulse.setValue(0);
    revealBurst.setValue(0);
    screenFlash.setValue(0);
    coreFlash.setValue(0);
    shockwave.setValue(0);
    cardImpact.setValue(0);

    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(packY, { toValue: -8, duration: 1450, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(packY, { toValue: 6, duration: 1450, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    floating.start();
    return () => floating.stop();
  }, [beam, burst, cardEnter, cardImpact, coreFlash, flip, floorPulse, pack?.id, packOpacity, packRotate, packScale, packY, rarityPulse, revealBurst, screenFlash, seamCharge, shockwave, tear, visible]);

  function animateCardIn() {
    cardEnter.setValue(0);
    Animated.spring(cardEnter, { toValue: 1, friction: 8, tension: 62, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }

  function startRarityPulse() {
    rarityPulse.stopAnimation();
    rarityPulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(rarityPulse, { toValue: 1, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(rarityPulse, { toValue: 0, duration: 900, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
      { iterations: 6 },
    ).start();
  }

  function resetRevealEffects() {
    flip.setValue(0);
    revealBurst.setValue(0);
    screenFlash.setValue(0);
    coreFlash.setValue(0);
    shockwave.setValue(0);
    cardImpact.setValue(0);
  }

  function runOpeningAnimation() {
    packRotate.setValue(0);
    packScale.setValue(1);
    packOpacity.setValue(1);
    seamCharge.setValue(0);
    tear.setValue(0);
    burst.setValue(0);
    beam.setValue(0);
    floorPulse.setValue(0);

    return new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(packScale, { toValue: 0.95, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(seamCharge, { toValue: 1, duration: 520, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(packRotate, { toValue: -1, duration: 65, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 1, duration: 65, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: -0.8, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 0.8, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(packRotate, { toValue: 0, duration: 55, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
          Animated.timing(packScale, { toValue: 1.045, duration: 295, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(tear, { toValue: 1, duration: 280, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(packScale, { toValue: 1.1, duration: 280, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(floorPulse, { toValue: 1, duration: 280, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.parallel([
          Animated.timing(packOpacity, { toValue: 0, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(packScale, { toValue: 0.74, duration: 200, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(burst, { toValue: 1, duration: 260, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(beam, { toValue: 1, duration: 340, useNativeDriver: USE_NATIVE_DRIVER }),
        ]),
        Animated.delay(260),
      ]).start(() => resolve());
    });
  }

  async function startOpening() {
    if (!pack || stage !== 'sealed') return;
    setError(null);
    setStage('opening');

    try {
      const purchasePromise = onPurchase();
      const animationPromise = runOpeningAnimation();
      const burstTimer = setTimeout(() => setStage('burst'), 850);
      const [receivedCards] = await Promise.all([purchasePromise, animationPromise]);
      clearTimeout(burstTimer);

      setCards(receivedCards);
      setCardIndex(0);
      setFaceUp(false);
      resetRevealEffects();
      setStage('cards');
      requestAnimationFrame(() => {
        animateCardIn();
        startRarityPulse();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir este booster.');
      setStage('sealed');
      packOpacity.setValue(1);
      packScale.setValue(1);
      packRotate.setValue(0);
      seamCharge.setValue(0);
      tear.setValue(0);
      burst.setValue(0);
      beam.setValue(0);
      floorPulse.setValue(0);
    }
  }

  function revealCurrent() {
    if (faceUp) return;

    const activeTheme = rarityTheme(cards[cardIndex]?.rarity);
    const flashStrength = flashStrengthForTier(activeTheme.tier);
    const highTier = activeTheme.tier >= 4;

    setFaceUp(true);
    revealBurst.setValue(0);
    screenFlash.setValue(0);
    coreFlash.setValue(0);
    shockwave.setValue(0);
    cardImpact.setValue(0);

    Animated.parallel([
      Animated.spring(flip, { toValue: 1, friction: 7, tension: 72, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.sequence([
        Animated.delay(45),
        Animated.timing(screenFlash, { toValue: flashStrength, duration: highTier ? 70 : 90, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.delay(highTier ? 28 : 12),
        Animated.timing(screenFlash, { toValue: 0, duration: highTier ? 230 : 180, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
      Animated.sequence([
        Animated.delay(35),
        Animated.timing(coreFlash, { toValue: 1, duration: highTier ? 85 : 110, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(coreFlash, { toValue: 0, duration: highTier ? 380 : 300, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
      Animated.sequence([
        Animated.delay(75),
        Animated.timing(shockwave, { toValue: 1, duration: highTier ? 620 : 500, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
      Animated.sequence([
        Animated.delay(60),
        Animated.timing(revealBurst, { toValue: 1, duration: highTier ? 150 : 185, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(revealBurst, { toValue: 0, duration: highTier ? 620 : 500, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
      Animated.sequence([
        Animated.delay(70),
        Animated.timing(cardImpact, { toValue: 1, duration: 105, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.spring(cardImpact, { toValue: 0, friction: 5, tension: 75, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    ]).start();
  }

  function nextCard() {
    if (!faceUp) {
      revealCurrent();
      return;
    }
    if (cardIndex >= cards.length - 1) {
      setStage('summary');
      onFinished?.();
      return;
    }

    setCardIndex((value) => value + 1);
    setFaceUp(false);
    resetRevealEffects();
    requestAnimationFrame(() => {
      animateCardIn();
      startRarityPulse();
    });
  }

  const bestPull = useMemo(() => {
    if (!cards.length) return null;
    return cards.reduce((best, card) => (rarityScore(card) > rarityScore(best) ? card : best), cards[0]);
  }, [cards]);

  if (!pack) return null;

  const currentCard = cards[cardIndex];
  const theme = rarityTheme(currentCard?.rarity);
  const highTier = theme.tier >= 4;

  const packRotation = packRotate.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.25, 5.4] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.95, 0] });
  const beamOpacity = beam.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.82, 0.36] });
  const floorScale = floorPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.35] });

  const cardTranslateY = cardEnter.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });
  const baseCardScale = cardEnter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  const impactScale = cardImpact.interpolate({ inputRange: [0, 1], outputRange: [1, highTier ? 1.075 : 1.045] });
  const combinedCardScale = Animated.multiply(baseCardScale, impactScale);

  const auraScale = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, highTier ? 1.2 : 1.12] });
  const auraOpacity = rarityPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.tier === 1 ? 0.16 : 0.24, theme.tier >= 5 ? 0.82 : theme.tier === 4 ? 0.72 : theme.tier === 3 ? 0.56 : 0.42],
  });
  const pedestalScale = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, highTier ? 1.1 : 1.05] });

  const backRotation = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const frontRotation = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  const revealScale = revealBurst.interpolate({ inputRange: [0, 1], outputRange: [0.15, highTier ? 3.05 : 2.45] });
  const colorWashOpacity = revealBurst.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, highTier ? 0.23 : 0.13, 0] });
  const coreScale = coreFlash.interpolate({ inputRange: [0, 1], outputRange: [0.12, highTier ? 3.25 : 2.65] });
  const coreOpacity = coreFlash.interpolate({ inputRange: [0, 0.28, 1], outputRange: [0, 1, 0.95] });
  const shockwaveScale = shockwave.interpolate({ inputRange: [0, 1], outputRange: [0.38, highTier ? 3.9 : 3.15] });
  const secondShockwaveScale = shockwave.interpolate({ inputRange: [0, 1], outputRange: [0.2, highTier ? 4.8 : 3.8] });
  const shockwaveOpacity = shockwave.interpolate({ inputRange: [0, 0.12, 0.55, 1], outputRange: [0, 1, 0.48, 0] });
  const secondShockwaveOpacity = shockwave.interpolate({ inputRange: [0, 0.28, 0.72, 1], outputRange: [0, highTier ? 0.82 : 0.48, 0.25, 0] });
  const sparkTravel = shockwave.interpolate({ inputRange: [0, 1], outputRange: [0, highTier ? -255 : -205] });
  const sparkOpacity = shockwave.interpolate({ inputRange: [0, 0.12, 0.62, 1], outputRange: [0, 1, 0.55, 0] });
  const rayScaleY = revealBurst.interpolate({ inputRange: [0, 1], outputRange: [0.2, highTier ? 2.4 : 1.75] });

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => { if (stage !== 'opening' && stage !== 'burst') onClose(); }}>
      <View style={styles.container}>
        <PremiumBackground />
        <View style={styles.cinematicShadeTop} />
        <View style={styles.cinematicShadeBottom} />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>PACK OPENING</Text>
            <Text numberOfLines={1} style={styles.title}>{pack.name}</Text>
          </View>
          {stage !== 'opening' && stage !== 'burst' ? (
            <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={21} color="#F4F4F4" /></Pressable>
          ) : null}
        </View>

        {(stage === 'sealed' || stage === 'opening' || stage === 'burst') ? (
          <View style={styles.openingStage}>
            <View style={styles.stageGrid} />
            <Animated.View style={[styles.floorHalo, { opacity: floorPulse, transform: [{ scaleX: floorScale }] }]} />
            <Animated.View style={[styles.burstRing, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
            <Animated.View style={[styles.openingBeam, { opacity: beamOpacity, transform: [{ scaleY: beam }] }]} />

            <Animated.View style={{ opacity: packOpacity, transform: [{ translateY: packY }, { rotate: packRotation }, { scale: packScale }] }}>
              <FoilBooster pack={pack} compact={compact} seamCharge={seamCharge} tear={tear} />
            </Animated.View>

            <View style={styles.openingCopy}>
              <Text style={styles.stageEyebrow}>{stage === 'sealed' ? 'PACOTE SELADO' : stage === 'opening' ? 'ENERGIA NO LACRE' : 'ABERTURA CONCLUÍDA'}</Text>
              <Text style={styles.stageTitle}>{stage === 'sealed' ? 'Rasgue o lacre.' : stage === 'opening' ? 'Não tire os olhos do pack.' : 'Sinal de raridade detectado.'}</Text>
              <Text style={styles.stageSubtitle}>
                {stage === 'sealed' ? `${pack.cards_per_pack} cards • 🪙 ${pack.price}` : stage === 'opening' ? 'A compra está sendo validada enquanto o pack é aberto.' : 'Preparando a primeira recompensa.'}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}><Ionicons name="alert-circle" size={19} color="#FF7A82" /><Text style={styles.errorText}>{error}</Text></View>
            ) : null}

            {stage === 'sealed' ? (
              <Pressable style={styles.openButton} onPress={startOpening}>
                <View style={styles.openButtonLine} /><Text style={styles.openButtonText}>ABRIR PACK</Text><Ionicons name="chevron-forward" size={18} color="#070707" />
              </Pressable>
            ) : (
              <View style={styles.loadingTrack}><Animated.View style={[styles.loadingSweep, { opacity: seamCharge, transform: [{ scaleX: seamCharge }] }]} /></View>
            )}
          </View>
        ) : null}

        {stage === 'cards' && currentCard ? (
          <View style={styles.rewardStage}>
            <View style={styles.rewardHeader}>
              <Text style={styles.rewardCounter}>RECOMPENSA {cardIndex + 1} / {cards.length}</Text>
              <View style={[styles.raritySignal, { borderColor: `${theme.color}80`, backgroundColor: theme.soft }]}>
                <View style={[styles.signalDot, { backgroundColor: theme.color }]} /><Text style={[styles.signalText, { color: theme.color }]}>{theme.label}</Text>
              </View>
            </View>

            <View style={styles.revealArena}>
              <Animated.View style={[styles.rarityAura, styles.noPointerEvents, { backgroundColor: theme.color, opacity: auraOpacity, transform: [{ scale: auraScale }] }]} />
              <Animated.View style={[styles.coreFlash, styles.noPointerEvents, { opacity: coreOpacity, transform: [{ scale: coreScale }] }]} />
              <Animated.View style={[styles.revealFlash, styles.noPointerEvents, { backgroundColor: theme.color, opacity: revealBurst, transform: [{ scale: revealScale }] }]} />
              <Animated.View style={[styles.shockwave, styles.noPointerEvents, { borderColor: '#FFFFFF', opacity: shockwaveOpacity, transform: [{ scale: shockwaveScale }] }]} />
              <Animated.View style={[styles.shockwaveSecondary, styles.noPointerEvents, { borderColor: theme.color, opacity: secondShockwaveOpacity, transform: [{ scale: secondShockwaveScale }] }]} />

              {RAYS.map((rotation) => (
                <Animated.View
                  key={`ray-${rotation}`}
                  style={[
                    styles.ray,
                    styles.noPointerEvents,
                    {
                      backgroundColor: theme.color,
                      opacity: revealBurst,
                      transform: [{ rotate: `${rotation}deg` }, { translateY: highTier ? -190 : -165 }, { scaleY: rayScaleY }],
                    },
                  ]}
                />
              ))}

              {theme.tier >= 3 ? SPARKS.map((rotation) => (
                <Animated.View
                  key={`spark-${rotation}`}
                  style={[
                    styles.spark,
                    styles.noPointerEvents,
                    {
                      backgroundColor: rotation % 40 === 0 ? '#FFFFFF' : theme.color,
                      opacity: sparkOpacity,
                      transform: [{ rotate: `${rotation}deg` }, { translateY: sparkTravel }],
                    },
                  ]}
                />
              )) : null}

              <Animated.View style={[styles.pedestalGlow, { borderColor: theme.color, opacity: auraOpacity, transform: [{ scaleX: pedestalScale }] }]} />
              <View style={styles.pedestalBase} />

              <Pressable style={styles.rewardTapArea} onPress={!faceUp ? revealCurrent : undefined}>
                <Animated.View style={[styles.flipScene, compact && styles.flipSceneCompact, { opacity: cardEnter, transform: [{ translateY: cardTranslateY }, { scale: combinedCardScale }] }]}>
                  <Animated.View style={[styles.cardFace, styles.cardBack, { opacity: backOpacity, borderColor: theme.color, transform: [{ perspective: 900 }, { rotateY: backRotation }] }]}>
                    <View style={[styles.backInnerGlow, { backgroundColor: theme.soft }]} />
                    <View style={[styles.backRingOuter, { borderColor: `${theme.color}66` }]}>
                      <View style={[styles.backRingInner, { borderColor: theme.color }]}><Ionicons name="help" size={54} color={theme.color} /></View>
                    </View>
                    <Text style={styles.hiddenTitle}>RECOMPENSA OCULTA</Text>
                    <Text style={[styles.hiddenHint, { color: theme.color }]}>TOQUE PARA REVELAR</Text>
                  </Animated.View>

                  <Animated.View style={[styles.cardFace, styles.cardFront, { opacity: frontOpacity, borderColor: theme.color, transform: [{ perspective: 900 }, { rotateY: frontRotation }] }]}>
                    <View style={[styles.frontTopLine, { backgroundColor: theme.color }]} />
                    {currentCard.image && !failedImages[currentCard.id] ? (
                      <Image source={{ uri: currentCard.image }} resizeMode="contain" style={styles.rewardImage as any} onError={() => setFailedImages((value) => ({ ...value, [currentCard.id]: true }))} />
                    ) : (
                      <View style={styles.imageFallback}><Ionicons name="image-outline" size={54} color="#666" /></View>
                    )}
                    <View style={styles.rewardInfo}><Text style={styles.rewardName}>{currentCard.name}</Text><Text style={[styles.rewardRarity, { color: theme.color }]}>{currentCard.rarity ?? 'Comum'}</Text></View>
                  </Animated.View>
                </Animated.View>
              </Pressable>
            </View>

            <Pressable style={[styles.nextButton, { borderColor: `${theme.color}90` }]} onPress={nextCard}>
              <Text style={styles.nextButtonText}>{!faceUp ? 'REVELAR' : cardIndex >= cards.length - 1 ? 'VER RESULTADO' : 'PRÓXIMA CARTA'}</Text>
              <Ionicons name="arrow-forward" size={18} color="#F4F4F4" />
            </Pressable>
          </View>
        ) : null}

        {stage === 'summary' ? (
          <ScrollView contentContainerStyle={styles.summaryContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryHero}>
              <Text style={styles.summaryKicker}>PACK FINALIZADO</Text>
              <Text style={styles.summaryTitle}>Coleção atualizada.</Text>
              {bestPull ? (
                <View style={styles.bestPullRow}><View style={[styles.bestDot, { backgroundColor: rarityTheme(bestPull.rarity).color }]} /><Text style={styles.bestPullText}>Melhor pull: {bestPull.name}</Text></View>
              ) : null}
              <Text style={styles.summarySubtitle}>Todos os cards foram enviados para sua Bag • +20 XP</Text>
            </View>

            <View style={styles.summaryGrid}>
              {cards.map((card, index) => {
                const cardTheme = rarityTheme(card.rarity);
                const imageFailed = failedImages[`summary-${card.id}-${index}`];
                return (
                  <View key={`${card.id}-${index}`} style={[styles.summaryCard, { borderColor: `${cardTheme.color}70` }]}>
                    <View style={[styles.summaryTopLine, { backgroundColor: cardTheme.color }]} />
                    {card.image && !imageFailed ? (
                      <Image source={{ uri: card.image }} resizeMode="contain" style={styles.summaryImage as any} onError={() => setFailedImages((value) => ({ ...value, [`summary-${card.id}-${index}`]: true }))} />
                    ) : (
                      <View style={styles.summaryFallback}><Ionicons name="image-outline" size={28} color="#555" /></View>
                    )}
                    <Text numberOfLines={1} style={styles.summaryName}>{card.name}</Text>
                    <Text numberOfLines={1} style={[styles.summaryRarity, { color: cardTheme.color }]}>{card.rarity ?? 'Comum'}</Text>
                  </View>
                );
              })}
            </View>

            <Pressable style={styles.summaryButton} onPress={onClose}><Text style={styles.summaryButtonText}>VOLTAR À LOJA</Text></Pressable>
          </ScrollView>
        ) : null}

        {stage === 'cards' && currentCard ? (
          <>
            <Animated.View style={[styles.colorWash, styles.noPointerEvents, { backgroundColor: theme.color, opacity: colorWashOpacity }]} />
            <Animated.View style={[styles.screenFlash, styles.noPointerEvents, { opacity: screenFlash }]} />
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function FoilBooster({ pack, compact, seamCharge, tear }: { pack: Pack; compact: boolean; seamCharge: Animated.Value; tear: Animated.Value }) {
  const leftSealX = tear.interpolate({ inputRange: [0, 1], outputRange: [0, -72] });
  const rightSealX = tear.interpolate({ inputRange: [0, 1], outputRange: [0, 72] });
  const leftSealRotate = tear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-16deg'] });
  const rightSealRotate = tear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '16deg'] });
  const seamOpacity = seamCharge.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.35, 1] });

  return (
    <View style={[styles.foilPack, compact && styles.foilPackCompact]}>
      <View style={styles.foilBodyTexture} /><View style={styles.foilSlashOne} /><View style={styles.foilSlashTwo} />
      <Text style={styles.foilBrand}>POKÉMON TCG</Text>
      {pack.image_url ? (
        <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.foilLogo as any} />
      ) : (
        <View style={styles.foilPlaceholder}><Ionicons name="cube-outline" size={48} color="#8B8F98" /><Text style={styles.foilPlaceholderText}>BOOSTER</Text></View>
      )}
      <Text style={styles.foilSet}>{pack.set_id.toUpperCase()}</Text><View style={styles.foilBottom} />
      <Animated.View style={[styles.seamGlow, { opacity: seamOpacity, transform: [{ scaleX: seamCharge }] }]} />
      <Animated.View style={[styles.sealHalf, styles.sealLeft, { transform: [{ translateX: leftSealX }, { rotate: leftSealRotate }] }]} />
      <Animated.View style={[styles.sealHalf, styles.sealRight, { transform: [{ translateX: rightSealX }, { rotate: rightSealRotate }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030303', overflow: 'hidden' },
  noPointerEvents: { pointerEvents: 'none' } as any,
  cinematicShadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 130, backgroundColor: 'rgba(0,0,0,0.50)' },
  cinematicShadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 130, backgroundColor: 'rgba(0,0,0,0.46)' },
  header: { minHeight: 76, paddingHorizontal: 24, paddingTop: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 16, zIndex: 20 },
  kicker: { color: '#FFD447', fontSize: 9, fontWeight: '900', letterSpacing: 2.1 },
  title: { color: '#F5F5F5', fontSize: 18, fontWeight: '900', marginTop: 5 },
  closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#292929' },

  openingStage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 42, overflow: 'hidden' },
  stageGrid: { position: 'absolute', width: '62%', height: 1, backgroundColor: 'rgba(255,255,255,0.04)', bottom: '26%', transform: [{ rotate: '-8deg' }] },
  floorHalo: { position: 'absolute', bottom: '24%', width: 330, height: 74, borderRadius: 200, backgroundColor: 'rgba(255,212,71,0.09)' },
  burstRing: { position: 'absolute', width: 92, height: 92, borderRadius: 92, borderWidth: 2, borderColor: '#FFF3C0', backgroundColor: 'rgba(255,255,255,0.08)' },
  openingBeam: { position: 'absolute', width: 150, height: 520, backgroundColor: 'rgba(255,235,170,0.09)', borderRadius: 120 },
  openingCopy: { alignItems: 'center', marginTop: 26, maxWidth: 520 },
  stageEyebrow: { color: '#858585', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  stageTitle: { color: '#F7F7F7', fontSize: 23, lineHeight: 29, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  stageSubtitle: { color: '#8D8D8D', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  openButton: { marginTop: 22, minWidth: 208, height: 52, borderRadius: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFD447', overflow: 'hidden' },
  openButtonLine: { position: 'absolute', top: 0, left: 22, right: 22, height: 2, backgroundColor: 'rgba(255,255,255,0.75)' },
  openButtonText: { color: '#070707', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  loadingTrack: { marginTop: 22, width: 230, height: 3, borderRadius: 99, overflow: 'hidden', backgroundColor: '#202020' },
  loadingSweep: { width: '100%', height: '100%', backgroundColor: '#FFD447' },
  errorBox: { marginTop: 18, maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: '#5A2528', backgroundColor: '#1A0D0E' },
  errorText: { color: '#FFB3B7', fontSize: 11, fontWeight: '700', flex: 1 },

  foilPack: { width: 230, height: 340, borderRadius: 18, overflow: 'hidden', alignItems: 'center', backgroundColor: '#111318', borderWidth: 1, borderColor: '#5B5F68' },
  foilPackCompact: { width: 184, height: 272 },
  foilBodyTexture: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#151922' },
  foilSlashOne: { position: 'absolute', width: 330, height: 110, top: 96, left: -70, backgroundColor: '#27344A', transform: [{ rotate: '-19deg' }] },
  foilSlashTwo: { position: 'absolute', width: 320, height: 82, top: 150, right: -84, backgroundColor: '#1C2638', transform: [{ rotate: '-19deg' }] },
  foilBrand: { color: '#E8EBF1', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 28, zIndex: 3 },
  foilLogo: { width: '76%', height: '48%', marginTop: 24, zIndex: 3 },
  foilPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 3 },
  foilPlaceholderText: { color: '#8A8D94', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  foilSet: { position: 'absolute', bottom: 22, color: '#C9CDD5', fontSize: 10, fontWeight: '900', letterSpacing: 1.5, zIndex: 3 },
  foilBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, backgroundColor: '#D7DADE' },
  seamGlow: { position: 'absolute', left: 0, right: 0, top: 24, height: 4, backgroundColor: '#FFF4A8', zIndex: 7 },
  sealHalf: { position: 'absolute', top: 0, height: 27, width: '52%', backgroundColor: '#D5D7DB', zIndex: 8 },
  sealLeft: { left: 0, borderBottomLeftRadius: 4 },
  sealRight: { right: 0, borderBottomRightRadius: 4 },

  rewardStage: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingBottom: 24 },
  rewardHeader: { width: '100%', maxWidth: 760, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginTop: 8 },
  rewardCounter: { color: '#797979', fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  raritySignal: { minHeight: 32, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', gap: 7, alignItems: 'center' },
  signalDot: { width: 7, height: 7, borderRadius: 99 },
  signalText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  revealArena: { flex: 1, width: '100%', maxWidth: 920, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rarityAura: { position: 'absolute', width: 540, height: 540, borderRadius: 540 },
  coreFlash: { position: 'absolute', width: 250, height: 250, borderRadius: 250, backgroundColor: '#FFFFFF', zIndex: 3 },
  revealFlash: { position: 'absolute', width: 350, height: 350, borderRadius: 350, zIndex: 2 },
  shockwave: { position: 'absolute', width: 260, height: 260, borderRadius: 260, borderWidth: 4, backgroundColor: 'rgba(255,255,255,0.06)', zIndex: 3 },
  shockwaveSecondary: { position: 'absolute', width: 220, height: 220, borderRadius: 220, borderWidth: 3, backgroundColor: 'transparent', zIndex: 2 },
  ray: { position: 'absolute', width: 3, height: 155, top: '50%', left: '50%', borderRadius: 10, zIndex: 2 },
  spark: { position: 'absolute', width: 5, height: 26, top: '50%', left: '50%', borderRadius: 6, zIndex: 4 },
  pedestalGlow: { position: 'absolute', bottom: '9%', width: 360, height: 82, borderRadius: 200, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.035)' },
  pedestalBase: { position: 'absolute', bottom: '7.5%', width: 240, height: 28, borderRadius: 100, backgroundColor: '#090909', borderWidth: 1, borderColor: '#343434' },
  rewardTapArea: { alignItems: 'center', justifyContent: 'center', zIndex: 6 },
  flipScene: { width: 292, height: 430 },
  flipSceneCompact: { width: 238, height: 350 },
  cardFace: { ...StyleSheet.absoluteFillObject, borderRadius: 20, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090909', backfaceVisibility: 'hidden' },
  cardBack: { padding: 20 },
  backInnerGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.42 },
  backRingOuter: { width: 154, height: 154, borderRadius: 154, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backRingInner: { width: 112, height: 112, borderRadius: 112, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' },
  hiddenTitle: { marginTop: 28, color: '#E9E9E9', fontSize: 12, fontWeight: '900', letterSpacing: 1.8 },
  hiddenHint: { marginTop: 8, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  cardFront: { justifyContent: 'flex-start', padding: 10 },
  frontTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 4 },
  rewardImage: { width: '100%', flex: 1, minHeight: 0 },
  imageFallback: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#101010' },
  rewardInfo: { width: '100%', minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingTop: 5 },
  rewardName: { color: '#F6F6F6', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  rewardRarity: { fontSize: 10, fontWeight: '900', marginTop: 4 },
  nextButton: { width: '100%', maxWidth: 330, height: 48, borderRadius: 12, borderWidth: 1, backgroundColor: '#101010', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextButtonText: { color: '#F4F4F4', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },

  colorWash: { ...StyleSheet.absoluteFillObject, zIndex: 90 },
  screenFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', zIndex: 100 },

  summaryContent: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  summaryHero: { alignItems: 'center', paddingVertical: 22 },
  summaryKicker: { color: '#FFD447', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  summaryTitle: { color: '#F6F6F6', fontSize: 28, fontWeight: '900', marginTop: 7 },
  bestPullRow: { marginTop: 12, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#292929' },
  bestDot: { width: 8, height: 8, borderRadius: 99 },
  bestPullText: { color: '#D8D8D8', fontSize: 11, fontWeight: '800' },
  summarySubtitle: { color: '#888', fontSize: 11, marginTop: 10, textAlign: 'center' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  summaryCard: { width: 142, minHeight: 205, padding: 7, borderRadius: 14, borderWidth: 1, overflow: 'hidden', backgroundColor: '#0C0C0C' },
  summaryTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  summaryImage: { width: '100%', height: 156 },
  summaryFallback: { width: '100%', height: 156, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  summaryName: { color: '#F1F1F1', fontSize: 10, fontWeight: '900', marginTop: 5 },
  summaryRarity: { fontSize: 8, fontWeight: '800', marginTop: 2 },
  summaryButton: { alignSelf: 'center', marginTop: 24, minWidth: 220, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD447' },
  summaryButtonText: { color: '#060606', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
});
