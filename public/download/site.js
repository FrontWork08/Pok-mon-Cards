(() => {
  'use strict';

  const EXPECTED_PACKAGE = 'com.frontwork.pokemoncards';
  const OFFICIAL_ORIGIN = 'https://pokemon-cards-frontwork.expo.app';
  const $ = (id) => document.getElementById(id);
  const buttons = [$('download-button'), $('download-button-secondary')].filter(Boolean);

  const versionEl = $('release-version');
  const sizeEl = $('release-size');
  const dateEl = $('release-date');
  const messageEl = $('release-message');
  const hashEl = $('release-hash');
  const certHashEl = $('release-cert-hash');
  const signatureEl = $('release-signature');
  const verifiedDateEl = $('release-verified-date');
  const packageEl = $('release-package');
  const verifierEl = $('release-verifier');
  const originEl = $('release-origin');
  const footerVersionEl = $('footer-version');
  const copyHashButton = $('copy-hash');
  const copyCertButton = $('copy-cert-hash');

  function normalizeHex(value) {
    return typeof value === 'string' ? value.replace(/[^a-fA-F0-9]/g, '').toLowerCase() : '';
  }

  function validSha256(value) {
    return /^[a-f0-9]{64}$/.test(normalizeHex(value));
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    const mb = bytes / 1024 / 1024;
    return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }

  function formatDate(value, includeTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
  }

  function safeSiteApkUrl(release) {
    const fileName = String(release?.downloadFileName || '').trim();
    if (!/^Trainer-Collection-v\d+\.\d+\.\d+\.apk$/.test(fileName)) return null;
    try {
      const url = new URL(String(release?.downloadUrl || ''));
      if (url.origin !== OFFICIAL_ORIGIN) return null;
      if (url.pathname !== `/download/${fileName}`) return null;
      return url;
    } catch {
      return null;
    }
  }

  function disableDownloads(message) {
    buttons.forEach((button) => {
      button.classList.add('is-disabled');
      button.setAttribute('aria-disabled', 'true');
      button.removeAttribute('href');
      button.removeAttribute('download');
    });
    if (messageEl) messageEl.textContent = message;
  }

  function enableDownloads(url, fileName) {
    buttons.forEach((button) => {
      button.classList.remove('is-disabled');
      button.setAttribute('aria-disabled', 'false');
      button.href = url.href;
      button.download = fileName;
      button.target = '_self';
      button.rel = 'noopener';
    });
  }

  function setupCopy(button, valueElement) {
    if (!button) return;
    button.addEventListener('click', async () => {
      const value = normalizeHex(valueElement?.textContent?.trim() || '');
      if (!/^[a-f0-9]{64}$/.test(value)) return;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = 'Copiado';
        window.setTimeout(() => { button.textContent = 'Copiar'; }, 1400);
      } catch {
        button.textContent = 'Selecione o código';
      }
    });
  }

  async function loadJson(path) {
    const response = await fetch(path, {
      cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`${path} indisponível`);
    return response.json();
  }

  function verifyRelease(release, trusted) {
    const errors = [];
    const apkUrl = safeSiteApkUrl(release);
    const apkHash = normalizeHex(release?.sha256);
    const releaseCert = normalizeHex(release?.verification?.certificateSha256);
    const trustedCert = normalizeHex(trusted?.certificateSha256);
    const schemes = release?.verification?.schemes || {};

    if (release?.status !== 'ready') errors.push('release ainda não está pronta');
    if (release?.packageName !== EXPECTED_PACKAGE) errors.push('package Android divergente');
    if (trusted?.packageName !== EXPECTED_PACKAGE) errors.push('certificado não pertence ao package oficial');
    if (release?.downloadProvider !== 'Trainer Collection Site') errors.push('origem pública do APK inválida');
    if (!apkUrl) errors.push('arquivo APK do site oficial inválido');
    if (!/^[a-f0-9]{64}$/.test(apkHash)) errors.push('SHA-256 do APK inválido');
    if (release?.verification?.sha256Verified !== true) errors.push('hash ainda não foi conferido no pipeline');
    if (release?.verification?.signatureVerified !== true) errors.push('assinatura Android ainda não foi verificada');
    if (release?.verification?.signerMatchesTrustedCertificate !== true) errors.push('assinante não corresponde ao certificado oficial');
    if (!/^[a-f0-9]{64}$/.test(releaseCert) || !/^[a-f0-9]{64}$/.test(trustedCert)) errors.push('fingerprint do certificado inválido');
    if (releaseCert !== trustedCert) errors.push('certificado da release difere do certificado oficial');
    if (!(schemes.v2 || schemes.v3 || schemes.v4)) errors.push('nenhum esquema moderno de assinatura foi verificado');
    if (!release?.verification?.verifiedAt) errors.push('data da verificação ausente');

    return { ok: errors.length === 0, errors, apkUrl, apkHash, releaseCert, schemes };
  }

  async function loadRelease() {
    disableDownloads('Verificando arquivo, assinatura e certificado oficial…');
    try {
      const [release, trusted] = await Promise.all([
        loadJson('/download/release.json'),
        loadJson('/download/trusted-signing-cert.json'),
      ]);

      const version = typeof release.version === 'string' ? release.version : '—';
      if (versionEl) versionEl.textContent = `v${version}`;
      if (footerVersionEl) footerVersionEl.textContent = `Versão ${version}`;
      if (sizeEl) sizeEl.textContent = formatBytes(release.sizeBytes);
      if (dateEl) dateEl.textContent = formatDate(release.publishedAt);
      if (packageEl) packageEl.textContent = release.packageName || '—';
      if (verifierEl) verifierEl.textContent = release.verification?.verifier || '—';
      if (verifiedDateEl) verifiedDateEl.textContent = formatDate(release.verification?.verifiedAt, true);

      const result = verifyRelease(release, trusted);
      if (hashEl) hashEl.textContent = result.apkHash || 'SHA-256 indisponível';
      if (copyHashButton) copyHashButton.disabled = !validSha256(result.apkHash);
      if (certHashEl) certHashEl.textContent = result.releaseCert || 'Certificado indisponível';
      if (copyCertButton) copyCertButton.disabled = !validSha256(result.releaseCert);
      if (originEl) originEl.textContent = result.apkUrl?.hostname || 'Release não validada';

      if (!result.ok) {
        if (signatureEl) signatureEl.textContent = 'Não validada';
        disableDownloads(`Download bloqueado por segurança: ${result.errors.join('; ')}.`);
        return;
      }

      if (signatureEl) {
        const scheme = result.schemes.v4 ? 'v4' : result.schemes.v3 ? 'v3' : 'v2';
        signatureEl.textContent = `Verificada • APK Signature Scheme ${scheme}`;
      }

      enableDownloads(result.apkUrl, release.downloadFileName);
      if (messageEl) {
        messageEl.textContent = `Download direto do site oficial • arquivo: ${release.downloadFileName}`;
      }
    } catch {
      if (versionEl) versionEl.textContent = '—';
      if (footerVersionEl) footerVersionEl.textContent = 'Versão indisponível';
      if (signatureEl) signatureEl.textContent = 'Não foi possível verificar';
      disableDownloads('Não foi possível validar a release agora. Por segurança, o download foi desativado.');
    }
  }

  setupCopy(copyHashButton, hashEl);
  setupCopy(copyCertButton, certHashEl);
  loadRelease();
})();
