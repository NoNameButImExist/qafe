/* global self */
// Service worker of the qafe.ba staff app: Web Push for new orders and calls (FR-KON-05).
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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
