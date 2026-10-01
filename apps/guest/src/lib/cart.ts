import { useSyncExternalStore } from 'react';

export interface CartLine {
  /** Same item, options and note merge into one line. */
  key: string;
  itemId: string;
  quantity: number;
  note?: string;
  modifierOptionIds: string[];
}

export interface Cart {
  lines: CartLine[];
  note: string;
  /** One key per cart: a resend after a lost response returns the same order (NFR-06). */
  idempotencyKey: string;
  /** Set while the guest corrects a returned order (FR-GOS-12). */
  editing?: { orderId: string; number: number };
}

/** UUID v4; randomUUID needs a secure context, getRandomValues works everywhere. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const empty = (): Cart => ({ lines: [], note: '', idempotencyKey: uuid() });

/** The cart lives in localStorage per venue, so it survives a refresh (FR-GOS-08). */
function storageKey() {
  return `qafe.guest.cart.${window.location.hostname}`;
}

function load(): Cart {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<Cart>) };
  } catch {
    // Unreadable or blocked storage: start empty.
  }
  return empty();
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Cart) {
  state = next;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    // Storage blocked: the cart lasts for this page only.
  }
  for (const listener of listeners) listener();
}

const lineKey = (itemId: string, options: string[], note?: string) =>
  [itemId, [...options].sort().join(','), note ?? ''].join('|');

export const cart = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  add(line: Omit<CartLine, 'key'>) {
    const key = lineKey(line.itemId, line.modifierOptionIds, line.note);
    const existing = state.lines.find((l) => l.key === key);
    set({
      ...state,
      lines: existing
        ? state.lines.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l,
          )
        : [...state.lines, { ...line, key }],
    });
  },
  setQuantity(key: string, quantity: number) {
    set({
      ...state,
      lines:
        quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    });
  },
  setNote(note: string) {
    set({ ...state, note });
  },
  /** Loads a returned order for correction. */
  edit(order: { orderId: string; number: number; lines: Omit<CartLine, 'key'>[]; note: string }) {
    set({
      ...empty(),
      note: order.note,
      editing: { orderId: order.orderId, number: order.number },
      lines: order.lines.map((l) => ({
        ...l,
        key: lineKey(l.itemId, l.modifierOptionIds, l.note),
      })),
    });
  },
  /** After a successful send: a new cart with a new idempotency key. */
  clear() {
    set(empty());
  },
};

export function useCart(): Cart {
  return useSyncExternalStore(
    (listener) => cart.subscribe(listener),
    () => cart.get(),
  );
}
