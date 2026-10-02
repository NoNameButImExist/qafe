import { useSyncExternalStore } from 'react';

/**
 * Alert sound with Web Audio (no file to load). Browsers allow sound only after a tap:
 * "Spreman za rad" unlocks it once after sign-in (FR-KON-02); after a page reload the first
 * tap anywhere unlocks it again, without asking.
 */
let context: AudioContext | null = null;
let enabled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** `confirm` plays the alert once, so the waiter hears that sound works. */
export async function unlockSound(confirm = true): Promise<void> {
  context ??= new AudioContext();
  await context.resume();
  enabled = true;
  notify();
  if (confirm) beep();
}

export const soundEnabled = () => enabled && context?.state === 'running';

/** After a reload: the next tap or key press unlocks sound quietly. */
export function unlockOnFirstInteraction(): void {
  if (soundEnabled()) return;
  const unlock = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    void unlockSound(false).catch(() => undefined);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, soundEnabled);
}

/** "Spreman za rad" was confirmed in this sign-in; a new sign-in asks again. */
const READY_KEY = 'qafe.staff.ready';

export function readyConfirmed(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setReadyConfirmed(ready: boolean): void {
  try {
    if (ready) localStorage.setItem(READY_KEY, '1');
    else localStorage.removeItem(READY_KEY);
  } catch {
    // Storage blocked: the screen shows again after a reload.
  }
}

/** Two short tones; loud enough for a busy room. */
export function beep(): void {
  if (!context || !enabled) return;
  const now = context.currentTime;
  for (const [offset, frequency] of [
    [0, 880],
    [0.18, 1320],
  ] as const) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    osc.connect(gain).connect(context.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.17);
  }
}

/**
 * Vibration with the alert, where the phone allows it (Android browsers; iOS Safari does
 * not support it). Browsers allow it only after the user has touched the page once.
 */
export function vibrate(pattern: number[] = [200, 100, 200]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: the sound and the screen still alert.
  }
}
