import type { VenueSpace, VenueTable } from '@qafe/contracts';
import { Link } from '@tanstack/react-router';
import { Check, Copy, Printer, RefreshCw, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, Field, Input, Select, Sheet, Switch } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { QrCode } from '../QrCode';
import { useSpaceMutation } from './useSpaceMutation';

/** One table: label, seats, area, active, its QR code (FR-SEF-15) and replacing it (FR-SEF-16). */
export function TableSheet({
  space,
  table,
  onClose,
  onNotice,
}: {
  space: VenueSpace;
  table: VenueTable;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    label: table.label,
    seats: table.seats?.toString() ?? '',
    areaId: table.areaId ?? '',
    isActive: table.isActive,
  });
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null);
  const [copied, setCopied] = useState(false);

  const save = useSpaceMutation(() =>
    api<VenueSpace>(`/venue/tables/${table.id}`, {
      method: 'PATCH',
      body: {
        label: form.label.trim(),
        seats: form.seats.trim() ? Number(form.seats) : null,
        areaId: form.areaId || null,
        isActive: form.isActive,
      },
    }),
  );
  const rotate = useSpaceMutation(() =>
    api<VenueSpace>(`/venue/tables/${table.id}/qr`, { method: 'POST' }),
  );
  const remove = useSpaceMutation(() =>
    api<VenueSpace>(`/venue/tables/${table.id}`, { method: 'DELETE' }),
  );
  const error = save.error ?? rotate.error ?? remove.error;

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('tables.table.title', { label: table.label })}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            icon={<Trash className="size-4" />}
            onClick={() => setConfirm('delete')}
            className="text-danger! hover:bg-danger/10!"
          >
            {t('tables.table.delete')}
          </Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="table-form"
              disabled={!form.label.trim()}
              loading={save.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {error != null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {t(errorKey(error))}
          </p>
        )}

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-start gap-5">
            <QrCode
              value={table.qrUrl}
              label={`${t('tables.table.qr')} ${table.label}`}
              className="w-36 shrink-0 rounded-lg bg-white p-2"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold text-ink">{t('tables.table.qr')}</p>
              <p className="mt-1 text-xs text-muted">{t('tables.table.qrHint')}</p>
              <p className="mt-2 text-[11px] font-semibold text-muted">
                {t('tables.table.version', { version: table.qrVersion })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={
                    copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />
                  }
                  onClick={() =>
                    void navigator.clipboard.writeText(table.qrUrl).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? t('common.copied') : t('tables.table.copyLink')}
                </Button>
                <Link
                  to="/tables/print"
                  search={{ ids: table.id }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2"
                >
                  <Printer className="size-4" />
                  {t('tables.table.print')}
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className="size-4" />}
                  onClick={() => setConfirm('rotate')}
                >
                  {t('tables.table.rotate')}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <form
          id="table-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined, { onSuccess: onClose });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tables.add.label')} required>
              {({ id }) => (
                <Input
                  id={id}
                  maxLength={20}
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('tables.add.seats')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={99}
                  value={form.seats}
                  onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
                />
              )}
            </Field>
          </div>
          <Field label={t('tables.add.area')}>
            {({ id }) => (
              <Select
                id={id}
                value={form.areaId}
                onChange={(e) => setForm((f) => ({ ...f, areaId: e.target.value }))}
              >
                <option value="">{t('tables.noArea')}</option>
                {space.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">{t('tables.table.active')}</span>
            <Switch
              label={t('tables.table.active')}
              checked={form.isActive}
              onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirm === 'rotate'}
        title={t('tables.table.rotateTitle', { label: table.label })}
        body={t('tables.table.rotateBody')}
        confirmLabel={t('tables.table.rotate')}
        tone="danger"
        loading={rotate.isPending}
        onConfirm={() =>
          rotate.mutate(undefined, {
            onSuccess: () => {
              setConfirm(null);
              onNotice(t('tables.table.rotated', { label: table.label }));
            },
          })
        }
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('tables.table.deleteTitle', { label: table.label })}
        body={t('tables.table.deleteBody')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
        onClose={() => setConfirm(null)}
      />
    </Sheet>
  );
}
