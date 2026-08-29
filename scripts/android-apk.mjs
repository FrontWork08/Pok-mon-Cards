import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] ?? 'build';
const root = process.cwd();
const outputDir = path.join(root, 'builds');

function runEas(args, options = {}) {
  // .cmd executables cannot be spawned directly by Node on some Windows/Git
  // Bash setups (spawnSync EINVAL). Running npx through the platform shell is
  // compatible with Git Bash, PowerShell and Command Prompt.
  const command = 'npx';
  const result = spawnSync(command, ['--yes', 'eas-cli', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`EAS terminou com código ${result.status ?? 'desconhecido'}.`);
  }

  return options.capture ? result.stdout : '';
}

function findArtifactUrl(build) {
  return (
    build?.artifacts?.buildUrl ??
    build?.artifacts?.applicationArchiveUrl ??
    build?.artifactUrl ??
    null
  );
}

async function getAppVersion() {
  try {
    const raw = await readFile(path.join(root, 'app.json'), 'utf8');
    const config = JSON.parse(raw);
    return String(config?.expo?.version ?? '0.0.0');
  } catch {
    return '0.0.0';
  }
}

async function writeDownloadReleaseMetadata({ build, url, bytes }) {
  const version = build?.appVersion ? String(build.appVersion) : await getAppVersion();
  const buildVersion = String(
    build?.appBuildVersion ??
    build?.versionCode ??
    build?.metadata?.versionCode ??
    buildVersionLabel(build),
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const release = {
    appName: 'Trainer Collection',
    version,
    buildVersion,
    downloadUrl: url,
    sha256,
    sizeBytes: bytes.length,
    publishedAt: new Date().toISOString(),
    channel: 'preview',
    status: 'ready',
  };

  const releasePath = path.join(root, 'public', 'download', 'release.json');
  await mkdir(path.dirname(releasePath), { recursive: true });
  await writeFile(releasePath, JSON.stringify(release, null, 2) + '\n');

  console.log('🔐 SHA-256:', sha256);
  console.log('🌐 Metadados do site:', releasePath);
}

function buildVersionLabel(build) {
  const raw =
    build?.appBuildVersion ??
    build?.versionCode ??
    build?.metadata?.versionCode ??
    build?.appVersion ??
    null;

  if (raw !== null && raw !== undefined && String(raw).trim()) {
    return String(raw).trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return stamp;
}

async function downloadLatestApk() {
  console.log('\n🔎 Procurando o último APK preview concluído...');

  const raw = runEas(
    [
      'build:list',
      '--platform',
      'android',
      '--profile',
      'preview',
      '--status',
      'finished',
      '--limit',
      '1',
      '--json',
      '--non-interactive',
    ],
    { capture: true },
  );

  const builds = JSON.parse(raw);
  const build = Array.isArray(builds) ? builds[0] : builds?.builds?.[0];

  if (!build) {
    throw new Error('Nenhum build Android preview concluído foi encontrado no EAS.');
  }

  const expectedAppVersion = await getAppVersion();
  const actualAppVersion = String(build?.appVersion ?? '').trim();
  if (!actualAppVersion || actualAppVersion !== expectedAppVersion) {
    throw new Error(
      `Build recusado: o último APK preview é da versão ${actualAppVersion || 'desconhecida'}, mas o app atual exige ${expectedAppVersion}. Nenhum metadata de download foi publicado.`,
    );
  }

  const url = findArtifactUrl(build);
  if (!url) {
    throw new Error('O EAS não retornou uma URL de APK para o último build.');
  }

  const version = buildVersionLabel(build);
  const fileName = `TrainerCollection-v${version}.apk`;
  const destination = path.join(outputDir, fileName);

  console.log(`⬇️  Baixando ${fileName}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Falha no download do APK: HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(outputDir, { recursive: true });
  await writeFile(destination, bytes);
  await writeDownloadReleaseMetadata({ build, url, bytes });

  console.log('\n✅ APK pronto:');
  console.log(destination);
  console.log(`📦 ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  if (!['build', 'download'].includes(mode)) {
    throw new Error('Use "build" ou "download".');
  }

  if (mode === 'build') {
    console.log('🚀 Gerando APK preview no EAS...');
    runEas([
      'build',
      '--platform',
      'android',
      '--profile',
      'preview',
      '--non-interactive',
    ]);
  }

  await downloadLatestApk();
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
