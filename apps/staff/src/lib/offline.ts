import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, ApiError, currentToken } from './api';
import { isOnline, onNetworkChange } from './network';

/**
 * Working without internet (NFR-05). Two parts:
 *
 * 1. Snapshot: the floor, orders, open tables, menu and KDS are kept in localStorage per venue,
 *    so after a dropped connection or a reload without internet the last state is on screen.
 * 2. Queue: the everyday one-tap actions (accept, serve, request seen / done, KDS ready /
 *    undo / start, item availability) are saved when the API cannot be reached, shown on
 *    screen at once and sent in order as soon as it answers again. Everything else (payment,
 *    cancelling, changing orders) needs a connection: those depend on the current state.
 */

const SNAPSHOT_KEYS = ['floor', 'orders', 'session', 'menu', 'kds'];
const snapshotKey = (venueId: string) => `qafe.staff.snapshot.${venueId}`;
const queueKey = (venueId: string) => `qafe.staff.queue.${venueId}`;
/** A snapshot older than this is not shown (yesterday's tables would mislead). */
const SNAPSHOT_MAX_AGE = 12 * 60 * 60_000;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app works, only without the offline copy.
  }
}

// ---------------------------------------------------------------- snapshot

/** Restores the last snapshot, then keeps it current. Returns the stop function. */
export function persistSnapshots(queryClient: QueryClient, venueId: string): () => void {
  const saved = read<{ savedAt: number; state: unknown }>(snapshotKey(venueId));
  if (saved && Date.now() - saved.savedAt < SNAPSHOT_MAX_AGE) {
    // Older than anything fetched since: hydrate never overwrites fresher data.
    hydrate(queryClient, saved.state as Parameters<typeof hydrate>[1]);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const state = dehydrate(queryClient, {
      shouldDehydrateQuery: (q) =>
        q.state.status === 'success' && SNAPSHOT_KEYS.includes(String(q.queryKey[0])),
    });
    write(snapshotKey(venueId), { savedAt: Date.now(), state });
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    const { queryKey } = event.query as { queryKey: readonly unknown[] };
    const key = queryKey[0];
    if (!SNAPSHOT_KEYS.includes(String(key))) return;
    timer ??= setTimeout(save, 1_000);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}

/** Sign-out: nothing of this venue stays on the phone. */
export function clearOfflineData(venueId: string): void {
  write(snapshotKey(venueId), null);
  write(queueKey(venueId), null);
}

// ---------------------------------------------------------------- queue

export interface QueuedAction {
  id: string;
  method: 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** What the screen shows at once: fields set on the object with this id in every cached view. */
  patch: { id: string; fields: Record<string, unknown> };
  /** For the message if the server refuses it later, e.g. "Narudžba #12". */
  label: string;
  createdAt: number;
}

export type QueueResult = 'sent' | 'queued';

let venue: string | null = null;
let queue: QueuedAction[] = [];
let syncing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setQueue(next: QueuedAction[]) {
  queue = next;
  if (venue) write(queueKey(venue), next.length ? next : null);
  emit();
}

export function useQueue(): { pending: number; syncing: boolean } {
  const pending = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue.length,
  );
  const busy = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => syncing,
  );
  return { pending, syncing: busy };
}

/** Sets `fields` on every cached object with this id (order, request, KDS item, menu item). */
function patchById(value: unknown, id: string, fields: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const p = patchById(v, id, fields);
      if (p !== v) changed = true;
      return p;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // KDS tickets name their order `orderId`; everything else is `id`.
    if (obj.id === id || obj.orderId === id) return { ...obj, ...fields };
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = patchById(v, id, fields);
      if (p !== v) changed = true;
      next[k] = p;
    }
    return changed ? next : value;
  }
  return value;
}

function applyPatch(queryClient: QueryClient, action: QueuedAction) {
  for (const key of SNAPSHOT_KEYS) {
    queryClient.setQueriesData({ queryKey: [key] }, (data: unknown) =>
      data === undefined ? data : patchById(data, action.patch.id, action.patch.fields),
    );
  }
}

/**
 * Sends the action now, or queues it when the API cannot be reached. Errors from the server
 * (it answered, but no) are thrown as usual.
 */
export async function runQueued(
  queryClient: QueryClient,
  action: Omit<QueuedAction, 'id' | 'createdAt'>,
): Promise<QueueResult> {
  // A connection that hangs (Wi-Fi without internet) must not keep the waiter waiting.
  const send = () =>
    api<unknown>(action.path, {
      method: action.method,
      body: action.body,
      query: action.query,
      timeoutMs: 8_000,
    });
  // Queued actions go first, so the server sees them in the order they were made.
  if (isOnline() && queue.length === 0 && currentToken()) {
    try {
      await send();
      return 'sent';
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 0) throw error;
    }
  }
  const queued: QueuedAction = {
    ...action,
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    createdAt: Date.now(),
  };
  setQueue([...queue, queued]);
  applyPatch(queryClient, queued);
  return 'queued';
}

export interface SyncReport {
  sent: number;
  /** Refused by the server once it was reachable (the state had changed meanwhile). */
  refused: { label: string; code: string }[];
}

/** Sends the queue in order; stops at the first network error and tries again later. */
async function flush(): Promise<SyncReport | null> {
  if (syncing || queue.length === 0 || !currentToken()) return null;
  syncing = true;
  emit();
  const report: SyncReport = { sent: 0, refused: [] };
  try {
    while (queue.length > 0) {
      const next = queue[0]!;
      try {
        await api<unknown>(next.path, {
          method: next.method,
          body: next.body,
          query: next.query,
          timeoutMs: 8_000,
        });
        report.sent += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) break;
        report.refused.push({
          label: next.label,
          code: error instanceof ApiError ? error.code : 'unknown',
        });
      }
      setQueue(queue.slice(1));
    }
  } finally {
    syncing = false;
    emit();
  }
  return report;
}

/**
 * Loads the venue's queue and sends it whenever the API is reachable again: on the browser's
 * "online" event, on a successful request and every 3 seconds while something waits (NFR-05:
 * within 5 s). `onSynced` refetches and tells the member what happened.
 */
export function startSync(
  queryClient: QueryClient,
  venueId: string,
  onSynced: (report: SyncReport) => void,
): () => void {
  venue = venueId;
  queue = read<QueuedAction[]>(queueKey(venueId)) ?? [];
  for (const action of queue) applyPatch(queryClient, action);
  emit();
  const tick = () => {
    void flush().then((report) => {
      if (report && (report.sent > 0 || report.refused.length > 0)) onSynced(report);
    });
  };
  const stopNetwork = onNetworkChange(() => {
    if (isOnline()) tick();
  });
  const timer = setInterval(() => {
    if (queue.length > 0) tick();
  }, 3_000);
  tick();
  return () => {
    stopNetwork();
    clearInterval(timer);
    venue = null;
  };
}
