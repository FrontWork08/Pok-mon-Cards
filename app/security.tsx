import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { getDeviceSecurityCapability, isDeviceLockEnabled, setDeviceLockEnabled } from '@/services/deviceSecurity';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function SecurityScreen() {
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [capability, setCapability] = useState({ available: false, hardware: false, enrolled: false, types: [] as string[] });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }
    const [status, active] = await Promise.all([getDeviceSecurityCapability(), isDeviceLockEnabled()]);
    setCapability(status);
    setEnabled(active);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function toggle() {
    if (saving || Platform.OS === 'web') return;
    setSaving(true);
    setMessage('');
    try {
      const next = await setDeviceLockEnabled(!enabled);
      setEnabled(next);
      setMessage(next ? 'Proteção ativada. O app será bloqueado após 30 segundos fora dele.' : 'Proteção desativada neste aparelho.');
      const status = await getDeviceSecurityCapability();
      setCapability(status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar a proteção.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Segurança do aparelho" subtitle="Proteja sua sessão sem guardar sua senha.">
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: enabled ? colors.yellow : colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="finger-print" size={34} color={enabled ? colors.yellow : colors.accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>Biometria + desbloqueio do aparelho</Text>
          <Text style={[styles.text, { color: colors.muted }]}>
            Quando ativado, a Trainer Collection pede sua biometria ao abrir e depois de 30 segundos em segundo plano. O Android pode oferecer PIN/código seguro como fallback.
          </Text>
        </View>
        {loading ? <ActivityIndicator color={colors.yellow} /> : (
          <View style={[styles.status, { backgroundColor: enabled ? colors.accentSoft : colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[styles.statusText, { color: enabled ? colors.yellow : colors.muted }]}>{enabled ? 'ATIVADO' : 'DESATIVADO'}</Text>
          </View>
        )}
      </View>

      <View style={[styles.info, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.infoTitle, { color: colors.text }]}>Neste aparelho</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>Hardware: {capability.hardware ? 'disponível' : 'não detectado'}</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>Biometria cadastrada: {capability.enrolled ? 'sim' : 'não'}</Text>
        <Text style={[styles.infoText, { color: colors.muted }]}>Métodos: {capability.types.length ? capability.types.join(', ') : 'nenhum detectado'}</Text>
      </View>

      {Platform.OS === 'web' ? <Text style={[styles.message, { color: colors.muted }]}>Abra esta opção pelo APK Android para configurar a biometria.</Text> : null}
      {message ? <Text style={[styles.message, { color: colors.text }]}>{message}</Text> : null}

      <Pressable disabled={loading || saving || Platform.OS === 'web'} onPress={() => { void toggle(); }} style={[styles.button, { backgroundColor: enabled ? colors.surfaceAlt : colors.yellow, borderColor: enabled ? colors.border : colors.yellow, opacity: saving ? .6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color={enabled ? colors.text : '#07111F'} /> : <Ionicons name={enabled ? 'lock-open-outline' : 'shield-checkmark-outline'} size={20} color={enabled ? colors.text : '#07111F'} />}
        <Text style={[styles.buttonText, { color: enabled ? colors.text : '#07111F' }]}>{saving ? 'CONFIRMANDO…' : enabled ? 'DESATIVAR PROTEÇÃO' : 'ATIVAR PROTEÇÃO'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: 18, gap: 12 },
  icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 6 },
  title: { fontSize: 18, fontWeight: '900' },
  text: { fontSize: 12, lineHeight: 19 },
  status: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: .8 },
  info: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
  infoTitle: { fontSize: 13, fontWeight: '900', marginBottom: 3 },
  infoText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  message: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontWeight: '700' },
  button: { minHeight: 54, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonText: { fontSize: 11, fontWeight: '900' },
});
