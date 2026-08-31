import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GalaxyFlowOverlay } from '@/components/GalaxyFlowOverlay';

type AuraIntensity = 'soft' | 'premium' | 'master';

type AuraBannerProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  primaryColor: string;
  secondaryColor?: string;
  intensity?: AuraIntensity;
  variant?: 'energy' | 'galaxy';
  badge?: string;
  children?: ReactNode;
  minHeight?: number;
};

const PARTICLES = [
  { x: '8%', y: '24%', size: 4, delay: 0 },
  { x: '18%', y: '72%', size: 3, delay: .18 },
  { x: '34%', y: '12%', size: 3, delay: .36 },
  { x: '52%', y: '82%', size: 5, delay: .52 },
  { x: '70%', y: '18%', size: 3, delay: .68 },
  { x: '84%', y: '67%', size: 4, delay: .82 },
  { x: '93%', y: '35%', size: 3, delay: .94 },
] as const;

export function AuraBanner({
  eyebrow,
  title,
  subtitle,
  icon = 'sparkles',
  primaryColor,
  secondaryColor,
  intensity = 'premium',
  variant = 'energy',
  badge,
  children,
  minHeight = 170,
}: AuraBannerProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const flow = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const second = secondaryColor ?? '#FFD447';

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduceMotion(Boolean(value));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(.45);
      flow.setValue(.35);
      drift.setValue(.4);
      return;
    }
    const native = Platform.OS !== 'web';
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1900, useNativeDriver: native }),
      Animated.timing(pulse, { toValue: 0, duration: 1900, useNativeDriver: native }),
    ]));
    const flowLoop = Animated.loop(Animated.timing(flow, {
      toValue: 1,
      duration: intensity === 'master' ? 4200 : 5200,
      useNativeDriver: native,
    }));
    const driftLoop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 3400, useNativeDriver: native }),
      Animated.timing(drift, { toValue: 0, duration: 3400, useNativeDriver: native }),
    ]));
    pulseLoop.start();
    flowLoop.start();
    driftLoop.start();
    return () => {
      pulseLoop.stop();
      flowLoop.stop();
      driftLoop.stop();
    };
  }, [drift, flow, intensity, pulse, reduceMotion]);

  const config = useMemo(() => {
    if (intensity === 'master') return { glow: .29, border: .96, particles: 1, wisp: .28 };
    if (intensity === 'premium') return { glow: .20, border: .82, particles: .72, wisp: .20 };
    return { glow: .12, border: .62, particles: .42, wisp: .13 };
  }, [intensity]);

  const outerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [config.border * .48, config.border] });
  const outerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [.995, 1.018] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [.92, 1.12] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [config.glow * .55, config.glow] });

  const topX = flow.interpolate({ inputRange: [0, 1], outputRange: [-130, 650] });
  const bottomX = flow.interpolate({ inputRange: [0, 1], outputRange: [650, -130] });
  const leftY = flow.interpolate({ inputRange: [0, 1], outputRange: [250, -100] });
  const rightY = flow.interpolate({ inputRange: [0, 1], outputRange: [-100, 250] });

  const wispAX = drift.interpolate({ inputRange: [0, 1], outputRange: [-20, 42] });
  const wispAY = drift.interpolate({ inputRange: [0, 1], outputRange: [14, -14] });
  const wispBX = drift.interpolate({ inputRange: [0, 1], outputRange: [28, -34] });
  const wispBY = drift.interpolate({ inputRange: [0, 1], outputRange: [-10, 22] });

  const webBackdrop = Platform.OS === 'web' ? ({
    backgroundImage:
      `radial-gradient(circle at 18% 18%, ${primaryColor}27 0 80px, transparent 150px),` +
      `radial-gradient(circle at 86% 74%, ${second}20 0 70px, transparent 145px),` +
      'linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.006))',
  } as any) : null;

  return (
    <View style={[styles.shell, { minHeight }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerAura,
          {
            borderColor: primaryColor,
            opacity: outerOpacity,
            transform: [{ scale: outerScale }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.outerAuraSecond,
          {
            borderColor: second,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [.08, intensity === 'master' ? .42 : .26] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.018, 1.035] }) }],
          },
        ]}
      />

      <View style={[styles.card, { borderColor: `${primaryColor}A8` }, webBackdrop]}>
        {variant === 'galaxy' ? <GalaxyFlowOverlay intensity={intensity} opacity={intensity==='master'?1:.82}/> : null}
        <Animated.View pointerEvents="none" style={[styles.glowOrbA, {
          backgroundColor: primaryColor,
          opacity: glowOpacity,
          transform: [{ translateX: wispAX }, { translateY: wispAY }, { scale: glowScale }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.glowOrbB, {
          backgroundColor: second,
          opacity: glowOpacity,
          transform: [{ translateX: wispBX }, { translateY: wispBY }, { scale: glowScale }],
        }]} />

        <Animated.View pointerEvents="none" style={[styles.wisp, styles.wispA, {
          borderColor: primaryColor,
          opacity: config.wisp,
          transform: [{ translateX: wispAX }, { translateY: wispAY }, { rotate: '-18deg' }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.wisp, styles.wispB, {
          borderColor: second,
          opacity: config.wisp * .8,
          transform: [{ translateX: wispBX }, { translateY: wispBY }, { rotate: '24deg' }],
        }]} />

        <Animated.View pointerEvents="none" style={[styles.flowHorizontal, styles.flowTop, {
          backgroundColor: primaryColor,
          opacity: outerOpacity,
          transform: [{ translateX: topX }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.flowHorizontal, styles.flowBottom, {
          backgroundColor: second,
          opacity: outerOpacity,
          transform: [{ translateX: bottomX }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.flowVertical, styles.flowLeft, {
          backgroundColor: second,
          opacity: outerOpacity,
          transform: [{ translateY: leftY }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.flowVertical, styles.flowRight, {
          backgroundColor: primaryColor,
          opacity: outerOpacity,
          transform: [{ translateY: rightY }],
        }]} />

        {intensity !== 'soft' ? PARTICLES.map((particle, index) => {
          const local = flow.interpolate({
            inputRange: [0, Math.max(.001, particle.delay), 1],
            outputRange: [.18, 1, .18],
          });
          return (
            <Animated.View
              key={`aura-particle-${index}`}
              pointerEvents="none"
              style={[
                styles.particle,
                {
                  left: particle.x as any,
                  top: particle.y as any,
                  width: particle.size,
                  height: particle.size,
                  borderRadius: particle.size,
                  backgroundColor: index % 2 ? second : primaryColor,
                  opacity: Animated.multiply(local, config.particles),
                  transform: [{
                    translateY: drift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [index % 2 ? 6 : -4, index % 2 ? -7 : 8],
                    }),
                  }],
                },
              ]}
            />
          );
        }) : null}

        <View style={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: `${primaryColor}1F`, borderColor: `${primaryColor}70` }]}>
            <Ionicons name={icon} size={23} color={primaryColor} />
          </View>
          <View style={styles.copy}>
            {eyebrow ? <Text style={[styles.eyebrow, { color: second }]}>{eyebrow}</Text> : null}
            <View style={styles.titleRow}>
              <Text style={styles.title}>{title}</Text>
              {badge ? <View style={[styles.badge, { borderColor: `${second}75`, backgroundColor: `${second}16` }]}><Text style={[styles.badgeText, { color: second }]}>{badge}</Text></View> : null}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>

        {children ? <View style={styles.children}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: 'relative', marginVertical: 3 },
  outerAura: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderWidth: 2, borderRadius: 29 },
  outerAuraSecond: { position: 'absolute', left: -8, right: -8, top: -8, bottom: -8, borderWidth: 1, borderRadius: 33 },
  card: { flex: 1, minHeight: 160, borderRadius: 25, borderWidth: 1, overflow: 'hidden', padding: 16, backgroundColor: '#0A101AEF' },
  glowOrbA: { position: 'absolute', width: 250, height: 250, borderRadius: 999, right: -92, top: -116 },
  glowOrbB: { position: 'absolute', width: 190, height: 190, borderRadius: 999, left: -80, bottom: -100 },
  wisp: { position: 'absolute', borderWidth: 2, borderRadius: 999 },
  wispA: { width: 270, height: 78, right: -80, top: 28 },
  wispB: { width: 230, height: 64, left: -78, bottom: 24 },
  flowHorizontal: { position: 'absolute', width: 115, height: 3, borderRadius: 999 },
  flowTop: { top: 0, left: 0 },
  flowBottom: { bottom: 0, left: 0 },
  flowVertical: { position: 'absolute', width: 3, height: 74, borderRadius: 999 },
  flowLeft: { left: 0, top: 0 },
  flowRight: { right: 0, top: 0 },
  particle: { position: 'absolute' },
  content: { zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.25 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 2 },
  title: { color: '#F6F8FC', fontSize: 22, lineHeight: 27, fontWeight: '900' },
  subtitle: { color: '#AEB8C8', fontSize: 9, lineHeight: 14, marginTop: 4, maxWidth: 620 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 6.5, fontWeight: '900', letterSpacing: .6 },
  children: { zIndex: 3, marginTop: 13 },
});
