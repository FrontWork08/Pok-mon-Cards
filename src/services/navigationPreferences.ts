import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type TrainerNavigationPreferences = {
  favorites: string[];
  recents: string[];
};

const STORAGE_KEY = 'trainer_navigation_preferences_v1';
let webMemory: TrainerNavigationPreferences = { favorites: [], recents: [] };

function sanitize(value: any): TrainerNavigationPreferences {
  const favorites = Array.isArray(value?.favorites)
    ? value.favorites.filter((item: unknown): item is string => typeof item === 'string').slice(0, 4)
    : [];
  const recents = Array.isArray(value?.recents)
    ? value.recents.filter((item: unknown): item is string => typeof item === 'string').slice(0, 5)
    : [];
  return { favorites: [...new Set(favorites)], recents: [...new Set(recents)] };
}

async function readRaw() {
  if (Platform.OS === 'web') return webMemory;
  const raw = await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null);
  if (!raw) return { favorites: [], recents: [] } as TrainerNavigationPreferences;
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return { favorites: [], recents: [] } as TrainerNavigationPreferences;
  }
}

async function writeRaw(value: TrainerNavigationPreferences) {
  const safe = sanitize(value);
  if (Platform.OS === 'web') {
    webMemory = safe;
    return safe;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(safe)).catch(() => null);
  return safe;
}

export async function getTrainerNavigationPreferences() {
  return sanitize(await readRaw());
}

export async function recordTrainerNavigationVisit(href: string) {
  const current = await getTrainerNavigationPreferences();
  return writeRaw({
    ...current,
    recents: [href, ...current.recents.filter((item) => item !== href)].slice(0, 5),
  });
}

export async function toggleTrainerNavigationFavorite(href: string) {
  const current = await getTrainerNavigationPreferences();
  const active = current.favorites.includes(href);
  const favorites = active
    ? current.favorites.filter((item) => item !== href)
    : [href, ...current.favorites.filter((item) => item !== href)].slice(0, 4);
  return writeRaw({ ...current, favorites });
}
