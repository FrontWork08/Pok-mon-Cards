import { Animated, Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { Pack } from '@/services/packs';

const ACCENTS = [
  ['#2768FF', '#10254E', '#60C7FF'],
  ['#A553FF', '#31164F', '#E36FFF'],
  ['#FF4F6D', '#4E1622', '#FFB44C'],
  ['#21B886', '#123E34', '#6CF1C0'],
  ['#E99A1E', '#4B3210', '#FFE06D'],
  ['#6A70FF', '#202653', '#A9B2FF'],
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

export function BoosterPack2D({ pack, width = 216, tear, seamCharge, style }: Props) {
  const height = width * 1.5;
  const [accent, deep, highlight] = paletteFor(pack.set_id);
  const safeTear = tear ?? new Animated.Value(0);
  const safeCharge = seamCharge ?? new Animated.Value(0);
  const leftX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, -width * .37] });
  const rightX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, width * .37] });
  const leftRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-22deg'] });
  const rightRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '22deg'] });
  const seamOpacity = safeCharge.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .28, 1] });
  const mouthOpacity = safeTear.interpolate({ inputRange: [0, .16, 1], outputRange: [0, .85, 1] });
  const art = pack.art_url || null;

  return (
    <View style={[styles.shadowWrap, { width, height }, style]}>
      <View style={[styles.pack, { backgroundColor: deep, borderColor: `${highlight}8F` }]}>
        <View style={[styles.foilBase, { backgroundColor: deep }]} />
        <View style={[styles.colorField, { backgroundColor: accent }]} />
        <View style={[styles.colorFieldTwo, { backgroundColor: highlight }]} />

        <View style={[styles.artViewport, { borderColor: `${highlight}4D`, backgroundColor: deep }]}>
          {art ? (
            <Image
              source={{ uri: art }}
              resizeMode="cover"
              style={styles.artImage}
            />
          ) : (
            <View style={[styles.artFallback, { backgroundColor: accent }]}>
              <Text style={styles.artFallbackText}>{pack.set_id.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.artInnerShade} />
          <View style={[styles.artAccent, { backgroundColor: `${highlight}24` }]} />
        </View>

        <View style={styles.darkBottom} />
        <View style={[styles.diagonalFoil, { backgroundColor: `${highlight}2D` }]} />
        <View style={styles.diagonalFoilTwo} />
        <View style={styles.edgeLightLeft} />
        <View style={styles.edgeLightRight} />

        <View style={styles.brandBlock}>
          <Text style={styles.brandTiny}>POKÉMON CARD GAME</Text>
          {pack.image_url ? (
            <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.logo} />
          ) : (
            <Text numberOfLines={1} style={styles.fallbackLogo}>{pack.set_id.toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.bottomCopy}>
          <Text numberOfLines={2} style={styles.packName}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
          <View style={styles.bottomLine}>
            <Text style={styles.setCode}>{pack.set_id.toUpperCase()}</Text>
            <Text style={styles.cardCount}>{pack.cards_per_pack} CARDS</Text>
          </View>
        </View>

        <Animated.View style={[styles.openMouth, { opacity: mouthOpacity }]} />
        <Animated.View
          style={[
            styles.seamGlow,
            { backgroundColor: highlight, opacity: seamOpacity, transform: [{ scaleX: safeCharge }] },
          ]}
        />

        <Animated.View
          style={[
            styles.crimpHalf,
            styles.crimpLeft,
            { transform: [{ translateX: leftX }, { rotate: leftRotate }] },
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <View key={index} style={[styles.crimpLine, { left: `${index * 13}%` as any }]} />
          ))}
        </Animated.View>
        <Animated.View
          style={[
            styles.crimpHalf,
            styles.crimpRight,
            { transform: [{ translateX: rightX }, { rotate: rightRotate }] },
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <View key={index} style={[styles.crimpLine, { left: `${index * 13}%` as any }]} />
          ))}
        </Animated.View>

        <View style={styles.bottomCrimp}>
          {Array.from({ length: 17 }, (_, index) => (
            <View key={index} style={[styles.bottomCrimpLine, { left: `${index * 6.2}%` as any }]} />
          ))}
        </View>
        <View style={styles.specular} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: .58,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 13 },
    elevation: 15,
  },
  pack: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.2,
    position: 'relative',
  },
  foilBase: { ...StyleSheet.absoluteFillObject },
  colorField: {
    position: 'absolute',
    width: '150%',
    height: '48%',
    left: '-28%',
    top: '5%',
    opacity: .68,
    transform: [{ rotate: '-16deg' }],
  },
  colorFieldTwo: {
    position: 'absolute',
    width: '135%',
    height: '29%',
    right: '-42%',
    top: '34%',
    opacity: .3,
    transform: [{ rotate: '22deg' }],
  },

  // The catalog art is usually a card image. It is intentionally zoomed and
  // clipped inside this viewport so card borders never look like white bars
  // on the physical booster wrapper.
  artViewport: {
    position: 'absolute',
    left: '6%',
    right: '6%',
    top: '25%',
    height: '43%',
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1,
  },
  artImage: {
    position: 'absolute',
    width: '132%',
    height: '132%',
    left: '-16%',
    top: '-16%',
    transform: [{ scale: 1.08 }],
  },
  artFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', opacity: .72 },
  artFallbackText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.6,
    textShadowColor: '#000',
    textShadowRadius: 6,
  },
  artInnerShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,3,6,.12)',
  },
  artAccent: {
    position: 'absolute',
    left: '-10%',
    right: '-10%',
    bottom: '-12%',
    height: '36%',
    transform: [{ rotate: '-7deg' }],
  },

  darkBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '31%',
    backgroundColor: 'rgba(2,3,6,.91)',
  },
  diagonalFoil: {
    position: 'absolute',
    width: '155%',
    height: '7%',
    left: '-24%',
    top: '48%',
    transform: [{ rotate: '-25deg' }],
  },
  diagonalFoilTwo: {
    position: 'absolute',
    width: '150%',
    height: '1.5%',
    left: '-25%',
    top: '58%',
    backgroundColor: 'rgba(255,255,255,.12)',
    transform: [{ rotate: '-25deg' }],
  },
  edgeLightLeft: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    left: 3,
    width: 1,
    backgroundColor: 'rgba(255,255,255,.25)',
  },
  edgeLightRight: {
    position: 'absolute',
    top: 10,
    bottom: 10,
    right: 3,
    width: 1,
    backgroundColor: 'rgba(255,255,255,.14)',
  },

  // Keep branding safely below the tear seam on narrow phone screens.
  brandBlock: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '7.5%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 5,
  },
  brandTiny: {
    color: '#F5F5F5',
    fontSize: 7,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
    textShadowColor: '#000',
    textShadowRadius: 5,
  },
  logo: { width: '88%', height: 42, marginTop: 4 },
  fallbackLogo: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 6,
    textShadowColor: '#000',
    textShadowRadius: 5,
  },

  bottomCopy: { position: 'absolute', left: '8%', right: '8%', bottom: '7.5%', zIndex: 4 },
  packName: {
    color: '#FAFAFA',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  setCode: { color: '#C7CBD3', fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  cardCount: { color: '#F0F0F2', fontSize: 7, fontWeight: '900', letterSpacing: .7 },

  openMouth: {
    position: 'absolute',
    top: 10,
    left: '9%',
    right: '9%',
    height: 7,
    backgroundColor: '#020203',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,.24)',
    zIndex: 11,
  },
  seamGlow: {
    position: 'absolute',
    top: 14,
    left: '5%',
    right: '5%',
    height: 2,
    borderRadius: 99,
    zIndex: 12,
  },

  // Dark foil crimps replace the old bright white/silver bars.
  crimpHalf: {
    position: 'absolute',
    top: 0,
    width: '51%',
    height: 16,
    backgroundColor: '#343840',
    borderBottomWidth: 1,
    borderBottomColor: '#14161A',
    zIndex: 15,
    overflow: 'hidden',
  },
  crimpLeft: { left: 0 },
  crimpRight: { right: 0 },
  crimpLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(235,239,245,.18)',
    transform: [{ rotate: '-9deg' }],
  },
  bottomCrimp: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 10,
    backgroundColor: '#30343B',
    borderTopWidth: 1,
    borderTopColor: '#111318',
    overflow: 'hidden',
  },
  bottomCrimpLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(235,239,245,.16)',
    transform: [{ rotate: '10deg' }],
  },
  specular: {
    position: 'absolute',
    width: '180%',
    height: '8%',
    top: '35%',
    left: '-45%',
    backgroundColor: 'rgba(255,255,255,.075)',
    transform: [{ rotate: '-31deg' }],
  },
});
