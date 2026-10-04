/* global self, caches */
// Service worker of the qafe.ba staff app: Web Push for new orders and calls (FR-KON-05) and
// the app shell for working without internet (NFR-05).
// The server sends data only; the text is written here in the app's language.
const TEXT = {
  bs: {
    'order.created': (p) => (p.orderNumber ? `Nova narudžba #${p.orderNumber}` : 'Nova narudžba'),
    call_waiter: () => 'Poziv konobara',
    request_bill: () => 'Traži račun',
    'guest.waiting': () => 'Novi uređaj čeka odobrenje',
    table: (p) => `Sto ${p.tableLabel}`,
  },
  en: {
    'order.created': (p) => (p.orderNumber ? `New order #${p.orderNumber}` : 'New order'),
    call_waiter: () => 'Waiter call',
    request_bill: () => 'Bill request',
    'guest.waiting': () => 'A new device is waiting for approval',
    table: (p) => `Table ${p.tableLabel}`,
  },
};

let language = 'bs';

// Working without internet (NFR-05): the app itself (HTML, scripts, styles, fonts) is kept in
// a cache, so the app opens after a reload with no connection. The API is never cached here;
// the app keeps its own last state. Built files have hashed names, so cache-first is safe for
// them; the page is network-first so a new version arrives as soon as there is a connection.
const SHELL = 'qafe-staff-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/index.html']))
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

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Every route of the app is index.html.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
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

self.addEventListener('message', (event) => {
  if (event.data && (event.data.language === 'bs' || event.data.language === 'en')) {
    language = event.data.language;
  }
});

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const text = TEXT[language] || TEXT.bs;
  const title = (text[payload.type] || text['order.created'])(payload);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: text.table(payload),
      tag: `${payload.type}:${payload.tableLabel}`,
      renotify: true,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => w.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
