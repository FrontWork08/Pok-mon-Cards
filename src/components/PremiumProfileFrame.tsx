import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';

type FrameTheme = 'indigo' | 'champion' | 'crimson' | 'master' | 'galaxy' | 'energy';
type FrameTier = 1 | 2 | 3 | 4 | 5;

type FramePreset = {
  theme: FrameTheme;
  tier: FrameTier;
  primary: string;
  secondary: string;
  tertiary: string;
  particles: number;
  flowSpeed: number;
  pulseSpeed: number;
  shineSpeed: number;
};

const PARTICLES = [
  ['7%', '16%', 3, 0],
  ['15%', '76%', 4, 1],
  ['25%', '31%', 2, 2],
  ['33%', '88%', 3, 3],
  ['44%', '9%', 4, 4],
  ['54%', '70%', 2, 5],
  ['63%', '21%', 3, 6],
  ['72%', '83%', 4, 7],
  ['82%', '38%', 2, 8],
  ['91%', '68%', 3, 9],
  ['96%', '20%', 2, 10],
  ['4%', '52%', 3, 11],
] as const;

function presetFor(frameId?: string | null, primaryColor?: string, secondaryColor?: string): FramePreset {
  const id = String(frameId ?? '').toLowerCase();
  if (id.includes('galaxy')) {
    return {
      theme: 'galaxy',
      tier: 5,
      primary: '#8B5CFF',
      secondary: '#55E6FF',
      tertiary: '#E056FD',
      particles: 12,
      flowSpeed: 4200,
      pulseSpeed: 1750,
      shineSpeed: 3800,
    };
  }
  if (id.includes('master')) {
    return {
      theme: 'master',
      tier: 5,
      primary: primaryColor ?? '#C493FF',
      secondary: '#8EE7FF',
      tertiary: '#F0CBFF',
      particles: 11,
      flowSpeed: 4600,
      pulseSpeed: 1900,
      shineSpeed: 4200,
    };
  }
  if (id.includes('crimson') || id.includes('crown')) {
    return {
      theme: 'crimson',
      tier: 4,
      primary: primaryColor ?? '#FF667A',
      secondary: '#FFB36B',
      tertiary: '#FFD3A1',
      particles: 9,
      flowSpeed: 4800,
      pulseSpeed: 2050,
      shineSpeed: 4500,
    };
  }
  if (id.includes('champion') || id.includes('gold')) {
    return {
      theme: 'champion',
      tier: 4,
      primary: primaryColor ?? '#FFD447',
      secondary: '#FFF0A8',
      tertiary: '#FF9F2F',
      particles: 8,
      flowSpeed: 5000,
      pulseSpeed: 2200,
      shineSpeed: 4700,
    };
  }
  if (id.includes('indigo')) {
    return {
      theme: 'indigo',
      tier: 3,
      primary: primaryColor ?? '#6A7CFF',
      secondary: '#55D9FF',
      tertiary: '#AFA8FF',
      particles: 6,
      flowSpeed: 5400,
      pulseSpeed: 2350,
      shineSpeed: 5100,
    };
  }
  return {
    theme: 'energy',
    tier: 2,
    primary: primaryColor ?? '#6A7CFF',
    secondary: secondaryColor ?? '#FFD447',
    tertiary: '#FFFFFF',
    particles: 5,
    flowSpeed: 5800,
    pulseSpeed: 2500,
    shineSpeed: 5400,
  };
}

