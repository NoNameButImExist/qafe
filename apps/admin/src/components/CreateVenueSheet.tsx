import { CreateVenueRequest, type CreateVenueResponse } from '@qafe/contracts';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, KeyRound, RefreshCw } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, errorKey } from '../lib/api';
import { venueHost } from '../lib/format';
import { generatePassword, slugify, suggestUsername } from '../lib/text';
import { Button, CopyRow, Field, Input, Select, Sheet } from '@qafe/ui';

interface FormState {
  name: string;
  slug: string;
  city: string;
  address: string;
  postalCode: string;
  phone: string;
  email: string;
  legalName: string;
  taxId: string;
  vatNumber: string;
  currency: string;
  timezone: string;
  defaultLanguage: 'bs' | 'en';
  ownerName: string;
  ownerUsername: string;
  ownerPassword: string;
}

const emptyForm = (): FormState => ({
  name: '',
  slug: '',
  city: '',
  address: '',
  postalCode: '',
  phone: '',
  email: '',
  legalName: '',
  taxId: '',
  vatNumber: '',
  currency: 'BAM',
  timezone: 'Europe/Sarajevo',
  defaultLanguage: 'bs',
  ownerName: '',
  ownerUsername: '',
  ownerPassword: generatePassword(),
});

/** Request field path → form field, to show server and client errors next to the input. */
const FIELD_OF_PATH: Record<string, keyof FormState> = {
  'owner.fullName': 'ownerName',
  'owner.username': 'ownerUsername',
  'owner.temporaryPassword': 'ownerPassword',
};

function toRequest(form: FormState): CreateVenueRequest {
  return {
    name: form.name,
    slug: form.slug,
    city: form.city,
    address: form.address,
    postalCode: form.postalCode,
    phone: form.phone,
    email: form.email,
    legalName: form.legalName,
    taxId: form.taxId,
    vatNumber: form.vatNumber,
    currency: form.currency,
    timezone: form.timezone,
    defaultLanguage: form.defaultLanguage,
    owner: {
      fullName: form.ownerName,
      username: form.ownerUsername,
      temporaryPassword: form.ownerPassword,
    },
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateVenueResponse) => void;
}

