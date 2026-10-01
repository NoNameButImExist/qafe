import i18n from '../i18n';

// Bosnian first; Croatian formats dates the same way. Some runtimes ship with neither,
// then the Bosnian names below are used.
const BS_LOCALES = ['bs-BA', 'hr-HR'];
// Some runtimes claim support but lack the data and print "M09"; check the actual output.
const bsSupported = !/M\d/.test(
  new Intl.DateTimeFormat(BS_LOCALES, { month: 'short' }).format(new Date(2026, 8, 1)),
);
const BS_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];
const BS_MONTHS_LONG = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
];
const BS_WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];

const manualBosnian = () => i18n.language === 'bs' && !bsSupported;
const locales = () => (i18n.language === 'bs' ? BS_LOCALES : ['en-GB']);

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (manualBosnian())
    return `${date.getDate()}. ${BS_MONTHS[date.getMonth()]} ${date.getFullYear()}.`;
  return new Intl.DateTimeFormat(locales(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatToday(date = new Date()): string {
  if (manualBosnian()) {
    return `${BS_WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${BS_MONTHS_LONG[date.getMonth()]}`;
  }
  return new Intl.DateTimeFormat(locales(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language === 'bs' ? BS_LOCALES : ['en-GB'], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function greetingKey(hour = new Date().getHours()) {
  if (hour < 11) return 'overview.greeting.morning' as const;
  if (hour < 18) return 'overview.greeting.day' as const;
  return 'overview.greeting.evening' as const;
}

/** Guest menu host for a slug; production domain unless configured otherwise. */
export function venueHost(slug: string): string {
  const domain = (import.meta.env.VITE_PUBLIC_DOMAIN as string | undefined) ?? 'qafe.ba';
  return `${slug || '…'}.${domain}`;
}
