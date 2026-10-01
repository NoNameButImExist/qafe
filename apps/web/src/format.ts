import type { Locale } from './i18n/context';

export function formatPrice(amount: number, currency: string, locale: Locale): string {
  const number = new Intl.NumberFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${number} ${currency}`;
}
