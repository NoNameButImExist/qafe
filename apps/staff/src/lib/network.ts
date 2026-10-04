import { useSyncExternalStore } from 'react';

/**
 * Whether the API answers. Starts from the browser's guess (navigator.onLine) and follows
 * every request: a network error means offline, any answer from the server means online.
 */
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();

export function reportNetwork(ok: boolean): void {
  if (ok === online) return;
  online = ok;
  listeners.forEach((l) => l());
}

/** The browser knowing it is offline wins over a late answer that arrived just before. */
export const isOnline = () => online && (typeof navigator === 'undefined' || navigator.onLine);

export function onNetworkChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(onNetworkChange, isOnline);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => reportNetwork(true));
  window.addEventListener('offline', () => reportNetwork(false));
}
