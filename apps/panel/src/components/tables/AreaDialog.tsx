import type { VenueArea, VenueSpace } from '@qafe/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Sheet } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { useSpaceMutation } from './useSpaceMutation';

export function AreaDialog({ area, onClose }: { area: VenueArea | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(area?.name ?? '');
  const save = useSpaceMutation(() =>
    area
      ? api<VenueSpace>(`/venue/areas/${area.id}`, { method: 'PATCH', body: { name } })
      : api<VenueSpace>('/venue/areas', { method: 'POST', body: { name } }),
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={area ? t('tables.editArea') : t('tables.newArea')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="area-form" disabled={!name.trim()} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form
        id="area-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: onClose });
        }}
      >
        {save.isError && (
          <p className="text-sm font-medium text-danger">{t(errorKey(save.error))}</p>
        )}
        <Field label={t('tables.areaName')} hint={t('tables.areaNameHint')} required>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
