import type { StaffServerEvents } from '@qafe/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { currentToken } from './api';
import { beep, vibrate } from './sound';

/** Changes a guest made that need a waiter: they ring (FR-KON-04, 18). */
const ALERTS = new Set([
  'order.created',
  'call_waiter',
  'request_bill',
  'guest',
  'order.disputed',
  'order.resubmitted',
  // KDS: the bar or kitchen finished an order; the waiter takes it (FR-KON-26).
  'order.ready',
]);

/** The KDS screen plays its own sound for new items and stays quiet for waiter alerts. */
let alertsMuted = false;
export const setAlertsMuted = (muted: boolean) => {
  alertsMuted = muted;
};

let socket: Socket<StaffServerEvents> | null = null;

/** Whether live updates arrive; the top bar shows it, so a dropped connection is noticed. */
let live = false;
const liveListeners = new Set<() => void>();
const setLive = (value: boolean) => {
  live = value;
  liveListeners.forEach((l) => l());
};
export function useLive(): boolean {
  return useSyncExternalStore(
    (l) => {
      liveListeners.add(l);
      return () => liveListeners.delete(l);
    },
    () => live,
  );
}

/**
 * Venue-wide live updates (NFR-02). The token is read at every (re)connect, so a refreshed
 * access token is used after a drop. Messages only trigger a refetch.
 */
export function connectRealtime(queryClient: QueryClient): void {
  if (socket) return;
  socket = io({
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: currentToken() }),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['floor'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['session'] });
    void queryClient.invalidateQueries({ queryKey: ['kds'] });
  };
  socket.on('venue.changed', ({ reason }) => {
    refresh();
    if (ALERTS.has(reason) && !alertsMuted) {
      beep();
      vibrate();
    }
  });
  socket.on('connect', () => {
    setLive(true);
    refresh();
  });
  // The server drops a socket whose token expired: reconnect with the current one.
  socket.on('disconnect', (why) => {
    setLive(false);
    if (why === 'io server disconnect') setTimeout(() => socket?.connect(), 1_000);
  });
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
  setLive(false);
}
