from pathlib import Path
import json

ROOT = Path('.')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Anchor not found for {label}: {old[:120]!r}')
    return text.replace(old, new, 1)

# ---- app.json native config -------------------------------------------------
app_path = ROOT / 'app.json'
app = json.loads(app_path.read_text())
expo = app['expo']
expo['version'] = '1.1.0'

plugins = expo.setdefault('plugins', [])
new_plugins = []
for plugin in plugins:
    key = plugin[0] if isinstance(plugin, list) else plugin
    if key in ('expo-notifications', 'expo-local-authentication', 'expo-quick-actions'):
        continue
    new_plugins.append(plugin)
new_plugins.extend([
    [
        'expo-notifications',
        {
            'icon': './assets/notification-icon.png',
            'color': '#D9B45B',
            'defaultChannel': 'default_v11',
            'sounds': [
                './assets/sounds/tc_default.wav',
                './assets/sounds/tc_battle.wav',
                './assets/sounds/tc_social.wav',
                './assets/sounds/tc_trade.wav',
            ],
        },
    ],
    [
        'expo-local-authentication',
        {
            'faceIDPermission': 'A Trainer Collection usa a biometria somente para desbloquear sua conta neste aparelho.',
        },
    ],
    'expo-quick-actions',
])
expo['plugins'] = new_plugins

android = expo.setdefault('android', {})
android['intentFilters'] = [
    {
        'action': 'VIEW',
        'autoVerify': True,
        'data': [
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/auth/callback'},
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/battle/'},
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/player/'},
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/trade/'},
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/chat/'},
            {'scheme': 'https', 'host': 'pokemon-cards-frontwork.expo.app', 'pathPrefix': '/friend-qr'},
        ],
        'category': ['BROWSABLE', 'DEFAULT'],
    }
]
app_path.write_text(json.dumps(app, ensure_ascii=False, indent=2) + '\n')

# ---- auth: HTTPS App Link callback with custom-scheme fallback -------------
auth_path = ROOT / 'src/services/auth.ts'
auth = auth_path.read_text()
auth = replace_once(
    auth,
    "export const GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback';\n",
    "export const APP_LINK_ORIGIN = 'https://pokemon-cards-frontwork.expo.app';\n"
    "export const APP_LINK_AUTH_CALLBACK = `${APP_LINK_ORIGIN}/auth/callback`;\n"
    "export const GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback';\n",
    'auth app-link constants',
)
auth = replace_once(
    auth,
    "  return GOOGLE_OAUTH_REDIRECT;\n}\n\nfunction authErrorMessage",
    "  return APP_LINK_AUTH_CALLBACK;\n}\n\nfunction authErrorMessage",
    'auth native redirect',
)
auth = replace_once(
    auth,
    "  return url.startsWith(GOOGLE_OAUTH_REDIRECT) || url.includes('access_token=') || url.includes('refresh_token=') || url.includes('code=');",
    "  return url.startsWith(GOOGLE_OAUTH_REDIRECT) || url.startsWith(APP_LINK_AUTH_CALLBACK) || url.includes('access_token=') || url.includes('refresh_token=') || url.includes('code=');",
    'oauth callback recognition',
)
auth = replace_once(
    auth,
    "  // Reuse the callback scheme already embedded in the installed APK and\n  // already used by Auth. No new Android intent filter or APK is required.\n  return GOOGLE_OAUTH_REDIRECT;",
    "  // APK 1.1 uses the verified HTTPS App Link. The custom scheme remains\n  // accepted by isOAuthCallbackUrl for backwards-compatible old e-mails.\n  return APP_LINK_AUTH_CALLBACK;",
    'password recovery app link',
)
auth_path.write_text(auth)

