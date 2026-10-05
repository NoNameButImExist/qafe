/** Money as the venue shows it: "2,50 KM" for BAM, the locale's format for other currencies. */
export function formatMoney(amount: string, currency: string, language: string): string {
  const value = Number(amount);
  if (currency === 'BAM') return `${value.toFixed(2).replace('.', ',')} KM`;
  return new Intl.NumberFormat(language === 'bs' ? ['bs-BA', 'hr-HR'] : ['en-GB'], {
    style: 'currency',
    currency,
  }).format(value);
}

/** A modifier's surcharge: "+0,50 KM", "−1,00 KM", or nothing for zero. */
export function formatDelta(amount: string, currency: string, language: string): string {
  const value = Number(amount);
  if (value === 0) return '';
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value).toFixed(2), currency, language)}`;
}
