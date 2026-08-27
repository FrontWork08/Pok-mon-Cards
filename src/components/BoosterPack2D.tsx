import { Animated, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { Pack } from '@/services/packs';

const ACCENTS = [
  ['#6D32FF', '#1C1239', '#C58BFF'],
  ['#E93463', '#32101A', '#FF9F62'],
  ['#1B9B74', '#0C2F28', '#79E8C3'],
  ['#2875FF', '#0D2448', '#83C9FF'],
  ['#E8A11A', '#38260B', '#FFE27A'],
  ['#774DFF', '#20174A', '#BDA9FF'],
] as const;

function paletteFor(setId: string) {
  const hash = Array.from(setId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ACCENTS[hash % ACCENTS.length];
}

type Props = {
  pack: Pack;
  width?: number;
  tear?: Animated.Value;
  seamCharge?: Animated.Value;
  style?: StyleProp<ViewStyle>;
};

export function BoosterPack2D({ pack, width = 224, tear, seamCharge, style }: Props) {
  const height = width * 1.72;
  const [accent, deep, highlight] = paletteFor(pack.set_id);
  const safeTear = tear ?? new Animated.Value(0);
  const safeCharge = seamCharge ?? new Animated.Value(0);

  const leftX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, -width * .42] });
  const rightX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, width * .42] });
  const leftRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-25deg'] });
  const rightRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '25deg'] });
  const seamOpacity = safeCharge.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .35, 1] });
  const mouthOpacity = safeTear.interpolate({ inputRange: [0, .1, 1], outputRange: [0, .96, 1] });
  const tearShardOpacity = safeTear.interpolate({ inputRange: [0, .08, .24, 1], outputRange: [0, 0, .72, .92] });

  const realArtwork = pack.booster_art_url;

  return (
    <View style={[styles.shadowWrap, { width, height }, style]}>
      {realArtwork ? (
        <View style={styles.realPackWrap}>
          <Image
            source={{ uri: realArtwork }}
            resizeMode="contain"
            style={styles.realPackImage}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.realOpenMouth,
              {
                opacity: mouthOpacity,
                transform: [{ scaleX: safeTear }],
              },
            ]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.realSeamGlow,
              {
                backgroundColor: highlight,
                opacity: seamOpacity,
                transform: [{ scaleX: safeCharge }],
              },
            ]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.realTearShard,
              styles.realTearLeft,
              {
                backgroundColor: deep,
                opacity: tearShardOpacity,
                transform: [{ translateX: leftX }, { rotate: leftRotate }],
              },
            ]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.realTearShard,
              styles.realTearRight,
              {
                backgroundColor: deep,
                opacity: tearShardOpacity,
                transform: [{ translateX: rightX }, { rotate: rightRotate }],
              },
            ]}
          />

          {tear ? <View pointerEvents="none" style={styles.realSpecular} /> : null}
        </View>
      ) : (
        <View style={[styles.fallbackPack, { backgroundColor: deep, borderColor: `${highlight}A6` }]}>
          <View style={[styles.fallbackGlow, { backgroundColor: accent }]} />
          <View style={[styles.fallbackGlowTwo, { backgroundColor: highlight }]} />

          <View style={styles.fallbackBrand}>
            <Text style={styles.fallbackTiny}>POKÉMON TRADING CARD GAME</Text>
            {pack.image_url ? (
              <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.fallbackLogo} />
            ) : (
              <Text style={styles.fallbackTitle}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
            )}
          </View>

          <View style={styles.fallbackCenter}>
            <View style={[styles.fallbackOrb, { borderColor: highlight }]}>
              <Text style={styles.fallbackSetCode}>{pack.set_id.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.fallbackBottom}>
            <Text numberOfLines={1} style={styles.fallbackName}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
            <Text style={styles.fallbackMeta}>{pack.cards_per_pack} CARDS</Text>
          </View>

          <View style={styles.fallbackTopCrimp} />
          <View style={styles.fallbackBottomCrimp} />

          <Animated.View
            style={[
              styles.fallbackOpenMouth,
              { opacity: mouthOpacity, transform: [{ scaleX: safeTear }] },
            ]}
          />
          <Animated.View
            style={[
              styles.fallbackSeamGlow,
              {
                backgroundColor: highlight,
                opacity: seamOpacity,
                transform: [{ scaleX: safeCharge }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.fallbackTearShard,
              styles.fallbackTearLeft,
              { transform: [{ translateX: leftX }, { rotate: leftRotate }] },
            ]}
          />
          <Animated.View
            style={[
              styles.fallbackTearShard,
              styles.fallbackTearRight,
              { transform: [{ translateX: rightX }, { rotate: rightRotate }] },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: .62,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },

  realPackWrap: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  realPackImage: {
    width: '100%',
    height: '100%',
  },
  realOpenMouth: {
    position: 'absolute',
    top: '9%',
    left: '13%',
    right: '13%',
    height: 8,
    borderRadius: 99,
    backgroundColor: '#050505',
    zIndex: 5,
  },
  realSeamGlow: {
    position: 'absolute',
    top: '9.5%',
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 99,
    zIndex: 6,
  },
  realTearShard: {
    position: 'absolute',
    top: '6.5%',
    width: '39%',
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.2)',
    zIndex: 7,
  },
  realTearLeft: { left: '11%' },
  realTearRight: { right: '11%' },
  realSpecular: {
    position: 'absolute',
    top: '21%',
    left: '20%',
    width: '8%',
    height: '48%',
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,.12)',
    transform: [{ rotate: '10deg' }],
  },

  fallbackPack: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.2,
    position: 'relative',
  },
  fallbackGlow: {
    position: 'absolute',
    width: '150%',
    height: '58%',
    left: '-25%',
    top: '10%',
    opacity: .7,
    transform: [{ rotate: '-13deg' }],
  },
  fallbackGlowTwo: {
    position: 'absolute',
    width: '110%',
    height: '35%',
    right: '-36%',
    bottom: '19%',
    opacity: .25,
    transform: [{ rotate: '19deg' }],
  },
  fallbackBrand: {
    position: 'absolute',
    top: '9%',
    left: '8%',
    right: '8%',
    alignItems: 'center',
    zIndex: 4,
  },
  fallbackTiny: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
    textShadowColor: '#000',
    textShadowRadius: 5,
  },
  fallbackLogo: {
    width: '90%',
    height: 55,
    marginTop: 5,
  },
  fallbackTitle: {
    color: '#fff',
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  fallbackCenter: {
    position: 'absolute',
    top: '34%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fallbackOrb: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackSetCode: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  fallbackBottom: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '8%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(2,3,6,.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.15)',
    alignItems: 'center',
  },
  fallbackName: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  fallbackMeta: {
    color: '#E7E7EA',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: .8,
    marginTop: 5,
  },
  fallbackTopCrimp: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 17,
    backgroundColor: '#44474F',
    borderBottomWidth: 1,
    borderBottomColor: '#17191D',
  },
  fallbackBottomCrimp: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 11,
    backgroundColor: '#41444C',
    borderTopWidth: 1,
    borderTopColor: '#15171B',
  },
  fallbackOpenMouth: {
    position: 'absolute',
    top: 10,
    left: '9%',
    right: '9%',
    height: 7,
    backgroundColor: '#020203',
    borderRadius: 99,
    zIndex: 8,
  },
  fallbackSeamGlow: {
    position: 'absolute',
    top: 13,
    left: '5%',
    right: '5%',
    height: 2,
    borderRadius: 99,
    zIndex: 9,
  },
  fallbackTearShard: {
    position: 'absolute',
    top: 0,
    width: '51%',
    height: 17,
    backgroundColor: '#44474F',
    borderBottomWidth: 1,
    borderBottomColor: '#17191D',
    zIndex: 10,
  },
  fallbackTearLeft: { left: 0 },
  fallbackTearRight: { right: 0 },
});
