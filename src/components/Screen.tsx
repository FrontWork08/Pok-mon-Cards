import { PropsWithChildren } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PremiumBackground } from '@/components/PremiumBackground';
import { useAppTheme } from '@/theme/ThemeProvider';

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, Platform.OS !== 'web' && styles.contentMobile]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.yellow }]}>TRAINER HUB</Text>
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
  header: { gap: 5, marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 21 },
});
