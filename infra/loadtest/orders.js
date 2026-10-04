/* global __ENV, __VU */
// Load test (NFR-02, NFR-03, NFR-13): guests at every table order again and again, one waiter
// per venue sees and accepts the orders. Runs in the grafana/k6 image on the stack's network:
//   make loadtest                         (defaults below)
//   make loadtest VENUES=50 TABLES=10 DURATION=10m
// Every VU is one phone at one table (the host device), so the per-table limits hold.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://traefik';
const DOMAIN = __ENV.DOMAIN || 'qafe.localhost';
const VENUES = Number(__ENV.VENUES || 20);
const TABLES = Number(__ENV.TABLES || 10);
const DURATION = __ENV.DURATION || '5m';
const PASSWORD = __ENV.STAFF_PASSWORD;
// A table orders about every THINK seconds (guests read the menu, wait, order a round).
const THINK = Number(__ENV.THINK || 20);

const slug = (v) => `lt-${String(v).padStart(3, '0')}`;
const token = (v, t) => `${slug(v)}-table-${String(t).padStart(3, '0')}-loadtest`;

/** From sending an order to the waiter's list showing it (NFR-02: under 2 s, p95). */
const orderVisible = new Trend('order_visible_ms', true);
const ordersPlaced = new Counter('orders_placed');
const ordersAccepted = new Counter('orders_accepted');

export const options = {
  // One scenario, so VU numbers are 1..N: the first VENUES*TABLES are phones (one per
  // table), the rest are waiters (one per venue). VU numbers are global across scenarios,
  // so two scenarios could put two phones on one table.
  scenarios: {
    venue: {
      executor: 'constant-vus',
      vus: VENUES * TABLES + VENUES,
      duration: DURATION,
    },
  },
  thresholds: {
    // NFR-03: API p95 under 300 ms under normal load.
    'http_req_duration{kind:api}': ['p(95)<300'],
    order_visible_ms: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
  // A phone keeps its device cookie between rounds (k6 clears cookies per iteration by default).
  noCookiesReset: true,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// The per-table order limit (429) is the system working as designed, not a failed request.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 429));

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const guestParams = (venue, name) => ({
  headers: { Host: `${slug(venue)}.${DOMAIN}`, 'Content-Type': 'application/json' },
  tags: { kind: 'api', name },
});

export default function () {
  if (__VU <= VENUES * TABLES) guest();
  else waiter();
}

// ---------------------------------------------------------------- guests

let menu = null;
let joined = false;

function guest() {
  // VU 1..VENUES*TABLES → one table each.
  const index = __VU - 1;
  const venue = Math.floor(index / TABLES) + 1;
  const table = (index % TABLES) + 1;

  if (!joined) {
    sleep(Math.random() * THINK); // do not all arrive in the same second
    const res = http.post(
      `${BASE}/api/guest/tables/${token(venue, table)}/join`,
      JSON.stringify({ locale: 'bs' }),
      guestParams(venue, 'POST /guest/tables/:token/join'),
    );
    if (!check(res, { 'joined table': (r) => r.status === 200 })) {
      sleep(5);
      return;
    }
    joined = true;
  }
  if (!menu) {
    const res = http.get(`${BASE}/api/guest/menu`, guestParams(venue, 'GET /guest/menu'));
    if (res.status !== 200) return;
    menu = res.json().categories.flatMap((c) => c.items.map((i) => i.id));
  }
  http.get(`${BASE}/api/guest/venue`, guestParams(venue, 'GET /guest/venue'));

  const items = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => ({
    itemId: menu[Math.floor(Math.random() * menu.length)],
    quantity: 1 + Math.floor(Math.random() * 2),
  }));
  const res = http.post(
    `${BASE}/api/guest/orders`,
    JSON.stringify({ idempotencyKey: uuid(), items }),
    guestParams(venue, 'POST /guest/orders'),
  );
  // 429/403 here are the per-table limits doing their job, not failures of the system.
  const ok = check(res, {
    'order placed (or limited)': (r) => r.status === 201 || r.status === 429 || r.status === 403,
  });
  if (ok && res.status === 201) ordersPlaced.add(1);
  if (__ENV.DEBUG && res.status !== 201) console.log(`order ${res.status} ${res.body}`);

  // The guest app refetches the table after the realtime hint; roughly twice per round.
  for (let i = 0; i < 2; i++) {
    sleep(1 + Math.random() * 2);
    http.get(`${BASE}/api/guest/session`, guestParams(venue, 'GET /guest/session'));
  }
  sleep(THINK * (0.5 + Math.random()));
}

// ---------------------------------------------------------------- waiters

let access = null;
const seen = new Set();

function waiter() {
  const venue = __VU - VENUES * TABLES;
  const host = `staff.${DOMAIN}`;
  if (!access) {
    const res = http.post(
      `${BASE}/api/auth/staff/login`,
      JSON.stringify({ venueSlug: slug(venue), username: 'lt.sef', password: PASSWORD }),
      { headers: { Host: host, 'Content-Type': 'application/json' }, tags: { kind: 'auth' } },
    );
    if (!check(res, { 'waiter signed in': (r) => r.status === 200 })) {
      sleep(5);
      return;
    }
    access = res.json().accessToken;
  }
  const params = (name) => ({
    headers: { Host: host, Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    tags: { kind: 'api', name },
  });

  const list = http.get(`${BASE}/api/staff/orders`, params('GET /staff/orders'));
  if (list.status === 401) {
    access = null; // token expired (15 min): sign in again
    return;
  }
  if (list.status === 200) {
    const now = Date.now();
    for (const order of list.json().orders) {
      if (order.status !== 'new') continue;
      if (!seen.has(order.id)) {
        seen.add(order.id);
        orderVisible.add(now - Date.parse(order.createdAt));
      }
      const res = http.post(
        `${BASE}/api/staff/orders/${order.id}/accept`,
        '{}',
        params('POST /staff/orders/:id/accept'),
      );
      if (res.status === 200 || res.status === 201 || res.status === 204) ordersAccepted.add(1);
    }
  }
  // The tables screen is open next to the queue.
  if (Math.random() < 0.3) http.get(`${BASE}/api/staff/floor`, params('GET /staff/floor'));
  // The app refetches on every realtime hint; a busy venue gets one every second or so.
  sleep(1);
}
