import { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PremiumBackground } from '@/components/PremiumBackground';
import { TrainerPageHeader } from '@/components/TrainerPageHeader';
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
          <TrainerPageHeader title={title} subtitle={subtitle} />
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
});
