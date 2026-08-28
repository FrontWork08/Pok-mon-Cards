(() => {
  'use strict';

  const ALLOWED_HOSTS = [
    'expo.dev',
    'github.com',
    'objects.githubusercontent.com',
    'github-releases.githubusercontent.com',
  ];

  const $ = (id) => document.getElementById(id);

  const versionEl = $('release-version');
  const sizeEl = $('release-size');
  const dateEl = $('release-date');
  const messageEl = $('release-message');
  const hashEl = $('release-hash');
  const originEl = $('release-origin');
  const footerVersionEl = $('footer-version');
  const copyHashButton = $('copy-hash');
  const buttons = [$('download-button'), $('download-button-secondary')].filter(Boolean);

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    const mb = bytes / 1024 / 1024;
    return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  function safeDownloadUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const host = url.hostname.toLowerCase();
      const allowed = ALLOWED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
      if (!allowed) return null;
      if (!url.pathname.toLowerCase().includes('.apk')) return null;
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
    });
    if (messageEl) messageEl.textContent = message;
  }

  function enableDownloads(url) {
    buttons.forEach((button) => {
      button.classList.remove('is-disabled');
      button.setAttribute('aria-disabled', 'false');
      button.href = url.href;
      button.target = '_self';
    });
  }

  async function loadRelease() {
    disableDownloads('Verificando a versão mais recente…');

    try {
      const response = await fetch('/download/release.json', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) throw new Error('release metadata unavailable');
      const release = await response.json();

      const version = typeof release.version === 'string' ? release.version : '—';
      if (versionEl) versionEl.textContent = `v${version}`;
      if (footerVersionEl) footerVersionEl.textContent = `Versão ${version}`;
      if (sizeEl) sizeEl.textContent = formatBytes(release.sizeBytes);
      if (dateEl) dateEl.textContent = formatDate(release.publishedAt);

      const url = safeDownloadUrl(release.downloadUrl);
      const hash = typeof release.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(release.sha256)
        ? release.sha256.toLowerCase()
        : null;

      if (hash) {
        if (hashEl) hashEl.textContent = hash;
        if (copyHashButton) copyHashButton.disabled = false;
      } else {
        if (hashEl) hashEl.textContent = 'Hash será publicado junto do próximo APK oficial';
        if (copyHashButton) copyHashButton.disabled = true;
      }

      if (!url) {
        if (originEl) originEl.textContent = 'Release em preparação';
        disableDownloads('O próximo APK oficial ainda não foi publicado. O botão será liberado automaticamente após o build.');
        return;
      }

      if (originEl) originEl.textContent = url.hostname;
      enableDownloads(url);

      if (messageEl) {
        messageEl.textContent = hash
          ? 'APK oficial disponível • hash SHA-256 publicado'
          : 'APK oficial disponível por HTTPS';
      }
    } catch {
      if (versionEl) versionEl.textContent = '—';
      if (footerVersionEl) footerVersionEl.textContent = 'Versão indisponível';
      disableDownloads('Não foi possível validar a versão agora. Por segurança, o download foi desativado.');
    }
  }

  if (copyHashButton) {
    copyHashButton.addEventListener('click', async () => {
      const value = hashEl?.textContent?.trim() || '';
      if (!/^[a-f0-9]{64}$/i.test(value)) return;
      try {
        await navigator.clipboard.writeText(value);
        copyHashButton.textContent = 'Copiado';
        window.setTimeout(() => { copyHashButton.textContent = 'Copiar'; }, 1400);
      } catch {
        copyHashButton.textContent = 'Selecione o hash';
      }
    });
  }

  loadRelease();
})();