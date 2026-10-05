import type { CurrentNetwork, UpdateVenueSettingsRequest, VenueSettings } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Lock, Save, Wifi } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Field,
  ImageInput,
  Input,
  SectionTitle,
  Segmented,
  Select,
  Switch,
} from '@qafe/ui';
import { api, errorKey } from '../lib/api';
import { settingsQuery } from '../lib/queries';
import { useCan } from '../lib/useAuth';

/** FR-SEF-02..05, FR-SEF-07: venue details, ordering options, VAT, payments and opening hours. */
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
            <HoursSection data={settings.data} disabled={!canEdit} />
            <NetworksSection data={settings.data} disabled={!canEdit} />
            {settings.data.modules.includes('kds') && (
              <KdsSection data={settings.data} disabled={!canEdit} />
            )}
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
            errorText={(e) => t(errorKey(e))}
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
    key:
      | 'guestOrderingEnabled'
      | 'orderRejectionEnabled'
      | 'deviceApprovalRequired'
      | 'wifiVerificationEnabled',
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
      {toggle('wifiVerificationEnabled', t('settings.wifi'), t('settings.wifiHint'))}
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

type Hours = VenueSettings['openingHours'];
const DEFAULT_WEEK: Hours = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  opensAt: '07:00',
  closesAt: '23:00',
}));

