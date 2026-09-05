import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authenticateDeviceOwner, isDeviceLockEnabled } from '@/services/deviceSecurity';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

const RELOCK_AFTER_MS = 30_000;

export function DeviceSecurityGate({ enabled }: { enabled: boolean }) {
  const { colors } = useAppTheme();
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [message, setMessage] = useState('');
  const backgroundAt = useRef<number | null>(null);
  const disposed = useRef(false);

  const unlock = useCallback(async () => {
    if (!enabled || Platform.OS === 'web' || unlocking) return;
    setUnlocking(true);
    setMessage('');
    try {
      const ok = await authenticateDeviceOwner('Desbloquear Trainer Collection');
      if (!disposed.current && ok) setLocked(false);
      else if (!disposed.current) setMessage('Use sua biometria ou o desbloqueio seguro do aparelho para continuar.');
    } catch {
      if (!disposed.current) setMessage('Não foi possível confirmar o desbloqueio do aparelho.');
    } finally {
      if (!disposed.current) setUnlocking(false);
    }
  }, [enabled, unlocking]);

  useEffect(() => {
    disposed.current = false;
    if (!enabled || Platform.OS === 'web') {
      setLocked(false);
      return () => { disposed.current = true; };
    }
    let active = true;
    void isDeviceLockEnabled().then((isEnabled) => {
      if (!active || !isEnabled) return;
      setLocked(true);
      setTimeout(() => { void unlock(); }, 80);
    });

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundAt.current = Date.now();
        return;
      }
      if (state === 'active' && backgroundAt.current) {
        const awayFor = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (awayFor >= RELOCK_AFTER_MS) {
          void isDeviceLockEnabled().then((isEnabled) => {
            if (!active || !isEnabled) return;
            setLocked(true);
          });
        }
      }
    });
    return () => {
      active = false;
      disposed.current = true;
      sub.remove();
    };
  }, [enabled, unlock]);

  useEffect(() => {
    if (locked && enabled && !unlocking) {
      const timer = setTimeout(() => { void unlock(); }, 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [locked, enabled, unlocking, unlock]);

  if (!enabled || Platform.OS === 'web') return null;

  return (
    <Modal visible={locked} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => null}>
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark" size={42} color={colors.yellow} />
        </View>
        <Text style={[styles.kicker, { color: colors.yellow }]}>CONTA PROTEGIDA</Text>
        <Text style={[styles.title, { color: colors.text }]}>Trainer Collection bloqueada</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Confirme sua biometria. O Android pode oferecer o código/PIN seguro do aparelho como alternativa.
        </Text>
        {message ? <Text style={[styles.message, { color: colors.text }]}>{message}</Text> : null}
        <Pressable disabled={unlocking} onPress={() => { void unlock(); }} style={[styles.button, { backgroundColor: colors.yellow, opacity: unlocking ? .65 : 1 }]}>
          <Ionicons name="finger-print" size={21} color="#07111F" />
          <Text style={styles.buttonText}>{unlocking ? 'CONFIRMANDO…' : 'DESBLOQUEAR'}</Text>
        </Pressable>
        <Pressable onPress={() => { void supabase.auth.signOut(); }} style={[styles.signOut, { borderColor: colors.border }]}>
          <Text style={[styles.signOutText, { color: colors.muted }]}>SAIR DA CONTA</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  icon: { width: 86, height: 86, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { marginTop: 20, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { marginTop: 6, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  body: { maxWidth: 420, marginTop: 10, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  message: { maxWidth: 420, marginTop: 14, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  button: { marginTop: 22, minWidth: 240, minHeight: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonText: { color: '#07111F', fontSize: 12, fontWeight: '900' },
  signOut: { marginTop: 12, minWidth: 180, minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 10, fontWeight: '900' },
});
