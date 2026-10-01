import type { VenueSpace } from '@qafe/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Segmented, Select, Sheet } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { useSpaceMutation } from './useSpaceMutation';

/** FR-SEF-11: one table, or a numbered range such as S1…S10. */
export function AddTablesSheet({
  space,
  areaId,
  onClose,
}: {
  space: VenueSpace;
  areaId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'single' | 'bulk'>('bulk');
  const [label, setLabel] = useState('');
  const [prefix, setPrefix] = useState('S');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [seats, setSeats] = useState('4');
  const [area, setArea] = useState(areaId ?? '');

  const seatCount = seats.trim() ? Number(seats) : null;
  const count = to - from + 1;
  const bulkValid = Number.isInteger(from) && Number.isInteger(to) && count >= 1 && count <= 100;
  const valid = mode === 'single' ? label.trim().length > 0 : bulkValid;

  const save = useSpaceMutation(() =>
    mode === 'single'
      ? api<VenueSpace>('/venue/tables', {
          method: 'POST',
          body: { label: label.trim(), seats: seatCount, areaId: area || null },
        })
      : api<VenueSpace>('/venue/tables/bulk', {
          method: 'POST',
          body: { prefix: prefix.trim(), from, to, seats: seatCount, areaId: area || null },
        }),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('tables.add.title')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="tables-form" disabled={!valid} loading={save.isPending}>
            {t('tables.add.submit')}
          </Button>
        </div>
      }
    >
      <form
        id="tables-form"
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <Segmented
          label={t('tables.add.title')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'bulk', label: t('tables.add.bulk') },
            { value: 'single', label: t('tables.add.single') },
          ]}
        />
        {save.isError && (
          <p className="text-sm font-medium text-danger">{t(errorKey(save.error))}</p>
        )}

        {mode === 'single' ? (
          <Field label={t('tables.add.label')} hint={t('tables.add.labelHint')} required>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                autoFocus
                maxLength={20}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('tables.add.prefix')}>
                {({ id }) => (
                  <Input
                    id={id}
                    maxLength={10}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('tables.add.from')}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={999}
                    value={from}
                    onChange={(e) => setFrom(Number(e.target.value))}
                  />
                )}
              </Field>
              <Field label={t('tables.add.to')}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={999}
                    value={to}
                    onChange={(e) => setTo(Number(e.target.value))}
                  />
                )}
              </Field>
            </div>
            <p className="-mt-2 rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink">
              {bulkValid
                ? count === 1
                  ? t('tables.add.previewOne', { first: `${prefix}${from}` })
                  : t('tables.add.preview', {
                      first: `${prefix}${from}`,
                      last: `${prefix}${to}`,
                      count: t('tables.count', { count }),
                    })
                : t('errors.validation_failed')}
              <span className="mt-1 block text-xs text-muted">{t('tables.add.skipHint')}</span>
            </p>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('tables.add.seats')}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={99}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
              />
            )}
          </Field>
          <Field label={t('tables.add.area')}>
            {({ id }) => (
              <Select id={id} value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">{t('tables.noArea')}</option>
                {space.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
