import type { UpdateVenueSettingsRequest, VenueSettings } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Lock, Save } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, SectionTitle, Segmented, Switch } from '@qafe/ui';
import { ImageInput } from '../components/ImageInput';
import { api, errorKey } from '../lib/api';
import { settingsQuery } from '../lib/queries';
import { useCan } from '../lib/useAuth';

/** FR-SEF-02..05, FR-SEF-07: venue details, ordering options, VAT and payment methods. */
export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery(settingsQuery);
  const canEdit = useCan('venue.settings');

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('settings.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('settings.subtitle')}</p>
      {!canEdit && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
          <Lock className="size-4" />
          {t('settings.readOnly')}
        </p>
      )}

      {settings.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(settings.error))}
        </Card>
      ) : !settings.data ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="h-72 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <ProfileSection data={settings.data} disabled={!canEdit} />
          <div className="flex flex-col gap-6">
            <OrderingSection data={settings.data} disabled={!canEdit} />
            <VatSection data={settings.data} disabled={!canEdit} />
            <PaymentsSection data={settings.data} disabled={!canEdit} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Saves one section; the response replaces the cached settings. */
function useSave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVenueSettingsRequest) =>
      api<VenueSettings>('/venue', { method: 'PATCH', body }),
    onSuccess: (data) => queryClient.setQueryData(settingsQuery.queryKey, data),
  });
}

function SectionForm({
  title,
  onSubmit,
  saving,
  saved,
  error,
  disabled,
  dirty,
  children,
}: {
  title: string;
  onSubmit: () => void;
  saving: boolean;
  saved: boolean;
  error: unknown;
  disabled: boolean;
  dirty: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-6">
      <form
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <SectionTitle>{title}</SectionTitle>
        <div className="flex flex-col gap-4">{children}</div>
        {!disabled && (
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-5">
            <p aria-live="polite" className="mr-auto text-[13px] font-medium">
              {error ? (
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <CircleAlert className="size-4" />
                  {t(errorKey(error))}
                </span>
              ) : (
                saved &&
                !dirty && (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <CircleCheck className="size-4" />
                    {t('common.saved')}
                  </span>
                )
              )}
            </p>
            <Button
              type="submit"
              size="sm"
              icon={<Save className="size-4" />}
              disabled={!dirty}
              loading={saving}
            >
              {t('common.save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function ProfileSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useSave();
  const initial = {
    name: data.profile.name,
    phone: data.profile.phone ?? '',
    email: data.profile.email ?? '',
    address: data.profile.address ?? '',
    city: data.profile.city ?? '',
    postalCode: data.profile.postalCode ?? '',
    primaryColor: data.profile.primaryColor ?? '',
  };
  const [form, setForm] = useState(initial);
  const dirtyKeys = (Object.keys(form) as (keyof typeof form)[]).filter(
    (k) => form[k] !== initial[k],
  );

  const setLogo = (settings: VenueSettings) =>
    queryClient.setQueryData(settingsQuery.queryKey, settings);

  const text = (key: keyof typeof form, label: string, type = 'text', className?: string) => (
    <Field label={label} className={className}>
      {({ id }) => (
        <Input
          id={id}
          type={type}
          disabled={disabled}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      )}
    </Field>
  );

  return (
    <SectionForm
      title={t('settings.profile')}
      disabled={disabled}
      dirty={dirtyKeys.length > 0}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error}
      onSubmit={() =>
        save.mutate({ profile: Object.fromEntries(dirtyKeys.map((k) => [k, form[k]])) })
      }
    >
      <Field label={t('settings.logo')}>
        {() => (
          <ImageInput
            url={data.profile.logoUrl}
            disabled={disabled}
            chooseLabel={t('settings.uploadLogo')}
            changeLabel={t('menu.item.changeImage')}
            removeLabel={t('settings.removeLogo')}
            hint={t('settings.logoHint')}
            onUpload={async (file) => {
              const form = new FormData();
              form.append('file', file);
              setLogo(await api<VenueSettings>('/venue/logo', { method: 'POST', form }));
            }}
            onRemove={() =>
              void api<VenueSettings>('/venue/logo', { method: 'DELETE' }).then(setLogo)
            }
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', t('settings.name'), 'text', 'sm:col-span-2')}
        {text('phone', t('settings.phone'), 'tel')}
        {text('email', t('settings.email'), 'email')}
        {text('address', t('settings.address'), 'text', 'sm:col-span-2')}
        {text('city', t('settings.city'))}
        {text('postalCode', t('settings.postalCode'))}
        <Field label={t('settings.color')} hint={t('settings.colorHint')} className="sm:col-span-2">
          {({ id, describedBy }) => (
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label={t('settings.color')}
                disabled={disabled}
                value={form.primaryColor || '#0070E8'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primaryColor: e.target.value.toUpperCase() }))
                }
                className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-surface p-1"
              />
              <Input
                id={id}
                aria-describedby={describedBy}
                disabled={disabled}
                value={form.primaryColor}
                placeholder="#0070E8"
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                className="font-mono uppercase"
              />
            </div>
          )}
        </Field>
      </div>
    </SectionForm>
  );
}

function OrderingSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const save = useSave();
  const [form, setForm] = useState(data.ordering);
  const dirty = JSON.stringify(form) !== JSON.stringify(data.ordering);
  const toggle = (
    key: 'guestOrderingEnabled' | 'orderRejectionEnabled' | 'deviceApprovalRequired',
    label: string,
    hint: string,
  ) => (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <Switch
        label={label}
        checked={form[key]}
        disabled={disabled}
        onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
      />
    </div>
  );
  return (
    <SectionForm
      title={t('settings.ordering')}
      disabled={disabled}
      dirty={dirty}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error}
      onSubmit={() => save.mutate({ ordering: form })}
    >
      {toggle('guestOrderingEnabled', t('settings.guestOrdering'), t('settings.guestOrderingHint'))}
      {toggle('orderRejectionEnabled', t('settings.rejection'), t('settings.rejectionHint'))}
      {toggle(
        'deviceApprovalRequired',
        t('settings.deviceApproval'),
        t('settings.deviceApprovalHint'),
      )}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t('settings.verification')}</p>
        <Segmented
          label={t('settings.verification')}
          value={form.sessionVerificationMode}
          onChange={(v) => !disabled && setForm((f) => ({ ...f, sessionVerificationMode: v }))}
          options={[
            { value: 'waiter', label: t('settings.verificationWaiter') },
            { value: 'pin', label: t('settings.verificationPin') },
          ]}
        />
      </div>
    </SectionForm>
  );
}

function VatSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const save = useSave();
  const initial = data.vatRate.replace('.', ',');
  const [rate, setRate] = useState(initial);
  const invalid =
    !/^\d{1,3}([.,]\d{1,2})?$/.test(rate.trim()) || Number(rate.replace(',', '.')) > 100;
  return (
    <SectionForm
      title={t('settings.vat')}
      disabled={disabled}
      dirty={rate !== initial && !invalid}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error}
      onSubmit={() => save.mutate({ vatRate: rate.trim() })}
    >
      <Field
        label={t('settings.vatRate')}
        hint={t('settings.vatHint')}
        error={invalid ? t('errors.validation_failed') : undefined}
      >
        {({ id, describedBy }) => (
          <div className="max-w-40">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              inputMode="decimal"
              disabled={disabled}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              trailing={<span className="pr-3 text-sm text-muted">%</span>}
            />
          </div>
        )}
      </Field>
    </SectionForm>
  );
}

function PaymentsSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const save = useSave();
  const [form, setForm] = useState(data.payments);
  const dirty = JSON.stringify(form) !== JSON.stringify(data.payments);
  const valid = (form.cash || form.card) && form[form.default];
  return (
    <SectionForm
      title={t('settings.payments')}
      disabled={disabled}
      dirty={dirty && valid}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error}
      onSubmit={() => save.mutate({ payments: form })}
    >
      <p className="text-xs text-muted">{t('settings.paymentsHint')}</p>
      {(['cash', 'card'] as const).map((method) => (
        <div key={method} className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-ink">{t(`settings.${method}`)}</p>
          <Switch
            label={t(`settings.${method}`)}
            checked={form[method]}
            disabled={disabled}
            onChange={(on) =>
              setForm((f) => {
                const next = { ...f, [method]: on };
                // The default must stay switched on.
                if (!next[next.default]) next.default = method === 'cash' ? 'card' : 'cash';
                return next;
              })
            }
          />
        </div>
      ))}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t('settings.default')}</p>
        <Segmented
          label={t('settings.default')}
          value={form.default}
          onChange={(v) => !disabled && form[v] && setForm((f) => ({ ...f, default: v }))}
          options={[
            { value: 'cash', label: t('settings.cash') },
            { value: 'card', label: t('settings.card') },
          ]}
        />
      </div>
    </SectionForm>
  );
}
