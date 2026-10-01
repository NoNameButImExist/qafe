import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Armchair,
  ArrowRight,
  CircleAlert,
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  Store,
  User,
  Wallet,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthBrandPanel, Brand, Button, Field, Input, LanguageSwitch, ThemeToggle } from '@qafe/ui';
import { errorKey } from '../lib/api';
import { useAuth } from '../lib/useAuth';

const LAST_VENUE = 'qafe.staff.venue';

function lastVenue(): string {
  try {
    return localStorage.getItem(LAST_VENUE) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });

  const [venue, setVenue] = useState(lastVenue);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const slug = venue.trim().toLowerCase();
    try {
      await login(slug, username.trim(), password);
      try {
        localStorage.setItem(LAST_VENUE, slug);
      } catch {
        // Storage blocked: the venue is simply not remembered.
      }
      // Only same-app paths, never an absolute URL from the query string.
      await navigate({
        to: redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : '/',
      });
    } catch (err) {
      setError(t(errorKey(err)));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh">
      <AuthBrandPanel
        tagline={t('brand.tagline')}
        badge={t('login.badge')}
        lines={[t('login.heroLine1'), t('login.heroLine2'), t('login.heroLine3')]}
        subtitle={t('login.heroSubtitle')}
        features={[
          { icon: ClipboardList, label: t('login.features.orders') },
          { icon: Armchair, label: t('login.features.tables') },
          { icon: Wallet, label: t('login.features.pay') },
        ]}
      />

      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 sm:px-10">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full bg-primary/10 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-[360px] rounded-full bg-blue-bright/10 blur-[110px]" />
        <div className="absolute top-5 right-5 flex items-center gap-2">
          <LanguageSwitch />
          <ThemeToggle />
        </div>

        <div className="relative w-full max-w-[420px] animate-fade-up">
          <div className="mb-10 lg:hidden">
            <Brand className="text-3xl" />
            <p className="mt-2 text-xs font-medium tracking-[0.3em] text-muted uppercase">
              {t('brand.tagline')}
            </p>
          </div>

          <div className="mb-6 h-1 w-14 rounded-full bg-gradient-to-r from-blue-brand to-blue-bright" />
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('login.title')}
          </h1>
          <p className="mt-1.5 text-sm text-muted">{t('login.subtitle')}</p>

          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
            >
              <CircleAlert className="mt-px size-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 flex flex-col gap-4" noValidate>
            <Field label={t('login.venue')} hint={t('login.venueHint')}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  autoComplete="organization"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  autoFocus={!venue}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  icon={<Store className="size-4" />}
                  trailing={<span className="pr-2.5 text-[13px] text-muted">.qafe.ba</span>}
                  className="pr-20"
                />
              )}
            </Field>
            <Field label={t('login.username')}>
              {({ id }) => (
                <Input
                  id={id}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  autoFocus={Boolean(venue)}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  icon={<User className="size-4" />}
                />
              )}
            </Field>
            <Field label={t('login.password')}>
              {({ id }) => (
                <Input
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  icon={<Lock className="size-4" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />
              )}
            </Field>

            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={!venue || !username || !password}
              className="group mt-2 w-full"
            >
              {t('login.submit')}
              {!submitting && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
