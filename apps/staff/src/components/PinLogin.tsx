import type { StaffDeviceRoster } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { ArrowLeft, CircleAlert, Delete, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, errorKey } from '../lib/api';
import { useAuth } from '../lib/useAuth';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Sign-in on a shared device of the venue (FR-KON-01): tap your name, then your PIN on a
 * keypad big enough for a busy bar (NFR-15).
 */
export function PinLogin({
  roster,
  onSignedIn,
  onPassword,
}: {
  roster: StaffDeviceRoster;
  onSignedIn: () => void;
  onPassword: () => void;
}) {
  const { t } = useTranslation();
  const { pinLogin } = useAuth();
  const [member, setMember] = useState<StaffDeviceRoster['members'][number] | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await pinLogin(member.memberId, value);
      onSignedIn();
    } catch (err) {
      // The password message names venue and username; for a PIN only the PIN can be wrong.
      setError(
        err instanceof ApiError && err.code === 'invalid_credentials'
          ? t('pin.wrong')
          : t(errorKey(err)),
      );
      setPin('');
      setBusy(false);
    }
  };
  const press = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setError(null);
    setPin((p) => p + digit);
  };

  // A hardware keyboard works too (tablets with a keyboard, desktop).
  useEffect(() => {
    if (!member) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= 4) void submit(pin);
      else if (e.key === 'Escape') setMember(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!member) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted">
          {t('pin.pickName', { device: roster.device.name, venue: roster.venue.name })}
        </p>
        {roster.members.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            {t('pin.noMembers')}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {roster.members.map((m) => (
              <li key={m.memberId}>
                <button
                  type="button"
                  onClick={() => {
                    setMember(m);
                    setPin('');
                    setError(null);
                  }}
                  className="flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-3 text-center shadow-card transition-transform hover:border-primary/50 active:scale-[0.97]"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary to-blue-bright font-display text-sm font-bold text-white">
                    {m.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-ink">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onPassword}
          className="mt-6 min-h-11 text-[13px] font-semibold text-accent hover:underline"
        >
          {t('pin.usePassword')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setMember(null)}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t('pin.back')}
      </button>
      <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <KeyRound className="size-5 text-accent" aria-hidden />
        {t('pin.enterFor', { name: member.name })}
      </p>

      <div
        className="mt-5 flex justify-center gap-3"
        aria-live="polite"
        aria-label={t('pin.label')}
      >
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-full border-2 transition-colors',
              i < pin.length ? 'border-primary bg-primary' : 'border-line-strong',
            )}
          />
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-center justify-center gap-2 text-[13px] font-medium text-danger"
        >
          <CircleAlert className="size-4" aria-hidden /> {error}
        </p>
      )}

      <div className="mx-auto mt-6 grid max-w-xs grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} label={t('pin.erase')}>
          <Delete className="size-5" aria-hidden />
        </Key>
        <Key onClick={() => press('0')}>0</Key>
        <Key
          primary
          disabled={pin.length < 4 || busy}
          onClick={() => void submit(pin)}
          label={t('pin.submit')}
        >
          {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : t('pin.ok')}
        </Key>
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  primary,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'grid h-16 place-items-center rounded-2xl font-display text-2xl font-semibold transition-transform active:scale-95 disabled:opacity-40',
        primary
          ? 'bg-primary text-base text-on-primary shadow-lg shadow-primary/25'
          : 'border border-line bg-surface text-ink shadow-card',
      )}
    >
      {children}
    </button>
  );
}
