import { Platform } from 'react-native';
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
