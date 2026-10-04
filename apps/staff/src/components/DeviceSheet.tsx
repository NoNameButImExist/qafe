import { Button, Field, Input, Sheet } from '@qafe/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../lib/api';
import { deviceRosterQuery, forgetDevice, linkDevice } from '../lib/device';
import { useNotify } from '../lib/notice';

/** The owner links the device in hand for PIN sign-in, or unlinks it (FR-KON-01). */
export function DeviceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const roster = useQuery({ ...deviceRosterQuery, enabled: open });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: deviceRosterQuery.queryKey });
      notify({ tone: 'success', text: done });
      onClose();
    } catch (error) {
      notify({ tone: 'error', text: t(errorKey(error)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('pin.linkTitle')} description={t('pin.linkHint')}>
      {roster.data ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/8 p-4 text-sm text-ink">
            <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            {t('pin.linkedAs', { name: roster.data.device.name })}
          </p>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void run(forgetDevice, t('pin.forgotten'))}
          >
            {t('pin.forget')}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void run(() => linkDevice(name.trim()), t('pin.linked'));
          }}
        >
          <Field label={t('pin.linkName')}>
            {({ id }) => (
              <Input
                id={id}
                value={name}
                maxLength={60}
                placeholder={t('pin.linkNamePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            {t('pin.link')}
          </Button>
        </form>
      )}
    </Sheet>
  );
}
