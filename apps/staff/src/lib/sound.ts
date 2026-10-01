/**
 * Alert sound with Web Audio (no file to load). Browsers allow sound only after a tap, so
 * "Spreman za rad" calls unlock() first (FR-KON-02).
 */
let context: AudioContext | null = null;
let enabled = false;

export async function unlockSound(): Promise<void> {
  context ??= new AudioContext();
  await context.resume();
  enabled = true;
  beep();
}

export const soundEnabled = () => enabled && context?.state === 'running';

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
