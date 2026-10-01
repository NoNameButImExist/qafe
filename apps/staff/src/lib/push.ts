import type { PushConfig } from '@qafe/contracts';
import { api } from './api';

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on' | 'unavailable';

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

/** Where push stands on this device. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const { publicKey } = await api<PushConfig>('/staff/push');
  if (!publicKey) return 'unavailable';
  const sub = await (await registration()).pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Asks for permission (needs a tap) and registers this device for the signed-in member. */
export async function subscribePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const { publicKey } = await api<PushConfig>('/staff/push');
  if (!publicKey) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api<void>('/staff/push/subscriptions', { method: 'POST', body: json });
  return 'on';
}

export async function unsubscribePush(): Promise<void> {
  if (!supported()) return;
  const sub = await (
    await navigator.serviceWorker.getRegistration('/sw.js')
  )?.pushManager.getSubscription();
  if (!sub) return;
  await api<void>('/staff/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: sub.endpoint },
  });
  await sub.unsubscribe();
}

/** The service worker writes notifications in the app's language. */
export function tellServiceWorkerLanguage(language: string): void {
  if (!supported()) return;
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ language }));
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
