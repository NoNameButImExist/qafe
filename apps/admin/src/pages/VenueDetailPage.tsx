import {
  UpdateVenueRequest,
  type VenueDetail,
  type VenueModuleState,
  type VenueStatus,
  type VenueSummary,
} from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Crown,
  KeyRound,
  Save,
  UtensilsCrossed,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ModuleIcon } from '../components/ModuleIcon';
import { ResetPasswordSheet, type ResetTarget } from '../components/ResetPasswordSheet';
import {
  Button,
  Card,
  cn,
  Field,
  Input,
  Notice,
  SectionTitle,
  Select,
  StatusBadge,
  Switch,
  useNotice,
} from '@qafe/ui';
import { VenueStatusMenu } from '../components/VenueStatusMenu';
import { api, errorKey } from '../lib/api';
import { formatDate, venueHost } from '../lib/format';
import { venueQuery } from '../lib/queries';
import { initials } from '../lib/text';

export function VenueDetailPage() {
  const { t } = useTranslation();
  const { venueId } = useParams({ from: '/app/venues/$venueId' });
  const venue = useQuery(venueQuery(venueId));
  const queryClient = useQueryClient();
  const [notice, setNotice] = useNotice();
  const [saved, setSaved] = useNotice();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin'] });

  const changeStatus = useMutation({
    mutationFn: (status: VenueStatus) =>
      api<VenueSummary>(`/admin/venues/${venueId}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (updated) => {
      setNotice({
        tone: 'success',
        text: t('venues.statusChanged', {
          name: updated.name,
          status: t(`venues.status.${updated.status}`),
        }),
      });
      refresh();
    },
    onError: (error) => setNotice({ tone: 'error', text: t(errorKey(error)) }),
  });

  if (venue.isError) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-danger">
        <CircleAlert className="size-6" />
        {t(errorKey(venue.error))}
        <Link to="/venues" className="text-accent hover:underline">
          ← {t('venue.back')}
        </Link>
      </Card>
    );
  }

  const data = venue.data;
  return (
    <div className="animate-fade-up">
      <Link
        to="/venues"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-accent"
      >
        <ArrowLeft className="size-4" />
        {t('venue.back')}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-navy-900 to-blue-brand font-display text-xl font-semibold text-white">
          {data?.name.slice(0, 1) ?? ''}
        </span>
        <div className="min-w-0 flex-1">
          {data ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[26px] leading-tight font-bold text-ink">
                  {data.name}
                </h1>
                <StatusBadge status={data.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {venueHost(data.slug)} · {t('venue.since', { date: formatDate(data.createdAt) })}
              </p>
            </>
          ) : (
            <div className="h-14 w-72 animate-pulse rounded-xl bg-surface-2" />
          )}
        </div>
        {data && (
          <Link
            to="/venues/$venueId/menu"
            params={{ venueId }}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-line-strong"
          >
            <UtensilsCrossed className="size-4 text-accent" />
            {t('venue.editMenu')}
          </Link>
        )}
        {data && (
          <VenueStatusMenu
            labelled
            venue={data}
            onChange={(status) => changeStatus.mutate(status)}
          />
        )}
      </div>

      <Notice notice={notice} className="mt-6" />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data ? (
            <DetailsForm
              key={data.updatedAt}
              venue={data}
              saved={saved !== null}
              onSaved={() => setSaved({ tone: 'success', text: t('venue.saved') })}
            />
          ) : (
            <Card className="h-96 animate-pulse" />
          )}
        </div>
        <div className="flex flex-col gap-6">
          <ModulesCard
            venueId={venueId}
            modules={data?.modules}
            onChanged={(module) => {
              setNotice({
                tone: 'success',
                text: t(module.enabled ? 'venue.moduleOn' : 'venue.moduleOff', {
                  name: t(`modules.names.${module.code}`, { defaultValue: module.name }),
                }),
              });
              refresh();
            }}
            onError={(error) => setNotice({ tone: 'error', text: t(errorKey(error)) })}
          />
          <StaffCard venue={data} />
        </div>
      </div>
    </div>
  );
}

type FormState = Record<
  | 'name'
  | 'city'
  | 'address'
  | 'postalCode'
  | 'phone'
  | 'email'
  | 'legalName'
  | 'taxId'
  | 'vatNumber'
  | 'currency'
  | 'timezone'
  | 'defaultLanguage',
  string
>;

function toForm(v: VenueDetail): FormState {
  return {
    name: v.name,
    city: v.city ?? '',
    address: v.address ?? '',
    postalCode: v.postalCode ?? '',
    phone: v.phone ?? '',
    email: v.email ?? '',
    legalName: v.legalName ?? '',
    taxId: v.taxId ?? '',
    vatNumber: v.vatNumber ?? '',
    currency: v.currency,
    timezone: v.timezone,
    defaultLanguage: v.defaultLanguage,
  };
}

function DetailsForm({
  venue,
  saved,
  onSaved,
}: {
  venue: VenueDetail;
  saved: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initial = toForm(venue);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const dirty = (Object.keys(form) as (keyof FormState)[]).filter((k) => form[k] !== initial[k]);

  const save = useMutation({
    mutationFn: (body: UpdateVenueRequest) =>
      api<VenueDetail>(`/admin/venues/${venue.id}`, { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'venues', 'detail', venue.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      onSaved();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Send only what changed; an emptied field is sent as "" and stored as NULL.
    const body = Object.fromEntries(dirty.map((k) => [k, form[k]])) as UpdateVenueRequest;
    const parsed = UpdateVenueRequest.safeParse(body);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof FormState] ??= t('errors.validation_failed');
      }
      setErrors(next);
      return;
    }
    save.mutate(body);
  }

  const field = (
    key: keyof FormState,
    label: string,
    props: { className?: string; type?: string; required?: boolean } = {},
  ) => (
    <Field label={label} error={errors[key]} required={props.required} className={props.className}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          type={props.type}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          value={form[key]}
          onChange={(e) => {
            setForm((f) => ({ ...f, [key]: e.target.value }));
            setErrors((er) => ({ ...er, [key]: undefined }));
          }}
        />
      )}
    </Field>
  );

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} noValidate>
        <SectionTitle>{t('venue.details')}</SectionTitle>
        <p className="-mt-2 mb-5 text-xs text-muted">{t('venue.detailsHint')}</p>

        {save.isError && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
          >
            <CircleAlert className="size-4 shrink-0" />
            {t(errorKey(save.error))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', t('createVenue.name'), { className: 'sm:col-span-2', required: true })}
          {field('city', t('createVenue.city'))}
          {field('postalCode', t('createVenue.postalCode'))}
          {field('address', t('createVenue.address'), { className: 'sm:col-span-2' })}
          {field('phone', t('createVenue.phone'), { type: 'tel' })}
          {field('email', t('createVenue.email'), { type: 'email' })}
          {field('legalName', t('createVenue.legalName'), { className: 'sm:col-span-2' })}
          {field('taxId', t('createVenue.taxId'))}
          {field('vatNumber', t('createVenue.vatNumber'))}
          <SelectField
            label={t('createVenue.currency')}
            value={form.currency}
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          >
            <option value="BAM">BAM (KM)</option>
            <option value="EUR">EUR (€)</option>
          </SelectField>
          <SelectField
            label={t('createVenue.language')}
            value={form.defaultLanguage}
            onChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v }))}
          >
            <option value="bs">Bosanski</option>
            <option value="en">English</option>
          </SelectField>
          <SelectField
            label={t('createVenue.timezone')}
            className="sm:col-span-2"
            value={form.timezone}
            onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          >
            {['Europe/Sarajevo', 'Europe/Zagreb', 'Europe/Belgrade', 'Europe/Vienna'].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-line pt-5">
          <p aria-live="polite" className="mr-auto text-[13px] font-medium text-success">
            {saved && dirty.length === 0 && (
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-4" />
                {t('venue.saved')}
              </span>
            )}
          </p>
          {dirty.length > 0 && (
            <Button variant="ghost" onClick={() => setForm(initial)}>
              {t('common.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            icon={<Save className="size-4" />}
            disabled={dirty.length === 0}
            loading={save.isPending}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SelectField({
  label,
  value,
  onChange,
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field label={label} className={className}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </Select>
      )}
    </Field>
  );
}

function ModulesCard({
  venueId,
  modules,
  onChanged,
  onError,
}: {
  venueId: string;
  modules: VenueModuleState[] | undefined;
  onChanged: (module: VenueModuleState) => void;
  onError: (error: unknown) => void;
}) {
  const { t } = useTranslation();
  const toggle = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      api<VenueModuleState[]>(`/admin/venues/${venueId}/modules/${code}`, {
        method: enabled ? 'PUT' : 'DELETE',
      }),
    onSuccess: (list, { code }) => {
      const module = list.find((m) => m.code === code);
      if (module) onChanged(module);
    },
    onError,
  });

  return (
    <Card className="p-6">
      <SectionTitle>{t('venue.modules')}</SectionTitle>
      <p className="-mt-2 mb-4 text-xs text-muted">{t('venue.modulesHint')}</p>
      <ul className="flex flex-col gap-3">
        {(modules ?? Array.from({ length: 3 }, () => null)).map((m, i) =>
          m ? (
            <li key={m.code} className="flex items-start gap-3 rounded-xl border border-line p-3.5">
              <ModuleIcon code={m.code} active={m.enabled} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {t(`modules.names.${m.code}`, { defaultValue: m.name })}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted">
                  {t(`modules.descriptions.${m.code}`, { defaultValue: m.description ?? '' })}
                </p>
              </div>
              <Switch
                checked={
                  toggle.isPending && toggle.variables.code === m.code
                    ? toggle.variables.enabled
                    : m.enabled
                }
                disabled={toggle.isPending}
                label={t(`modules.names.${m.code}`, { defaultValue: m.name })}
                onChange={(enabled) => toggle.mutate({ code: m.code, enabled })}
              />
            </li>
          ) : (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
          ),
        )}
      </ul>
    </Card>
  );
}

/** Staff of the venue; the admin can set a new password for any of them (FR-ADM-09). */
function StaffCard({ venue }: { venue: VenueDetail | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [resetFor, setResetFor] = useState<ResetTarget | null>(null);
  const staff = venue?.staff;
  return (
    <Card className="p-6">
      <SectionTitle>{t('venue.staff')}</SectionTitle>
      {staff && staff.length === 0 ? (
        <p className="text-sm text-muted">{t('venue.staffEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(staff ?? Array.from({ length: 2 }, () => null)).map((m, i) =>
            m ? (
              <li key={m.memberId} className="flex items-center gap-3">
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold',
                    m.isOwner ? 'bg-primary/12 text-accent' : 'bg-surface-2 text-muted',
                  )}
                >
                  {initials(m.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                    {m.fullName}
                    {m.isOwner && (
                      <Crown className="size-3.5 text-warning" aria-label={t('venue.owner')} />
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{m.username} · {m.role} ·{' '}
                    {m.lastLoginAt
                      ? t('venue.lastLogin', { date: formatDate(m.lastLoginAt) })
                      : t('venue.neverLoggedIn')}
                  </p>
                </div>
                {venue && (
                  <button
                    type="button"
                    onClick={() =>
                      setResetFor({
                        id: m.userId,
                        fullName: m.fullName,
                        email: null,
                        login: { venueSlug: venue.slug, username: m.username },
                      })
                    }
                    aria-label={`${t('users.resetPassword')}: ${m.fullName}`}
                    title={t('users.resetPassword')}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <KeyRound className="size-4" />
                  </button>
                )}
                {!m.userActive ? (
                  <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[11px] font-semibold text-danger">
                    {t('venue.blocked')}
                  </span>
                ) : (
                  !m.isActive && (
                    <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {t('venue.inactive')}
                    </span>
                  )
                )}
              </li>
            ) : (
              <li key={i} className="h-10 animate-pulse rounded-xl bg-surface-2" />
            ),
          )}
        </ul>
      )}
      <ResetPasswordSheet
        user={resetFor}
        onClose={() => setResetFor(null)}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ['admin'] })}
      />
    </Card>
  );
}
