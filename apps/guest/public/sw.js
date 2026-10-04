/* global self, caches */
// Service worker of the qafe.ba guest app (PWA). Keeps the app itself (HTML, scripts, styles,
// fonts) and the last venue and menu, so the menu opens on a weak or lost connection. The
// table session and orders always come from the network: an old copy would mislead.
const SHELL = 'qafe-guest-v1';
const CACHED_API = ['/api/guest/venue', '/api/guest/menu'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/index.html']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Network first; on failure the last good copy (if any). */
function networkFirst(request, key) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(SHELL).then((cache) => cache.put(key, copy));
      }
      return response;
    })
    .catch(() => caches.match(key).then((cached) => cached || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // /t/<token> and / are both index.html; the QR link itself always needs the network.
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }
  if (CACHED_API.includes(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
