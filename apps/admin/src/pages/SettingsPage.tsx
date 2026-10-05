import {
  THEME_BRANDS,
  type SmtpSecurity,
  type SmtpSettings,
  type ThemeBrand,
  type UpdateSmtpRequest,
} from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Mail, Palette, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyBrand,
  Button,
  Card,
  cn,
  Field,
  Input,
  Notice,
  SectionTitle,
  Select,
  useBrand,
  useNotice,
} from '@qafe/ui';
import { api, ApiError, errorKey } from '../lib/api';
import { smtpQuery } from '../lib/queries';

/**
 * Swatches of each theme for the preview cards (the real tokens live in @qafe/ui theme.css):
 * deep colour, accent, canvas, surface.
 */
const SWATCHES: Record<ThemeBrand, [string, string, string, string]> = {
  warm: ['#003835', '#8fd1c4', '#f3f0e8', '#004643'],
  ice: ['#082c47', '#5fd0f3', '#f1f7fa', '#0a6fa1'],
};

/** Platform settings of the super admin: colour theme and SMTP. */
export function SettingsPage() {
  const { t } = useTranslation();
  const [notice, setNotice] = useNotice();
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('settings.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('settings.subtitle')}</p>
      <Notice notice={notice} className="mt-6" />
      <ThemeSection onNotice={setNotice} />
      <SmtpSection onNotice={setNotice} />
    </div>
  );
}

type NoticeFn = ReturnType<typeof useNotice>[1];