# ---- notifications: v1.1 channels, custom sounds, actions, app version ----
notifications_path = ROOT / 'src/services/notifications.ts'
notifications = notifications_path.read_text()
notifications = notifications.replace("setNotificationChannelAsync('default',", "setNotificationChannelAsync('default_v11',")
notifications = notifications.replace("setNotificationChannelAsync('battles',", "setNotificationChannelAsync('battles_v11',")
notifications = notifications.replace("setNotificationChannelAsync('social',", "setNotificationChannelAsync('social_v11',")
notifications = notifications.replace("setNotificationChannelAsync('trades',", "setNotificationChannelAsync('trades_v11',")
# Replace sounds in channel order, guarded by distinctive descriptions.
notifications = notifications.replace("description: 'Avisos gerais da sua conta Trainer Collection.',\n        importance: Notifications.AndroidImportance.HIGH,\n        vibrationPattern: [0, 180, 90, 180],\n        sound: 'default',",
                                      "description: 'Avisos gerais da sua conta Trainer Collection.',\n        importance: Notifications.AndroidImportance.HIGH,\n        vibrationPattern: [0, 180, 90, 180],\n        sound: 'tc_default.wav',")
notifications = notifications.replace("description: 'Desafios, matchmaking e resultados de batalha.',\n        importance: Notifications.AndroidImportance.HIGH,\n        vibrationPattern: [0, 220, 100, 220],\n        sound: 'default',",
                                      "description: 'Desafios, matchmaking e resultados de batalha.',\n        importance: Notifications.AndroidImportance.HIGH,\n        vibrationPattern: [0, 220, 100, 220],\n        sound: 'tc_battle.wav',")
notifications = notifications.replace("description: 'Mensagens, amizades e atividades da guilda.',\n        importance: Notifications.AndroidImportance.DEFAULT,\n        vibrationPattern: [0, 160],\n        sound: 'default',",
                                      "description: 'Mensagens, amizades e atividades da guilda.',\n        importance: Notifications.AndroidImportance.DEFAULT,\n        vibrationPattern: [0, 160],\n        sound: 'tc_social.wav',")
notifications = notifications.replace("description: 'Ofertas, trocas e movimentações do mercado.',\n        importance: Notifications.AndroidImportance.DEFAULT,\n        vibrationPattern: [0, 160],\n        sound: 'default',",
                                      "description: 'Ofertas, trocas e movimentações do mercado.',\n        importance: Notifications.AndroidImportance.DEFAULT,\n        vibrationPattern: [0, 160],\n        sound: 'tc_trade.wav',")
category_anchor = "  const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra as any)?.eas?.projectId;\n"
category_block = "  await Promise.all([\n    Notifications.setNotificationCategoryAsync('tc_battle', [\n      { identifier: 'tc_open_battle', buttonTitle: 'ABRIR BATALHA', options: { opensAppToForeground: true } },\n    ]),\n    Notifications.setNotificationCategoryAsync('tc_social', [\n      { identifier: 'tc_open_social', buttonTitle: 'ABRIR CONVERSA', options: { opensAppToForeground: true } },\n    ]),\n    Notifications.setNotificationCategoryAsync('tc_trade', [\n      { identifier: 'tc_open_trade', buttonTitle: 'VER TROCA / MERCADO', options: { opensAppToForeground: true } },\n    ]),\n  ]);\n\n" + category_anchor
notifications = replace_once(notifications, category_anchor, category_block, 'notification categories')
notifications = replace_once(
    notifications,
    "    platform: Platform.OS,\n    enabled: true,",
    "    platform: Platform.OS,\n    app_version: Constants.expoConfig?.version ?? null,\n    enabled: true,",
    'push token native version',
)
notifications_path.write_text(notifications)

