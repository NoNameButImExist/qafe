import type { GuestServerEvents } from '@qafe/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

let socket: Socket<GuestServerEvents> | null = null;

/**
 * Live status (FR-GOS-10): the server only says "your table changed" and the app refetches
 * over HTTP, so a missed message costs a short delay, never data.
 */
export function connectRealtime(queryClient: QueryClient): void {
  if (socket) return;
  socket = io({ path: '/api/socket.io', transports: ['websocket', 'polling'] });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['session'] });
  socket.on('session.changed', refresh);
  socket.on('connect', refresh);
}

/**
 * After joining or leaving a table. The server picks the room from the handshake's cookie,
 * so a new connection carries the device cookie set by the join.
 */
export function resubscribe(): void {
  socket?.disconnect().connect();
}
