import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const apkPath = process.argv[2];
if (!apkPath) {
  console.error('Uso: node scripts/verify-apk-sounds.mjs <arquivo.apk>');
  process.exit(2);
}

const root = process.cwd();
const expectedFiles = [
  'tc_default.wav',
  'tc_battle.wav',
  'tc_social.wav',
  'tc_trade.wav',
].map((name) => path.join(root, 'assets', 'sounds', name));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function unzip(args, options = {}) {
  const result = spawnSync('unzip', args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
    throw new Error(`unzip falhou (${result.status}): ${stderr.trim()}`);
  }
  return result.stdout;
}

const listing = String(unzip(['-Z1', apkPath], { encoding: 'utf8' }) ?? '');
const wavEntries = listing
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter((value) => value && /\.wav$/i.test(value));

if (wavEntries.length !== expectedFiles.length) {
  throw new Error(`Esperados ${expectedFiles.length} WAVs nativos no APK; encontrados ${wavEntries.length}: ${wavEntries.join(', ') || 'nenhum'}`);
}

const expectedHashes = [];
for (const file of expectedFiles) {
  expectedHashes.push(sha256(await readFile(file)));
}
expectedHashes.sort();

const apkHashes = [];
for (const entry of wavEntries) {
  const bytes = unzip(['-p', apkPath, entry]);
  apkHashes.push(sha256(bytes));
}
apkHashes.sort();

if (JSON.stringify(apkHashes) !== JSON.stringify(expectedHashes)) {
  console.error('Hashes esperados:', expectedHashes);
  console.error('Hashes encontrados no APK:', apkHashes);
  console.error('Entradas WAV do APK:', wavEntries);
  throw new Error('Os WAVs empacotados no APK não correspondem exatamente aos 4 sons oficiais do Trainer Collection.');
}

console.log('✅ Sons nativos do Trainer Collection verificados por conteúdo.');
console.log(`   ${wavEntries.length} WAVs no APK correspondem byte a byte aos arquivos oficiais, mesmo com nomes Android compactados.`);
