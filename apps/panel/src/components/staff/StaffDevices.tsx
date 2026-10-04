import type { StaffDevice } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ConfirmDialog } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { formatDate } from '../../lib/format';

const devicesQuery = {
  queryKey: ['staff-devices'],
  queryFn: () => api<StaffDevice[]>('/venue/staff-devices'),
};

/**
 * Shared devices linked for PIN sign-in (FR-KON-01). They are linked in the staff app
 * ("Ovaj uređaj"); here the owner sees them and revokes a lost or replaced one.
 */
export function StaffDevices({ onError }: { onError: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const devices = useQuery(devicesQuery);
  const [revoking, setRevoking] = useState<StaffDevice | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>(`/venue/staff-devices/${id}`, { method: 'DELETE' }),
    onSettled: () => {
      setRevoking(null);
      void queryClient.invalidateQueries({ queryKey: devicesQuery.queryKey });
    },
    onError: (error) => onError(t(errorKey(error))),
  });

  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
        <MonitorSmartphone className="size-5 text-accent" aria-hidden />
        {t('staff.devices.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('staff.devices.hint')}</p>
      {devices.data && devices.data.length === 0 && (
        <p className="mt-4 text-sm text-muted">{t('staff.devices.empty')}</p>
      )}
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {devices.data?.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{d.name}</p>
              <p className="text-xs text-muted">
                {t('staff.devices.linkedAt', { date: formatDate(d.createdAt, i18n.language) })}
                {' · '}
                {d.lastUsedAt
                  ? t('staff.devices.usedAt', { date: formatDate(d.lastUsedAt, i18n.language) })
                  : t('staff.devices.neverUsed')}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setRevoking(d)}>
              {t('staff.devices.revoke')}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={revoking !== null}
        title={t('staff.devices.revokeTitle', { name: revoking?.name ?? '' })}
        body={t('staff.devices.revokeBody')}
        confirmLabel={t('staff.devices.revoke')}
        tone="danger"
        loading={revoke.isPending}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Card>
  );
}
