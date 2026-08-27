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
  const height = width * 1.68;
  const [accent, deep, highlight] = paletteFor(pack.set_id);
  const safeTear = tear ?? new Animated.Value(0);
  const safeCharge = seamCharge ?? new Animated.Value(0);

  const leftX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, -width * .4] });
  const rightX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, width * .4] });
  const leftRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-24deg'] });
  const rightRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '24deg'] });
  const seamOpacity = safeCharge.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .3, 1] });
  const mouthOpacity = safeTear.interpolate({ inputRange: [0, .12, 1], outputRange: [0, .92, 1] });

  return (
    <View style={[styles.shadowWrap, { width, height }, style]}>
      <View style={[styles.pack, { backgroundColor: deep, borderColor: `${highlight}A6` }]}>
        <View style={[styles.foilBase, { backgroundColor: deep }]} />

        {pack.art_url ? (
          <View style={styles.fullArtClip}>
            <Image source={{ uri: pack.art_url }} resizeMode="cover" style={styles.fullArt} />
            <View style={styles.artTopShade} />
            <View style={styles.artBottomShade} />
          </View>
        ) : (
          <View style={[styles.fallbackArt, { backgroundColor: accent }]}>
            <View style={[styles.fallbackOrb, { backgroundColor: highlight }]} />
            <Text style={styles.fallbackSet}>{pack.set_id.toUpperCase()}</Text>
          </View>
        )}

        <View style={[styles.topColorWash, { backgroundColor: accent }]} />
        <View style={[styles.sideColorWash, { backgroundColor: highlight }]} />

        <View style={styles.brandZone}>
          <Text style={styles.brandTiny}>POKÉMON TRADING CARD GAME</Text>
          {pack.image_url ? (
            <View style={styles.logoPlate}>
              <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.logo} />
            </View>
          ) : (
            <Text numberOfLines={1} style={styles.fallbackLogo}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
          )}
        </View>

        <View style={styles.bottomIdentity}>
          <Text numberOfLines={1} style={styles.packName}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
          <View style={styles.identityMeta}>
            <Text style={styles.setCode}>{pack.set_id.toUpperCase()}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.cardCount}>{pack.cards_per_pack} CARDS</Text>
          </View>
        </View>

        <View style={styles.foilEdgeLeft} />
        <View style={styles.foilEdgeRight} />
        <View style={styles.foilShineOne} />
        <View style={styles.foilShineTwo} />

        <Animated.View style={[styles.openMouth, { opacity: mouthOpacity }]} />
        <Animated.View
          style={[
            styles.seamGlow,
            {
              backgroundColor: highlight,
              opacity: seamOpacity,
              transform: [{ scaleX: safeCharge }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.crimpHalf,
            styles.crimpLeft,
            { transform: [{ translateX: leftX }, { rotate: leftRotate }] },
          ]}
        >
          {Array.from({ length: 10 }, (_, index) => (
            <View key={index} style={[styles.crimpLine, { left: `${index * 11.5}%` as any }]} />
          ))}
        </Animated.View>

        <Animated.View
          style={[
            styles.crimpHalf,
            styles.crimpRight,
            { transform: [{ translateX: rightX }, { rotate: rightRotate }] },
          ]}
        >
          {Array.from({ length: 10 }, (_, index) => (
            <View key={index} style={[styles.crimpLine, { left: `${index * 11.5}%` as any }]} />
          ))}
        </Animated.View>

        <View style={styles.bottomCrimp}>
          {Array.from({ length: 18 }, (_, index) => (
            <View key={index} style={[styles.bottomCrimpLine, { left: `${index * 5.8}%` as any }]} />
          ))}
        </View>

        <View style={styles.cornerFoldLeft} />
        <View style={styles.cornerFoldRight} />
      </View>
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
  pack: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.2,
    position: 'relative',
  },
  foilBase: { ...StyleSheet.absoluteFillObject },

  fullArtClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14,
    bottom: 10,
    overflow: 'hidden',
  },
  fullArt: {
    position: 'absolute',
    width: '158%',
    height: '205%',
    left: '-29%',
    top: '-28%',
  },
  artTopShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '29%',
    backgroundColor: 'rgba(0,0,0,.18)',
  },
  artBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '33%',
    backgroundColor: 'rgba(0,0,0,.34)',
  },
  fallbackArt: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14,
    bottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackOrb: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 180,
    opacity: .35,
    transform: [{ scaleX: 1.35 }],
  },
  fallbackSet: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: '#000',
    textShadowRadius: 8,
  },

  topColorWash: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    height: '25%',
    opacity: .56,
  },
  sideColorWash: {
    position: 'absolute',
    width: '76%',
    height: '54%',
    right: '-36%',
    top: '24%',
    opacity: .18,
    transform: [{ rotate: '14deg' }],
  },

  brandZone: {
    position: 'absolute',
    top: '7%',
    left: '7%',
    right: '7%',
    zIndex: 6,
    alignItems: 'center',
  },
  brandTiny: {
    color: '#FFFFFF',
    fontSize: 6.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 1.25,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 5,
  },
  logoPlate: {
    width: '90%',
    height: 53,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  fallbackLogo: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    marginTop: 7,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 7,
  },

  bottomIdentity: {
    position: 'absolute',
    left: '7%',
    right: '7%',
    bottom: '7%',
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: 'rgba(3,4,7,.54)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.16)',
    zIndex: 5,
  },
  packName: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 5,
  },
  identityMeta: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  setCode: {
    color: '#E6E8ED',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: .8,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: '#E6E8ED',
    opacity: .75,
  },
  cardCount: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: .7,
  },

  foilEdgeLeft: {
    position: 'absolute',
    top: 14,
    bottom: 10,
    left: 2,
    width: 2,
    backgroundColor: 'rgba(255,255,255,.22)',
  },
  foilEdgeRight: {
    position: 'absolute',
    top: 14,
    bottom: 10,
    right: 2,
    width: 1,
    backgroundColor: 'rgba(255,255,255,.14)',
  },
  foilShineOne: {
    position: 'absolute',
    width: '190%',
    height: '7%',
    top: '33%',
    left: '-45%',
    backgroundColor: 'rgba(255,255,255,.12)',
    transform: [{ rotate: '-26deg' }],
  },
  foilShineTwo: {
    position: 'absolute',
    width: '160%',
    height: '2%',
    top: '54%',
    left: '-35%',
    backgroundColor: 'rgba(255,255,255,.09)',
    transform: [{ rotate: '-26deg' }],
  },

  openMouth: {
    position: 'absolute',
    top: 10,
    left: '8%',
    right: '8%',
    height: 7,
    backgroundColor: '#020203',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,.3)',
    zIndex: 11,
  },
  seamGlow: {
    position: 'absolute',
    top: 13,
    left: '5%',
    right: '5%',
    height: 2,
    borderRadius: 99,
    zIndex: 12,
  },

  crimpHalf: {
    position: 'absolute',
    top: 0,
    width: '51%',
    height: 17,
    backgroundColor: '#4A4D55',
    borderBottomWidth: 1,
    borderBottomColor: '#17191D',
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
    backgroundColor: 'rgba(255,255,255,.22)',
    transform: [{ rotate: '-10deg' }],
  },
  bottomCrimp: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 11,
    backgroundColor: '#41444C',
    borderTopWidth: 1,
    borderTopColor: '#15171B',
    overflow: 'hidden',
    zIndex: 10,
  },
  bottomCrimpLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,.2)',
    transform: [{ rotate: '10deg' }],
  },

  cornerFoldLeft: {
    position: 'absolute',
    left: -18,
    bottom: 6,
    width: 44,
    height: 14,
    backgroundColor: 'rgba(255,255,255,.12)',
    transform: [{ rotate: '36deg' }],
    zIndex: 9,
  },
  cornerFoldRight: {
    position: 'absolute',
    right: -18,
    bottom: 6,
    width: 44,
    height: 14,
    backgroundColor: 'rgba(255,255,255,.08)',
    transform: [{ rotate: '-36deg' }],
    zIndex: 9,
  },
});
