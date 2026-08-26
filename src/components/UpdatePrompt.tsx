import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';

const FOREGROUND_CHECK_COOLDOWN_MS = 10 * 60 * 1000;

type UpdateState = 'idle' | 'available' | 'downloading' | 'error';

export function UpdatePrompt() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<UpdateState>('idle');
  const [dismissed, setDismissed] = useState(false);
  const [errorText, setErrorText] = useState('');
  const checkingRef = useRef(false);
  const lastCheckRef = useRef(0);

  const canUseUpdates = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;

  const checkForUpdate = useCallback(async (force = false) => {
    if (!canUseUpdates || checkingRef.current || dismissed || state === 'downloading') return;

    const now = Date.now();
    if (!force && now - lastCheckRef.current < FOREGROUND_CHECK_COOLDOWN_MS) return;

    checkingRef.current = true;
    lastCheckRef.current = now;

    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setErrorText('');
        setState('available');
      }
    } catch (error) {
      // Update checks should never block the game. We only surface an error
      // after the player has explicitly tried to install an available update.
      console.warn('OTA update check failed:', error);
    } finally {
      checkingRef.current = false;
    }
  }, [canUseUpdates, dismissed, state]);

  useEffect(() => {
    if (!canUseUpdates) return;

    const timer = setTimeout(() => {
      checkForUpdate(true).catch(() => null);
    }, 1800);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkForUpdate(false).catch(() => null);
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [canUseUpdates, checkForUpdate]);

  async function installUpdate() {
    if (!canUseUpdates || state === 'downloading') return;

    try {
      setErrorText('');
      setState('downloading');
      const result = await Updates.fetchUpdateAsync();

      if (!result.isNew && !result.isRollBackToEmbedded) {
        setState('idle');
        return;
      }

      await Updates.reloadAsync();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Não foi possível instalar a atualização agora.');
      setState('error');
    }
  }

  function dismiss() {
    setDismissed(true);
    setState('idle');
    setErrorText('');
  }

  if (!canUseUpdates || state === 'idle') return null;

  const downloading = state === 'downloading';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!downloading) dismiss();
      }}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="cloud-download-outline" size={28} color={colors.yellow} />
          </View>

          <Text style={[styles.eyebrow, { color: colors.yellow }]}>ATUALIZAÇÃO DISPONÍVEL</Text>
          <Text style={[styles.title, { color: colors.text }]}>Tem novidade no Pokémon Cards.</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Baixe a versão mais recente agora. O app vai reiniciar automaticamente quando terminar.
          </Text>

          {state === 'error' ? (
            <View style={[styles.errorBox, { borderColor: colors.red }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={[styles.errorText, { color: colors.text }]} numberOfLines={3}>
                {errorText || 'Não foi possível atualizar agora.'}
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={downloading}
            onPress={installUpdate}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.yellow,
                opacity: pressed || downloading ? 0.82 : 1,
              },
            ]}
          >
            {downloading ? (
              <>
                <ActivityIndicator size="small" color="#080808" />
                <Text style={styles.primaryText}>BAIXANDO ATUALIZAÇÃO…</Text>
              </>
            ) : (
              <>
                <Ionicons name="download-outline" size={19} color="#080808" />
                <Text style={styles.primaryText}>
                  {state === 'error' ? 'TENTAR NOVAMENTE' : 'BAIXAR E REINICIAR'}
                </Text>
              </>
            )}
          </Pressable>

          {!downloading ? (
            <Pressable onPress={dismiss} style={styles.laterButton}>
              <Text style={[styles.laterText, { color: colors.muted }]}>DEPOIS</Text>
            </Pressable>
          ) : (
            <Text style={[styles.waitText, { color: colors.muted }]}>Não feche o app durante o download.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,.66)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 20,
    minHeight: 330,
    alignItems: 'stretch',
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
    marginTop: 14,
  },
  title: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  errorBox: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    marginTop: 20,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#080808',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: .5,
  },
  laterButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  laterText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: .8,
  },
  waitText: {
    textAlign: 'center',
    fontSize: 10,
    marginTop: 12,
  },
});