export function CreateVenueSheet({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState(emptyForm);
  // Slug and username follow the name until the admin edits them.
  const [slugEdited, setSlugEdited] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [created, setCreated] = useState<{ result: CreateVenueResponse; password: string } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: (body: CreateVenueRequest) =>
      api<CreateVenueResponse>('/admin/venues', { method: 'POST', body }),
    onSuccess: (result, body) => {
      setCreated({ result, password: body.owner.temporaryPassword });
      onCreated(result);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'slug_taken') {
        setErrors({ slug: t('errors.slug_taken') });
      }
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'name' && !slugEdited) next.slug = slugify(value);
      if (key === 'ownerName' && !usernameEdited) next.ownerUsername = suggestUsername(value);
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function close() {
    onClose();
    // Reset after the closing animation, so the panel does not flash empty.
    setTimeout(() => {
      setForm(emptyForm());
      setSlugEdited(false);
      setUsernameEdited(false);
      setErrors({});
      setCreated(null);
      mutation.reset();
    }, 250);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const request = toRequest(form);
    const parsed = CreateVenueRequest.safeParse(request);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        const field = FIELD_OF_PATH[path] ?? (path as keyof FormState);
        next[field] ??= field === 'slug' ? t('createVenue.slugInvalid') : issueMessage(issue, t);
      }
      setErrors(next);
      return;
    }
    mutation.mutate(request);
  }

  const bind = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => update(key, e.target.value as never),
  });

  const generalError =
    mutation.isError &&
    !(mutation.error instanceof ApiError && mutation.error.code === 'slug_taken')
      ? t(errorKey(mutation.error))
      : null;

  if (created) {
    return (
      <Sheet
        open={open}
        onClose={close}
        title={t('createVenue.successTitle')}
        footer={
          <div className="flex justify-end">
            <Button onClick={close}>{t('createVenue.done')}</Button>
          </div>
        }
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-success/12 text-success">
            <CircleCheck className="size-7" />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted">{t('createVenue.successBody')}</p>
        </div>
        <dl className="mt-6 flex flex-col gap-3">
          <CopyRow
            label={t('createVenue.successVenue')}
            value={venueHost(created.result.venue.slug)}
          />
          <CopyRow label={t('createVenue.successUsername')} value={created.result.owner.username} />
          <CopyRow label={t('createVenue.successPassword')} value={created.password} secret />
        </dl>
        <p className="mt-6 rounded-xl border border-warning/25 bg-warning/8 px-4 py-3 text-[13px] text-warning">
          {t('createVenue.successStatus')}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t('createVenue.title')}
      description={t('createVenue.subtitle')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-venue" loading={mutation.isPending}>
            {t('createVenue.submit')}
          </Button>
        </div>
      }
    >
      <form id="create-venue" onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        {generalError && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
          >
            <CircleAlert className="size-4 shrink-0" />
            {generalError}
          </div>
        )}

        <Section title={t('createVenue.sections.venue')}>
          <Field
            label={t('createVenue.name')}
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                autoFocus
                {...bind('name')}
              />
            )}
          </Field>
          <Field
            label={t('createVenue.slug')}
            required
            error={errors.slug}
            hint={t('createVenue.slugHint', { host: venueHost(form.slug) })}
            className="sm:col-span-2"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  update('slug', e.target.value.toLowerCase());
                }}
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <TextField label={t('createVenue.city')} error={errors.city} {...bind('city')} />
          <TextField
            label={t('createVenue.postalCode')}
            error={errors.postalCode}
            {...bind('postalCode')}
          />
          <TextField
            label={t('createVenue.address')}
            error={errors.address}
            className="sm:col-span-2"
            {...bind('address')}
          />
          <TextField
            label={t('createVenue.phone')}
            type="tel"
            error={errors.phone}
            {...bind('phone')}
          />
          <TextField
            label={t('createVenue.email')}
            type="email"
            error={errors.email}
            {...bind('email')}
          />
        </Section>

        <Section title={t('createVenue.sections.legal')}>
          <TextField
            label={t('createVenue.legalName')}
            error={errors.legalName}
            className="sm:col-span-2"
            {...bind('legalName')}
          />
          <TextField
            label={t('createVenue.taxId')}
            inputMode="numeric"
            error={errors.taxId}
            {...bind('taxId')}
          />
          <TextField
            label={t('createVenue.vatNumber')}
            inputMode="numeric"
            error={errors.vatNumber}
            {...bind('vatNumber')}
          />
        </Section>

        <Section title={t('createVenue.sections.settings')}>
          <Field label={t('createVenue.currency')}>
            {({ id }) => (
              <Select id={id} {...bind('currency')}>
                <option value="BAM">BAM (KM)</option>
                <option value="EUR">EUR (€)</option>
              </Select>
            )}
          </Field>
          <Field label={t('createVenue.language')}>
            {({ id }) => (
              <Select id={id} {...bind('defaultLanguage')}>
                <option value="bs">Bosanski</option>
                <option value="en">English</option>
              </Select>
            )}
          </Field>
          <Field label={t('createVenue.timezone')} className="sm:col-span-2">
            {({ id }) => (
              <Select id={id} {...bind('timezone')}>
                <option value="Europe/Sarajevo">Europe/Sarajevo</option>
                <option value="Europe/Zagreb">Europe/Zagreb</option>
                <option value="Europe/Belgrade">Europe/Belgrade</option>
                <option value="Europe/Vienna">Europe/Vienna</option>
              </Select>
            )}
          </Field>
        </Section>

        <Section title={t('createVenue.sections.owner')}>
          <TextField
            label={t('createVenue.ownerName')}
            required
            error={errors.ownerName}
            className="sm:col-span-2"
            autoComplete="off"
            {...bind('ownerName')}
          />
          <Field
            label={t('createVenue.ownerUsername')}
            required
            error={errors.ownerUsername}
            hint={t('createVenue.ownerUsernameHint')}
            className="sm:col-span-2"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={form.ownerUsername}
                onChange={(e) => {
                  setUsernameEdited(true);
                  update('ownerUsername', e.target.value);
                }}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
          <Field
            label={t('createVenue.ownerPassword')}
            required
            error={errors.ownerPassword}
            hint={t('createVenue.ownerPasswordHint')}
            className="sm:col-span-2"
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="font-mono"
                autoComplete="new-password"
                spellCheck={false}
                icon={<KeyRound className="size-4" />}
                {...bind('ownerPassword')}
                trailing={
                  <button
                    type="button"
                    onClick={() => update('ownerPassword', generatePassword())}
                    aria-label={t('createVenue.generate')}
                    title={t('createVenue.generate')}
                    className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                }
              />
            )}
          </Field>
        </Section>
      </form>
    </Sheet>
  );
}

function issueMessage(issue: { code: string }, t: ReturnType<typeof useTranslation>['t']): string {
  return issue.code === 'too_small' || issue.code === 'invalid_type'
    ? t('createVenue.required')
    : t('errors.validation_failed');
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-4 font-display text-xs font-semibold tracking-[0.08em] text-muted uppercase">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TextField({
  label,
  error,
  required,
  className,
  ...input
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...input} />
      )}
    </Field>
  );
}
