import { PropsWithChildren } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { gameTheme } from '@/theme/gameTheme';

export function Screen({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TRAINER HUB</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: gameTheme.colors.bg, overflow: 'hidden' },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 118, gap: 16 },
  header: { gap: 5, marginBottom: 4 },
  eyebrow: { color: gameTheme.colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: gameTheme.colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: gameTheme.colors.muted, fontSize: 15, lineHeight: 21 },
  glowOne: { position: 'absolute', width: 260, height: 260, borderRadius: 260, backgroundColor: '#15366C', opacity: 0.32, top: -120, right: -90 },
  glowTwo: { position: 'absolute', width: 220, height: 220, borderRadius: 220, backgroundColor: '#5B2A55', opacity: 0.16, top: 260, left: -150 },
});
