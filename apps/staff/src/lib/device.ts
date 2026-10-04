import type { StaffDevice, StaffDeviceRoster } from '@qafe/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

/**
 * Shared devices (FR-KON-01): a device the owner linked to the venue shows the names of the
 * staff and signs them in with their PIN. The link lives in an httpOnly cookie; the app only
 * asks the API whether this device is linked.
 */
export const deviceRosterQuery = queryOptions({
  queryKey: ['device-roster'],
  queryFn: () => api<StaffDeviceRoster>('/auth/staff/device'),
  retry: false,
  staleTime: 60_000,
});

export const linkDevice = (name: string) =>
  api<StaffDevice>('/auth/staff/devices', { method: 'POST', body: { name } });

export const forgetDevice = () => api<void>('/auth/staff/device/forget', { method: 'POST' });

/** A PIN session on a shared device locks itself after this long without a touch. */
export const PIN_IDLE_LOCK_MS = 5 * 60_000;
const PIN_SESSION = 'qafe.staff.pinSession';

export function setPinSession(on: boolean): void {
  try {
    if (on) localStorage.setItem(PIN_SESSION, '1');
    else localStorage.removeItem(PIN_SESSION);
  } catch {
    // Storage blocked: no automatic lock after a reload.
  }
}

export function isPinSession(): boolean {
  try {
    return localStorage.getItem(PIN_SESSION) === '1';
  } catch {
    return false;
  }
}
