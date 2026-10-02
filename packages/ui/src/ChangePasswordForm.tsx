import { CircleAlert, KeyRound, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from './Brand';
import { Button } from './Button';
import { Field, Input } from './Field';

interface ChangePasswordFormProps {
  /** Throws on failure; `errorText` turns the error into a message. */
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  errorText: (error: unknown) => string;
  /** Shown under the button when the user must change the password before anything else. */
  onLogout?: () => void;
  /** Full screen (forced change at sign-in) or a plain form (account page). */
  variant?: 'screen' | 'form';
  onDone?: () => void;
}

/**
 * Change one's own password (FR-SEF-01). Every app defines the i18n keys `password.*`.
 * As a screen it is the only thing a user with a temporary password can do.
 */
export function ChangePasswordForm({
  onSubmit,
  errorText,
  onLogout,
  variant = 'form',
  onDone,
}: ChangePasswordFormProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = repeat.length > 0 && next !== repeat;
  const same = next.length > 0 && next === current;
  const valid = current && next.length >= 8 && next === repeat && !same;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
        >
          <CircleAlert className="mt-px size-4 shrink-0" />
          {error}
        </div>
      )}
      {done && variant === 'form' && (
        <p role="status" className="text-[13px] font-medium text-success">
          {t('password.changed')}
        </p>
      )}
      <Field label={t('password.current')}>
        {({ id }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            icon={<Lock className="size-4" />}
          />
        )}
      </Field>
      <Field
        label={t('password.new')}
        hint={t('password.hint')}
        error={tooShort ? t('password.short') : same ? t('password.same') : undefined}
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            icon={<KeyRound className="size-4" />}
          />
        )}
      </Field>
      <Field label={t('password.repeat')} error={mismatch ? t('password.mismatch') : undefined}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            icon={<KeyRound className="size-4" />}
          />
        )}
      </Field>
      <Button type="submit" size="lg" loading={busy} disabled={!valid} className="mt-1 w-full">
        {t('password.submit')}
      </Button>
      {onLogout && (
        <Button variant="ghost" onClick={onLogout}>
          {t('password.logout')}
        </Button>
      )}
    </form>
  );

  if (variant === 'form') return form;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12">
      <div className="w-full max-w-[420px] animate-fade-up">
        <Brand className="text-3xl" />
        <h1 className="mt-8 font-display text-[26px] leading-tight font-bold text-ink">
          {t('password.title')}
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-muted">{t('password.body')}</p>
        {form}
      </div>
    </main>
  );
}
