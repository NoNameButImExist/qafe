const cents = (value: string | number) => Math.round(Number(value) * 100);

/** "2.50" → "2,50 KM". */
export function formatMoney(amount: string | number, currency = 'BAM'): string {
  const value = cents(amount) / 100;
  if (currency === 'BAM') return `${value.toFixed(2).replace('.', ',')} KM`;
  return new Intl.NumberFormat('bs-BA', { style: 'currency', currency }).format(value);
}

export function sumMoney(values: (string | number)[]): string {
  return (values.reduce<number>((s, v) => s + cents(v), 0) / 100).toFixed(2);
}

export function multiplyMoney(value: string | number, times: number): string {
  return ((cents(value) * times) / 100).toFixed(2);
}

/** Whole minutes since a time, for "prije 4 min" and waiting colours. */
export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
