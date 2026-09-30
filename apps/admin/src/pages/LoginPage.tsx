import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowRight,
  CircleAlert,
  Coffee,
  Eye,
  EyeOff,
  FaceSlightlySmiling,
  Lock,
  Mail,
  ScanLine,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand, Button, Field, Input, LanguageSwitch, ThemeToggle } from '@qafe/ui';
import { errorKey } from '../lib/api';
import { useAuth } from '../lib/useAuth';

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
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
      <BrandPanel />

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
            <Field label={t('login.email')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="size-4" />}
                  placeholder="admin@qafe.ba"
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
              disabled={!email || !password}
              className="group mt-2 w-full"
            >
              {t('login.submit')}
              {!submitting && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">{t('login.adminOnly')}</p>
        </div>
      </main>
    </div>
  );
}

/** Left half on large screens: the brand look of the printed table cards. */
function BrandPanel() {
  const { t } = useTranslation();
  const features = [
    { icon: ScanLine, label: t('login.features.scan') },
    { icon: Coffee, label: t('login.features.order') },
    { icon: FaceSlightlySmiling, label: t('login.features.enjoy') },
  ];

  return (
    <aside className="relative hidden w-1/2 flex-col overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div className="pointer-events-none absolute -top-40 -left-40 size-[560px] rounded-full bg-blue-brand/20 blur-[150px]" />
      <div className="pointer-events-none absolute top-1/3 -right-24 size-[320px] rounded-full bg-blue-bright/10 blur-[110px]" />

      <div className="relative z-10 p-10 xl:p-12">
        <Brand onDark className="text-3xl" />
        <p className="mt-2 text-xs font-medium tracking-[0.3em] text-white/70 uppercase">
          {t('brand.tagline')}
        </p>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-40 xl:px-16">
        <div className="animate-fade-up">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-bright/30 bg-blue-bright/10 px-3.5 py-1.5 text-xs font-semibold text-blue-bright">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-bright" />
            {t('login.badge')}
          </span>

          <h2 className="font-display text-5xl leading-[1.08] font-bold tracking-tight xl:text-6xl">
            {t('login.heroLine1')}
            <br />
            {t('login.heroLine2')}
            <br />
            <span className="text-blue-bright">{t('login.heroLine3')}</span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
            {t('login.heroSubtitle')}
          </p>

          <ul className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] py-5 backdrop-blur-sm">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2.5 px-3 text-center">
                <Icon className="size-7 text-blue-bright" strokeWidth={1.6} aria-hidden />
                <span className="text-xs leading-snug font-medium text-white/80">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Blue wave at the bottom, as on the printed table cards. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-40 w-full"
        viewBox="0 0 800 160"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 110 C 220 40, 480 170, 800 60 L 800 160 L 0 160 Z" fill="#0070E8" />
        <path
          d="M0 132 C 260 80, 520 175, 800 100 L 800 160 L 0 160 Z"
          fill="#0056C4"
          opacity="0.55"
        />
      </svg>
    </aside>
  );
}
