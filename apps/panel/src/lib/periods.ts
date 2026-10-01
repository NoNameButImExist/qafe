/** Report periods as local calendar dates ("2026-10-01"). Weeks start on Monday. */

export type Preset = 'today' | 'yesterday' | 'week' | 'last7' | 'month' | 'lastMonth';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function presetRange(preset: Preset, today = new Date()): { from: string; to: string } {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case 'today':
      return { from: iso(day), to: iso(day) };
    case 'yesterday':
      return { from: iso(addDays(day, -1)), to: iso(addDays(day, -1)) };
    case 'week': {
      const monday = addDays(day, -((day.getDay() + 6) % 7));
      return { from: iso(monday), to: iso(day) };
    }
    case 'last7':
      return { from: iso(addDays(day, -6)), to: iso(day) };
    case 'month':
      return { from: iso(new Date(day.getFullYear(), day.getMonth(), 1)), to: iso(day) };
    case 'lastMonth':
      return {
        from: iso(new Date(day.getFullYear(), day.getMonth() - 1, 1)),
        to: iso(new Date(day.getFullYear(), day.getMonth(), 0)),
      };
  }
}

/** "2026-10-01" → "1. 10." (bs) or "1 Oct" (en); with the year when asked. */
export function shortDate(value: string, language: string, withYear = false): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (language === 'bs') return `${d}. ${m}.${withYear ? ` ${y}.` : ''}`;
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][m - 1];
  return `${d} ${month}${withYear ? ` ${y}` : ''}`;
}

/** Change against the previous period: "+12 %", or null when there is nothing to compare. */
export function percentChange(current: string | number, previous: string | number): number | null {
  const prev = Number(previous);
  if (prev === 0) return null;
  return Math.round(((Number(current) - prev) / prev) * 100);
}
