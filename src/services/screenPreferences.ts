import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memory = new Map<string, unknown>();

export async function getScreenPreference<T>(key: string, fallback: T): Promise<T> {
  if (Platform.OS === 'web') return (memory.get(key) as T | undefined) ?? fallback;
  const raw = await SecureStore.getItemAsync(`screen_pref:${key}`).catch(() => null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setScreenPreference<T>(key: string, value: T) {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(`screen_pref:${key}`, JSON.stringify(value)).catch(() => null);
}
