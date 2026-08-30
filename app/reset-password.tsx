import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PremiumBackground } from '@/components/PremiumBackground';
import { clearPendingPasswordRecovery, getCurrentSession, signOut, updateRecoveredPassword } from '@/services/auth';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function ResetPasswordScreen() {
  const { colors, isLight } = useAppTheme();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentSession()
      .then((session) => {
        if (!mounted) return;
        setSessionReady(Boolean(session?.user));
      })
      .catch(() => {
        if (mounted) setSessionReady(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });
    return () => { mounted = false; };
  }, []);

  async function savePassword() {
    if (saving) return;
    if (password.length < 6) {
      Alert.alert('Nova senha', 'Use pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Nova senha', 'As duas senhas precisam ser iguais.');
      return;
    }

    try {
      setSaving(true);
      await updateRecoveredPassword(password);
      // The native recovery marker is only a routing fallback. Once the new
      // password is committed, it must be removed before the next normal login
      // or the account can be mistaken for a recovery session again.
      await clearPendingPasswordRecovery();
      await signOut();
      Alert.alert('Senha alterada', 'Sua senha foi atualizada. Entre novamente com a nova senha.');
      router.replace('/login');
    } catch (error) {
      Alert.alert('Nova senha', error instanceof Error ? error.message : 'Não foi possível atualizar sua senha.');
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <SafeAreaView style={[styles.loading, { backgroundColor: colors.bg }]}>
        <PremiumBackground />
        <ActivityIndicator size="large" color={colors.yellow} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Validando o link de recuperação...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <PremiumBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { backgroundColor: isLight ? 'rgba(255,255,255,.95)' : colors.surface, borderColor: colors.border }]}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="key" size={30} color={colors.yellow} />
            </View>

            <Text style={[styles.kicker, { color: colors.yellow }]}>RECUPERAÇÃO DE CONTA</Text>
            <Text style={[styles.title, { color: colors.text }]}>Crie uma nova senha</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              O link de recuperação confirma sua identidade temporariamente. Depois de salvar, você precisará entrar de novo.
            </Text>

            {!sessionReady ? (
              <View style={[styles.errorBox, { backgroundColor: colors.surfaceAlt, borderColor: '#C96B7A' }]}>
                <Ionicons name="alert-circle" size={19} color="#FF8290" />
                <View style={styles.errorCopy}>
                  <Text style={[styles.errorTitle, { color: colors.text }]}>Link inválido ou expirado</Text>
                  <Text style={[styles.errorText, { color: colors.muted }]}>
                    Solicite um novo e-mail de recuperação na tela de login.
                  </Text>
                </View>
                <Pressable onPress={() => router.replace('/login')} style={[styles.backButton, { borderColor: colors.border }]}>
                  <Text style={[styles.backText, { color: colors.accent }]}>VOLTAR</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <PasswordField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Nova senha"
                />
                <PasswordField
                  value={confirmation}
                  onChangeText={setConfirmation}
                  placeholder="Confirmar nova senha"
                />

                <View style={[styles.securityNote, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.green} />
                  <Text style={[styles.securityText, { color: colors.muted }]}>
                    Nunca envie sua senha por chat. A Trainer Collection só pede a nova senha nesta tela de recuperação.
                  </Text>
                </View>

                <Pressable
                  disabled={saving}
                  onPress={() => { void savePassword(); }}
                  style={[styles.primary, { backgroundColor: colors.yellow, opacity: saving ? .65 : 1 }]}
                >
                  {saving ? <ActivityIndicator size="small" color="#07111F" /> : <Ionicons name="lock-closed" size={18} color="#07111F" />}
                  <Text style={styles.primaryText}>{saving ? 'SALVANDO...' : 'SALVAR NOVA SENHA'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.inputWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        style={[styles.input, { color: colors.text }]}
      />
      <Pressable accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisible((current) => !current)}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, overflow: 'hidden' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, overflow: 'hidden' },
  loadingText: { fontSize: 11, fontWeight: '800' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 500, alignSelf: 'center', borderWidth: 1, borderRadius: 30, padding: 22, gap: 12 },
  icon: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3, textAlign: 'center', marginTop: 2 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginBottom: 5 },
  inputWrap: { minHeight: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, minHeight: 52, fontSize: 13, paddingVertical: 0 },
  securityNote: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  securityText: { flex: 1, fontSize: 9, lineHeight: 14 },
  primary: { minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#07111F', fontSize: 10, fontWeight: '900', letterSpacing: .5 },
  errorBox: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorCopy: { flex: 1, minWidth: 0 },
  errorTitle: { fontSize: 11, fontWeight: '900' },
  errorText: { fontSize: 9, lineHeight: 14, marginTop: 2 },
  backButton: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 8, fontWeight: '900' },
});
