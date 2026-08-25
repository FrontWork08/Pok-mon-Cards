import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/ThemeProvider';

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  const { colors, isLight } = useAppTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={[styles.glowOne, styles.noPointerEvents, { backgroundColor: colors.accent, opacity: isLight ? 0.10 : 0.20 }]} />
      <View style={[styles.glowTwo, styles.noPointerEvents, { backgroundColor: colors.yellow, opacity: isLight ? 0.07 : 0.08 }]} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 118 },
  inner: { width: '100%', maxWidth: 1280, alignSelf: 'center', gap: 16 },
  header: { gap: 5, marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  glowOne: { position: 'absolute', width: 260, height: 260, borderRadius: 260, top: -120, right: -90 },
  glowTwo: { position: 'absolute', width: 220, height: 220, borderRadius: 220, top: 260, left: -150 },
  noPointerEvents: { pointerEvents: 'none' } as any,
});
