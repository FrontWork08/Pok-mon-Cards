import release from '../public/download/release.json';

const OFFICIAL_REPOSITORY = 'FrontWork08/Pok-mon-Cards';
const RELEASE_PREFIX = `/${OFFICIAL_REPOSITORY}/releases/download/`;

function getVerifiedArchive() {
  const version = String(release.version || '').trim();
  const fileName = String(release.downloadFileName || '').trim();
  const archive = new URL(String(release.archiveUrl || ''));

  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('INVALID_RELEASE_VERSION');
  if (!/^Trainer-Collection-v\d+\.\d+\.\d+\.apk$/.test(fileName)) throw new Error('INVALID_APK_NAME');
  if (archive.origin !== 'https://github.com') throw new Error('INVALID_ARCHIVE_ORIGIN');
  if (archive.pathname !== `${RELEASE_PREFIX}android-v${version}/${fileName}`) {
    throw new Error('INVALID_ARCHIVE_PATH');
  }
  if (release.status !== 'ready' || release.verification?.signatureVerified !== true) {
    throw new Error('RELEASE_NOT_VERIFIED');
  }

  return { archiveUrl: archive.href, fileName };
}

function downloadHeaders(upstream: Response, fileName: string) {
  const headers = new Headers();
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
  headers.set('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');

  for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return headers;
}

async function proxyApk(request: Request, headOnly = false) {
  try {
    const { archiveUrl, fileName } = getVerifiedArchive();
    const headers = new Headers({
      Accept: 'application/octet-stream',
      'User-Agent': 'Trainer-Collection-Official-Download',
    });

    const range = request.headers.get('range');
    const ifRange = request.headers.get('if-range');
    if (range) headers.set('Range', range);
    if (ifRange) headers.set('If-Range', ifRange);

    const upstream = await fetch(archiveUrl, {
      method: headOnly ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response('APK temporariamente indisponível.', {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return new Response(headOnly ? null : upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers: downloadHeaders(upstream, fileName),
    });
  } catch (error) {
    console.error('Same-site APK stream failed', error);
    return new Response('Não foi possível iniciar o download agora.', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export function GET(request: Request) {
  return proxyApk(request);
}

export function HEAD(request: Request) {
  return proxyApk(request, true);
}