function ThemeSection({ onNotice }: { onNotice: NoticeFn }) {
  const { t } = useTranslation();
  const active = useBrand();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (brand: ThemeBrand) =>
      api<{ brand: ThemeBrand }>('/admin/settings/theme', { method: 'PUT', body: { brand } }),
    onMutate: (brand) => {
      // Shown at once; restored if the server says no.
      const before = active;
      applyBrand(brand, { animate: true });
      return { before };
    },
    onSuccess: (saved) => {
      applyBrand(saved.brand);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] });
      onNotice({
        tone: 'success',
        text: t('settings.theme.saved', { name: t(`settings.theme.names.${saved.brand}`) }),
      });
    },
    onError: (error, _brand, context) => {
      if (context) applyBrand(context.before, { animate: true });
      onNotice({ tone: 'error', text: t(errorKey(error)) });
    },
  });
  const other = THEME_BRANDS.find((b) => b !== active) ?? THEME_BRANDS[0];

  return (
    <Card className="mt-6 p-6">
      <SectionTitle
        action={
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() => save.mutate(other)}
            icon={<Palette className="size-4" />}
          >
            {t('settings.theme.switchTo', { name: t(`settings.theme.names.${other}`) })}
          </Button>
        }
      >
        {t('settings.theme.title')}
      </SectionTitle>
      <p className="-mt-2 text-sm text-muted">{t('settings.theme.hint')}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {THEME_BRANDS.map((brand) => {
          const [deep, bright, canvas, primary] = SWATCHES[brand];
          const isActive = brand === active;
          return (
            <button
              key={brand}
              type="button"
              aria-pressed={isActive}
              disabled={save.isPending}
              onClick={() => !isActive && save.mutate(brand)}
              className={cn(
                'group overflow-hidden rounded-2xl border-2 text-left transition-colors',
                isActive ? 'border-primary' : 'border-line hover:border-line-strong',
              )}
            >
              {/* A small picture of the app in that theme. */}
              <div className="flex h-28" style={{ background: canvas }}>
                <div className="w-1/4" style={{ background: deep }}>
                  <div className="m-3 h-2 w-8 rounded-full" style={{ background: bright }} />
                  <div className="mx-3 mt-3 h-1.5 w-10 rounded-full bg-white/30" />
                  <div className="mx-3 mt-2 h-1.5 w-8 rounded-full bg-white/30" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div
                    className="h-2.5 w-24 rounded-full"
                    style={{ background: deep, opacity: 0.8 }}
                  />
                  <div className="flex-1 rounded-lg bg-white/80 shadow-sm" />
                  <div className="h-6 w-20 rounded-lg" style={{ background: primary }} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 bg-surface p-4">
                <div>
                  <p className="font-semibold text-ink">{t(`settings.theme.names.${brand}`)}</p>
                  <p className="text-xs text-muted">{t(`settings.theme.descriptions.${brand}`)}</p>
                </div>
                {isActive ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-bold text-accent">
                    <Check className="size-3.5" aria-hidden /> {t('settings.theme.active')}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-accent group-hover:underline">
                    {t('settings.theme.use')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function SmtpSection({ onNotice }: { onNotice: NoticeFn }) {
  const smtp = useQuery(smtpQuery);
  if (!smtp.data) return null;
  return <SmtpForm key={smtp.data.updatedAt ?? 'new'} current={smtp.data} onNotice={onNotice} />;
}

function SmtpForm({ current, onNotice }: { current: SmtpSettings; onNotice: NoticeFn }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    host: current.host,
    port: String(current.port),
    security: current.security,
    username: current.username,
    password: '',
    removePassword: false,
    fromName: current.fromName,
    fromEmail: current.fromEmail,
  });
  const [testTo, setTestTo] = useState('');
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () => {
      const body: UpdateSmtpRequest = {
        host: form.host.trim(),
        port: Number(form.port),
        security: form.security,
        username: form.username.trim(),
        fromName: form.fromName.trim(),
        fromEmail: form.fromEmail.trim(),
        // Empty field = keep the stored password; "remove" = clear it.
        ...(form.removePassword
          ? { password: '' }
          : form.password
            ? { password: form.password }
            : {}),
      };
      return api<SmtpSettings>('/admin/settings/smtp', { method: 'PUT', body });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(smtpQuery.queryKey, saved);
      onNotice({ tone: 'success', text: t('settings.smtp.saved') });
    },
    onError: (error) => onNotice({ tone: 'error', text: t(errorKey(error)) }),
  });
  const test = useMutation({
    mutationFn: () =>
      api<{ messageId: string }>('/admin/settings/smtp/test', {
        method: 'POST',
        body: { to: testTo.trim() },
      }),
    onSuccess: () =>
      onNotice({ tone: 'success', text: t('settings.smtp.testSent', { to: testTo.trim() }) }),
    onError: (error) => {
      const reason =
        error instanceof ApiError &&
        typeof (error.details as { reason?: unknown })?.reason === 'string'
          ? (error.details as { reason: string }).reason
          : null;
      onNotice({
        tone: 'error',
        text: reason ? t('settings.smtp.testFailed', { reason }) : t(errorKey(error)),
      });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const valid =
    form.host.trim() &&
    Number(form.port) > 0 &&
    form.fromName.trim() &&
    form.fromEmail.includes('@');

  return (
    <Card className="mt-6 p-6">
      <SectionTitle>{t('settings.smtp.title')}</SectionTitle>
      <p className="-mt-2 text-sm text-muted">{t('settings.smtp.hint')}</p>
      <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-6" noValidate>
        <Field label={t('settings.smtp.host')} className="sm:col-span-3">
          {({ id }) => (
            <Input
              id={id}
              value={form.host}
              placeholder="smtp.example.com"
              autoComplete="off"
              onChange={(e) => set({ host: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('settings.smtp.port')} className="sm:col-span-1">
          {({ id }) => (
            <Input
              id={id}
              inputMode="numeric"
              value={form.port}
              onChange={(e) => set({ port: e.target.value.replace(/\D/g, '') })}
            />
          )}
        </Field>
        <Field label={t('settings.smtp.security')} className="sm:col-span-2">
          {({ id }) => (
            <Select
              id={id}
              value={form.security}
              onChange={(e) => {
                const security = e.target.value as SmtpSecurity;
                // The usual port of each choice, unless the admin typed another.
                const usual = { starttls: '587', tls: '465', none: '25' } as const;
                set({
                  security,
                  port: Object.values(usual).includes(form.port as '587')
                    ? usual[security]
                    : form.port,
                });
              }}
            >
              <option value="starttls">STARTTLS (587)</option>
              <option value="tls">TLS (465)</option>
              <option value="none">{t('settings.smtp.noTls')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('settings.smtp.username')} className="sm:col-span-3">
          {({ id }) => (
            <Input
              id={id}
              value={form.username}
              autoComplete="off"
              onChange={(e) => set({ username: e.target.value })}
            />
          )}
        </Field>
        <Field
          label={t('settings.smtp.password')}
          hint={
            !current.canStorePassword
              ? t('settings.smtp.noKey')
              : current.hasPassword
                ? t('settings.smtp.passwordKept')
                : undefined
          }
          className="sm:col-span-3"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              aria-describedby={describedBy}
              autoComplete="new-password"
              disabled={!current.canStorePassword || form.removePassword}
              placeholder={current.hasPassword ? '••••••••' : ''}
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          )}
        </Field>
        {current.hasPassword && (
          <label className="flex items-center gap-2 text-[13px] text-ink sm:col-span-6">
            <input
              type="checkbox"
              checked={form.removePassword}
              onChange={(e) => set({ removePassword: e.target.checked, password: '' })}
            />
            {t('settings.smtp.removePassword')}
          </label>
        )}
        <Field label={t('settings.smtp.fromName')} className="sm:col-span-3">
          {({ id }) => (
            <Input
              id={id}
              value={form.fromName}
              onChange={(e) => set({ fromName: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('settings.smtp.fromEmail')} className="sm:col-span-3">
          {({ id }) => (
            <Input
              id={id}
              type="email"
              value={form.fromEmail}
              placeholder="noreply@qafe.ba"
              onChange={(e) => set({ fromEmail: e.target.value })}
            />
          )}
        </Field>
        <div className="sm:col-span-6">
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!valid}
            icon={<Mail className="size-4" />}
          >
            {t('settings.smtp.save')}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[13px] font-semibold text-ink">{t('settings.smtp.testTitle')}</p>
        <p className="mt-0.5 text-xs text-muted">{t('settings.smtp.testHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="email"
            aria-label={t('settings.smtp.testTo')}
            placeholder={t('settings.smtp.testTo')}
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            className="w-72"
          />
          <Button
            variant="secondary"
            loading={test.isPending}
            disabled={!current.configured || !testTo.includes('@')}
            onClick={() => test.mutate()}
            icon={<Send className="size-4" />}
          >
            {t('settings.smtp.test')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