# ---- security service -------------------------------------------------------
(ROOT / 'src/services/deviceSecurity.ts').write_text(r'''import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const DEVICE_LOCK_KEY = 'trainer_collection_device_lock_v1';

export type DeviceSecurityCapability = {
  available: boolean;
  hardware: boolean;
  enrolled: boolean;
  types: string[];
};

export async function isDeviceLockEnabled() {
  if (Platform.OS === 'web') return false;
  return (await SecureStore.getItemAsync(DEVICE_LOCK_KEY).catch(() => null)) === '1';
}

export async function getDeviceSecurityCapability(): Promise<DeviceSecurityCapability> {
  if (Platform.OS === 'web') return { available: false, hardware: false, enrolled: false, types: [] };
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const [hardware, enrolled, supported] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const labels = supported.map((type) => {
      if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) return 'Impressão digital';
      if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) return 'Reconhecimento facial';
      if (type === LocalAuthentication.AuthenticationType.IRIS) return 'Íris';
      return 'Biometria';
    });
    return { available: hardware && enrolled, hardware, enrolled, types: labels };
  } catch {
    return { available: false, hardware: false, enrolled: false, types: [] };
  }
}

async function promptDeviceOwner(promptMessage: string) {
  if (Platform.OS === 'web') return false;
  const LocalAuthentication = await import('expo-local-authentication');
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar código do aparelho',
    disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong',
  });
  return result.success;
}

export async function authenticateDeviceOwner(promptMessage = 'Desbloquear Trainer Collection') {
  if (!(await isDeviceLockEnabled())) return true;
  const capability = await getDeviceSecurityCapability();
  if (!capability.available) return false;
  return promptDeviceOwner(promptMessage);
}

export async function setDeviceLockEnabled(enabled: boolean) {
  if (Platform.OS === 'web') throw new Error('A proteção do aparelho está disponível somente no aplicativo.');
  const current = await isDeviceLockEnabled();
  if (enabled) {
    const capability = await getDeviceSecurityCapability();
    if (!capability.hardware) throw new Error('Este aparelho não possui biometria compatível.');
    if (!capability.enrolled) throw new Error('Cadastre uma biometria nas configurações do Android antes de ativar.');
    const ok = await promptDeviceOwner('Ativar proteção da Trainer Collection');
    if (!ok) throw new Error('A ativação não foi confirmada.');
    await SecureStore.setItemAsync(DEVICE_LOCK_KEY, '1');
    return true;
  }
  if (current) {
    const ok = await promptDeviceOwner('Desativar proteção da Trainer Collection');
    if (!ok) throw new Error('A desativação não foi confirmada.');
  }
  await SecureStore.deleteItemAsync(DEVICE_LOCK_KEY).catch(() => null);
  return false;
}
''')

# ---- global biometric/device gate ------------------------------------------
(ROOT / 'src/components/DeviceSecurityGate.tsx').write_text(r'''import { useCallback, useEffect, useRef, useState } from 'react';
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
''')

# ---- security settings screen ----------------------------------------------
(ROOT / 'app/security.tsx').write_text(r'''import { useCallback, useState } from 'react';
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
''')

# ---- quick actions bootstrap ------------------------------------------------
(ROOT / 'src/components/NativeQuickActionsBootstrap.tsx').write_text(r'''import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';

const SHORTCUTS = [
  { id: 'bag', title: 'Abrir Bag', params: { href: '/(tabs)/bag' } },
  { id: 'packs', title: 'Abrir Packs', params: { href: '/(tabs)/packs' } },
  { id: 'battles', title: 'Ir para Batalhas', params: { href: '/(tabs)/battles' } },
  { id: 'profile', title: 'Meu Trainer', params: { href: '/(tabs)/profile' } },
] as const;

const ALLOWED = new Set(SHORTCUTS.map((item) => item.params.href));

export function NativeQuickActionsBootstrap({ userId }: { userId?: string | null }) {
  const router = useRouter();
  const handledInitial = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let remove: (() => void) | null = null;

    void import('expo-quick-actions').then(async (QuickActions) => {
      if (disposed) return;
      if (!userId) {
        await QuickActions.setItems([]).catch(() => null);
        return;
      }
      const supported = await QuickActions.isSupported().catch(() => false);
      if (!supported || disposed) return;
      await QuickActions.setItems([...SHORTCUTS]).catch(() => null);

      const open = (action: any) => {
        const href = String(action?.params?.href ?? '');
        if (!ALLOWED.has(href as any)) return;
        router.push(href as never);
      };
      if (!handledInitial.current && QuickActions.initial) {
        handledInitial.current = true;
        setTimeout(() => { if (!disposed) open(QuickActions.initial); }, 100);
      }
      const subscription = QuickActions.addListener(open);
      remove = () => subscription.remove();
    }).catch(() => null);

    return () => {
      disposed = true;
      remove?.();
    };
  }, [router, userId]);

  return null;
}
''')

