import type { ReportSummary } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';
import { shortDate } from '../lib/periods';
import { reportQuery } from '../lib/queries';
import { useStaff } from '../lib/useAuth';

/**
 * FR-SEF-25 PDF: the report as an A4 print layout. The browser's print dialog saves it as PDF,
 * like the QR cards; no PDF library needed.
 */
export function ReportPrintPage() {
  const { t, i18n } = useTranslation();
  const staff = useStaff();
  const { from, to } = useSearch({ from: '/print/reports/print' });
  const report = useQuery(reportQuery(from, to));

  useEffect(() => {
    if (!report.data) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [report.data]);

  if (!report.data) return <p className="p-8 text-sm">{t('common.loading')}</p>;
  const r = report.data;
  const money = (v: string) => formatMoney(v, 'BAM', i18n.language);
  const weekdays = t('settings.weekdays', { returnObjects: true });

  return (
    <div className="mx-auto max-w-[180mm] bg-white p-8 text-[11pt] text-black print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <header className="mb-6 border-b border-black/20 pb-3">
        <p className="text-sm text-black/60">{staff.venue.name}</p>
        <h1 className="text-2xl font-bold">{t('reports.printTitle')}</h1>
        <p className="text-sm">
          {t('reports.printPeriod', {
            from: shortDate(r.from, i18n.language, true),
            to: shortDate(r.to, i18n.language, true),
          })}
        </p>
      </header>

      <Table
        rows={[
          [t('reports.revenue'), money(r.totals.revenue)],
          [t('reports.vat', { vat: '' }).trim(), money(r.totals.vatAmount)],
          [t('reports.orders'), String(r.totals.orders)],
          [t('reports.items'), String(r.totals.items)],
          [t('reports.average'), money(r.totals.averageOrder)],
        ]}
      />

      <Section title={t('reports.byDay')}>
        <Table
          head={[t('orders.date'), t('reports.orders'), t('reports.revenue')]}
          rows={r.byDay
            .filter((d) => d.orders > 0)
            .map((d) => [
              shortDate(d.date, i18n.language, true),
              String(d.orders),
              money(d.revenue),
            ])}
        />
      </Section>
      <Section title={t('reports.byItem')}>
        <Table
          head={[
            t('reports.item'),
            t('reports.category'),
            t('reports.quantity'),
            t('reports.revenue'),
          ]}
          rows={r.byItem.map((i) => [
            i.name,
            i.category ?? '—',
            String(i.quantity),
            money(i.revenue),
          ])}
        />
      </Section>
      <Section title={t('reports.byCategory')}>
        <Table
          head={[t('reports.category'), t('reports.quantity'), t('reports.revenue')]}
          rows={r.byCategory.map((c) => [c.name ?? '—', String(c.quantity), money(c.revenue)])}
        />
      </Section>
      <Section title={t('reports.byMember')}>
        <Table
          head={[t('reports.member'), t('reports.orders'), t('reports.revenue')]}
          rows={r.byMember.map((m) => [m.name ?? '—', String(m.orders), money(m.revenue)])}
        />
      </Section>
      <Section title={t('reports.byPayment')}>
        <Table
          head={[t('reports.method'), t('reports.orders'), t('reports.revenue')]}
          rows={r.byPaymentMethod.map((p) => [
            p.method ? t(`reports.methods.${p.method}`) : '—',
            String(p.orders),
            money(p.revenue),
          ])}
        />
      </Section>
      <Section title={t('reports.byWeekday')}>
        <Table
          head={[t('reports.day'), t('reports.orders'), t('reports.revenue')]}
          rows={r.byWeekday.map((d) => [
            weekdays[d.day - 1] ?? String(d.day),
            String(d.orders),
            money(d.revenue),
          ])}
        />
      </Section>
      <HourSection report={r} money={money} />

      <p className="mt-8 text-xs text-black/50">
        {t('reports.printedAt', {
          date: new Date().toLocaleString(i18n.language === 'bs' ? 'bs-BA' : 'en-GB'),
        })}
      </p>
    </div>
  );
}

function HourSection({ report, money }: { report: ReportSummary; money: (v: string) => string }) {
  const { t } = useTranslation();
  const hours = report.byHour.filter((h) => h.orders > 0);
  if (hours.length === 0) return null;
  return (
    <Section title={t('reports.byHour')}>
      <Table
        head={[t('reports.hour'), t('reports.orders'), t('reports.revenue')]}
        rows={hours.map((h) => [
          `${String(h.hour).padStart(2, '0')}:00`,
          String(h.orders),
          money(h.revenue),
        ])}
      />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head?: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-[10pt]">
      {head && (
        <thead>
          <tr className="border-b border-black/40">
            {head.map((h, i) => (
              <th
                key={h}
                className={`py-1 pr-2 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-black/10">
            {row.map((cell, j) => (
              <td
                key={j}
                className={`py-1 pr-2 ${j === 0 ? 'text-left' : 'text-right tabular-nums'}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
