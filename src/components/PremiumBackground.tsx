import { memo } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

const PATTERN_POSITIONS = [
  ['8%', '12%', -14], ['78%', '18%', 12], ['23%', '39%', 8],
  ['88%', '48%', -10], ['10%', '69%', 15], ['62%', '76%', -8], ['35%', '91%', 10],
] as const;

const THEME_ICONS = {
  trainer: 'paw', midnight: 'moon', poke_red: 'radio-button-on', electric: 'flash',
  ghost: 'skull', fire: 'flame', water: 'water', grass: 'leaf', psychic: 'eye',
  dragon: 'sparkles', fighting: 'barbell', steel: 'hardware-chip', fairy: 'heart', darkness: 'moon',
  kanto: 'paw', johto: 'leaf', hoenn: 'water', sinnoh: 'sparkles',
} as const;

function CaptureOrb({ top, right, left, size, color, opacity }: {
  top: string; right?: string; left?: string; size: number; color: string; opacity: number;
}) {
  return (
    <View style={[styles.orb, { top: top as any, right: right as any, left: left as any, width: size, height: size, borderRadius: size / 2, borderColor: color, opacity }]}>
      <View style={[styles.orbLine, { backgroundColor: color }]} />
      <View style={[styles.orbCenter, { width: size * .25, height: size * .25, borderRadius: size, borderColor: color }]}>
        <View style={[styles.orbDot, { width: size * .095, height: size * .095, borderRadius: size, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export const PremiumBackground = memo(function PremiumBackground() {
  const { colors, isLight, themeName } = useAppTheme();
  const patternIcon = THEME_ICONS[themeName as keyof typeof THEME_ICONS] ?? 'paw';
  const visual = getThemeVisual(themeName);
  const webTexture = Platform.OS === 'web' ? ({
    backgroundImage:
      `radial-gradient(circle at 88% 10%, ${colors.accent}20 0 54px, transparent 55px),` +
      `radial-gradient(circle at 88% 10%, transparent 0 78px, ${colors.accent}18 79px 82px, transparent 83px),` +
      `radial-gradient(circle at 9% 72%, transparent 0 92px, ${colors.yellow}12 93px 96px, transparent 97px),` +
      `repeating-radial-gradient(circle at 20% 20%, ${isLight ? 'rgba(10,20,35,.035)' : 'rgba(255,255,255,.028)'} 0 1px, transparent 1px 15px)`,
  } as any) : null;

  return (
    <View style={[styles.layer, { backgroundColor: colors.bg }, webTexture]}>
      <View style={[styles.pokemonGlowRight, { backgroundColor: colors.accent, opacity: isLight ? .07 : .12 }]} />
      <View style={[styles.pokemonGlowLeft, { backgroundColor: colors.yellow, opacity: isLight ? .04 : .07 }]} />
      <Image
        source={{ uri: visual.image }}
        resizeMode="contain"
        style={[styles.themePokemonRight, { opacity: isLight ? .13 : .20 }]}
      />
      <View style={[styles.landMass, { backgroundColor: colors.accent, opacity: isLight ? .045 : .08 }]} />
      <View style={[styles.landMassTwo, { backgroundColor: colors.yellow, opacity: isLight ? .035 : .055 }]} />
      {Platform.OS !== 'web' ? (
        <>
          <CaptureOrb top="4%" right="-42" size={178} color={colors.accent} opacity={isLight ? .10 : .15} />
          <CaptureOrb top="61%" left="-62" size={205} color={colors.yellow} opacity={isLight ? .07 : .10} />
          {PATTERN_POSITIONS.slice(0, 4).map(([left, top, rotation], index) => (
            <View key={`type-${index}`} style={{ position:'absolute', left:left as any, top:top as any, transform:[{ rotate:`${rotation}deg` }], opacity:isLight ? .055 : .075 }}>
              <Ionicons name={patternIcon} size={index % 2 ? 29 : 22} color={index % 3 ? colors.accent : colors.yellow} />
            </View>
          ))}
        </>
      ) : null}
      <View style={[styles.routeLine, { borderColor: colors.accent, opacity: isLight ? .07 : .11 }]} />
      <View style={[styles.routeLineTwo, { borderColor: colors.yellow, opacity: isLight ? .05 : .08 }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', pointerEvents: 'none' } as any,
  pokemonGlowRight: { position:'absolute', right:-90, top:'3%', width:330, height:330, borderRadius:999 },
  pokemonGlowLeft: { position:'absolute', left:-100, bottom:'-3%', width:240, height:240, borderRadius:999 },
  themePokemonRight:{position:'absolute',right:-38,top:'2%',width:300,height:370,transform:[{rotate:'6deg'}]},
  themePokemonLeft:{position:'absolute',left:-70,bottom:'-3%',width:245,height:320,transform:[{rotate:'-8deg'}]},
  orb: { position: 'absolute', borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orbLine: { position: 'absolute', left: 0, right: 0, height: 3 },
  orbCenter: { borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  orbDot: {},
  landMass: { position:'absolute', width:430, height:250, borderRadius:180, top:'25%', right:-300, transform:[{ rotate:'-22deg' }] },
  landMassTwo: { position:'absolute', width:390, height:210, borderRadius:160, bottom:'5%', left:-270, transform:[{ rotate:'17deg' }] },
  routeLine: { position:'absolute', width:'65%', height:190, borderWidth:2, borderRadius:150, top:'31%', left:'46%', transform:[{ rotate:'-17deg' }] },
  routeLineTwo: { position:'absolute', width:'58%', height:170, borderWidth:2, borderRadius:150, top:'70%', left:'-24%', transform:[{ rotate:'11deg' }] },
});
