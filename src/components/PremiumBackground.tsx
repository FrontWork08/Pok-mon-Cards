import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

const GRAIN = [
  [4,8,1],[12,18,0.7],[21,6,0.8],[29,25,1],[37,12,0.7],[46,31,0.9],[55,9,0.7],[64,22,1],[73,5,0.8],[82,29,0.7],[91,15,1],
  [7,42,0.7],[16,55,1],[25,37,0.8],[34,63,0.7],[43,48,1],[52,71,0.8],[61,40,0.7],[70,59,1],[79,44,0.7],[88,68,0.9],[96,50,0.7],
  [3,78,1],[13,88,0.7],[22,72,0.9],[31,94,0.7],[40,81,1],[49,91,0.8],[58,76,0.7],[67,97,1],[76,84,0.7],[85,93,0.9],[94,79,0.7],
  [10,31,0.6],[19,46,0.8],[27,15,0.6],[36,86,0.7],[45,20,0.6],[54,55,0.8],[63,88,0.6],[72,35,0.7],[81,74,0.6],[90,39,0.8],
] as const;

const SLASHES = [12, 28, 47, 68, 86] as const;

export const PremiumBackground = memo(function PremiumBackground() {
  const { colors, isLight } = useAppTheme();

  const webTexture = Platform.OS === 'web' ? ({
    backgroundImage: isLight
      ? `radial-gradient(circle at 85% 5%, ${colors.accent}12 0%, transparent 30%), radial-gradient(circle at 8% 58%, ${colors.yellow}0D 0%, transparent 24%), repeating-linear-gradient(118deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 24px)`
      : `radial-gradient(circle at 86% 3%, ${colors.accent}18 0%, transparent 31%), radial-gradient(circle at 8% 58%, ${colors.yellow}0A 0%, transparent 23%), radial-gradient(circle at 50% 118%, rgba(255,255,255,0.035) 0%, transparent 35%), repeating-linear-gradient(118deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 28px)`,
  } as any) : null;

  return (
    <View style={[styles.layer, styles.noPointerEvents, { backgroundColor: colors.bg }, webTexture]}>
      <View style={[styles.topShade, { backgroundColor: isLight ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.012)' }]} />
      <View style={[styles.edgeShadeLeft, { backgroundColor: isLight ? 'rgba(0,0,0,0.018)' : 'rgba(0,0,0,0.34)' }]} />
      <View style={[styles.edgeShadeRight, { backgroundColor: isLight ? 'rgba(0,0,0,0.014)' : 'rgba(0,0,0,0.28)' }]} />

      {Platform.OS !== 'web' ? (
        <>
          <View style={[styles.glowTop, { backgroundColor: colors.accent, opacity: isLight ? 0.035 : 0.055 }]} />
          <View style={[styles.glowSide, { backgroundColor: colors.yellow, opacity: isLight ? 0.025 : 0.03 }]} />
          {SLASHES.map((top, index) => (
            <View
              key={`slash-${top}`}
              style={[
                styles.slash,
                {
                  top: `${top}%` as any,
                  left: index % 2 === 0 ? '-14%' : '42%',
                  backgroundColor: isLight ? 'rgba(0,0,0,0.022)' : 'rgba(255,255,255,0.018)',
                },
              ]}
            />
          ))}
        </>
      ) : null}

      <View style={styles.grainLayer}>
        {GRAIN.map(([left, top, scale], index) => (
          <View
            key={`grain-${index}`}
            style={[
              styles.grain,
              {
                left: `${left}%` as any,
                top: `${top}%` as any,
                width: 1.2 * scale,
                height: 1.2 * scale,
                opacity: isLight ? 0.055 : 0.11,
                backgroundColor: isLight ? '#111' : '#FFF',
              },
            ]}
          />
        ))}
      </View>

      <View style={[styles.hairline, { backgroundColor: isLight ? 'rgba(0,0,0,0.028)' : 'rgba(255,255,255,0.025)' }]} />
      <View style={[styles.hairlineTwo, { backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.018)' }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  noPointerEvents: { pointerEvents: 'none' } as any,
  grainLayer: { ...StyleSheet.absoluteFillObject },
  grain: { position: 'absolute', borderRadius: 999 },
  glowTop: { position: 'absolute', width: 460, height: 460, borderRadius: 460, top: -260, right: -170 },
  glowSide: { position: 'absolute', width: 340, height: 340, borderRadius: 340, top: '39%', left: -250 },
  slash: { position: 'absolute', width: '72%', height: 1, transform: [{ rotate: '-17deg' }] },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  edgeShadeLeft: { position: 'absolute', top: 0, bottom: 0, left: -120, width: 170, borderRadius: 170 },
  edgeShadeRight: { position: 'absolute', top: 0, bottom: 0, right: -140, width: 190, borderRadius: 190 },
  hairline: { position: 'absolute', width: '46%', height: 1, top: '23%', right: '-5%', transform: [{ rotate: '-8deg' }] },
  hairlineTwo: { position: 'absolute', width: '40%', height: 1, top: '74%', left: '-7%', transform: [{ rotate: '-8deg' }] },
});
