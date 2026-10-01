import type { ReportDimension, ReportSummary } from '@qafe/contracts';
import writeXlsxFile, { type Sheet } from 'write-excel-file/node';

type Lang = 'bs' | 'en';

/** Byte order mark: tells Excel the CSV is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

const TEXT = {
  bs: {
    sheets: {
      day: 'Po danu',
      hour: 'Po satu',
      weekday: 'Po danu u sedmici',
      item: 'Po artiklu',
      category: 'Po kategoriji',
      member: 'Po konobaru',
      payment: 'Po načinu plaćanja',
    },
    columns: {
      day: 'Datum',
      hour: 'Sat',
      weekday: 'Dan',
      item: 'Artikal',
      category: 'Kategorija',
      member: 'Konobar',
      payment: 'Način plaćanja',
      quantity: 'Količina',
      orders: 'Narudžbe',
      revenue: 'Promet (KM)',
    },
    weekdays: ['Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'],
    methods: { cash: 'Gotovina', card: 'Kartica', online: 'Online' },
    none: '—',
  },
  en: {
    sheets: {
      day: 'By day',
      hour: 'By hour',
      weekday: 'By weekday',
      item: 'By item',
      category: 'By category',
      member: 'By waiter',
      payment: 'By payment method',
    },
    columns: {
      day: 'Date',
      hour: 'Hour',
      weekday: 'Day',
      item: 'Item',
      category: 'Category',
      member: 'Waiter',
      payment: 'Payment method',
      quantity: 'Quantity',
      orders: 'Orders',
      revenue: 'Revenue (KM)',
    },
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    methods: { cash: 'Cash', card: 'Card', online: 'Online' },
    none: '—',
  },
} as const;

/** One report table: a header row and value rows (numbers as numbers). */
export function reportTable(
  summary: ReportSummary,
  dimension: ReportDimension,
  lang: Lang,
): { header: string[]; rows: (string | number)[][] } {
  const t = TEXT[lang];
  const c = t.columns;
  const money = (v: string) => Number(v);
  switch (dimension) {
    case 'day':
      return {
        header: [c.day, c.orders, c.quantity, c.revenue],
        rows: summary.byDay.map((r) => [r.date, r.orders, r.quantity, money(r.revenue)]),
      };
    case 'hour':
      return {
        header: [c.hour, c.orders, c.quantity, c.revenue],
        rows: summary.byHour.map((r) => [
          `${String(r.hour).padStart(2, '0')}:00`,
          r.orders,
          r.quantity,
          money(r.revenue),
        ]),
      };
    case 'weekday':
      return {
        header: [c.weekday, c.orders, c.quantity, c.revenue],
        rows: summary.byWeekday.map((r) => [
          t.weekdays[r.day - 1]!,
          r.orders,
          r.quantity,
          money(r.revenue),
        ]),
      };
    case 'item':
      return {
        header: [c.item, c.category, c.quantity, c.orders, c.revenue],
        rows: summary.byItem.map((r) => [
          r.name,
          r.category ?? t.none,
          r.quantity,
          r.orders,
          money(r.revenue),
        ]),
      };
    case 'category':
      return {
        header: [c.category, c.quantity, c.orders, c.revenue],
        rows: summary.byCategory.map((r) => [
          r.name ?? t.none,
          r.quantity,
          r.orders,
          money(r.revenue),
        ]),
      };
    case 'member':
      return {
        header: [c.member, c.orders, c.quantity, c.revenue],
        rows: summary.byMember.map((r) => [
          r.name ?? t.none,
          r.orders,
          r.quantity,
          money(r.revenue),
        ]),
      };
    case 'payment':
      return {
        header: [c.payment, c.orders, c.quantity, c.revenue],
        rows: summary.byPaymentMethod.map((r) => [
          r.method ? t.methods[r.method] : t.none,
          r.orders,
          r.quantity,
          money(r.revenue),
        ]),
      };
  }
}

/**
 * CSV the way Excel opens it in the language's locale: Bosnian uses ";" and a decimal comma,
 * English "," and a decimal point. A BOM makes Excel read UTF-8 (č, ć, š, ž, đ).
 */
export function toCsv(
  table: { header: string[]; rows: (string | number)[][] },
  lang: Lang,
): string {
  const separator = lang === 'bs' ? ';' : ',';
  const cell = (value: string | number) => {
    const text =
      typeof value === 'number'
        ? lang === 'bs'
          ? String(value).replace('.', ',')
          : String(value)
        : value;
    return /[";,\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [table.header, ...table.rows].map((row) => row.map(cell).join(separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export const DIMENSIONS: ReportDimension[] = [
  'day',
  'item',
  'category',
  'member',
  'hour',
  'weekday',
  'payment',
];

/** One workbook, one sheet per table (or just the asked one). */
export async function toXlsx(
  summary: ReportSummary,
  lang: Lang,
  only?: ReportDimension,
): Promise<Buffer> {
  const sheets: Sheet<Buffer>[] = (only ? [only] : DIMENSIONS).map((dimension) => {
    const table = reportTable(summary, dimension, lang);
    return {
      sheet: TEXT[lang].sheets[dimension].slice(0, 31),
      stickyRowsCount: 1,
      columns: table.header.map((_, i) => ({ width: i === 0 ? 28 : 14 })),
      data: [
        table.header.map((value) => ({ value, fontWeight: 'bold' as const })),
        ...table.rows.map((row) =>
          row.map((value, i) =>
            typeof value === 'number' && i === row.length - 1
              ? { value, type: Number, format: '#,##0.00' }
              : { value },
          ),
        ),
      ],
    };
  });
  return writeXlsxFile(sheets).toBuffer();
}
