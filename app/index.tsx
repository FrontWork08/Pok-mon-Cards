import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getCurrentSession, signIn, signInWithGoogle, signUp } from '../src/services/auth';
import { supabase } from '../src/lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentSession()
      .then((session) => {
        if (mounted && session) router.replace('/(tabs)');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.replace('/(tabs)');
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
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
      Alert.alert(mode === 'signup' ? 'Erro ao criar conta' : 'Erro ao entrar', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o login com Google.';
      Alert.alert('Google', message);
    } finally {
      setGoogleLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FFD447" />
        <Text style={styles.loadingText}>Preparando sua conta...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandMark}><Ionicons name="flash" size={24} color="#050505" /></View>
      <Text style={styles.logo}>Pokémon Cards</Text>
      <Text style={styles.subtitle}>Abra boosters, complete sua Bag e jogue com seus amigos.</Text>

      <Pressable style={[styles.googleButton, googleLoading && styles.disabled]} onPress={handleGoogle} disabled={googleLoading}>
        <View style={styles.googleMark}><Text style={styles.googleLetter}>G</Text></View>
        <Text style={styles.googleText}>{googleLoading ? 'ABRINDO GOOGLE...' : 'CONTINUAR COM GOOGLE'}</Text>
      </Pressable>

      <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>OU</Text><View style={styles.dividerLine} /></View>

      <View style={styles.switcher}>
        <Pressable style={[styles.switchButton, mode === 'login' && styles.switchActive]} onPress={() => setMode('login')}>
          <Text style={[styles.switchText, mode === 'login' && styles.switchTextActive]}>Entrar</Text>
        </Pressable>
        <Pressable style={[styles.switchButton, mode === 'signup' && styles.switchActive]} onPress={() => setMode('signup')}>
          <Text style={[styles.switchText, mode === 'signup' && styles.switchTextActive]}>Criar conta</Text>
        </Pressable>
      </View>

      {mode === 'signup' && (
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Username de treinador"
          placeholderTextColor="#747474"
          autoCapitalize="none"
          style={styles.input}
        />
      )}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="E-mail"
        placeholderTextColor="#747474"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Senha"
        placeholderTextColor="#747474"
        secureTextEntry
        style={styles.input}
      />

      <Pressable style={styles.primaryButton} onPress={submit}>
        <Ionicons name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'} size={18} color="#050505" />
        <Text style={styles.primaryText}>{mode === 'login' ? 'ENTRAR NO JOGO' : 'CRIAR TREINADOR'}</Text>
      </Pressable>

      <Text style={styles.accountHint}>Ao usar Google com o mesmo e-mail de uma conta existente, seu progresso continua na mesma conta.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingHorizontal: 24, justifyContent: 'center', alignItems: 'stretch' },
  loading: { flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#9A9A9A', fontSize: 12, fontWeight: '700' },
  brandMark: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#FFD447', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  logo: { color: '#F7F7F7', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#9A9A9A', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 26 },
  googleButton: { minHeight: 54, borderRadius: 15, backgroundColor: '#F7F7F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11, borderWidth: 1, borderColor: '#DADADA' },
  googleMark: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0' },
  googleLetter: { color: '#4285F4', fontSize: 16, fontWeight: '900' },
  googleText: { color: '#242424', fontSize: 11, fontWeight: '900', letterSpacing: .45 },
  disabled: { opacity: .6 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 19 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#252525' },
  dividerText: { color: '#666', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  switcher: { flexDirection: 'row', gap: 7, marginBottom: 15, backgroundColor: '#0D0D0D', padding: 4, borderRadius: 14, borderWidth: 1, borderColor: '#242424' },
  switchButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  switchActive: { backgroundColor: '#1A1A1A' },
  switchText: { color: '#777', fontWeight: '800' },
  switchTextActive: { color: '#F7F7F7' },
  input: { backgroundColor: '#0D0D0D', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, color: '#F7F7F7', marginBottom: 10, borderWidth: 1, borderColor: '#282828' },
  primaryButton: { backgroundColor: '#FFD447', minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  primaryText: { color: '#050505', fontWeight: '900', fontSize: 12, letterSpacing: .55 },
  accountHint: { color: '#6F6F6F', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 15, paddingHorizontal: 12 },
});
