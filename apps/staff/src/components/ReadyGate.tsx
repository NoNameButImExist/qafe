import { Button, Switch } from '@qafe/ui';
import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pushState, subscribePush, type PushState } from '../lib/push';
import { unlockSound } from '../lib/sound';
import { useStaff } from '../lib/useAuth';

/**
 * "Spreman za rad" (FR-KON-02): browsers play sound only after a tap, so the shift starts with
 * one. The same tap may ask for notification permission (FR-KON-05).
 */
export function ReadyGate({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const staff = useStaff();
  const [push, setPush] = useState<PushState | null>(null);
  const [wantPush, setWantPush] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState()
      .then(setPush)
      .catch(() => setPush('unavailable'));
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      await unlockSound().catch(() => undefined);
      if (wantPush && push === 'off') setPush(await subscribePush().catch(() => 'off' as const));
    } finally {
      setBusy(false);
      onReady();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
          <BellRing className="size-7" />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-ink">{t('ready.title')}</h2>
        <p className="mt-1 text-sm text-muted">
          {staff.fullName} · {staff.venue.name}
        </p>
        <p className="mt-3 text-sm text-muted">{t('ready.body')}</p>

        {push === 'off' && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink">
            {t('ready.push')}
            <Switch checked={wantPush} onChange={setWantPush} label={t('ready.push')} />
          </div>
        )}
        {push === 'blocked' && (
          <p className="mt-4 text-xs text-warning">{t('ready.pushBlocked')}</p>
        )}
        {push === 'unsupported' && (
          <p className="mt-4 text-xs text-muted">{t('ready.pushUnsupported')}</p>
        )}

        <Button
          size="lg"
          className="mt-6 h-14 w-full text-base"
          loading={busy}
          onClick={() => void start()}
        >
          {t('ready.start')}
        </Button>
      </div>
    </div>
  );
}
