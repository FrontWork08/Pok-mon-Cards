const CACHE_VERSION = 'trainer-collection-web-v1';
const APP_SHELL = ['/', '/manifest.json', '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (request.destination === 'image' || request.destination === 'font' || request.destination === 'style' || request.destination === 'script') return true;
  return /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
          return response;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match('/')) || Response.error();
        })
    );
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          event.waitUntil(
            fetch(request)
              .then((response) => {
                if (response.ok) return caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
              })
              .catch(() => null)
          );
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        });
      })
    );
  }
});
