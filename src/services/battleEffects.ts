import { Platform } from 'react-native';

export type BattleSound = 'lock' | 'reveal' | 'win' | 'loss';

type Note = { frequency: number; duration: number; volume?: number };

const sequences: Record<BattleSound, Note[]> = {
  lock: [
    { frequency: 520, duration: 0.055, volume: 0.22 },
    { frequency: 760, duration: 0.07, volume: 0.26 },
  ],
  reveal: [
    { frequency: 360, duration: 0.07, volume: 0.2 },
    { frequency: 560, duration: 0.07, volume: 0.23 },
    { frequency: 840, duration: 0.13, volume: 0.28 },
  ],
  win: [
    { frequency: 523.25, duration: 0.09, volume: 0.2 },
    { frequency: 659.25, duration: 0.09, volume: 0.23 },
    { frequency: 783.99, duration: 0.1, volume: 0.25 },
    { frequency: 1046.5, duration: 0.22, volume: 0.3 },
  ],
  loss: [
    { frequency: 392, duration: 0.1, volume: 0.2 },
    { frequency: 329.63, duration: 0.1, volume: 0.2 },
    { frequency: 261.63, duration: 0.24, volume: 0.23 },
  ],
};

const cachedUris = new Map<BattleSound, string>();
let configured = false;

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function bytesToBase64(bytes: Uint8Array) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? chars[triplet & 63] : '=';
  }
  return output;
}

function createWav(notes: Note[]) {
  const sampleRate = 22050;
  const gap = 0.018;
  const totalSeconds = notes.reduce((sum, note) => sum + note.duration + gap, 0);
  const sampleCount = Math.ceil(totalSeconds * sampleRate);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  let cursor = 0;
  for (const note of notes) {
    const noteSamples = Math.floor(note.duration * sampleRate);
    const volume = note.volume ?? 0.22;
    for (let i = 0; i < noteSamples; i += 1) {
      const t = i / sampleRate;
      const edge = Math.min(1, i / 180, (noteSamples - i) / 260);
      const fundamental = Math.sin(2 * Math.PI * note.frequency * t);
      const harmonic = Math.sin(2 * Math.PI * note.frequency * 2 * t) * 0.18;
      const sample = Math.max(-1, Math.min(1, (fundamental + harmonic) * volume * edge));
      view.setInt16(44 + cursor * 2, Math.round(sample * 32767), true);
      cursor += 1;
    }
    cursor += Math.floor(gap * sampleRate);
  }
  return new Uint8Array(buffer);
}

async function ensureNativeSound(kind: BattleSound) {
  const cached = cachedUris.get(kind);
  if (cached) return cached;
  const FileSystem = await import('expo-file-system');
  if (!FileSystem.cacheDirectory) throw new Error('Audio cache unavailable');
  const uri = `${FileSystem.cacheDirectory}pokemon-battle-${kind}.wav`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    const wav = createWav(sequences[kind]);
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(wav), { encoding: FileSystem.EncodingType.Base64 });
  }
  cachedUris.set(kind, uri);
  return uri;
}

function playWeb(kind: BattleSound) {
  const Ctx = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  let start = ctx.currentTime;
  for (const note of sequences[kind]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + note.duration + 0.015);
    start += note.duration + 0.018;
  }
  setTimeout(() => ctx.close().catch(() => null), Math.ceil((start - ctx.currentTime + 0.2) * 1000));
}

export async function playBattleSound(kind: BattleSound) {
  if (Platform.OS === 'web') { playWeb(kind); return; }
  try {
    const { Audio } = await import('expo-av');
    if (!configured) {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: false, shouldDuckAndroid: true });
      configured = true;
    }
    const uri = await ensureNativeSound(kind);
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 0.8 });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync().catch(() => null);
    });
  } catch {
    // Sound is optional; battle flow must never fail because audio could not play.
  }
}