/** FR-SEF-02: one interval per weekday; outside it guests cannot order (FR-GOS-03). */
function HoursSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const save = useSave();
  const [enabled, setEnabled] = useState(data.openingHours.length > 0);
  // Every day keeps its times while switched off, so turning it back on restores them.
  const [days, setDays] = useState(() =>
    [1, 2, 3, 4, 5, 6, 7].map((day) => {
      const saved = data.openingHours.find((d) => d.day === day);
      return {
        day,
        open: enabled ? Boolean(saved) : true,
        opensAt: saved?.opensAt ?? '07:00',
        closesAt: saved?.closesAt ?? '23:00',
      };
    }),
  );
  const next: Hours = enabled
    ? days.filter((d) => d.open).map(({ day, opensAt, closesAt }) => ({ day, opensAt, closesAt }))
    : [];
  const invalid = next.some((d) => d.opensAt === d.closesAt || !d.opensAt || !d.closesAt);
  const dirty = JSON.stringify(next) !== JSON.stringify(data.openingHours);
  const weekdays = t('settings.weekdays', { returnObjects: true });
  const update = (day: number, patch: Partial<(typeof days)[number]>) =>
    setDays((all) => all.map((d) => (d.day === day ? { ...d, ...patch } : d)));

  return (
    <SectionForm
      title={t('settings.hours')}
      disabled={disabled}
      dirty={dirty && !invalid}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error}
      onSubmit={() => save.mutate({ openingHours: next })}
    >
      <p className="text-xs text-muted">{t('settings.hoursHint')}</p>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-ink">{t('settings.hoursEnabled')}</p>
        <Switch
          label={t('settings.hoursEnabled')}
          checked={enabled}
          disabled={disabled}
          onChange={(on) => {
            setEnabled(on);
            if (on && !days.some((d) => d.open)) {
              setDays(DEFAULT_WEEK.map((d) => ({ ...d, open: true })));
            }
          }}
        />
      </div>
      {!enabled ? (
        <p className="text-[13px] text-muted">{t('settings.hoursOff')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {days.map((d) => (
            <li key={d.day} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-28 text-sm font-medium text-ink">{weekdays[d.day - 1]}</span>
              <Switch
                label={`${weekdays[d.day - 1]}: ${t('settings.open')}`}
                checked={d.open}
                disabled={disabled}
                onChange={(open) => update(d.day, { open })}
              />
              {d.open ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${weekdays[d.day - 1]}: ${t('settings.opensAt')}`}
                    value={d.opensAt}
                    disabled={disabled}
                    onChange={(e) => update(d.day, { opensAt: e.target.value })}
                    className="h-9 w-28"
                  />
                  <span className="text-muted">–</span>
                  <Input
                    type="time"
                    aria-label={`${weekdays[d.day - 1]}: ${t('settings.closesAt')}`}
                    value={d.closesAt}
                    disabled={disabled}
                    onChange={(e) => update(d.day, { closesAt: e.target.value })}
                    className="h-9 w-28"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted">{t('settings.closedDay')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionForm>
  );
}

/** FR-GOS-28: the venue's Wi-Fi networks, by the public address the api sees. */
function NetworksSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ['venue', 'network'],
    queryFn: () => api<CurrentNetwork>('/venue/network'),
    enabled: !disabled,
  });
  const [manual, setManual] = useState('');
  const change = useMutation({
    mutationFn: (req: { add?: { network?: string; label?: string }; remove?: string }) =>
      req.remove
        ? api<VenueSettings>(`/venue/networks/${req.remove}`, { method: 'DELETE' })
        : api<VenueSettings>('/venue/networks', { method: 'POST', body: req.add ?? {} }),
    onSuccess: (next) => {
      queryClient.setQueryData(settingsQuery.queryKey, next);
      setManual('');
    },
  });
  const known = data.networks.some((n) => n.network === current.data?.ip);

  return (
    <Card className="p-6">
      <SectionTitle>{t('settings.networks')}</SectionTitle>
      <p className="text-xs text-muted">{t('settings.networksHint')}</p>
      {!data.ordering.wifiVerificationEnabled && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          {t('settings.networksOff')}
        </p>
      )}
      {change.isError && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-danger">
          {t(errorKey(change.error))}
        </p>
      )}
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {data.networks.length === 0 && (
          <li className="py-2 text-sm text-muted">{t('settings.networksEmpty')}</li>
        )}
        {data.networks.map((n) => (
          <li key={n.id} className="flex items-center gap-3 py-2.5">
            <Wifi className="size-4 text-accent" aria-hidden />
            <span className="flex-1 font-mono text-sm text-ink">
              {n.network}
              {n.label && <span className="ml-2 font-sans text-xs text-muted">{n.label}</span>}
            </span>
            {!disabled && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger!"
                onClick={() => change.mutate({ remove: n.id })}
              >
                {t('common.delete')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          {current.data && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-[13px] text-muted">
                {t('settings.networkCurrent', { ip: current.data.ip })}
              </p>
              <Button
                size="sm"
                icon={<Wifi className="size-4" />}
                disabled={known}
                loading={change.isPending}
                onClick={() => change.mutate({ add: { label: t('settings.networkLabel') } })}
              >
                {known ? t('settings.networkAdded') : t('settings.networkAddCurrent')}
              </Button>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) change.mutate({ add: { network: manual.trim() } });
            }}
          >
            <Input
              aria-label={t('settings.networkManual')}
              placeholder={t('settings.networkManual')}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" variant="secondary" disabled={!manual.trim()}>
              {t('common.add')}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}

/** KDS module: preparation stations (FR-SEF-12) and waiting thresholds (FR-KON-25). */
function KdsSection({ data, disabled }: { data: VenueSettings; disabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useSave();
  const [warning, setWarning] = useState(String(data.kds.warningMinutes));
  const [critical, setCritical] = useState(String(data.kds.criticalMinutes));
  const [name, setName] = useState('');
  const [type, setType] = useState<'bar' | 'kitchen' | 'other'>('bar');
  const station = useMutation({
    mutationFn: (req: { id?: string; name: string; type: string; isActive?: boolean }) =>
      req.id
        ? api<VenueSettings>(`/venue/stations/${req.id}`, { method: 'PATCH', body: req })
        : api<VenueSettings>('/venue/stations', { method: 'POST', body: req }),
    onSuccess: (next) => {
      queryClient.setQueryData(settingsQuery.queryKey, next);
      setName('');
    },
  });
  const w = Number(warning);
  const c = Number(critical);
  const valid = Number.isInteger(w) && Number.isInteger(c) && w >= 1 && c > w && c <= 240;
  const dirty = w !== data.kds.warningMinutes || c !== data.kds.criticalMinutes;
  const types = ['bar', 'kitchen', 'other'] as const;

  return (
    <SectionForm
      title={t('settings.kds')}
      disabled={disabled}
      dirty={dirty && valid}
      saving={save.isPending}
      saved={save.isSuccess}
      error={save.error ?? station.error}
      onSubmit={() => save.mutate({ kds: { warningMinutes: w, criticalMinutes: c } })}
    >
      <p className="text-xs text-muted">{t('settings.kdsHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('settings.kdsWarning')}>
          {({ id }) => (
            <Input
              id={id}
              inputMode="numeric"
              disabled={disabled}
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('settings.kdsCritical')}
          error={dirty && !valid ? t('settings.kdsInvalid') : undefined}
        >
          {({ id }) => (
            <Input
              id={id}
              inputMode="numeric"
              disabled={disabled}
              value={critical}
              onChange={(e) => setCritical(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink">{t('settings.stations')}</p>
        <ul className="flex flex-col divide-y divide-line">
          {data.stations.length === 0 && (
            <li className="py-2 text-sm text-muted">{t('settings.stationsEmpty')}</li>
          )}
          {data.stations.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span
                className={
                  s.isActive
                    ? 'flex-1 text-sm font-medium text-ink'
                    : 'flex-1 text-sm text-muted line-through'
                }
              >
                {s.name}
                <span className="ml-2 text-xs text-muted">
                  {t(`settings.stationType.${s.type}`)}
                </span>
              </span>
              <Switch
                label={`${s.name}: ${t('settings.stationActive')}`}
                checked={s.isActive}
                disabled={disabled}
                onChange={(isActive) =>
                  station.mutate({ id: s.id, name: s.name, type: s.type, isActive })
                }
              />
            </li>
          ))}
        </ul>
        {!disabled && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              aria-label={t('settings.stationName')}
              placeholder={t('settings.stationName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-40 flex-1"
            />
            <Select
              aria-label={t('settings.stationTypeLabel')}
              value={type}
              onChange={(e) => setType(e.target.value as (typeof types)[number])}
              className="w-36"
            >
              {types.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`settings.stationType.${tp}`)}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={!name.trim()}
              loading={station.isPending}
              onClick={() => station.mutate({ name: name.trim(), type })}
            >
              {t('common.add')}
            </Button>
          </div>
        )}
      </div>
    </SectionForm>
  );
}
