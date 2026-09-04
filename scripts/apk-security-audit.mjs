import { readFileSync } from 'node:fs';

const failures = [];
const ok = (condition, message) => {
  if (!condition) failures.push(message);
};
const normalizeHex = (value) => String(value ?? '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();

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
  try { url = new URL(String(release.downloadUrl ?? '')); } catch {}

  ok(release.appName === 'Trainer Collection', 'Nome do APK oficial inesperado.');
  ok(release.packageName === 'com.frontwork.pokemoncards', 'Package Android oficial divergente.');
  ok(trusted.packageName === 'com.frontwork.pokemoncards', 'Package do certificado fixado divergente.');
  ok(release.status === 'ready', 'Release APK não está marcada como ready.');
  ok(url?.protocol === 'https:', 'URL do APK oficial precisa usar HTTPS.');
  ok(Boolean(url?.pathname?.toLowerCase().includes('.apk')), 'URL oficial não aponta para um APK.');
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

console.log('✅ APK security audit: metadata, SHA-256, assinatura e certificado oficial consistentes.');
