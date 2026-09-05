import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { clearPendingPasswordRecovery, completeOAuthFromUrl, getCurrentSession, isPasswordRecoveryUrl, isPendingPasswordRecoveryFor } from '@/services/auth';
import { initialWebAuthUrl } from '@/lib/supabase';
import { useAppTheme } from '@/theme/ThemeProvider';

export default function AuthCallbackScreen() {
  const { colors } = useAppTheme();
  const [message, setMessage] = useState('Confirmando acesso seguro…');

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const url = Platform.OS === 'web' ? initialWebAuthUrl : await Linking.getInitialURL();
        let session = Platform.OS === 'web' ? await getCurrentSession() : (url ? await completeOAuthFromUrl(url) : null);
        if (!session) session = await getCurrentSession();
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
