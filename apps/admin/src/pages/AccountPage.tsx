import type { MfaSetup, MfaStatus } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ChangePasswordForm, CopyRow, Input, SectionTitle } from '@qafe/ui';
import { QrCode } from '../components/QrCode';
import { api, errorKey } from '../lib/api';
import { useAuth, useUser } from '../lib/useAuth';

const mfaQuery = { queryKey: ['mfa'], queryFn: () => api<MfaStatus>('/auth/mfa') };

/** The admin's own account: two-factor sign-in (FR-ADM-01) and password. */
export function AccountPage() {
  const { t } = useTranslation();
  const user = useUser();
  const { changePassword } = useAuth();
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('account.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {user.fullName} · {user.email}
      </p>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <MfaCard />
        <Card className="p-6">
          <SectionTitle>{t('account.password')}</SectionTitle>
          <ChangePasswordForm onSubmit={changePassword} errorText={(e) => t(errorKey(e))} />
        </Card>
      </div>
    </div>
  );
}

function MfaCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery(mfaQuery);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const done = () => {
    setSetup(null);
    setCode('');
    void queryClient.invalidateQueries({ queryKey: ['mfa'] });
  };
  const start = useMutation({
    mutationFn: () => api<MfaSetup>('/auth/mfa/setup', { method: 'POST' }),
    onSuccess: setSetup,
  });
  const enable = useMutation({
    mutationFn: () => api<void>('/auth/mfa/enable', { method: 'POST', body: { code } }),
    onSuccess: done,
    onError: () => setCode(''),
  });
  const disable = useMutation({
    mutationFn: () => api<void>('/auth/mfa/disable', { method: 'POST', body: { code } }),
    onSuccess: done,
    onError: () => setCode(''),
  });
  const error = start.error ?? enable.error ?? disable.error;

  const codeInput = (
    <Input
      aria-label={t('account.code')}
      placeholder={t('account.code')}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      className="w-40 tracking-[0.3em]"
    />
  );

  return (
    <Card className="p-6">
      <SectionTitle>{t('account.mfa')}</SectionTitle>
      <p className="text-sm text-muted">{t('account.mfaHint')}</p>
      {error && (
        <p
          role="alert"
          className="mt-3 flex items-center gap-2 text-[13px] font-medium text-danger"
        >
          <CircleAlert className="size-4" /> {t(errorKey(error))}
        </p>
      )}

      {!status.data ? null : !status.data.available ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[13px] text-muted">
          {t('account.mfaUnavailable')}
        </p>
      ) : status.data.enabled ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <ShieldCheck className="size-5" /> {t('account.mfaOn')}
          </p>
          <p className="text-[13px] text-muted">{t('account.mfaDisableHint')}</p>
          <div className="flex flex-wrap gap-2">
            {codeInput}
            <Button
              variant="danger"
              icon={<ShieldOff className="size-4" />}
              disabled={code.length !== 6}
              loading={disable.isPending}
              onClick={() => disable.mutate()}
            >
              {t('account.mfaDisable')}
            </Button>
          </div>
        </div>
      ) : setup ? (
        <div className="mt-4 flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-[13px] text-ink">
            <li>{t('account.step1')}</li>
            <li>{t('account.step2')}</li>
          </ol>
          <div className="w-48 rounded-2xl border border-line bg-white p-3">
            <QrCode value={setup.otpauthUrl} label={t('account.qr')} />
          </div>
          <CopyRow label={t('account.manual')} value={setup.secret} />
          <div className="flex flex-wrap gap-2">
            {codeInput}
            <Button
              disabled={code.length !== 6}
              loading={enable.isPending}
              onClick={() => enable.mutate()}
            >
              {t('account.mfaConfirm')}
            </Button>
            <Button variant="ghost" onClick={done}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
            <ShieldOff className="size-5" /> {t('account.mfaOff')}
          </p>
          <Button
            icon={<ShieldCheck className="size-4" />}
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            {t('account.mfaEnable')}
          </Button>
        </div>
      )}
    </Card>
  );
}
