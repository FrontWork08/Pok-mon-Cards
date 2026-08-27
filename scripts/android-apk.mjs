import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] ?? 'build';
const root = process.cwd();
const outputDir = path.join(root, 'builds');

function runEas(args, options = {}) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, ['--yes', 'eas-cli', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    shell: false,
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

  const url = findArtifactUrl(build);
  if (!url) {
    throw new Error('O EAS não retornou uma URL de APK para o último build.');
  }

  const version = buildVersionLabel(build);
  const fileName = `PokemonCard-v${version}.apk`;
  const destination = path.join(outputDir, fileName);

  console.log(`⬇️  Baixando ${fileName}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Falha no download do APK: HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(outputDir, { recursive: true });
  await writeFile(destination, bytes);

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
