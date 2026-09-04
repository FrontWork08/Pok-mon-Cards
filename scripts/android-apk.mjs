import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] ?? 'build';
const root = process.cwd();
const outputDir = path.join(root, 'builds');
const trustedCertPath = path.join(root, 'public', 'download', 'trusted-signing-cert.json');

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

function normalizeHex(value) {
  return String(value ?? '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

async function fileIsExecutable(filePath) {
  try {
    await access(filePath, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findApkSigner() {
  const explicit = process.env.APKSIGNER?.trim();
  if (explicit && await fileIsExecutable(explicit)) return explicit;

  const sdkRoot = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '').trim();
  if (sdkRoot) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    try {
      const entries = await readdir(buildToolsDir, { withFileTypes: true });
      const versions = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
      for (const version of versions) {
        const candidate = path.join(buildToolsDir, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
        if (await fileIsExecutable(candidate)) return candidate;
      }
    } catch {
      // Fall through to PATH lookup below.
    }
  }

  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['apksigner'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const fromPath = lookup.status === 0 ? String(lookup.stdout ?? '').split(/\r?\n/).find(Boolean)?.trim() : '';
  if (fromPath && await fileIsExecutable(fromPath)) return fromPath;

  throw new Error('apksigner não foi encontrado. O APK não será publicado sem verificar a assinatura Android.');
}

function schemeVerified(output, version) {
  const match = new RegExp(`Verified using v${version} scheme[^:]*:\\s*(true|false)`, 'i').exec(output);
  return match ? match[1].toLowerCase() === 'true' : false;
}

async function readTrustedSigningCertificate() {
  let trusted;
  try {
    trusted = JSON.parse(await readFile(trustedCertPath, 'utf8'));
  } catch {
    throw new Error('O certificado oficial ainda não está fixado em public/download/trusted-signing-cert.json.');
  }

  const certificateSha256 = normalizeHex(trusted?.certificateSha256);
  if (!/^[a-f0-9]{64}$/.test(certificateSha256)) {
    throw new Error('O fingerprint SHA-256 do certificado oficial é inválido.');
  }

  return { ...trusted, certificateSha256 };
}

async function verifyApkSignature(apkPath) {
  const apksigner = await findApkSigner();
  const result = spawnSync(apksigner, ['verify', '--verbose', '--print-certs', apkPath], {
    cwd: root,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`A assinatura Android do APK falhou na verificação.\n${output}`);
  }

  const certMatch = output.match(/Signer #1 certificate SHA-256 digest:\s*([0-9a-f:]+)/i);
  const certificateSha256 = normalizeHex(certMatch?.[1]);
  if (!/^[a-f0-9]{64}$/.test(certificateSha256)) {
    throw new Error('Não foi possível extrair o SHA-256 do certificado de assinatura do APK.');
  }

  const trusted = await readTrustedSigningCertificate();
  if (certificateSha256 !== trusted.certificateSha256) {
    throw new Error(
      `CERTIFICADO DE ASSINATURA DIFERENTE DO OFICIAL. Esperado ${trusted.certificateSha256}, recebido ${certificateSha256}. Publicação bloqueada.`,
    );
  }

  const subjectMatch = output.match(/Signer #1 certificate DN:\s*(.+)/i);
  const certificateSubject = subjectMatch?.[1]?.trim() || trusted.certificateSubject || null;

  return {
    sha256Verified: true,
    signatureVerified: true,
    certificateSha256,
    certificateSubject,
    signerMatchesTrustedCertificate: true,
    verifiedAt: new Date().toISOString(),
    verifier: 'Android apksigner',
    schemes: {
      v1: schemeVerified(output, 1),
      v2: schemeVerified(output, 2),
      v3: schemeVerified(output, 3),
      v4: schemeVerified(output, 4),
    },
  };
}

async function writeDownloadReleaseMetadata({ build, url, bytes, verification }) {
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
    packageName: 'com.frontwork.pokemoncards',
    version,
    buildVersion,
    downloadUrl: url,
    sha256,
    sizeBytes: bytes.length,
    publishedAt: new Date().toISOString(),
    channel: 'production',
    status: 'ready',
    verification: {
      ...verification,
      sha256Verified: true,
    },
  };

  const releasePath = path.join(root, 'public', 'download', 'release.json');
  await mkdir(path.dirname(releasePath), { recursive: true });
  await writeFile(releasePath, JSON.stringify(release, null, 2) + '\n');

  console.log('🔐 SHA-256 do APK:', sha256);
  console.log('🔏 Certificado SHA-256:', verification.certificateSha256);
  console.log('✅ Assinatura Android verificada e corresponde ao certificado oficial fixado.');
  console.log('🌐 Metadados do site:', releasePath);
  return release;
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
  console.log('\n🔎 Procurando o último APK de lançamento concluído...');

  const raw = runEas(
    [
      'build:list',
      '--platform',
      'android',
      '--profile',
      'release-apk',
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
    throw new Error('Nenhum build Android release-apk concluído foi encontrado no EAS.');
  }

  const expectedAppVersion = await getAppVersion();
  const actualAppVersion = String(build?.appVersion ?? '').trim();
  if (!actualAppVersion || actualAppVersion !== expectedAppVersion) {
    throw new Error(
      `Build recusado: o último APK de lançamento é da versão ${actualAppVersion || 'desconhecida'}, mas o app atual exige ${expectedAppVersion}. Nenhum metadata de download foi publicado.`,
    );
  }

  const url = findArtifactUrl(build);
  if (!url || !/^https:\/\//i.test(String(url))) {
    throw new Error('O EAS não retornou uma URL HTTPS de APK para o último build.');
  }

  const buildVersion = buildVersionLabel(build);
  const fileName = `TrainerCollection-v${expectedAppVersion}-b${buildVersion}.apk`;
  const destination = path.join(outputDir, fileName);

  console.log(`⬇️  Baixando ${fileName}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Falha no download do APK: HTTP ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(outputDir, { recursive: true });
  await writeFile(destination, bytes);

  console.log('🔎 Verificando assinatura Android com apksigner...');
  const verification = await verifyApkSignature(destination);
  const release = await writeDownloadReleaseMetadata({ build, url, bytes, verification });

  await writeFile(`${destination}.sha256`, `${release.sha256}  ${path.basename(destination)}\n`);
  await writeFile(`${destination}.verification.json`, JSON.stringify({
    appName: release.appName,
    packageName: release.packageName,
    version: release.version,
    buildVersion: release.buildVersion,
    sha256: release.sha256,
    verification: release.verification,
  }, null, 2) + '\n');

  console.log('\n✅ APK pronto e verificado:');
  console.log(destination);
  console.log(`📦 ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  if (!['build', 'download'].includes(mode)) {
    throw new Error('Use "build" ou "download".');
  }

  // Fail before spending a cloud build if the official certificate pin is missing.
  await readTrustedSigningCertificate();
  await findApkSigner();

  if (mode === 'build') {
    console.log('🚀 Gerando APK de lançamento no EAS...');
    runEas([
      'build',
      '--platform',
      'android',
      '--profile',
      'release-apk',
      '--non-interactive',
    ]);
  }

  await downloadLatestApk();
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
