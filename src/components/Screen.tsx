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
          { paddingTop: 9 },
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
  content: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 108 },
  contentMobile: { paddingBottom: 28 },
  inner: { width: '100%', maxWidth: 1220, alignSelf: 'center', gap: 12 },
});
