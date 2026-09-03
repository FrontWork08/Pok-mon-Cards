import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';
import { getThemeVisual } from '@/theme/themeCatalog';

export function TrainerPageHeader({
  title,
  subtitle,
  icon = 'sparkles',
  compact = false,
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}) {
  const { colors, themeName, isLight, effectsReduced, largeText } = useAppTheme();
  const visual = getThemeVisual(themeName);

  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
        {
          backgroundColor: isLight ? 'rgba(255,255,255,.88)' : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.accentRail, { backgroundColor: colors.accent }]} />
      {!effectsReduced?<View style={[styles.glow, { backgroundColor: colors.accent }]} />:null}
      {!effectsReduced?<Image
        source={{ uri: visual.image }}
        resizeMode="contain"
        style={[styles.mascot, compact && styles.mascotCompact]}
      />:null}

      <View style={[styles.icon, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
        <Ionicons name={icon} size={compact ? 18 : 22} color={colors.yellow} />
      </View>

      <View style={styles.copy}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.yellow }]} />
          <Text style={[styles.eyebrow, { color: colors.yellow }]}>TRAINER COLLECTION</Text>
          <View style={[styles.version, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
            <Text style={[styles.versionText, { color: colors.accent }]}>1.0</Text>
          </View>
        </View>

        <Text
          numberOfLines={compact ? 1 : 2}
          style={[styles.title, compact && styles.titleCompact, largeText&&styles.titleLarge, { color: colors.text }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={compact ? 2 : 3}
            style={[styles.subtitle, compact && styles.subtitleCompact, largeText&&styles.subtitleLarge, { color: colors.muted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    minHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    padding: 15,
    paddingRight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    overflow: 'hidden',
    position: 'relative',
  },
  shellCompact: {
    minHeight: 94,
    borderRadius: 19,
    padding: 12,
    paddingRight: 78,
    gap: 10,
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  glow: {
    position: 'absolute',
    right: -50,
    top: -68,
    width: 190,
    height: 190,
    borderRadius: 999,
    opacity: .11,
  },
  mascot: {
    position: 'absolute',
    right: -18,
    bottom: -28,
    width: 132,
    height: 145,
    opacity: .22,
    transform: [{ rotate: '6deg' }],
  },
  mascotCompact: {
    width: 120,
    height: 135,
    right: -14,
    bottom: -25,
    opacity: .18,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    zIndex: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  version: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  versionText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: .5,
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -.65,
    marginTop: 5,
  },
  titleCompact: {
    fontSize: 21,
    lineHeight: 25,
  },
  titleLarge:{fontSize:30,lineHeight:35},
  subtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 650,
  },
  subtitleCompact: {
    fontSize: 10,
    lineHeight: 15,
  },
  subtitleLarge:{fontSize:13,lineHeight:19},
});
