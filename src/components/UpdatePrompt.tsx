import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const FOREGROUND_CHECK_COOLDOWN_MS = 10 * 60 * 1000;
const RELEASE_METADATA_URL = 'https://pokemon-cards-frontwork.expo.app/download/release.json';
const OFFICIAL_DOWNLOAD_PAGE = 'https://pokemon-cards-frontwork.expo.app/download-apk';
const OFFICIAL_DOWNLOAD_URL = 'https://pokemon-cards-frontwork.expo.app/download-apk';
const EXPECTED_PACKAGE = 'com.frontwork.pokemoncards';

function parseVersion(value: unknown): number[] | null {
  const normalized = String(value ?? '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) return null;
  const core = normalized.split(/[+-]/, 1)[0];
  return core.split('.').map(Number);
}

function compareVersions(installed: string, required: string): number | null {
  const a = parseVersion(installed);
  const b = parseVersion(required);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Checks OTA updates silently and enforces the minimum native APK version
 * published by the official download site. The gate never redirects users to
 * EAS, GitHub, or a raw artifact URL.
 */
export function UpdatePrompt() {
  const checkingRef = useRef(false);
  const reloadingRef = useRef(false);
  const lastCheckRef = useRef(0);
  const firstBootRef = useRef(true);
  const [requiredVersion, setRequiredVersion] = useState<string | null>(null);

  const canUseUpdates = Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
  const installedVersion = String(
    Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '',
  );

  useEffect(() => {
    if (Platform.OS === 'web' || __DEV__) return;

    let disposed = false;

    const checkRequiredApk = async () => {
      try {
        const response = await fetch(`${RELEASE_METADATA_URL}?v=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;

        const release = await response.json() as {
          version?: unknown;
          packageName?: unknown;
          status?: unknown;
          downloadUrl?: unknown;
        };

        if (
          release.status !== 'ready'
          || release.packageName !== EXPECTED_PACKAGE
          || release.downloadUrl !== OFFICIAL_DOWNLOAD_URL
        ) return;

        const latestVersion = String(release.version ?? '');
        const comparison = compareVersions(installedVersion, latestVersion);
        if (disposed || comparison === null) return;

        setRequiredVersion(comparison < 0 ? latestVersion : null);
      } catch {
        // Do not lock users out when the network/site is temporarily unavailable.
        // The check runs again on the next launch or when the app returns active.
      }
    };

    void checkRequiredApk();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkRequiredApk();
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [installedVersion]);

  useEffect(() => {
    if (!canUseUpdates) return;

    let disposed = false;

    const checkAndFetch = async (reloadWhenFetched: boolean) => {
      if (checkingRef.current || reloadingRef.current) return;

      const now = Date.now();
      if (!reloadWhenFetched && now - lastCheckRef.current < FOREGROUND_CHECK_COOLDOWN_MS) return;

      checkingRef.current = true;
      lastCheckRef.current = now;

      try {
        const result = await Updates.checkForUpdateAsync();
        if (disposed || (!result.isAvailable && !result.isRollBackToEmbedded)) return;

        const fetched = await Updates.fetchUpdateAsync();
        if (disposed) return;

        if (
          reloadWhenFetched
          && (fetched.isNew || fetched.isRollBackToEmbedded)
          && AppState.currentState === 'active'
        ) {
          reloadingRef.current = true;
          await Updates.reloadAsync();
        }
      } catch (error) {
        // OTA must never block app startup. The embedded/cached bundle remains
        // usable and a future launch/foreground check will retry automatically.
        console.warn('Background OTA update failed:', error);
      } finally {
        checkingRef.current = false;
      }
    };

    const bootstrapTimer = setTimeout(() => {
      void checkAndFetch(true);
      firstBootRef.current = false;
    }, 250);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      void checkAndFetch(firstBootRef.current);
      firstBootRef.current = false;
    });

    return () => {
      disposed = true;
      clearTimeout(bootstrapTimer);
      subscription.remove();
    };
  }, [canUseUpdates]);

  const openOfficialDownloadPage = async () => {
    try {
      await Linking.openURL(OFFICIAL_DOWNLOAD_PAGE);
    } catch {
      // Keep the required-update gate in place; the only destination remains
      // the official Trainer Collection download page.
    }
  };

  return (
    <Modal
      visible={Boolean(requiredVersion)}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => null}
    >
      <View style={styles.screen}>
        <View style={styles.emblem}><Text style={styles.emblemText}>↻</Text></View>
        <Text style={styles.kicker}>TRAINER COLLECTION</Text>
        <Text style={styles.title}>Atualização obrigatória</Text>
        <Text style={styles.body}>
          Esta versão do aplicativo ficou desatualizada. Atualize para continuar jogando e manter a compatibilidade com os servidores.
        </Text>
        <View style={styles.versionCard}>
          <Text style={styles.versionLabel}>NOVA VERSÃO DISPONÍVEL</Text>
          <Text style={styles.versionValue}>v{requiredVersion ?? '—'}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { void openOfficialDownloadPage(); }} style={styles.button}>
          <Text style={styles.buttonText}>ATUALIZAR PELO SITE OFICIAL</Text>
        </Pressable>
        <Text style={styles.footer}>Abra o site oficial e baixe o APK pelo botão de download. Depois de instalar a nova versão, abra o jogo novamente.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingVertical: 32,
    backgroundColor: '#07111F',
  },
  emblem: {
    width: 78,
    height: 78,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#201B3B',
    borderWidth: 1,
    borderColor: '#9B7BFF',
  },
  emblemText: { color: '#D9B45B', fontSize: 42, fontWeight: '900' },
  kicker: { marginTop: 22, color: '#D9B45B', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 10, color: '#FFFFFF', fontSize: 27, fontWeight: '900', textAlign: 'center' },
  body: { maxWidth: 420, marginTop: 12, color: '#C4CAD5', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  versionCard: {
    width: '100%',
    maxWidth: 360,
    marginTop: 24,
    padding: 18,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#51427B',
    backgroundColor: '#101824',
  },
  versionLabel: { color: '#A9B0BF', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  versionValue: { marginTop: 6, color: '#D9B45B', fontSize: 25, fontWeight: '900' },
  button: {
    width: '100%',
    maxWidth: 360,
    minHeight: 56,
    marginTop: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9B7BFF',
  },
  buttonText: { color: '#07111F', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  footer: { maxWidth: 360, marginTop: 16, color: '#8E98A8', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
