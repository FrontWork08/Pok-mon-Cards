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

type Stage = 'sealed' | 'opening' | 'cards' | 'summary';

export function PackOpeningModal({ visible, pack, onClose, onPurchase, onFinished }: Props) {
  const [stage, setStage] = useState<Stage>('sealed');
  const [cards, setCards] = useState<OpenedCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [faceUp, setFaceUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packShake = useRef(new Animated.Value(0)).current;
  const packScale = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setStage('sealed');
    setCards([]);
    setCardIndex(0);
    setFaceUp(false);
    setError(null);
    packShake.setValue(0);
    packScale.setValue(1);
  }, [visible, pack?.id, packScale, packShake]);

  function runPackAnimation() {
    packShake.setValue(0);
    packScale.setValue(1);

    return new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(packShake, { toValue: -1, duration: 90, useNativeDriver: true }),
          Animated.timing(packShake, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(packShake, { toValue: -1, duration: 90, useNativeDriver: true }),
          Animated.timing(packShake, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(packShake, { toValue: 0, duration: 90, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(packScale, { toValue: 1.08, duration: 220, useNativeDriver: true }),
          Animated.timing(packScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
          Animated.timing(packScale, { toValue: 1.16, duration: 220, useNativeDriver: true }),
          Animated.timing(packScale, { toValue: 0.01, duration: 250, useNativeDriver: true }),
        ]),
      ]).start(() => resolve());
    });
  }

  function animateCardIn() {
    cardScale.setValue(0.88);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }

  async function startOpening() {
    if (!pack || stage === 'opening') return;

    setError(null);
    setStage('opening');

    try {
      const [receivedCards] = await Promise.all([onPurchase(), runPackAnimation()]);
      setCards(receivedCards);
      setCardIndex(0);
      setFaceUp(false);
      setStage('cards');
      requestAnimationFrame(animateCardIn);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível abrir este booster.';
      setError(message);
      setStage('sealed');
      packScale.setValue(1);
      packShake.setValue(0);
    }
  }

  function revealCurrent() {
    if (faceUp) return;
    cardOpacity.setValue(0);
    cardScale.setValue(0.9);
    setFaceUp(true);
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
    requestAnimationFrame(animateCardIn);
  }

  if (!pack) return null;

  const currentCard = cards[cardIndex];
  const rotation = packShake.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={stage === 'opening' ? undefined : onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>BOOSTER OPENING</Text>
            <Text numberOfLines={1} style={styles.title}>{pack.name}</Text>
          </View>
          {stage !== 'opening' ? (
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          ) : null}
        </View>

        {stage === 'sealed' || stage === 'opening' ? (
          <View style={styles.centerStage}>
            <View style={styles.sparkle}><Ionicons name="sparkles" size={22} color={gameTheme.colors.yellow} /></View>
            <Animated.View style={{ transform: [{ rotate: rotation }, { scale: packScale }] }}>
              {pack.image_url ? (
                <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.packImage} />
              ) : (
                <View style={styles.packPlaceholder}>
                  <Ionicons name="cube" size={64} color="#6B88B2" />
                  <Text style={styles.packPlaceholderText}>BOOSTER</Text>
                </View>
              )}
            </Animated.View>

            <Text style={styles.stageTitle}>{stage === 'opening' ? 'Rasgando o booster...' : 'Seu booster está pronto'}</Text>
            <Text style={styles.stageSubtitle}>
              {stage === 'opening'
                ? 'Preparando seus cards. A abertura é validada pelo servidor.'
                : `${pack.cards_per_pack} cards • 🪙 ${pack.price}`}
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color="#FF8C8C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable style={[styles.primaryButton, stage === 'opening' && styles.disabled]} disabled={stage === 'opening'} onPress={startOpening}>
              <Ionicons name="flash" size={18} color="#111827" />
              <Text style={styles.primaryButtonText}>{stage === 'opening' ? 'ABRINDO...' : 'RASGAR BOOSTER'}</Text>
            </Pressable>
          </View>
        ) : null}

        {stage === 'cards' && currentCard ? (
          <View style={styles.cardStage}>
            <Text style={styles.counter}>CARD {cardIndex + 1} / {cards.length}</Text>

            <Pressable style={styles.cardTapArea} onPress={faceUp ? undefined : revealCurrent}>
              <Animated.View style={[styles.bigCardWrap, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
                {faceUp ? (
                  <>
                    {currentCard.image ? (
                      <Image source={{ uri: currentCard.image }} resizeMode="contain" style={styles.bigCardImage} />
                    ) : (
                      <View style={styles.bigCardPlaceholder}><Ionicons name="image-outline" size={54} color="#7392BD" /></View>
                    )}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{currentCard.name}</Text>
                      <Text style={styles.cardRarity}>{currentCard.rarity ?? 'Sem raridade'}</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.cardBack}>
                    <View style={styles.cardBackOrb}>
                      <View style={styles.cardBackLine} />
                      <View style={styles.cardBackCenter} />
                    </View>
                    <Text style={styles.cardBackTitle}>POKÉMON CARD</Text>
                    <Text style={styles.cardBackHint}>Toque para revelar</Text>
                  </View>
                )}
              </Animated.View>
            </Pressable>

            <Pressable style={styles.primaryButton} onPress={nextCard}>
              <Text style={styles.primaryButtonText}>
                {!faceUp ? 'REVELAR CARD' : cardIndex >= cards.length - 1 ? 'VER RESUMO' : 'PRÓXIMO CARD'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#111827" />
            </Pressable>
          </View>
        ) : null}

        {stage === 'summary' ? (
          <ScrollView contentContainerStyle={styles.summaryContent}>
            <View style={styles.summaryHero}>
              <Ionicons name="checkmark-circle" size={42} color="#65D894" />
              <Text style={styles.summaryTitle}>Booster aberto!</Text>
              <Text style={styles.summarySubtitle}>Todos os cards já foram enviados para sua Bag.</Text>
            </View>

            <View style={styles.summaryGrid}>
              {cards.map((card, index) => (
                <View key={`${card.id}-${index}`} style={styles.summaryCard}>
                  {card.image ? <Image source={{ uri: card.image }} resizeMode="contain" style={styles.summaryImage} /> : <View style={styles.summaryPlaceholder} />}
                  <Text numberOfLines={1} style={styles.summaryName}>{card.name}</Text>
                  <Text numberOfLines={1} style={styles.summaryRarity}>{card.rarity ?? 'Sem raridade'}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>VOLTAR À LOJA</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111F', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: gameTheme.colors.yellow, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 3, maxWidth: 280 },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14243A' },
  centerStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sparkle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#302B19', marginBottom: 2 },
  packImage: { width: 245, height: 360 },
  packPlaceholder: { width: 220, height: 320, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#10233B', borderWidth: 1, borderColor: '#284A70' },
  packPlaceholderText: { color: '#7F9CC4', fontWeight: '900', letterSpacing: 1.8 },
  stageTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  stageSubtitle: { color: '#92A7C1', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 360 },
  errorBox: { width: '100%', maxWidth: 430, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#351A24', borderWidth: 1, borderColor: '#683243', borderRadius: 14, padding: 12, marginTop: 4 },
  errorText: { flex: 1, color: '#FFD5D5', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  primaryButton: { minHeight: 50, minWidth: 210, borderRadius: 16, paddingHorizontal: 20, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: gameTheme.colors.yellow, marginTop: 10 },
  primaryButtonText: { color: '#111827', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  disabled: { opacity: 0.55 },
  cardStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  counter: { color: '#7F98B9', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  cardTapArea: { alignItems: 'center', justifyContent: 'center' },
  bigCardWrap: { width: 300, minHeight: 430, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0E1C2F', borderWidth: 1, borderColor: '#2A4769' },
  bigCardImage: { width: '100%', height: 390 },
  bigCardPlaceholder: { width: '100%', height: 390, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12253D' },
  cardInfo: { paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#0C1929' },
  cardName: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  cardRarity: { color: gameTheme.colors.yellow, fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  cardBack: { flex: 1, minHeight: 430, alignItems: 'center', justifyContent: 'center', backgroundColor: '#173A72', borderWidth: 9, borderColor: '#E8B83E', gap: 18 },
  cardBackOrb: { width: 142, height: 142, borderRadius: 71, backgroundColor: '#F1F5FA', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#D9E2ED' },
  cardBackLine: { position: 'absolute', width: '100%', height: 18, backgroundColor: '#1D2B3F' },
  cardBackCenter: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5FA', borderWidth: 9, borderColor: '#1D2B3F' },
  cardBackTitle: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: 1.6 },
  cardBackHint: { color: '#C5D7EF', fontSize: 12, fontWeight: '700' },
  summaryContent: { paddingVertical: 24, gap: 18 },
  summaryHero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  summaryTitle: { color: '#fff', fontSize: 28, fontWeight: '900' },
  summarySubtitle: { color: '#8FA4BE', textAlign: 'center', fontSize: 13 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '31%', minWidth: 110, flexGrow: 1, maxWidth: 180, borderRadius: 14, padding: 7, backgroundColor: '#101D30', borderWidth: 1, borderColor: '#243A57' },
  summaryImage: { width: '100%', aspectRatio: 0.72 },
  summaryPlaceholder: { width: '100%', aspectRatio: 0.72, borderRadius: 8, backgroundColor: '#192A42' },
  summaryName: { color: '#fff', fontSize: 11, fontWeight: '900', marginTop: 5 },
  summaryRarity: { color: '#889EB9', fontSize: 9, marginTop: 2 },
});
