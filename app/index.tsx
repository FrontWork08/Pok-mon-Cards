import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getCurrentSession,
  resendSignUpConfirmation,
  signIn,
  signInWithGoogle,
  signUp,
} from '../src/services/auth';
import { supabase } from '../src/lib/supabase';

type AuthNotice = {
  kind: 'info' | 'success' | 'error';
  message: string;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('A autenticação demorou demais. Verifique sua conexão e tente novamente.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [booting, setBooting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  useEffect(() => {
    let mounted = true;

    getCurrentSession()
      .then((session) => {
        if (mounted && session?.user) router.replace('/(tabs)');
      })
      .catch((error) => {
        if (mounted) {
          setNotice({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível restaurar sua sessão.',
          });
        }
      })
      .finally(() => {
        if (mounted) setBooting(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      setTimeout(() => router.replace('/(tabs)'), 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function validateCredentials() {
    if (!email.trim() || !email.includes('@')) {
      setNotice({ kind: 'error', message: 'Digite um e-mail válido.' });
      return false;
    }

    if (password.length < 6) {
      setNotice({ kind: 'error', message: 'A senha precisa ter pelo menos 6 caracteres.' });
      return false;
    }

    if (mode === 'signup' && username.trim().length < 3) {
      setNotice({ kind: 'error', message: 'O username precisa ter pelo menos 3 caracteres.' });
      return false;
    }

    return true;
  }

  async function finishPasswordLogin() {
    const result = await withTimeout(signIn(email, password));
    if (!result.session?.user) {
      throw new Error('A sessão não foi criada. Tente entrar novamente.');
    }

    setAwaitingConfirmation(false);
    setNotice({ kind: 'success', message: 'Login confirmado. Entrando no Trainer Collection...' });
    router.replace('/(tabs)');
  }

  async function submit() {
    if (!validateCredentials() || submitting) return;

    try {
      setSubmitting(true);
      setNotice(null);

      if (mode === 'signup') {
        const result = await withTimeout(signUp(email, password, username));

        if (!result.session?.user) {
          setAwaitingConfirmation(true);
          setMode('login');
          setNotice({
            kind: 'info',
            message:
              'Conta criada. Confirme o e-mail enviado para você. Depois volte a esta tela e toque em “JÁ CONFIRMEI — ENTRAR”.',
          });
          return;
        }

        setNotice({ kind: 'success', message: 'Conta criada. Entrando no jogo...' });
        router.replace('/(tabs)');
        return;
      }

      await finishPasswordLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível autenticar.';
      const needsConfirmation = message.toLowerCase().includes('confirme seu e-mail');

      if (needsConfirmation) setAwaitingConfirmation(true);

      setNotice({
        kind: needsConfirmation ? 'info' : 'error',
        message: needsConfirmation
          ? 'Seu cadastro existe, mas o e-mail ainda precisa ser confirmado. Abra o e-mail de confirmação e depois volte aqui.'
          : message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmedLogin() {
    if (!email.trim() || password.length < 6 || submitting) return;

    try {
      setSubmitting(true);
      setNotice({ kind: 'info', message: 'Verificando a confirmação do e-mail...' });
      await finishPasswordLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ainda não foi possível entrar.';
      const stillUnconfirmed = message.toLowerCase().includes('confirme seu e-mail');

      setNotice({
        kind: stillUnconfirmed ? 'info' : 'error',
        message: stillUnconfirmed
          ? 'O e-mail ainda não aparece como confirmado. Confirme pelo link recebido e tente novamente.'
          : message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email.trim() || resending) return;

    try {
      setResending(true);
      setNotice(null);
      await withTimeout(resendSignUpConfirmation(email));
      setNotice({
        kind: 'success',
        message: 'Novo e-mail de confirmação enviado. Verifique também a pasta de spam.',
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível reenviar o e-mail.',
      });
    } finally {
      setResending(false);
    }
  }

  async function handleGoogle() {
    try {
      setGoogleLoading(true);
      setNotice(null);
      await withTimeout(signInWithGoogle());
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível abrir o login com Google.',
      });
    } finally {
      setGoogleLoading(false);
    }
  }

  if (booting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#D9B24C" />
        <Text style={styles.loadingText}>Preparando sua conta...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandMark}><Ionicons name="sparkles" size={24} color="#070A12" /></View>
      <Text style={styles.logo}>Trainer Collection</Text>
      <Text style={styles.version}>VERSION 1.0</Text>
      <Text style={styles.subtitle}>Sua coleção, seus decks e suas batalhas em uma nova fase.</Text>

      {notice ? (
        <View
          style={[
            styles.notice,
            notice.kind === 'error'
              ? styles.noticeError
              : notice.kind === 'success'
                ? styles.noticeSuccess
                : styles.noticeInfo,
          ]}
        >
          <Ionicons
            name={
              notice.kind === 'error'
                ? 'alert-circle'
                : notice.kind === 'success'
                  ? 'checkmark-circle'
                  : 'information-circle'
            }
            size={19}
            color={
              notice.kind === 'error'
                ? '#FF8997'
                : notice.kind === 'success'
                  ? '#71E0B4'
                  : '#76C9FF'
            }
          />
          <Text style={styles.noticeText}>{notice.message}</Text>
        </View>
      ) : null}

      {awaitingConfirmation ? (
        <View style={styles.confirmCard}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-unread" size={26} color="#F2CF69" />
          </View>
          <Text style={styles.confirmTitle}>CONFIRME SEU E-MAIL</Text>
          <Text style={styles.confirmEmail}>{email.trim().toLowerCase()}</Text>
          <Text style={styles.confirmText}>
            O cadastro já foi criado. Depois de tocar no link recebido por e-mail, volte para esta aba da 1.0.
            Se o link abrir outra página, não tem problema.
          </Text>

          <Pressable
            disabled={submitting}
            onPress={() => { void handleConfirmedLogin(); }}
            style={[styles.primaryButton, submitting && styles.disabled]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#070A12" />
            ) : (
              <Ionicons name="log-in-outline" size={18} color="#070A12" />
            )}
            <Text style={styles.primaryText}>
              {submitting ? 'VERIFICANDO...' : 'JÁ CONFIRMEI — ENTRAR'}
            </Text>
          </Pressable>

          <Pressable
            disabled={resending}
            onPress={() => { void handleResend(); }}
            style={[styles.secondaryButton, resending && styles.disabled]}
          >
            {resending ? (
              <ActivityIndicator size="small" color="#D9B24C" />
            ) : (
              <Ionicons name="refresh" size={17} color="#D9B24C" />
            )}
            <Text style={styles.secondaryText}>
              {resending ? 'REENVIANDO...' : 'REENVIAR E-MAIL'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setAwaitingConfirmation(false);
              setNotice(null);
              setPassword('');
            }}
            style={styles.otherAccountButton}
          >
            <Text style={styles.otherAccountText}>USAR OUTRO E-MAIL</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={[styles.googleButton, googleLoading && styles.disabled]}
            onPress={() => { void handleGoogle(); }}
            disabled={googleLoading || submitting}
          >
            <View style={styles.googleMark}><Text style={styles.googleLetter}>G</Text></View>
            <Text style={styles.googleText}>{googleLoading ? 'ABRINDO GOOGLE...' : 'CONTINUAR COM GOOGLE'}</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OU</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.switcher}>
            <Pressable
              style={[styles.switchButton, mode === 'login' && styles.switchActive]}
              onPress={() => {
                setMode('login');
                setNotice(null);
              }}
            >
              <Text style={[styles.switchText, mode === 'login' && styles.switchTextActive]}>Entrar</Text>
            </Pressable>
            <Pressable
              style={[styles.switchButton, mode === 'signup' && styles.switchActive]}
              onPress={() => {
                setMode('signup');
                setNotice(null);
              }}
            >
              <Text style={[styles.switchText, mode === 'signup' && styles.switchTextActive]}>Criar conta</Text>
            </Pressable>
          </View>

          {mode === 'signup' ? (
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Username de treinador"
              placeholderTextColor="#707988"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            placeholderTextColor="#707988"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Senha"
            placeholderTextColor="#707988"
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          <Pressable
            style={[styles.primaryButton, submitting && styles.disabled]}
            onPress={() => { void submit(); }}
            disabled={submitting || googleLoading}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#070A12" />
            ) : (
              <Ionicons
                name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'}
                size={18}
                color="#070A12"
              />
            )}
            <Text style={styles.primaryText}>
              {submitting
                ? mode === 'login'
                  ? 'ENTRANDO...'
                  : 'CRIANDO CONTA...'
                : mode === 'login'
                  ? 'ENTRAR NO JOGO'
                  : 'CRIAR TREINADOR'}
            </Text>
          </Pressable>

          <Text style={styles.accountHint}>
            No cadastro por e-mail, a confirmação pode ser necessária antes do primeiro login.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070A12',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'stretch',
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  loading: {
    flex: 1,
    backgroundColor: '#070A12',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#8E98A8', fontSize: 12, fontWeight: '700' },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#D9B24C',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 13,
  },
  logo: { color: '#F7F3E6', fontSize: 34, fontWeight: '900', textAlign: 'center' },
  version: {
    color: '#D9B24C',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    textAlign: 'center',
    marginTop: 3,
  },
  subtitle: {
    color: '#8E98A8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 11,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noticeError: { backgroundColor: '#2D171C', borderColor: '#71313D' },
  noticeSuccess: { backgroundColor: '#112820', borderColor: '#27654E' },
  noticeInfo: { backgroundColor: '#122536', borderColor: '#285D80' },
  noticeText: { color: '#E9EDF4', flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  confirmCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#6D5729',
    backgroundColor: '#0E1522',
    padding: 17,
  },
  confirmIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B2415',
  },
  confirmTitle: {
    color: '#F2CF69',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: .8,
    textAlign: 'center',
    marginTop: 12,
  },
  confirmEmail: {
    color: '#F7F3E6',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  confirmText: {
    color: '#919CAC',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 9,
    marginBottom: 8,
  },
  googleButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: '#F7F7F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#DADADA',
  },
  googleMark: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleLetter: { color: '#4285F4', fontSize: 16, fontWeight: '900' },
  googleText: { color: '#2A3345', fontSize: 11, fontWeight: '900', letterSpacing: .45 },
  disabled: { opacity: .58 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#252D3A' },
  dividerText: { color: '#687384', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  switcher: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 15,
    backgroundColor: '#0D1320',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3345',
  },
  switchButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  switchActive: { backgroundColor: '#1A2231' },
  switchText: { color: '#7D8796', fontWeight: '800' },
  switchTextActive: { color: '#F7F3E6' },
  input: {
    backgroundColor: '#0D1320',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F7F3E6',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A3345',
  },
  primaryButton: {
    backgroundColor: '#D9B24C',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
  },
  primaryText: { color: '#070A12', fontWeight: '900', fontSize: 11, letterSpacing: .45 },
  secondaryButton: {
    minHeight: 49,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
    borderWidth: 1,
    borderColor: '#6D5729',
    backgroundColor: '#171710',
  },
  secondaryText: { color: '#D9B24C', fontWeight: '900', fontSize: 10, letterSpacing: .4 },
  otherAccountButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  otherAccountText: { color: '#7F8998', fontWeight: '900', fontSize: 8, letterSpacing: .7 },
  accountHint: {
    color: '#6F7988',
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
});
