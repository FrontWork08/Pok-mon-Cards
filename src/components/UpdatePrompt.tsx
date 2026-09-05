import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/ThemeProvider';

const REQUIRED_APK_DOWNLOAD_PAGE = 'https://pokemon-cards-frontwork.expo.app/download/';

export function UpdatePrompt() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  const [errorText, setErrorText] = useState('');

  if (Platform.OS === 'web' || __DEV__) return null;

  async function openRequiredDownload() {
    if (opening) return;

    try {
      setOpening(true);
      setErrorText('');
      const supported = await Linking.canOpenURL(REQUIRED_APK_DOWNLOAD_PAGE);
      if (!supported) throw new Error('Não foi possível abrir a página oficial de download.');
      await Linking.openURL(REQUIRED_APK_DOWNLOAD_PAGE);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Não foi possível abrir o download agora.');
    } finally {
      setOpening(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 22),
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="download-outline" size={30} color={colors.yellow} />
          </View>

          <Text style={[styles.eyebrow, { color: colors.yellow }]}>ATUALIZAÇÃO OBRIGATÓRIA</Text>
          <Text style={[styles.title, { color: colors.text }]}>Trainer Collection 1.1 é necessária.</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Esta versão 1.0.1 foi encerrada. Para continuar jogando, baixe e instale o novo APK oficial do Trainer Collection 1.1.
          </Text>

          {errorText ? (
            <View style={[styles.errorBox, { borderColor: colors.red }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={[styles.errorText, { color: colors.text }]} numberOfLines={3}>
                {errorText}
              </Text>
            </View>
          ) : null}

          <Pressable
            disabled={opening}
            onPress={openRequiredDownload}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.yellow,
                opacity: pressed || opening ? 0.82 : 1,
              },
            ]}
          >
            {opening ? (
              <ActivityIndicator size="small" color="#080808" />
            ) : (
              <Ionicons name="logo-android" size={20} color="#080808" />
            )}
            <Text style={styles.primaryText}>
              {opening ? 'ABRINDO DOWNLOAD…' : 'BAIXAR TRAINER COLLECTION 1.1'}
            </Text>
          </Pressable>

          <Text style={[styles.lockText, { color: colors.muted }]}>O APK antigo não pode continuar sem atualizar.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,.78)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 26,
    paddingHorizontal: 20,
    minHeight: 345,
    alignItems: 'stretch',
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
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
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 9,
    paddingHorizontal: 4,
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
    height: 56,
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
    letterSpacing: .4,
  },
  lockText: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 13,
  },
});
