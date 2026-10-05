import { MenuEditor } from '@qafe/menu-editor';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@qafe/ui';
import { api, errorKey } from '../lib/api';
import { venueQuery } from '../lib/queries';

/**
 * FR-ADM-07: the menu of any venue, to help the owner set it up. Same editor as the venue
 * panel, pointed at /admin/venues/<id>/catalog; every change runs in that venue's context and
 * goes to its audit log with the admin as the actor. Prep stations (KDS) stay the owner's.
 */
export function VenueMenuPage() {
  const { t } = useTranslation();
  const { venueId } = useParams({ from: '/app/venues/$venueId/menu' });
  const venue = useQuery(venueQuery(venueId));

  return (
    <div className="animate-fade-up">
      <Link
        to="/venues/$venueId"
        params={{ venueId }}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-accent"
      >
        <ArrowLeft className="size-4" />
        {venue.data ? t('venueMenu.back', { name: venue.data.name }) : t('venue.back')}
      </Link>
      {venue.isError ? (
        <Card className="p-5 text-sm text-danger">{t(errorKey(venue.error))}</Card>
      ) : !venue.data ? (
        <Card className="h-96 animate-pulse" />
      ) : (
        <MenuEditor
          request={(path, init) => api(`/admin/venues/${venueId}/catalog${path}`, init)}
          queryKey={['admin', 'venues', venueId, 'menu']}
          errorText={(error) => t(errorKey(error))}
          currency={venue.data.currency}
          canEdit
          canToggle
          stations={null}
          title={t('venueMenu.title', { name: venue.data.name })}
          subtitle={t('venueMenu.subtitle')}
        />
      )}
    </div>
  );
}
