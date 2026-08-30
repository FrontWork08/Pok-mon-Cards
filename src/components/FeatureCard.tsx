import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/theme/ThemeProvider';

export function FeatureCard({ title, value, description }: { title: string; value?: string; description: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="sparkles" size={18} color={colors.yellow} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.yellow }]}>{title}</Text>
        {value ? <Text style={[styles.value, { color: colors.text }]}>{value}</Text> : null}
        <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    gap: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, fontWeight: '900', letterSpacing: .25 },
  value: { fontSize: 24, fontWeight: '900', marginTop: 3 },
  description: { fontSize: 11, lineHeight: 17, marginTop: 4 },
});
