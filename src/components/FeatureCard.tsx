import { StyleSheet, Text, View } from 'react-native';

export function FeatureCard({ title, value, description }: { title: string; value?: string; description: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#141925', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#252c3d', gap: 7 },
  title: { color: '#f6c945', fontSize: 15, fontWeight: '800' },
  value: { color: '#fff', fontSize: 25, fontWeight: '900' },
  description: { color: '#a4adbf', lineHeight: 20 },
});
