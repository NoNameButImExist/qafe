import type { ReportDimension, ReportSummary } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, Input, Select } from '@qafe/ui';
import { RankTable, RevenueChart, StatTile } from '../components/reports/ReportParts';
import { download, errorKey } from '../lib/api';
import { formatMoney } from '../lib/format';
import { presetRange, shortDate, type Preset } from '../lib/periods';
import { reportQuery } from '../lib/queries';
import { useNotice } from '@qafe/ui';

const PRESETS: Preset[] = ['today', 'yesterday', 'week', 'last7', 'month', 'lastMonth'];
const PERIOD_KEY = 'qafe.panel.reportPeriod';

function initialPreset(): Preset {
  try {
    const stored = localStorage.getItem(PERIOD_KEY);
    if (stored && (PRESETS as string[]).includes(stored)) return stored as Preset;
  } catch {
    // Storage blocked: the default period.
  }
  return 'last7';
}

/** FR-SEF-24, FR-SEF-25: revenue of paid tables with comparison, charts, tables and export. */
export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [preset, setPreset] = useState<Preset | 'custom'>(initialPreset);
  const [custom, setCustom] = useState(() => presetRange('last7'));
  const range = preset === 'custom' ? custom : presetRange(preset);
  const valid = range.from <= range.to;
  const report = useQuery({ ...reportQuery(range.from, range.to), enabled: valid });
  const [csvDimension, setCsvDimension] = useState<ReportDimension>('day');
  const [notice, setNotice] = useNotice();

  const choose = (p: Preset | 'custom') => {
    setPreset(p);
    if (p !== 'custom') {
      try {
        localStorage.setItem(PERIOD_KEY, p);
      } catch {
        // Storage blocked: the period lasts for this page only.
      }
    }
  };

  const lang = i18n.language === 'en' ? 'en' : 'bs';
  const exportQuery = `from=${range.from}&to=${range.to}&lang=${lang}`;
  const exportFile = async (path: string) => {
    try {
      await download(path);
    } catch (error) {
      setNotice({ tone: 'error', text: t(errorKey(error)) });
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('reports.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('reports.subtitle')}</p>
        </div>
        {report.data && report.data.totals.orders > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="size-4" />}
              onClick={() => void exportFile(`/reports/export?${exportQuery}&format=xlsx`)}
            >
              {t('reports.excel')}
            </Button>
            <div className="flex items-center gap-1">
              <Select
                aria-label={t('reports.csv')}
                value={csvDimension}
                onChange={(e) => setCsvDimension(e.target.value as ReportDimension)}
                className="h-9 w-40 text-[13px]"
              >
                {(['day', 'item', 'category', 'member', 'hour', 'weekday', 'payment'] as const).map(
                  (d) => (
                    <option key={d} value={d}>
                      {t(DIMENSION_LABEL[d])}
                    </option>
                  ),
                )}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="size-4" />}
                onClick={() =>
                  void exportFile(
                    `/reports/export?${exportQuery}&format=csv&dimension=${csvDimension}`,
                  )
                }
              >
                {t('reports.csv')}
              </Button>
            </div>
            <a
              href={`/reports/print?from=${range.from}&to=${range.to}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2"
            >
              <Printer className="size-4" /> {t('reports.pdf')}
            </a>
          </div>
        )}
      </div>

      <div
        className="mt-6 flex flex-wrap items-end gap-2"
        role="group"
        aria-label={t('reports.period')}
      >
        {[...PRESETS, 'custom' as const].map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={preset === p}
            onClick={() => choose(p)}
            className={cn(
              'h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
              preset === p
                ? 'border-primary bg-primary text-on-primary'
                : 'border-line bg-surface text-ink hover:border-line-strong',
            )}
          >
            {t(`reports.presets.${p}`)}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={t('reports.from')}
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="h-9 w-40"
            />
            <span className="text-muted">–</span>
            <Input
              type="date"
              aria-label={t('reports.to')}
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="h-9 w-40"
            />
          </div>
        )}
      </div>

      {notice && (
        <Card className="mt-4 flex items-center gap-2 p-3 text-sm text-danger">
          <CircleAlert className="size-4" /> {notice.text}
        </Card>
      )}

      {report.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" /> {t(errorKey(report.error))}
        </Card>
      ) : !report.data ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <ReportBody report={report.data} language={i18n.language} />
      )}
    </div>
  );
}

const DIMENSION_LABEL = {
  day: 'reports.byDay',
  hour: 'reports.byHour',
  weekday: 'reports.byWeekday',
  item: 'reports.byItem',
  category: 'reports.byCategory',
  member: 'reports.byMember',
  payment: 'reports.byPayment',
} as const;

function ReportBody({ report, language }: { report: ReportSummary; language: string }) {
  const { t } = useTranslation();
  const money = (v: string) => formatMoney(v, 'BAM', language);
  const { totals, previous } = report;
  const total = Number(totals.revenue);

  if (totals.orders === 0) {
    return (
      <Card className="mt-6 p-10 text-center">
        <p className="font-semibold text-ink">{t('reports.empty')}</p>
        <p className="mt-1 text-sm text-muted">{t('reports.emptyHint')}</p>
      </Card>
    );
  }

  const weekdays = t('reports.weekdaysShort', { returnObjects: true });
  const longWeekdays = t('settings.weekdays', { returnObjects: true });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t('reports.revenue')}
          value={money(totals.revenue)}
          hint={t('reports.vat', { vat: money(totals.vatAmount) })}
          current={totals.revenue}
          previous={previous.totals.revenue}
          previousLabel={previous}
        />
        <StatTile
          label={t('reports.orders')}
          value={String(totals.orders)}
          current={totals.orders}
          previous={previous.totals.orders}
          previousLabel={previous}
        />
        <StatTile
          label={t('reports.items')}
          value={String(totals.items)}
          current={totals.items}
          previous={previous.totals.items}
          previousLabel={previous}
        />
        <StatTile
          label={t('reports.average')}
          value={money(totals.averageOrder)}
          current={totals.averageOrder}
          previous={previous.totals.averageOrder}
          previousLabel={previous}
        />
      </div>

      {report.byDay.length > 1 && (
        <RevenueChart
          title={t('reports.byDay')}
          points={report.byDay.map((d) => ({
            label: shortDate(d.date, language),
            title: shortDate(d.date, language, true),
            revenue: Number(d.revenue),
            orders: d.orders,
          }))}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart
          title={t('reports.byHour')}
          points={report.byHour.map((h) => ({
            label: String(h.hour).padStart(2, '0'),
            title: `${String(h.hour).padStart(2, '0')}:00–${String(h.hour).padStart(2, '0')}:59`,
            revenue: Number(h.revenue),
            orders: h.orders,
          }))}
        />
        <RevenueChart
          title={t('reports.byWeekday')}
          points={report.byWeekday.map((d) => ({
            label: weekdays[d.day - 1] ?? String(d.day),
            title: longWeekdays[d.day - 1] ?? String(d.day),
            revenue: Number(d.revenue),
            orders: d.orders,
          }))}
        />
      </div>

      <RankTable
        title={t('reports.byItem')}
        columns={[t('reports.item'), t('reports.category'), t('reports.quantity')]}
        total={total}
        rows={report.byItem.map((i) => ({
          cells: [i.name, i.category ?? t('reports.none'), i.quantity],
          revenue: Number(i.revenue),
        }))}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <RankTable
          title={t('reports.byCategory')}
          columns={[t('reports.category'), t('reports.quantity')]}
          total={total}
          rows={report.byCategory.map((c) => ({
            cells: [c.name ?? t('reports.none'), c.quantity],
            revenue: Number(c.revenue),
          }))}
        />
        <RankTable
          title={t('reports.byMember')}
          columns={[t('reports.member'), t('reports.orders')]}
          total={total}
          rows={report.byMember.map((m) => ({
            cells: [m.name ?? t('reports.none'), m.orders],
            revenue: Number(m.revenue),
          }))}
        />
      </div>
      <RankTable
        title={t('reports.byPayment')}
        columns={[t('reports.method'), t('reports.orders')]}
        total={total}
        rows={report.byPaymentMethod.map((p) => ({
          cells: [p.method ? t(`reports.methods.${p.method}`) : t('reports.none'), p.orders],
          revenue: Number(p.revenue),
        }))}
      />
    </div>
  );
}
