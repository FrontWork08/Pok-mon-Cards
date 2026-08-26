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

export function BoosterPack2D({ pack, width = 176, tear, seamCharge, style }: Props) {
  const height = width * 1.54;
  const [accent, deep, highlight] = paletteFor(pack.set_id);
  const safeTear = tear ?? new Animated.Value(0);
  const safeCharge = seamCharge ?? new Animated.Value(0);
  const leftX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, -width * .35] });
  const rightX = safeTear.interpolate({ inputRange: [0, 1], outputRange: [0, width * .35] });
  const leftRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-20deg'] });
  const rightRotate = safeTear.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '20deg'] });
  const seamOpacity = safeCharge.interpolate({ inputRange: [0, .2, 1], outputRange: [0, .25, 1] });
  const mouthOpacity = safeTear.interpolate({ inputRange: [0, .18, 1], outputRange: [0, .8, 1] });
  const art = pack.art_url || null;

  return (
    <View style={[styles.shadowWrap, { width, height }, style]}>
      <View style={[styles.pack, { backgroundColor: deep, borderColor: `${highlight}99` }]}>
        <View style={[styles.foilBase, { backgroundColor: deep }]} />
        <View style={[styles.colorField, { backgroundColor: accent }]} />
        <View style={[styles.colorFieldTwo, { backgroundColor: highlight }]} />
        {art ? <Image source={{ uri: art }} resizeMode="cover" style={styles.art} /> : null}
        <View style={styles.artShade} />
        <View style={styles.darkBottom} />
        <View style={[styles.diagonalFoil, { backgroundColor: `${highlight}32` }]} />
        <View style={styles.diagonalFoilTwo} />
        <View style={styles.edgeLightLeft} />
        <View style={styles.edgeLightRight} />

        <View style={styles.brandBlock}>
          <Text style={styles.brandTiny}>POKÉMON CARD GAME</Text>
          {pack.image_url ? <Image source={{ uri: pack.image_url }} resizeMode="contain" style={styles.logo} /> : <Text style={styles.fallbackLogo}>{pack.set_id.toUpperCase()}</Text>}
        </View>

        <View style={styles.bottomCopy}>
          <Text numberOfLines={2} style={styles.packName}>{pack.name.replace(/\s+Booster$/i, '')}</Text>
          <View style={styles.bottomLine}><Text style={styles.setCode}>{pack.set_id.toUpperCase()}</Text><Text style={styles.cardCount}>{pack.cards_per_pack} CARDS</Text></View>
        </View>

        <Animated.View style={[styles.openMouth, { opacity: mouthOpacity }]} />
        <Animated.View style={[styles.seamGlow, { backgroundColor: highlight, opacity: seamOpacity, transform: [{ scaleX: safeCharge }] }]} />

        <Animated.View style={[styles.crimpHalf, styles.crimpLeft, { transform: [{ translateX: leftX }, { rotate: leftRotate }] }]}>
          {Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.crimpLine, { left: `${index * 13}%` as any }]} />)}
        </Animated.View>
        <Animated.View style={[styles.crimpHalf, styles.crimpRight, { transform: [{ translateX: rightX }, { rotate: rightRotate }] }]}>
          {Array.from({ length: 9 }, (_, index) => <View key={index} style={[styles.crimpLine, { left: `${index * 13}%` as any }]} />)}
        </Animated.View>

        <View style={styles.bottomCrimp}>{Array.from({ length: 17 }, (_, index) => <View key={index} style={[styles.bottomCrimpLine, { left: `${index * 6.2}%` as any }]} />)}</View>
        <View style={styles.specular} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: 18, shadowColor: '#000', shadowOpacity: .55, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
  pack: { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1.2, position: 'relative' },
  foilBase: { ...StyleSheet.absoluteFillObject },
  colorField: { position: 'absolute', width: '150%', height: '54%', left: '-28%', top: '7%', opacity: .72, transform: [{ rotate: '-16deg' }] },
  colorFieldTwo: { position: 'absolute', width: '135%', height: '30%', right: '-42%', top: '31%', opacity: .34, transform: [{ rotate: '22deg' }] },
  art: { position: 'absolute', left: '-9%', right: '-9%', top: '17%', width: '118%', height: '62%', opacity: .91 },
  artShade: { position: 'absolute', left: 0, right: 0, top: '15%', height: '67%', backgroundColor: 'rgba(3,4,8,0.17)' },
  darkBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '33%', backgroundColor: 'rgba(2,3,6,0.88)' },
  diagonalFoil: { position: 'absolute', width: '155%', height: '7%', left: '-24%', top: '46%', transform: [{ rotate: '-25deg' }] },
  diagonalFoilTwo: { position: 'absolute', width: '150%', height: '2%', left: '-25%', top: '56%', backgroundColor: 'rgba(255,255,255,.16)', transform: [{ rotate: '-25deg' }] },
  edgeLightLeft: { position: 'absolute', top: 12, bottom: 12, left: 3, width: 1, backgroundColor: 'rgba(255,255,255,.33)' },
  edgeLightRight: { position: 'absolute', top: 12, bottom: 12, right: 3, width: 1, backgroundColor: 'rgba(255,255,255,.18)' },
  brandBlock: { position: 'absolute', left: '9%', right: '9%', top: '8%', alignItems: 'center' },
  brandTiny: { color: '#F5F5F5', fontSize: 6.5, fontWeight: '900', letterSpacing: 1.25, textShadowColor: '#000', textShadowRadius: 5 },
  logo: { width: '92%', height: 43, marginTop: 5 },
  fallbackLogo: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 9, textShadowColor: '#000', textShadowRadius: 5 },
  bottomCopy: { position: 'absolute', left: '9%', right: '9%', bottom: '8%' },
  packName: { color: '#FAFAFA', fontSize: 11, lineHeight: 13, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 4 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  setCode: { color: '#CACDD4', fontSize: 6.5, fontWeight: '900', letterSpacing: .8 },
  cardCount: { color: '#F0F0F2', fontSize: 6.5, fontWeight: '900', letterSpacing: .7 },
  openMouth: { position: 'absolute', top: 9, left: '9%', right: '9%', height: 9, backgroundColor: '#020203', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.35)', zIndex: 11 },
  seamGlow: { position: 'absolute', top: 17, left: '5%', right: '5%', height: 3, borderRadius: 99, zIndex: 12 },
  crimpHalf: { position: 'absolute', top: 0, width: '51%', height: 23, backgroundColor: '#D8DADE', borderBottomWidth: 1, borderBottomColor: '#757981', zIndex: 15, overflow: 'hidden' },
  crimpLeft: { left: 0 }, crimpRight: { right: 0 },
  crimpLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(55,58,65,.35)', transform: [{ rotate: '-9deg' }] },
  bottomCrimp: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, backgroundColor: '#D5D7DB', borderTopWidth: 1, borderTopColor: '#73777E', overflow: 'hidden' },
  bottomCrimpLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(55,58,65,.38)', transform: [{ rotate: '10deg' }] },
  specular: { position: 'absolute', width: '180%', height: '10%', top: '34%', left: '-45%', backgroundColor: 'rgba(255,255,255,.09)', transform: [{ rotate: '-31deg' }] },
});
