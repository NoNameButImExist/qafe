import type { StaffServerEvents } from '@qafe/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { currentToken } from './api';
import { beep } from './sound';

/** Changes a guest made that need a waiter: they ring (FR-KON-04, 18). */
const ALERTS = new Set([
  'order.created',
  'call_waiter',
  'request_bill',
  'guest',
  'order.disputed',
  'order.resubmitted',
]);

let socket: Socket<StaffServerEvents> | null = null;

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
  };
  socket.on('venue.changed', ({ reason }) => {
    refresh();
    if (ALERTS.has(reason)) beep();
  });
  socket.on('connect', refresh);
  // The server drops a socket whose token expired: reconnect with the current one.
  socket.on('disconnect', (why) => {
    if (why === 'io server disconnect') setTimeout(() => socket?.connect(), 1_000);
  });
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}
