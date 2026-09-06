import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { clearPendingPasswordRecovery, completeOAuthFromUrl, getCurrentSession, isPasswordRecoveryUrl, isPendingPasswordRecoveryFor } from '@/services/auth';
import { initialWebAuthUrl } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AuthCallbackScreen() {
  const { colors } = useAppTheme();
  const [message, setMessage] = useState(Platform.OS === 'web' ? 'Confirmando acesso seguro…' : 'Abrindo Trainer Collection…');

  useEffect(() => {
    // On Android the root layout exclusively owns incoming App Links and is the
    // single writer that exchanges the PKCE code. Keeping this route passive
    // prevents two concurrent exchangeCodeForSession calls for the same callback.
    if (Platform.OS !== 'web') return;

    let disposed = false;
    void (async () => {
      try {
        const url = initialWebAuthUrl;
        let session = await getCurrentSession();
        if (!session && url) {
          try {
            session = await completeOAuthFromUrl(url);
          } catch {
            session = await getCurrentSession();
          }
        }
        if (disposed || !session?.user) throw new Error('Sessão não encontrada.');
        const recovery = isPasswordRecoveryUrl(url) || await isPendingPasswordRecoveryFor(session.user.email);
        if (recovery) {
          await clearPendingPasswordRecovery();
          router.replace('/reset-password');
        } else {
          router.replace('/(tabs)');
        }
      } catch {
        if (!disposed) {
          setMessage('Não foi possível concluir o acesso. Voltando para o login…');
          setTimeout(() => router.replace('/login'), 900);
        }
      }
    })();
    return () => { disposed = true; };
  }, []);

  return <View style={[styles.screen, { backgroundColor: colors.bg }]}><ActivityIndicator size="large" color={colors.yellow} /><Text style={[styles.text, { color: colors.text }]}>{message}</Text></View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, text: { fontSize: 13, fontWeight: '800', textAlign: 'center' } });
