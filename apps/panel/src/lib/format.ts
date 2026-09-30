export function greetingKey(hour = new Date().getHours()) {
  if (hour < 11) return 'overview.greeting.morning' as const;
  if (hour < 18) return 'overview.greeting.day' as const;
  return 'overview.greeting.evening' as const;
}

/** "2.50" → "2,50 KM" (BAM) or a locale currency format for other currencies. */
export function formatMoney(amount: string, currency: string, language: string): string {
  const value = Number(amount);
  if (currency === 'BAM') return `${value.toFixed(2).replace('.', ',')} KM`;
  return new Intl.NumberFormat(language === 'bs' ? ['bs-BA', 'hr-HR'] : ['en-GB'], {
    style: 'currency',
    currency,
  }).format(value);
}

/** A signed extra charge for modifier options: "+0,50 KM", "−0,20 KM", "" for zero. */
export function formatDelta(amount: string, currency: string, language: string): string {
  const value = Number(amount);
  if (value === 0) return '';
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value).toFixed(2), currency, language)}`;
}

/** Guest menu host for a slug; production domain unless configured otherwise. */
export function venueHost(slug: string): string {
  const domain = (import.meta.env.VITE_PUBLIC_DOMAIN as string | undefined) ?? 'qafe.ba';
  return `${slug}.${domain}`;
}
