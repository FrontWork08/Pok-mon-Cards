import { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PremiumBackground } from '@/components/PremiumBackground';
import { useAppTheme } from '@/theme/ThemeProvider';

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          Platform.OS !== 'web' && styles.contentMobile,
          { paddingTop: 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={[styles.brandDot, { backgroundColor: colors.yellow }]} />
              <Text style={[styles.eyebrow, { color: colors.yellow }]}>TRAINER COLLECTION</Text>
              <View style={[styles.versionPill, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                <Text style={[styles.versionText, { color: colors.accent }]}>1.0</Text>
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 118 },
  contentMobile: { paddingBottom: 28 },
  inner: { width: '100%', maxWidth: 1280, alignSelf: 'center', gap: 16 },
  header: { width: '100%', gap: 5, marginBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 999 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  versionPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  versionText: { fontSize: 8, fontWeight: '900', letterSpacing: .6 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 21 },
});
