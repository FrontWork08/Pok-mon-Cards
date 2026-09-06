import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';

export type Pokemon3DAnimationRole = 'idle' | 'attack' | 'hit' | 'faint' | 'victory';

export type Pokemon3DModelManifest = {
  pokemon_id: number;
  form_key: string;
  storage_path: string;
  format: 'glb';
  version: number;
  sha256: string | null;
  byte_size: number | null;
  scale: number;
  offset_x: number;
  offset_y: number;
  offset_z: number;
  rotation_y: number;
  animations: Partial<Record<Pokemon3DAnimationRole, string>>;
  min_app_version: string | null;
};

export type Pokemon3DModelAsset = {
  manifest: Pokemon3DModelManifest;
  localUri: string;
  publicUrl: string;
};

const BUCKET = 'pokemon-3d';
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MANIFEST_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMITS: Record<'low' | 'medium' | 'high', number> = {
  low: 64 * 1024 * 1024,
  medium: 128 * 1024 * 1024,
  high: 224 * 1024 * 1024,
};

const manifestCache = new Map<number, { expiresAt: number; value: Pokemon3DModelManifest | null }>();
const inflight = new Map<string, Promise<Pokemon3DModelAsset | null>>();

function validPokemonId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'default';
}

function cacheRoot() {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  return base ? `${base}pokemon-3d/` : null;
}

async function ensureCacheDirectory() {
  const root = cacheRoot();
  if (!root) throw new Error('3D model cache directory is unavailable.');
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

function cacheFilename(manifest: Pokemon3DModelManifest) {
  const hash = manifest.sha256?.slice(0, 12).toLowerCase() || 'nohash';
  return `p${manifest.pokemon_id}-${safeFilePart(manifest.form_key)}-v${manifest.version}-${hash}.glb`;
}

async function getManifest(pokemonId: number) {
  const id = validPokemonId(pokemonId);
  if (!id) return null;
  const cached = manifestCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabase
    .from('pokemon_3d_models')
    .select('pokemon_id,form_key,storage_path,format,version,sha256,byte_size,scale,offset_x,offset_y,offset_z,rotation_y,animations,min_app_version')
    .eq('pokemon_id', id)
    .eq('form_key', 'default')
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    console.warn('[3D] model registry lookup failed', error.message);
    manifestCache.set(id, { expiresAt: Date.now() + 30_000, value: null });
    return null;
  }

  const manifest = data ? ({
    ...data,
    pokemon_id: Number(data.pokemon_id),
    version: Number(data.version),
    byte_size: data.byte_size == null ? null : Number(data.byte_size),
    scale: Number(data.scale ?? 1),
    offset_x: Number(data.offset_x ?? 0),
    offset_y: Number(data.offset_y ?? 0),
    offset_z: Number(data.offset_z ?? 0),
    rotation_y: Number(data.rotation_y ?? 0),
    animations: (data.animations && typeof data.animations === 'object' ? data.animations : {}) as Pokemon3DModelManifest['animations'],
  } as Pokemon3DModelManifest) : null;

  manifestCache.set(id, { expiresAt: Date.now() + MANIFEST_TTL_MS, value: manifest });
  return manifest;
}

async function trimCache(maxBytes: number, keepUri?: string) {
  const root = cacheRoot();
  if (!root) return;
  try {
    const names = await FileSystem.readDirectoryAsync(root);
    const entries = await Promise.all(names
      .filter((name) => name.endsWith('.glb'))
      .map(async (name) => {
        const uri = `${root}${name}`;
        const info = await FileSystem.getInfoAsync(uri);
        return {
          uri,
          exists: info.exists,
          size: info.exists ? Number((info as any).size ?? 0) : 0,
          modified: info.exists ? Number((info as any).modificationTime ?? 0) : 0,
        };
      }));
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= maxBytes) return;
    const removable = entries
      .filter((entry) => entry.exists && entry.uri !== keepUri)
      .sort((a, b) => a.modified - b.modified);
    for (const entry of removable) {
      if (total <= maxBytes) break;
      await FileSystem.deleteAsync(entry.uri, { idempotent: true });
      total -= entry.size;
    }
  } catch (error) {
    console.warn('[3D] cache trim skipped', error);
  }
}

async function downloadModel(manifest: Pokemon3DModelManifest, quality: 'low' | 'medium' | 'high') {
  if (manifest.format !== 'glb') return null;
  if (manifest.byte_size != null && (manifest.byte_size <= 0 || manifest.byte_size > MAX_MODEL_BYTES)) {
    console.warn('[3D] model rejected by declared size', manifest.pokemon_id, manifest.byte_size);
    return null;
  }

  const root = await ensureCacheDirectory();
  const localUri = `${root}${cacheFilename(manifest)}`;
  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists && Number((existing as any).size ?? 0) > 0) {
    return localUri;
  }

  const cleanPath = manifest.storage_path.replace(/^\/+/, '');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  const publicUrl = data.publicUrl;
  if (!publicUrl) return null;

  try {
    const result = await FileSystem.downloadAsync(publicUrl, localUri);
    const info = await FileSystem.getInfoAsync(result.uri);
    const actualBytes = info.exists ? Number((info as any).size ?? 0) : 0;
    if (!actualBytes || actualBytes > MAX_MODEL_BYTES) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      console.warn('[3D] downloaded model rejected by size', manifest.pokemon_id, actualBytes);
      return null;
    }
    if (manifest.byte_size != null && actualBytes !== manifest.byte_size) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      console.warn('[3D] downloaded model size does not match registry', manifest.pokemon_id);
      return null;
    }
    await trimCache(CACHE_LIMITS[quality], localUri);
    return localUri;
  } catch (error) {
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    console.warn('[3D] model download failed', manifest.pokemon_id, error);
    return null;
  }
}

export async function resolvePokemon3DModel(
  pokemonId: unknown,
  quality: 'low' | 'medium' | 'high' = 'medium',
): Promise<Pokemon3DModelAsset | null> {
  const id = validPokemonId(pokemonId);
  if (!id) return null;
  const manifest = await getManifest(id);
  if (!manifest) return null;
  const cleanPath = manifest.storage_path.replace(/^\/+/, '');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  if (!data.publicUrl) return null;

  const key = `${id}:${manifest.form_key}:${manifest.version}:${manifest.sha256 ?? ''}:${quality}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const localUri = await downloadModel(manifest, quality);
    return localUri ? { manifest, localUri, publicUrl: data.publicUrl } : null;
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export async function readPokemon3DModelArrayBuffer(localUri: string) {
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const decoder = (globalThis as any).atob as ((value: string) => string) | undefined;
  if (!decoder) throw new Error('Base64 decoder is unavailable in this runtime.');
  const binary = decoder(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function invalidatePokemon3DManifest(pokemonId?: unknown) {
  const id = validPokemonId(pokemonId);
  if (id) manifestCache.delete(id);
  else manifestCache.clear();
}
