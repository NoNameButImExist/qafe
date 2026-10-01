import type { GuestSessionState } from '@qafe/contracts';
import { Button } from '@qafe/ui';
import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useNoticeContext } from '../lib/notice';
import { useSessionAction } from '../lib/useAction';

/** "Pozovi konobara", then a countdown until it may be pressed again (FR-GOS-14). */
export function CallWaiter({ state }: { state: GuestSessionState }) {
  const { t } = useTranslation();
  const notify = useNoticeContext();
  const seconds = useSecondsUntil(state.callWaiterAvailableAt);
  const call = useSessionAction(() =>
    api<GuestSessionState>('POST', '/guest/requests', { type: 'call_waiter' }),
  );
  return (
    <Button
      variant="secondary"
      size="lg"
      className="w-full"
      icon={<BellRing className="size-4" />}
      loading={call.isPending}
      disabled={seconds > 0}
      onClick={() =>
        call.mutate(undefined, {
          onSuccess: () => notify({ tone: 'success', text: t('service.called') }),
        })
      }
    >
      {seconds > 0 ? t('service.again', { seconds }) : t('service.callWaiter')}
    </Button>
  );
}

function useSecondsUntil(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  const until = iso ? Date.parse(iso) : 0;
  useEffect(() => {
    // Fresh clock right away, then every second until the cooldown ends.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}
