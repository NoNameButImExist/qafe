import type { GuestSessionState, GuestVenue } from '@qafe/contracts';
import { Button, Input } from '@qafe/ui';
import { Info, KeyRound, Store, UserRoundPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useSessionAction } from '../lib/useAction';

function Banner({
  icon,
  tone,
  children,
}: {
  icon: ReactNode;
  tone: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={
        tone === 'warning'
          ? 'flex gap-3 rounded-2xl border border-warning/25 bg-warning/8 p-3.5 text-[13px] text-ink'
          : 'flex gap-3 rounded-2xl border border-primary/20 bg-primary/6 p-3.5 text-[13px] text-ink'
      }
    >
      <span className={tone === 'warning' ? 'text-warning' : 'text-accent'}>{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** What the device has to know or do before ordering (FR-GOS-03, 21, 22). */
export function Banners({
  venue,
  state,
  onReview,
}: {
  venue: GuestVenue;
  state: GuestSessionState;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const waiting = state.guests.filter((g) => g.status === 'pending_approval' && !g.isMe).length;
  const needsPin =
    state.session.verificationMode === 'pin' &&
    !state.session.verified &&
    state.me.status === 'approved';
  const items: ReactNode[] = [];

  if (venue.closedReason) {
    items.push(
      <Banner key="closed" tone="warning" icon={<Store className="size-5" />}>
        {t(`venue.closed.${venue.closedReason}`)}
      </Banner>,
    );
  }
  if (state.me.status === 'pending_approval') {
    items.push(
      <Banner key="me" tone="warning" icon={<UserRoundPlus className="size-5" />}>
        {t('banner.pendingMe')}
      </Banner>,
    );
  }
  if (state.me.isHost && waiting > 0) {
    items.push(
      <Banner key="others" tone="warning" icon={<UserRoundPlus className="size-5" />}>
        <p className="font-semibold">{t('banner.pendingOthers', { count: waiting })}</p>
        <Button size="sm" className="mt-2" onClick={onReview}>
          {t('banner.review')}
        </Button>
      </Banner>,
    );
  }
  if (needsPin) items.push(<PinForm key="pin" />);
  if (
    state.session.verificationMode === 'waiter' &&
    !state.session.verified &&
    state.me.status === 'approved' &&
    !venue.closedReason
  ) {
    items.push(
      <Banner key="waiter" tone="info" icon={<Info className="size-5" />}>
        {t('banner.unverifiedWaiter')}
      </Banner>,
    );
  }
  if (items.length === 0) return null;
  return <div className="flex flex-col gap-2 px-4 pt-4">{items}</div>;
}

function PinForm() {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const verify = useSessionAction((value: string) =>
    api<GuestSessionState>('POST', '/guest/session/verify', { code: value }),
  );
  return (
    <Banner tone="warning" icon={<KeyRound className="size-5" />}>
      <p className="font-semibold">{t('banner.pinTitle')}</p>
      <p className="text-muted">{t('banner.pinBody')}</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate(code, { onError: () => setCode('') });
        }}
      >
        <Input
          aria-label={t('banner.pinLabel')}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4}"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-28 text-center text-lg tracking-[0.4em]"
        />
        <Button type="submit" disabled={code.length !== 4} loading={verify.isPending}>
          {t('banner.pinSubmit')}
        </Button>
      </form>
    </Banner>
  );
}
