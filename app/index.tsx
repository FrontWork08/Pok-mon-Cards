import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { getCurrentSession, signIn, signUp } from '../src/services/auth';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentSession()
      .then((session) => {
        if (session) router.replace('/(tabs)');
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Confira os dados', 'Use um e-mail válido e uma senha com pelo menos 6 caracteres.');
      return;
    }

    if (mode === 'signup' && username.trim().length < 3) {
      Alert.alert('Username inválido', 'O username precisa ter pelo menos 3 caracteres.');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'signup') {
        const result = await signUp(email, password, username);
        if (!result.session) {
          Alert.alert('Conta criada', 'Confirme seu e-mail para entrar, se a confirmação estiver habilitada no Supabase.');
          setMode('login');
          return;
        }
      } else {
        await signIn(email, password);
      }
      router.replace('/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível autenticar.';
      Alert.alert('Erro', message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Pokémon Cards</Text>
      <Text style={styles.subtitle}>Abra boosters, complete sua Bag e troque cards com seus amigos.</Text>

      <View style={styles.switcher}>
        <Pressable style={[styles.switchButton, mode === 'login' && styles.switchActive]} onPress={() => setMode('login')}>
          <Text style={styles.switchText}>Entrar</Text>
        </Pressable>
        <Pressable style={[styles.switchButton, mode === 'signup' && styles.switchActive]} onPress={() => setMode('signup')}>
          <Text style={styles.switchText}>Criar conta</Text>
        </Pressable>
      </View>

      {mode === 'signup' && (
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Username de treinador"
          placeholderTextColor="#7c8497"
          autoCapitalize="none"
          style={styles.input}
        />
      )}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="E-mail"
        placeholderTextColor="#7c8497"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Senha"
        placeholderTextColor="#7c8497"
        secureTextEntry
        style={styles.input}
      />

      <Pressable style={styles.primaryButton} onPress={submit}>
        <Text style={styles.primaryText}>{mode === 'login' ? 'Entrar no jogo' : 'Criar treinador'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1020', padding: 24, justifyContent: 'center' },
  loading: { flex: 1, backgroundColor: '#0b1020', alignItems: 'center', justifyContent: 'center' },
  logo: { color: '#fff', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#aab3c8', fontSize: 15, textAlign: 'center', marginTop: 10, marginBottom: 28 },
  switcher: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  switchButton: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#151c31', alignItems: 'center' },
  switchActive: { backgroundColor: '#2d6cff' },
  switchText: { color: '#fff', fontWeight: '700' },
  input: { backgroundColor: '#151c31', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', marginBottom: 12 },
  primaryButton: { backgroundColor: '#f2c94c', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#111827', fontWeight: '900', fontSize: 16 },
});
