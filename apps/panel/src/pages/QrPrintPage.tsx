import type { VenueTable } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Coffee, FaceSlightlySmiling, Printer, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Brand, Button } from '@qafe/ui';
import { QrCode } from '../components/QrCode';
import { spaceQuery } from '../lib/queries';
import { useStaff } from '../lib/useAuth';

const PER_PAGE = 6;

/**
 * FR-SEF-15: table cards with QR codes, six per A4 page, in the look of the printed
 * table tents. The browser's print dialog also saves them as a PDF (with full Bosnian fonts).
 */
export function QrPrintPage() {
  const { t } = useTranslation();
  const staff = useStaff();
  const { ids } = useSearch({ from: '/print/tables/print' });
  const space = useQuery(spaceQuery);

  const wanted = ids?.split(',').filter(Boolean);
  const tables = (space.data?.tables ?? []).filter((x) =>
    wanted ? wanted.includes(x.id) : x.isActive,
  );
  const pages = Array.from({ length: Math.ceil(tables.length / PER_PAGE) }, (_, i) =>
    tables.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
  );

  return (
    <div className="min-h-dvh bg-surface-2 print:bg-white">
      <style>{`@page { size: A4; margin: 0; } @media print { html, body { background: #fff !important; } }`}</style>

      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/90 px-6 py-4 backdrop-blur print:hidden">
        <div className="flex items-center gap-4">
          <Link
            to="/tables"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-accent"
          >
            <ArrowLeft className="size-4" />
            {t('tables.print.back')}
          </Link>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">
              {t('tables.print.title')}
            </h1>
            <p className="text-xs text-muted">
              {t('tables.count', { count: tables.length })} · {t('tables.print.hint')}
            </p>
          </div>
        </div>
        <Button
          icon={<Printer className="size-4" />}
          disabled={tables.length === 0}
          onClick={() => window.print()}
        >
          {t('tables.print.print')}
        </Button>
      </header>

      {space.data && tables.length === 0 && (
        <p className="p-10 text-center text-sm text-muted">{t('tables.print.none')}</p>
      )}

      <div className="flex flex-col items-center gap-8 py-8 print:block print:p-0">
        {pages.map((page, i) => (
          <section
            key={i}
            className="grid h-[297mm] w-[210mm] shrink-0 grid-cols-2 grid-rows-3 gap-[6mm] bg-white p-[10mm] shadow-xl print:break-after-page print:shadow-none"
          >
            {page.map((table) => (
              <Card key={table.id} table={table} venueName={staff.venue.name} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Card({ table, venueName }: { table: VenueTable; venueName: string }) {
  const { t } = useTranslation();
  const steps = [
    { icon: ScanLine, label: t('tables.print.scan') },
    { icon: Coffee, label: t('tables.print.order') },
    { icon: FaceSlightlySmiling, label: t('tables.print.enjoy') },
  ];
  return (
    // Always the brand navy, whatever the screen theme: this is what gets printed.
    <article className="relative flex flex-col items-center overflow-hidden rounded-[5mm] bg-[#0B1F3F] px-[6mm] pt-[5mm] [&>*]:shrink-0 text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      <Brand onDark className="text-[17pt]" />
      <p className="mt-[1mm] text-[6.5pt] font-medium tracking-[0.3em] text-white/75 uppercase">
        {t('brand.tagline')}
      </p>

      <div className="relative mt-[4mm] rounded-[3mm] bg-white p-[2.5mm]">
        {/* Corner marks, as on the printed table cards. */}
        <span className="absolute -top-[2mm] -left-[2mm] size-[5mm] rounded-tl-[2mm] border-t-[0.7mm] border-l-[0.7mm] border-[#0086FA]" />
        <span className="absolute -top-[2mm] -right-[2mm] size-[5mm] rounded-tr-[2mm] border-t-[0.7mm] border-r-[0.7mm] border-[#0086FA]" />
        <span className="absolute -bottom-[2mm] -left-[2mm] size-[5mm] rounded-bl-[2mm] border-b-[0.7mm] border-l-[0.7mm] border-[#0086FA]" />
        <span className="absolute -right-[2mm] -bottom-[2mm] size-[5mm] rounded-br-[2mm] border-r-[0.7mm] border-b-[0.7mm] border-[#0086FA]" />
        <QrCode
          value={table.qrUrl}
          label={`${t('tables.print.table')} ${table.label}`}
          className="w-[30mm]"
        />
      </div>

      <p className="mt-[3mm] font-display text-[14pt] leading-none font-bold">
        {t('tables.print.table')} {table.label}
      </p>
      <p className="mt-[1.2mm] max-w-full truncate text-[7.5pt] text-white/75">{venueName}</p>

      <ul className="mt-auto mb-[8mm] flex w-full justify-around pt-[1.5mm]">
        {steps.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex flex-col items-center gap-[1mm] text-[6.5pt] font-medium text-white/85"
          >
            <Icon className="size-[5mm] text-[#0086FA]" strokeWidth={1.6} aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      {/* Blue wave at the bottom. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[7mm] w-full"
        viewBox="0 0 200 30"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 18 C 60 4, 120 34, 200 10 L 200 30 L 0 30 Z" fill="#0070E8" />
      </svg>
    </article>
  );
}