# ---- auth callback route ----------------------------------------------------
(ROOT / 'app/auth').mkdir(parents=True, exist_ok=True)
(ROOT / 'app/auth/callback.tsx').write_text(r'''import { useEffect, useState } from 'react';
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
''')

# ---- root layout: bootstrap native features --------------------------------
layout_path = ROOT / 'app/_layout.tsx'
layout = layout_path.read_text()
layout = replace_once(layout, "import { WebPwaBootstrap } from '@/components/WebPwaBootstrap';\n",
                      "import { WebPwaBootstrap } from '@/components/WebPwaBootstrap';\nimport { DeviceSecurityGate } from '@/components/DeviceSecurityGate';\nimport { NativeQuickActionsBootstrap } from '@/components/NativeQuickActionsBootstrap';\n", 'layout imports')
layout = replace_once(layout, "      <ReleaseCampaignNotice />\n",
                      "      <ReleaseCampaignNotice />\n      <NativeQuickActionsBootstrap userId={userId} />\n      <DeviceSecurityGate enabled={Boolean(userId) && !publicAuthRoute} />\n", 'layout native bootstraps')
layout_path.write_text(layout)

# ---- profile link + visible version ----------------------------------------
profile_path = ROOT / 'app/(tabs)/profile.tsx'
profile = profile_path.read_text().replace('TRAINER CARD • 1.0', 'TRAINER CARD • 1.1')
profile = replace_once(profile,
    "      <FeatureLink icon=\"color-palette\" color={colors.accent} title=\"Personalização\" text=\"Modo claro/escuro, temas, push, som e vibração.\" onPress={() => router.push('/settings')} />\n",
    "      <FeatureLink icon=\"color-palette\" color={colors.accent} title=\"Personalização\" text=\"Modo claro/escuro, temas, push, som e vibração.\" onPress={() => router.push('/settings')} />\n      <FeatureLink icon=\"shield-checkmark\" color={colors.yellow} title=\"Segurança do aparelho\" text=\"Biometria e PIN/código do Android para proteger sua sessão.\" onPress={() => router.push('/security')} />\n",
    'profile security link')
profile_path.write_text(profile)

login_path = ROOT / 'app/login.tsx'
login = login_path.read_text().replace('VERSÃO 1.0', 'VERSÃO 1.1')
login_path.write_text(login)

# ---- Android verified App Links association --------------------------------
well_known = ROOT / 'public/.well-known'
well_known.mkdir(parents=True, exist_ok=True)
(well_known / 'assetlinks.json').write_text(json.dumps([
    {
        'relation': ['delegate_permission/common.handle_all_urls'],
        'target': {
            'namespace': 'android_app',
            'package_name': 'com.frontwork.pokemoncards',
            'sha256_cert_fingerprints': ['7B:4E:00:52:F1:BD:F0:7E:0C:33:AB:C4:17:6D:E9:6F:9C:F7:A6:4A:8F:32:5A:E7:C5:DC:BB:20:83:CC:28:43'],
        },
    }
], indent=2) + '\n')

