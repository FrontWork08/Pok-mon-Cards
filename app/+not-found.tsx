import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

const DOWNLOAD_PAGE = '/download/index.html';

export default function NotFoundScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const isDownloadAlias = pathname === '/download' || pathname === '/download/';

  useEffect(() => {
    if (!isDownloadAlias || Platform.OS !== 'web') return;
    window.location.replace(DOWNLOAD_PAGE);
  }, [isDownloadAlias]);

  if (isDownloadAlias && Platform.OS === 'web') {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Abrindo download oficial…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>TRAINER COLLECTION</Text>
      <Text style={styles.title}>Página não encontrada</Text>
      <Text style={styles.body}>
        O endereço acessado não existe ou foi movido.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/')}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>VOLTAR AO INÍCIO</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07111F',
  },
  loadingText: {
    color: '#F2C75C',
    fontSize: 16,
    fontWeight: '800',
  },
  container: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#07111F',
  },
  kicker: {
    color: '#F2C75C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: '#AAB8CC',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 22,
  },
  button: {
    minHeight: 48,
    minWidth: 190,
    borderRadius: 14,
    backgroundColor: '#E6B94F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#07111F',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});