export function PremiumProfileFrame({
  children,
  frameId,
  primaryColor,
  secondaryColor,
  radius = 28,
  style,
  compact = false,
}: {
  children: ReactNode;
  frameId?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const preset = useMemo(
    () => presetFor(frameId, primaryColor, secondaryColor),
    [frameId, primaryColor, secondaryColor],
  );
  const pulse = useRef(new Animated.Value(0)).current;
  const flow = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (mounted) setReduceMotion(Boolean(value)); })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(.52);
      flow.setValue(.35);
      sparkle.setValue(.62);
      return;
    }
    const native = Platform.OS !== 'web';
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: preset.pulseSpeed, useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: preset.pulseSpeed, useNativeDriver: native }),
    ]));
    const flowLoop = Animated.loop(
      Animated.timing(flow, { toValue: 1, duration: preset.flowSpeed, useNativeDriver: native }),
    );
    const sparkleLoop = Animated.loop(Animated.sequence([
      Animated.delay(450),
      Animated.timing(sparkle, { toValue: 1, duration: 900, useNativeDriver: native }),
      Animated.timing(sparkle, { toValue: 0, duration: 1200, useNativeDriver: native }),
      Animated.delay(650),
    ]));
    pulseLoop.start();
    flowLoop.start();
    sparkleLoop.start();
    return () => {
      pulseLoop.stop();
      flowLoop.stop();
      sparkleLoop.stop();
    };
  }, [flow, preset.flowSpeed, preset.pulseSpeed, pulse, reduceMotion, sparkle]);

  const outerOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [compact ? .22 : .34, compact ? .58 : preset.tier >= 4 ? .92 : .72],
  });
  const outerScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, compact ? 1.018 : preset.tier >= 4 ? 1.035 : 1.024],
  });
  const orbitRotate = flow.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const orbitBack = flow.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const topFlow = flow.interpolate({ inputRange: [0, 1], outputRange: [-115, compact ? 285 : 690] });
  const bottomFlow = flow.interpolate({ inputRange: [0, 1], outputRange: [compact ? 285 : 690, -115] });
  const shineX = flow.interpolate({ inputRange: [0, .68, 1], outputRange: [-180, compact ? 260 : 620, compact ? 260 : 620] });
  const cornerPulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [.7, 1.18] });

  const border = compact ? 2 : preset.tier >= 4 ? 3 : 2;
  const railHeight = compact ? 2 : preset.tier >= 4 ? 4 : 3;
  const particleCount = compact ? Math.min(5, preset.particles) : preset.particles;

  return (
    <View style={[styles.shell, { borderRadius: radius }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerAura,
          {
            borderRadius: radius + 8,
            borderColor: preset.primary,
            opacity: outerOpacity,
            transform: [{ scale: outerScale }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerAuraSecondary,
          {
            borderRadius: radius + 13,
            borderColor: preset.secondary,
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [.08, compact ? .24 : preset.tier >= 4 ? .48 : .34],
            }),
          },
        ]}
      />

      {preset.tier >= 4 ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbit,
              styles.orbitWide,
              {
                borderColor: preset.secondary,
                opacity: compact ? .18 : .30,
                transform: [{ rotate: orbitRotate }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.orbit,
              styles.orbitTight,
              {
                borderColor: preset.tertiary,
                opacity: compact ? .14 : .25,
                transform: [{ rotate: orbitBack }],
              },
            ]}
          />
        </>
      ) : null}

      <View
        style={[
          styles.frame,
          {
            borderRadius: radius,
            borderWidth: border,
            borderColor: preset.primary,
          },
        ]}
      >
        {preset.theme === 'galaxy' ? (
          <GalaxyFlowOverlay intensity="master" opacity={compact ? .72 : .92} />
        ) : null}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.innerAura,
            {
              borderRadius: Math.max(8, radius - 4),
              borderColor: preset.secondary,
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [.18, preset.tier >= 4 ? .72 : .48],
              }),
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.energyRail,
            styles.energyTop,
            {
              height: railHeight,
              width: compact ? 82 : preset.tier >= 4 ? 150 : 116,
              backgroundColor: preset.secondary,
              opacity: outerOpacity,
              transform: [{ translateX: topFlow }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.energyRail,
            styles.energyBottom,
            {
              height: railHeight,
              width: compact ? 82 : preset.tier >= 4 ? 150 : 116,
              backgroundColor: preset.tertiary,
              opacity: outerOpacity,
              transform: [{ translateX: bottomFlow }],
            },
          ]}
        />

        {preset.tier >= 3 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shine,
              {
                backgroundColor: preset.theme === 'champion' ? '#FFF8D1' : '#FFFFFF',
                opacity: sparkle.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, compact ? .20 : preset.tier >= 4 ? .34 : .24],
                }),
                transform: [{ translateX: shineX }, { rotate: '17deg' }],
              },
            ]}
          />
        ) : null}

        {Array.from({ length: particleCount }).map((_, index) => {
          const [left, top, size, phase] = PARTICLES[index];
          const particleOpacity = Animated.multiply(
            index % 2 === 0 ? pulse : sparkle,
            preset.tier >= 4 ? .9 : .68,
          );
          const rise = flow.interpolate({
            inputRange: [0, 1],
            outputRange: [index % 2 ? 7 : -5, index % 2 ? -8 : 9],
          });
          return (
            <Animated.View
              key={phase}
              pointerEvents="none"
              style={[
                styles.particle,
                {
                  left: left as any,
                  top: top as any,
                  width: compact ? Math.max(2, size - 1) : size,
                  height: compact ? Math.max(2, size - 1) : size,
                  borderRadius: 999,
                  backgroundColor: index % 3 === 0 ? preset.tertiary : index % 3 === 1 ? preset.secondary : preset.primary,
                  opacity: particleOpacity,
                  transform: [{ translateY: rise }],
                },
              ]}
            />
          );
        })}

        {preset.tier >= 4 ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.cornerGem, styles.cornerTL, { backgroundColor: preset.secondary, transform: [{ scale: cornerPulse }] }]} />
            <Animated.View pointerEvents="none" style={[styles.cornerGem, styles.cornerTR, { backgroundColor: preset.tertiary, transform: [{ scale: cornerPulse }] }]} />
            <Animated.View pointerEvents="none" style={[styles.cornerGem, styles.cornerBL, { backgroundColor: preset.tertiary, transform: [{ scale: cornerPulse }] }]} />
            <Animated.View pointerEvents="none" style={[styles.cornerGem, styles.cornerBR, { backgroundColor: preset.secondary, transform: [{ scale: cornerPulse }] }]} />
          </>
        ) : null}

        <View style={styles.content}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'visible',
  },
  outerAura: {
    position: 'absolute',
    left: -7,
    right: -7,
    top: -7,
    bottom: -7,
    borderWidth: 2,
  },
  outerAuraSecondary: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: -12,
    bottom: -12,
    borderWidth: 1,
  },
  orbit: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderRadius: 999,
    borderWidth: 1,
  },
  orbitWide: {
    width: '118%',
    height: '72%',
    marginLeft: '-59%',
    marginTop: '-36%',
  },
  orbitTight: {
    width: '108%',
    height: '88%',
    marginLeft: '-54%',
    marginTop: '-44%',
  },
  frame: {
    position: 'relative',
    overflow: 'hidden',
  },
  innerAura: {
    ...StyleSheet.absoluteFillObject,
    margin: 3,
    borderWidth: 1,
    zIndex: 2,
  },
  energyRail: {
    position: 'absolute',
    left: 0,
    borderRadius: 999,
    zIndex: 5,
  },
  energyTop: {
    top: 0,
  },
  energyBottom: {
    bottom: 0,
  },
  shine: {
    position: 'absolute',
    top: -70,
    bottom: -70,
    width: 34,
    borderRadius: 999,
    zIndex: 6,
  },
  particle: {
    position: 'absolute',
    zIndex: 7,
  },
  cornerGem: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 3,
    zIndex: 8,
  },
  cornerTL: { left: 7, top: 7 },
  cornerTR: { right: 7, top: 7 },
  cornerBL: { left: 7, bottom: 7 },
  cornerBR: { right: 7, bottom: 7 },
  content: {
    position: 'relative',
    zIndex: 3,
  },
});
