import { readFileSync } from 'node:fs';

const failures = [];
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};
const normalizeHex = (value) => String(value ?? '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();

const EXPECTED_EXPO_OWNER = 'frontwork';
const EXPECTED_EXPO_PROJECT = 'pokemon-cards';

let release;
let trusted;
try {
  release = JSON.parse(readFileSync('public/download/release.json', 'utf8'));
} catch (error) {
  failures.push(`release.json inválido: ${error instanceof Error ? error.message : error}`);
}
try {
  trusted = JSON.parse(readFileSync('public/download/trusted-signing-cert.json', 'utf8'));
} catch (error) {
  failures.push(`trusted-signing-cert.json inválido: ${error instanceof Error ? error.message : error}`);
}

if (release && trusted) {
  const apkHash = normalizeHex(release.sha256);
  const releaseCert = normalizeHex(release.verification?.certificateSha256);
  const trustedCert = normalizeHex(trusted.certificateSha256);
  let url = null;
  try { url = new URL(String(release.easBuildUrl || release.downloadUrl || '')); } catch {}

  const expectedBuildPrefix = `/accounts/${EXPECTED_EXPO_OWNER}/projects/${EXPECTED_EXPO_PROJECT}/builds/`;
  const buildId = url?.pathname?.startsWith(expectedBuildPrefix)
    ? url.pathname.slice(expectedBuildPrefix.length).split('/')[0]
    : '';
  const validEasInstaller = Boolean(
    url
    && url.protocol === 'https:'
    && url.hostname.toLowerCase() === 'expo.dev'
    && url.pathname.startsWith(expectedBuildPrefix)
    && /^[0-9a-f-]{36}$/i.test(buildId)
    && (!release.easBuildId || release.easBuildId === buildId)
  );

  ok(release.appName === 'Trainer Collection', 'Nome do APK oficial inesperado.');
  ok(release.packageName === 'com.frontwork.pokemoncards', 'Package Android oficial divergente.');
  ok(trusted.packageName === 'com.frontwork.pokemoncards', 'Package do certificado fixado divergente.');
  ok(release.status === 'ready', 'Release APK não está marcada como ready.');
  ok(validEasInstaller, 'Instalador oficial precisa apontar para o build verificado no Expo EAS.');
  ok(release.downloadProvider === 'Expo EAS Build', 'Provedor oficial de instalação deve ser Expo EAS Build.');
  ok(/^[a-f0-9]{64}$/.test(apkHash), 'SHA-256 do APK ausente ou inválido.');
  ok(Number(release.sizeBytes) > 0, 'Tamanho do APK ausente ou inválido.');
  ok(release.verification?.sha256Verified === true, 'APK não está marcado como hash verificado.');
  ok(release.verification?.signatureVerified === true, 'Assinatura Android não está marcada como verificada.');
  ok(release.verification?.signerMatchesTrustedCertificate === true, 'Assinante do APK não corresponde ao certificado oficial.');
  ok(/^[a-f0-9]{64}$/.test(releaseCert), 'Fingerprint do certificado da release inválido.');
  ok(/^[a-f0-9]{64}$/.test(trustedCert), 'Fingerprint do certificado oficial inválido.');
  ok(releaseCert === trustedCert, 'Fingerprint da release difere do certificado oficial fixado.');
  ok(Boolean(release.verification?.verifiedAt), 'Data da verificação do APK ausente.');
  ok(release.verification?.verifier === 'Android apksigner', 'APK não foi verificado pelo Android apksigner.');
  const schemes = release.verification?.schemes ?? {};
  ok(Boolean(schemes.v2 || schemes.v3 || schemes.v4), 'APK não possui esquema moderno de assinatura Android verificado.');
}

if (failures.length) {
  console.error('❌ Auditoria de segurança do APK falhou:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('✅ APK security audit: Expo EAS installer, metadata, SHA-256, assinatura e certificado oficial consistentes.');
