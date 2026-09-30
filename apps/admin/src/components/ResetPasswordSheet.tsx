import { useMutation } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorKey } from '../lib/api';
import { venueHost } from '../lib/format';
import { generatePassword } from '../lib/text';
import { Button, CopyRow, Field, Input, Sheet } from '@qafe/ui';

/** Whose password is reset, and how they sign in (shown with the new password). */
export interface ResetTarget {
  id: string;
  fullName: string;
  email: string | null;
  /** Venue staff sign in with the venue address and a username. */
  login?: { venueSlug: string; username: string };
}

/** FR-ADM-09: sets a temporary password and shows it once, for the admin to pass on. */
export function ResetPasswordSheet({
  user,
  onClose,
  onDone,
}: {
  user: ResetTarget | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(generatePassword);
  const reset = useMutation({
    mutationFn: (u: ResetTarget) =>
      api<void>(`/admin/users/${u.id}/password`, {
        method: 'POST',
        body: { temporaryPassword: password },
      }),
    onSuccess: () => onDone?.(),
  });

  function close() {
    onClose();
    setTimeout(() => {
      reset.reset();
      setPassword(generatePassword());
    }, 250);
  }

  const tooShort = password.length < 10;
  const login = user?.login;

  return (
    <Sheet
      open={user !== null}
      onClose={close}
      title={reset.isSuccess ? t('users.resetDone') : t('users.resetTitle')}
      description={reset.isSuccess ? undefined : user?.fullName}
      footer={
        <div className="flex justify-end gap-3">
          {reset.isSuccess ? (
            <Button onClick={close}>{t('createVenue.done')}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={tooShort}
                loading={reset.isPending}
                onClick={() => user && reset.mutate(user)}
              >
                {t('users.resetSubmit')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {reset.isSuccess && user ? (
        <>
          <div className="flex flex-col items-center text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-success/12 text-success">
              <CircleCheck className="size-7" />
            </span>
            <p className="mt-4 max-w-sm text-sm text-muted">{t('users.resetDoneBody')}</p>
          </div>
          <dl className="mt-6 flex flex-col gap-3">
            {login ? (
              <>
                <CopyRow label={t('createVenue.successVenue')} value={venueHost(login.venueSlug)} />
                <CopyRow label={t('createVenue.successUsername')} value={login.username} />
              </>
            ) : (
              user.email && <CopyRow label={t('login.email')} value={user.email} />
            )}
            <CopyRow label={t('createVenue.successPassword')} value={password} secret />
          </dl>
        </>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted">{t('users.resetBody')}</p>
          {reset.isError && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
            >
              <CircleAlert className="size-4 shrink-0" />
              {t(errorKey(reset.error))}
            </div>
          )}
          <Field label={t('createVenue.ownerPassword')} hint={t('createVenue.ownerPasswordHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={tooShort}
                className="font-mono"
                autoComplete="new-password"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<KeyRound className="size-4" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setPassword(generatePassword())}
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
        </div>
      )}
    </Sheet>
  );
}
