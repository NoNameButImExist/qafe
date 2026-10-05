import { MenuEditor } from '@qafe/menu-editor';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, errorKey } from '../lib/api';
import { menuQuery, settingsQuery } from '../lib/queries';
import { useCan, useStaff } from '../lib/useAuth';

/** FR-SEF-17..19 (and FR-KON-22 for waiters: availability only), for the member's own venue. */
export function MenuPage() {
  const { t } = useTranslation();
  const { venue, modules } = useStaff();
  const canEdit = useCan('menu.edit');
  const canToggle = useCan('menu.edit', 'menu.availability');
  const kds = modules.includes('kds');
  const settings = useQuery({ ...settingsQuery, enabled: kds && canEdit });
  return (
    <MenuEditor
      request={(path, init) => api(`/catalog${path}`, init)}
      queryKey={menuQuery.queryKey}
      errorText={(error) => t(errorKey(error))}
      currency={venue.currency}
      canEdit={canEdit}
      canToggle={canToggle}
      stations={kds ? (settings.data?.stations ?? []) : null}
    />
  );
}
