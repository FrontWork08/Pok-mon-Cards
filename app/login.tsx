import { type ComponentProps, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentSession, isPasswordRecoveryUrl, isPendingPasswordRecoveryFor, requestPasswordReset, signIn, signInWithGoogle, signUp } from '../src/services/auth';
import { initialWebAuthUrl, supabase } from '../src/lib/supabase';
import { PremiumBackground } from '../src/components/PremiumBackground';
import { useAppTheme } from '../src/theme/ThemeProvider';
import { getThemeVisual } from '../src/theme/themeCatalog';

export default function AuthScreen() {
  const { colors, isLight, themeName } = useAppTheme();
  const visual = getThemeVisual(themeName);
  const { width } = useWindowDimensions();
  const wide = width >= 860;

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [recoverySending, setRecoverySending] = useState(false);

  useEffect(() => {
    let mounted = true;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    const openingRecovery = isPasswordRecoveryUrl(initialWebAuthUrl);

    if (openingRecovery) {
      // Supabase parses the recovery token from the URL during client startup.
      // Give it a brief moment, then fall back to the recovered session if the
      // PASSWORD_RECOVERY event was emitted before this screen subscribed.
      recoveryTimer = setTimeout(() => {
        getCurrentSession()
          .then((session) => {
            if (!mounted) return;
            if (session?.user) router.replace('/reset-password');
            else setLoading(false);
          })
          .catch(() => {
            if (mounted) setLoading(false);
          });
      }, 350);
    } else {
      getCurrentSession()
        .then((session) => {
          if (mounted && session) router.replace('/(tabs)');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(() => router.replace('/reset-password'), 0);
        return;
      }
      if (!session?.user) return;

      setTimeout(() => {
        void isPendingPasswordRecoveryFor(session.user.email)
          .then((pendingRecovery) => {
            if (pendingRecovery) router.replace('/reset-password');
            else router.replace('/(tabs)');
          })
          .catch(() => router.replace('/(tabs)'));
      }, 0);
    });

    return () => {
      mounted = false;
      if (recoveryTimer) clearTimeout(recoveryTimer);
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

  async function handleForgotPassword() {
    const address = email.trim();
    if (!address || !address.includes('@')) {
      Alert.alert('Recuperar senha', 'Digite primeiro o e-mail usado na sua conta.');
      return;
    }

    try {
      setRecoverySending(true);
      await requestPasswordReset(address);
      Alert.alert(
        'Confira seu e-mail',
        'Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.',
      );
    } catch (error) {
      Alert.alert('Recuperar senha', error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de recuperação.');
    } finally {
      setRecoverySending(false);
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
      <SafeAreaView style={[styles.loading, { backgroundColor: colors.bg }]}>
        <PremiumBackground />
        <View style={[styles.loadingMark, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Image source={require('../assets/icon.png')} resizeMode="cover" style={styles.loadingLogo} />
        </View>
        <ActivityIndicator size="large" color={colors.yellow} />
        <Text style={[styles.loadingTitle, { color: colors.text }]}>Trainer Collection</Text>
        <Text style={[styles.loadingText, { color: colors.muted }]}>Preparando sua coleção...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={[styles.shell, wide && styles.shellWide]}>
            <View
              style={[
                styles.hero,
                wide && styles.heroWide,
                { backgroundColor: colors.accentSoft, borderColor: colors.accent },
              ]}
            >
              <View style={[styles.heroGlow, { backgroundColor: colors.accent }]} />
              <Image source={{ uri: visual.image }} resizeMode="contain" style={styles.heroPokemon} />

              <View style={[styles.logoFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Image source={require('../assets/icon.png')} resizeMode="cover" style={styles.logoImage} />
              </View>

              <View style={styles.versionRow}>
                <View style={[styles.versionBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.versionDot, { backgroundColor: '#65D894' }]} />
                  <Text style={[styles.versionText, { color: colors.text }]}>VERSÃO 1.0</Text>
                </View>
                <Text style={[styles.mascotText, { color: colors.yellow }]}>{visual.mascot.toUpperCase()} THEME</Text>
              </View>

              <Text style={[styles.brand, { color: colors.text }]}>Trainer Collection</Text>
              <Text style={[styles.heroTitle, { color: colors.text }]}>Sua coleção. Seu treinador. Seu legado.</Text>
              <Text style={[styles.heroText, { color: colors.muted }]}>
                Abra boosters, monte sua Bag, acompanhe preços, batalhe e construa sua rede de treinadores em uma experiência única.
              </Text>

              <View style={styles.featureList}>
                <AuthFeature icon="albums" title="Collection Vault" text="Bag, preços, raridades e estatísticas de batalha." />
                <AuthFeature icon="cube" title="Pack Lab" text="Boosters de várias eras e aberturas registradas." />
                <AuthFeature icon="people" title="Trainer Network" text="Perfis, QR de amizade, guildas, chat e trocas." />
              </View>
            </View>

            <View
              style={[
                styles.authCard,
                wide && styles.authCardWide,
                {
                  backgroundColor: isLight ? 'rgba(255,255,255,.94)' : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.authHead}>
                <View style={[styles.authIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={mode === 'login' ? 'log-in' : 'person-add'} size={22} color={colors.yellow} />
                </View>
                <View style={styles.authHeadCopy}>
                  <Text style={[styles.authKicker, { color: colors.yellow }]}>TRAINER ACCESS</Text>
                  <Text style={[styles.authTitle, { color: colors.text }]}>
                    {mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu treinador'}
                  </Text>
                  <Text style={[styles.authSubtitle, { color: colors.muted }]}>
                    {mode === 'login' ? 'Entre para continuar sua coleção.' : 'Comece sua jornada na Trainer Collection.'}
                  </Text>
                </View>
              </View>

              <View style={[styles.switcher, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Pressable
                  style={[styles.switchButton, mode === 'login' && { backgroundColor: colors.surface, borderColor: colors.accent }]}
                  onPress={() => setMode('login')}
                >
                  <Text style={[styles.switchText, { color: mode === 'login' ? colors.text : colors.muted }]}>Entrar</Text>
                </Pressable>
                <Pressable
                  style={[styles.switchButton, mode === 'signup' && { backgroundColor: colors.surface, borderColor: colors.accent }]}
                  onPress={() => setMode('signup')}
                >
                  <Text style={[styles.switchText, { color: mode === 'signup' ? colors.text : colors.muted }]}>Criar conta</Text>
                </Pressable>
              </View>

              <Pressable
                style={[styles.googleButton, { backgroundColor: isLight ? '#FFFFFF' : colors.surfaceAlt, borderColor: colors.border }, googleLoading && styles.disabled]}
                onPress={handleGoogle}
                disabled={googleLoading}
              >
                <View style={styles.googleMark}><Text style={styles.googleLetter}>G</Text></View>
                <Text style={[styles.googleText, { color: colors.text }]}>
                  {googleLoading ? 'ABRINDO GOOGLE...' : 'CONTINUAR COM GOOGLE'}
                </Text>
              </Pressable>

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.muted }]}>OU USE E-MAIL</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              {mode === 'signup' ? (
                <AuthInput
                  icon="person-outline"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username de treinador"
                  autoCapitalize="none"
                />
              ) : null}

              <AuthInput
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                placeholder="E-mail"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <AuthInput
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder="Senha"
                secureTextEntry
              />

              {mode === 'login' ? (
                <Pressable
                  disabled={recoverySending}
                  onPress={() => { void handleForgotPassword(); }}
                  style={styles.forgotButton}
                >
                  {recoverySending ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="key-outline" size={15} color={colors.accent} />}
                  <Text style={[styles.forgotText, { color: colors.accent }]}>
                    {recoverySending ? 'ENVIANDO RECUPERAÇÃO...' : 'ESQUECI MINHA SENHA'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable style={[styles.primaryButton, { backgroundColor: colors.yellow }]} onPress={submit}>
                <Ionicons name={mode === 'login' ? 'log-in-outline' : 'person-add-outline'} size={19} color="#07111F" />
                <Text style={styles.primaryText}>{mode === 'login' ? 'ENTRAR NA TRAINER COLLECTION' : 'CRIAR TREINADOR'}</Text>
              </Pressable>

              <View style={[styles.accountNote, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                <Ionicons name="shield-checkmark" size={17} color={colors.green} />
                <Text style={[styles.accountHint, { color: colors.muted }]}>
                  Ao usar Google com o mesmo e-mail de uma conta existente, seu progresso continua na mesma conta.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthFeature({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.feature, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.featureText, { color: colors.muted }]}>{text}</Text>
      </View>
    </View>
  );
}

function AuthInput(props: ComponentProps<typeof TextInput> & { icon: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme();
  const { icon, ...inputProps } = props;
  return (
    <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, overflow: 'hidden' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, overflow: 'hidden' },
  loadingMark: { width: 84, height: 84, borderRadius: 27, borderWidth: 1, padding: 5, marginBottom: 7 },
  loadingLogo: { width: '100%', height: '100%', borderRadius: 22 },
  loadingTitle: { fontSize: 21, fontWeight: '900' },
  loadingText: { fontSize: 11, fontWeight: '700' },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 20, justifyContent: 'center' },
  shell: { width: '100%', maxWidth: 1120, alignSelf: 'center', gap: 14 },
  shellWide: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  hero: {
    minHeight: 350,
    borderRadius: 30,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  heroWide: { flex: 1.15, minHeight: 630, justifyContent: 'center', padding: 28 },
  heroGlow: { position: 'absolute', right: -100, top: -110, width: 360, height: 360, borderRadius: 999, opacity: .14 },
  heroPokemon: { position: 'absolute', right: -35, bottom: -45, width: 300, height: 355, opacity: .23, transform: [{ rotate: '7deg' }] },
  logoFrame: { width: 72, height: 72, borderRadius: 23, borderWidth: 1, padding: 4, zIndex: 2 },
  logoImage: { width: '100%', height: '100%', borderRadius: 19 },
  versionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 15, zIndex: 2 },
  versionBadge: { minHeight: 29, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  versionDot: { width: 7, height: 7, borderRadius: 999 },
  versionText: { fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  mascotText: { fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  brand: { fontSize: 13, fontWeight: '900', letterSpacing: 1.1, marginTop: 18, zIndex: 2 },
  heroTitle: { fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -.8, marginTop: 4, maxWidth: 510, zIndex: 2 },
  heroText: { fontSize: 12, lineHeight: 18, maxWidth: 500, marginTop: 8, zIndex: 2 },
  featureList: { gap: 8, marginTop: 22, maxWidth: 510, zIndex: 2 },
  feature: { minHeight: 62, borderRadius: 17, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: { fontSize: 10, fontWeight: '900' },
  featureText: { fontSize: 8, lineHeight: 12, marginTop: 2 },
  authCard: { width: '100%', borderRadius: 30, borderWidth: 1, padding: 18, gap: 12 },
  authCardWide: { flex: .85, maxWidth: 470, justifyContent: 'center', padding: 24 },
  authHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 2 },
  authIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  authHeadCopy: { flex: 1, minWidth: 0 },
  authKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  authTitle: { fontSize: 21, fontWeight: '900', marginTop: 2 },
  authSubtitle: { fontSize: 9, marginTop: 2 },
  switcher: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 15, borderWidth: 1 },
  switchButton: { flex: 1, minHeight: 39, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 10, fontWeight: '900' },
  googleButton: { minHeight: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1 },
  googleMark: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0' },
  googleLetter: { color: '#4285F4', fontSize: 16, fontWeight: '900' },
  googleText: { fontSize: 10, fontWeight: '900', letterSpacing: .35 },
  disabled: { opacity: .55 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  inputWrap: { minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, minHeight: 50, fontSize: 13, paddingVertical: 0 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
  forgotText: { fontSize: 8, fontWeight: '900', letterSpacing: .55 },
  primaryButton: { minHeight: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 2 },
  primaryText: { color: '#07111F', fontWeight: '900', fontSize: 10, letterSpacing: .45 },
  accountNote: { borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  accountHint: { flex: 1, fontSize: 8, lineHeight: 13 },
});