# ---- Native release regression audit ---------------------------------------
audit_path = ROOT / 'scripts/native-11-audit.mjs'
audit_path.write_text(r'''import { existsSync, readFileSync, statSync } from 'node:fs';
const fail = [];
const assert = (ok, msg) => { if (!ok) fail.push(msg); };
const app = JSON.parse(readFileSync('app.json','utf8'));
const pkg = JSON.parse(readFileSync('package.json','utf8'));
const expo = app.expo ?? {};
assert(expo.version === '1.1.0', 'app version must be 1.1.0');
assert(pkg.dependencies?.['expo-local-authentication'], 'expo-local-authentication missing');
assert(pkg.dependencies?.['expo-quick-actions'], 'expo-quick-actions missing');
const plugin = (name) => (expo.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] : p) === name);
assert(Boolean(plugin('expo-local-authentication')), 'local authentication config plugin missing');
assert(Boolean(plugin('expo-quick-actions')), 'quick actions config plugin missing');
const notifications = plugin('expo-notifications');
const notificationConfig = Array.isArray(notifications) ? notifications[1] : null;
for (const sound of ['tc_default.wav','tc_battle.wav','tc_social.wav','tc_trade.wav']) {
  const path = `assets/sounds/${sound}`;
  assert(existsSync(path) && statSync(path).size > 1000, `native notification sound missing: ${sound}`);
  assert(notificationConfig?.sounds?.some((item) => String(item).endsWith(sound)), `notification plugin does not bundle ${sound}`);
}
assert(notificationConfig?.defaultChannel === 'default_v11', 'v1.1 default notification channel missing');
const filters = expo.android?.intentFilters ?? [];
const verified = filters.find((f) => f.autoVerify === true && (f.data ?? []).some((d) => d.host === 'pokemon-cards-frontwork.expo.app' && d.pathPrefix === '/auth/callback'));
assert(Boolean(verified), 'verified Android App Link for auth callback missing');
const assetlinks = JSON.parse(readFileSync('public/.well-known/assetlinks.json','utf8'));
const target = assetlinks?.[0]?.target;
assert(target?.package_name === 'com.frontwork.pokemoncards', 'assetlinks package mismatch');
assert(target?.sha256_cert_fingerprints?.includes('7B:4E:00:52:F1:BD:F0:7E:0C:33:AB:C4:17:6D:E9:6F:9C:F7:A6:4A:8F:32:5A:E7:C5:DC:BB:20:83:CC:28:43'), 'assetlinks signer fingerprint mismatch');
const auth = readFileSync('src/services/auth.ts','utf8');
assert(auth.includes('APP_LINK_AUTH_CALLBACK') && auth.includes('https://pokemon-cards-frontwork.expo.app'), 'auth does not use verified HTTPS callback');
const n = readFileSync('src/services/notifications.ts','utf8');
for (const id of ['default_v11','battles_v11','social_v11','trades_v11','tc_battle','tc_social','tc_trade']) assert(n.includes(id), `notification native contract missing ${id}`);
const layout = readFileSync('app/_layout.tsx','utf8');
assert(layout.includes('DeviceSecurityGate') && layout.includes('NativeQuickActionsBootstrap'), 'root native bootstraps missing');
assert(existsSync('app/security.tsx') && existsSync('src/services/deviceSecurity.ts'), 'device security UI/service missing');
assert(existsSync('src/components/NativeQuickActionsBootstrap.tsx'), 'quick actions bootstrap missing');
if (fail.length) { console.error(fail.map((x) => `- ${x}`).join('\n')); process.exit(1); }
console.log('Trainer Collection 1.1 native contracts: OK');
''')

# package version + permanent audit hook. Dependencies are installed by workflow.
pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text())
pkg['version'] = '1.1.0'
verify = pkg['scripts']['verify']
if 'native-11-audit.mjs' not in verify:
    pkg['scripts']['verify'] = verify + ' && node scripts/native-11-audit.mjs'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')

print('Trainer Collection 1.1 native patch applied.')
