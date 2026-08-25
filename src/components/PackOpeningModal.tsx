import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

type RarityTheme = {
  color: string;
  soft: string;
  label: string;
};

function rarityTheme(rarity?: string | null): RarityTheme {
  const value = (rarity ?? '').toLowerCase();

  if (
    value.includes('hyper') ||
    value.includes('secret') ||
    value.includes('special illustration') ||
    value.includes('shiny ultra')
  ) {
    return { color: '#FFD447', soft: '#3A3014', label: 'RARIDADE MÁXIMA' };
  }

  if (
    value.includes('ultra') ||
    value.includes('illustration') ||
    value.includes('double rare') ||
    value.includes('ace spec') ||
    value.includes('rainbow')
  ) {
    return { color: '#B26CFF', soft: '#29183C', label: 'RARIDADE ESPECIAL' };
  }

  if (value.includes('rare') || value.includes('holo')) {
    return { color: '#4EA5FF', soft: '#132A43', label: 'RARO' };
  }

  if (value.includes('uncommon')) {
    return { color: '#75D2A6', soft: '#153126', label: 'INCOMUM' };
  }

  return { color: '#AAB8C8', soft: '#212A35', label: 'COMUM' };
}

export function PackOpeningModal({ visible, pack, onClose, onPurchase, onFinished }: Props) {
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

    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(packY, { toValue: -10, duration: 1100, useNativeDriver: true }),
        Animated.timing(packY, { toValue: 7, duration: 1100, useNativeDriver: true }),
      ]),
    );

    floatAnimation.start();
    return () => floatAnimation.stop();
  }, [visible, pack?.id, beam, burst, packRotate, packScale, packY, rarityPulse]);

  function animateCardIn() {
    cardScale.setValue(0.86);
    cardOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 75,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function startRarityPulse() {
    rarityPulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(rarityPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(rarityPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
      { iterations: 3 },
    ).start();
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
            Animated.timing(packRotate, { toValue: -1, duration: 80, useNativeDriver: true }),
            Animated.timing(packRotate, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.timing(packRotate, { toValue: -1, duration: 70, useNativeDriver: true }),
            Animated.timing(packRotate, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(packRotate, { toValue: 0, duration: 70, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(packScale, { toValue: 1.08, duration: 180, useNativeDriver: true }),
            Animated.timing(packScale, { toValue: 0.96, duration: 130, useNativeDriver: true }),
            Animated.timing(packScale, { toValue: 1.14, duration: 180, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(packScale, { toValue: 0.02, duration: 210, useNativeDriver: true }),
          Animated.timing(burst, { toValue: 1, duration: 230, useNativeDriver: true }),
          Animated.timing(beam, { toValue: 1, duration: 280, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ]).start(() => resolve());
    });
  }

  async function startOpening() {
    if (!pack || stage === 'opening' || stage === 'burst') return;

    setError(null);
    setStage('opening');

    try {
      const purchasePromise = onPurchase();
      await new Promise((resolve) => setTimeout(resolve, 500));
      setStage('burst');
      const [, receivedCards] = await Promise.all([runOpeningAnimation(), purchasePromise]);

      setCards(receivedCards);
      setCardIndex(0);
      setFaceUp(false);
      setStage('cards');
      requestAnimationFrame(() => {
        animateCardIn();
        startRarityPulse();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível abrir este booster.';
      setError(message);
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
    cardScale.setValue(0.82);
    cardOpacity.setValue(0);
    requestAnimationFrame(animateCardIn);
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
    requestAnimationFrame(() => {
      animateCardIn();
      startRarityPulse();
    });
  }

  if (!pack) return null;

  const currentCard = cards[cardIndex];
  const currentTheme = rarityTheme(currentCard?.rarity);
  const rotation = packRotate.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.2, 5] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.9, 0] });
  const beamScaleY = beam.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1.35] });
  const pulseScale = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] });
  const pulseOpacity = rarityPulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.62] });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={() => {
        if (stage !== 'opening' && stage !== 'burst') onClose();
      }}
    >
      <View style={styles.container}>
        <View style={styles.vignetteTop} />
        <View style={styles.vignetteBottom} />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>PACK OPENING</Text>
            <Text numberOfLines={1} style={styles.title}>{pack.name}</Text>
          </View>
          {stage !== 'opening' && stage !== 'burst' ? (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={23} color="#fff" />
            </Pressable>
          ) : null}
        </View>

        {(stage === 'sealed' || stage === 'opening' || stage === 'burst') ? (
          <View style={styles.openingStage}>
            <View style={styles.floorLight} />

            <Animated.View
              pointerEvents="none"
              style={[
                styles.burstRing,
                { opacity: burstOpacity, transform: [{ scale: burstScale }] },
              ]}
            />

            <Animated.View
              pointerEvents="none"
              style={[
                styles.lightBeam,
                { opacity: beam, transform: [{ scaleY: beamScaleY }] },
              ]}
            />

            <View style={styles.packRig}>
              <Animated.View
                style={{
                  transform: [
                    { translateY: packY },
                    { rotate: rotation },
                    { scale: packScale },
                  ],
                }}
              >
                {pack.image_url ? (
                  <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.packImage} />
                ) : (
                  <View style={styles.packPlaceholder}>
                    <Ionicons name="cube" size={68} color="#7597C5" />
                    <Text style={styles.packPlaceholderText}>BOOSTER</Text>
                  </View>
                )}
              </Animated.View>
            </View>

            <View style={styles.openingCopy}>
              <Text style={styles.stageEyebrow}>
                {stage === 'sealed' ? 'PACOTE SELADO' : stage === 'opening' ? 'ROMPENDO LACRE' : 'RECOMPENSAS LIBERADAS'}
              </Text>
              <Text style={styles.stageTitle}>
                {stage === 'sealed' ? 'Pronto para abrir?' : stage === 'opening' ? 'Preparando abertura...' : 'Impacto!'}
              </Text>
              <Text style={styles.stageSubtitle}>
                {stage === 'sealed'
                  ? `${pack.cards_per_pack} cards • 🪙 ${pack.price}`
                  : stage === 'opening'
                    ? 'Validando a compra e carregando as recompensas.'
                    : 'O pack foi rompido. Preparando o primeiro card.'}
              </Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color="#FF9A9A" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {stage === 'sealed' ? (
              <Pressable style={styles.openButton} onPress={startOpening}>
                <View style={styles.openButtonAccent} />
                <Ionicons name="flash" size={19} color="#111820" />
                <Text style={styles.openButtonText}>ABRIR PACOTE</Text>
              </Pressable>
            ) : (
              <View style={styles.loadingLine}>
                <Animated.View style={[styles.loadingFill, { opacity: beam }]} />
              </View>
            )}
          </View>
        ) : null}

        {stage === 'cards' && currentCard ? (
          <View style={styles.rewardStage}>
            <Text style={styles.rewardCounter}>RECOMPENSA {cardIndex + 1} / {cards.length}</Text>

            <Animated.View
              pointerEvents="none"
              style={[
                styles.rarityAura,
                {
                  backgroundColor: currentTheme.color,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />

            <View style={[styles.rarityBar, { borderColor: currentTheme.color, backgroundColor: currentTheme.soft }]}>
              <View style={[styles.rarityDot, { backgroundColor: currentTheme.color }]} />
              <Text style={[styles.rarityBarText, { color: currentTheme.color }]}>{currentTheme.label}</Text>
            </View>

            <Pressable style={styles.rewardTapArea} onPress={!faceUp ? revealCurrent : undefined}>
              <Animated.View
                style={[
                  styles.rewardCard,
                  {
                    opacity: cardOpacity,
                    borderColor: currentTheme.color,
                    transform: [{ scale: cardScale }],
                  },
                ]}
              >
                {faceUp ? (
                  <>
                    <View style={[styles.rewardTopLine, { backgroundColor: currentTheme.color }]} />
                    {currentCard.image ? (
                      <Image source={{ uri: currentCard.image }} resizeMode="contain" style={styles.rewardImage} />
                    ) : (
                      <View style={styles.rewardPlaceholder}>
                        <Ionicons name="image-outline" size={58} color="#7B94B5" />
                      </View>
                    )}
                    <View style={styles.rewardInfo}>
                      <Text style={styles.rewardName}>{currentCard.name}</Text>
                      <Text style={[styles.rewardRarity, { color: currentTheme.color }]}>{currentCard.rarity ?? 'Comum'}</Text>
                    </View>
                  </>
                ) : (
                  <View style={[styles.rewardBack, { borderColor: currentTheme.color }]}>
                    <View style={[styles.rewardBackGlow, { backgroundColor: currentTheme.soft }]} />
                    <View style={[styles.rewardGlyph, { borderColor: currentTheme.color }]}>
                      <Ionicons name="help" size={58} color={currentTheme.color} />
                    </View>
                    <Text style={styles.rewardUnknown}>RECOMPENSA OCULTA</Text>
                    <Text style={[styles.rewardHint, { color: currentTheme.color }]}>TOQUE PARA REVELAR</Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>

            <Pressable style={[styles.nextButton, { borderColor: currentTheme.color }]} onPress={nextCard}>
              <Text style={styles.nextButtonText}>
                {!faceUp ? 'REVELAR' : cardIndex >= cards.length - 1 ? 'VER TUDO' : 'PRÓXIMA RECOMPENSA'}
              </Text>
              <Ionicons name="chevron-forward" size={19} color="#fff" />
            </Pressable>
          </View>
        ) : null}

        {stage === 'summary' ? (
          <ScrollView contentContainerStyle={styles.summaryContent}>
            <View style={styles.summaryHero}>
              <View style={styles.summaryIcon}>
                <Ionicons name="checkmark" size={30} color="#08120C" />
              </View>
              <Text style={styles.summaryTitle}>PACK CONCLUÍDO</Text>
              <Text style={styles.summarySubtitle}>Todos os cards já foram adicionados à sua Bag.</Text>
            </View>

            <View style={styles.summaryGrid}>
              {cards.map((card, index) => {
                const theme = rarityTheme(card.rarity);
                return (
                  <View key={`${card.id}-${index}`} style={[styles.summaryCard, { borderColor: theme.color }]}>
                    <View style={[styles.summaryLine, { backgroundColor: theme.color }]} />
                    {card.image ? (
                      <Image source={{ uri: card.image }} resizeMode="contain" style={styles.summaryImage} />
                    ) : (
                      <View style={styles.summaryPlaceholder} />
                    )}
                    <Text numberOfLines={1} style={styles.summaryName}>{card.name}</Text>
                    <Text numberOfLines={1} style={[styles.summaryRarity, { color: theme.color }]}>{card.rarity ?? 'Comum'}</Text>
                  </View>
                );
              })}
            </View>

            <Pressable style={styles.openButton} onPress={onClose}>
              <Text style={styles.openButtonText}>VOLTAR À LOJA</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070A0E', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24, overflow: 'hidden' },
  vignetteTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 150, backgroundColor: '#0D141D' },
  vignetteBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, backgroundColor: '#05070A' },
  header: { zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#728297', fontSize: 9, fontWeight: '900', letterSpacing: 2.1 },
  title: { color: '#F7FAFD', fontSize: 19, fontWeight: '900', marginTop: 3, maxWidth: 330 },
  closeButton: { width: 42, height: 42, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151B22', borderWidth: 1, borderColor: '#2B3541' },

  openingStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 2 },
  floorLight: { position: 'absolute', bottom: 90, width: 360, height: 70, borderRadius: 180, backgroundColor: '#17293D', opacity: 0.48 },
  burstRing: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 8, borderColor: '#E7F3FF' },
  lightBeam: { position: 'absolute', width: 120, height: 500, backgroundColor: '#E3F3FF', opacity: 0.16 },
  packRig: { width: 280, height: 380, alignItems: 'center', justifyContent: 'center' },
  packImage: { width: 245, height: 360 },
  packPlaceholder: { width: 220, height: 320, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#111A24', borderWidth: 2, borderColor: '#31465E' },
  packPlaceholderText: { color: '#7896BC', fontWeight: '900', letterSpacing: 2 },
  openingCopy: { alignItems: 'center', gap: 4, marginTop: -4 },
  stageEyebrow: { color: '#7D8DA1', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  stageTitle: { color: '#fff', fontSize: 27, fontWeight: '900', letterSpacing: 0.3, textAlign: 'center' },
  stageSubtitle: { color: '#8494A9', fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 380 },
  errorBox: { width: '100%', maxWidth: 430, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#6B3446', padding: 12, marginTop: 5 },
  errorText: { flex: 1, color: '#FFD7D7', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  openButton: { minHeight: 52, minWidth: 220, paddingHorizontal: 22, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.yellow, marginTop: 12, position: 'relative', overflow: 'hidden' },
  openButtonAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: '#F7FAFD' },
  openButtonText: { color: '#111820', fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  loadingLine: { width: 240, height: 3, backgroundColor: '#202B37', overflow: 'hidden', marginTop: 14 },
  loadingFill: { width: '100%', height: '100%', backgroundColor: '#DDEFFF' },

  rewardStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 2 },
  rewardCounter: { color: '#69798E', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  rarityAura: { position: 'absolute', width: 330, height: 500, borderRadius: 165 },
  rarityBar: { minWidth: 190, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  rarityBarText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  rewardTapArea: { alignItems: 'center', justifyContent: 'center' },
  rewardCard: { width: 300, minHeight: 438, overflow: 'hidden', backgroundColor: '#0D1218', borderWidth: 2 },
  rewardTopLine: { height: 5, width: '100%' },
  rewardImage: { width: '100%', height: 390, backgroundColor: '#080B0F' },
  rewardPlaceholder: { width: '100%', height: 390, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121820' },
  rewardInfo: { paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#0A0E13' },
  rewardName: { color: '#fff', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  rewardRarity: { fontSize: 10, fontWeight: '900', textAlign: 'center', marginTop: 4, letterSpacing: 0.8 },
  rewardBack: { flex: 1, minHeight: 438, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#090D12', borderWidth: 8 },
  rewardBackGlow: { position: 'absolute', width: 250, height: 250, borderRadius: 125, opacity: 0.7 },
  rewardGlyph: { width: 130, height: 130, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  rewardUnknown: { color: '#EEF4FA', fontSize: 16, fontWeight: '900', letterSpacing: 1.5, marginTop: 12 },
  rewardHint: { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  nextButton: { minHeight: 49, minWidth: 225, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#10161D', borderWidth: 1 },
  nextButtonText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  summaryContent: { paddingVertical: 28, gap: 20, zIndex: 2 },
  summaryHero: { alignItems: 'center', gap: 7, paddingVertical: 8 },
  summaryIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#68D995' },
  summaryTitle: { color: '#fff', fontSize: 25, fontWeight: '900', letterSpacing: 1.2 },
  summarySubtitle: { color: '#8192A7', textAlign: 'center', fontSize: 12 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  summaryCard: { width: '31%', minWidth: 110, flexGrow: 1, maxWidth: 180, padding: 7, backgroundColor: '#0D1218', borderWidth: 1, overflow: 'hidden' },
  summaryLine: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, zIndex: 2 },
  summaryImage: { width: '100%', aspectRatio: 0.72 },
  summaryPlaceholder: { width: '100%', aspectRatio: 0.72, backgroundColor: '#17202B' },
  summaryName: { color: '#fff', fontSize: 11, fontWeight: '900', marginTop: 5 },
  summaryRarity: { fontSize: 9, fontWeight: '800', marginTop: 2 },
});
