const cents = (value: string | number) => Math.round(Number(value) * 100);

/** "2.50" → "2,50 KM" (BAM), or the locale's currency format for others. */
export function formatMoney(amount: string | number, currency: string, language: string): string {
  const value = cents(amount) / 100;
  if (currency === 'BAM') return `${value.toFixed(2).replace('.', ',')} KM`;
  return new Intl.NumberFormat(language === 'bs' ? ['bs-BA', 'hr-HR'] : ['en-GB'], {
    style: 'currency',
    currency,
  }).format(value);
}

/** "+0,50 KM" for a modifier option; "" when it costs nothing extra. */
export function formatDelta(amount: string, currency: string, language: string): string {
  const value = cents(amount);
  if (value === 0) return '';
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value) / 100, currency, language)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Sum of decimal strings without floating point drift. */
export function sumMoney(values: (string | number)[]): string {
  return (values.reduce<number>((s, v) => s + cents(v), 0) / 100).toFixed(2);
}

export function multiplyMoney(value: string | number, times: number): string {
  return ((cents(value) * times) / 100).toFixed(2);
}
