import type { GuestVenue } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { MenuView } from '../components/MenuView';
import { menuQuery } from '../lib/queries';

/** Not at a table: the menu to browse and how to start ordering. */
export function LandingScreen({ venue }: { venue: GuestVenue }) {
  const { t } = useTranslation();
  const menu = useQuery(menuQuery);
  return (
    <div className="min-h-dvh bg-canvas">
      <Header venue={venue} />
      <main className="mx-auto max-w-2xl">
        <div className="m-4 flex gap-3 rounded-2xl border border-line bg-surface p-4">
          <QrCode className="size-6 shrink-0 text-accent" aria-hidden />
          <div>
            <h2 className="font-semibold text-ink">{t('landing.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('landing.body')}</p>
          </div>
        </div>
        {menu.data && <MenuView menu={menu.data} currency={venue.currency} />}
      </main>
    </div>
  );
}
