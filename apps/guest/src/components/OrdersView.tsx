import type { GuestSessionState, SessionOrder } from '@qafe/contracts';
import { Button, cn, ConfirmDialog } from '@qafe/ui';
import { AnimatePresence, m } from 'motion/react';
import { MessageSquareText, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { cart } from '../lib/cart';
import { formatMoney, formatTime } from '../lib/format';
import { useSessionAction } from '../lib/useAction';

type Shown = SessionOrder['status'] | 'modified';

const TONES: Record<Shown, string> = {
  new: 'bg-primary/10 text-accent',
  returned: 'bg-warning/12 text-warning',
  accepted: 'bg-success/12 text-success',
  modified: 'bg-warning/12 text-warning',
  preparing: 'bg-primary/10 text-accent',
  ready: 'bg-success/12 text-success',
  served: 'bg-surface-2 text-muted',
  cancelled: 'bg-danger/10 text-danger',
  rejected: 'bg-danger/10 text-danger',
  withdrawn: 'bg-surface-2 text-muted',
};

const INACTIVE = ['cancelled', 'rejected', 'withdrawn'];

/** The way an order goes; returned, cancelled and similar orders show only their badge. */
const STEPS = ['new', 'accepted', 'preparing', 'ready', 'served'] as const;

/** "Izmijenjeno" is an accepted order that staff changed (FR-GOS-10, 11). */
const shownStatus = (order: SessionOrder): Shown =>
  order.status === 'accepted' && order.changes.length > 0 ? 'modified' : order.status;

/** Every order of the table with who ordered it (FR-GOS-10..12, 24, 25). */
export function OrdersView({
  state,
  currency,
  onEdit,
}: {
  state: GuestSessionState;
  currency: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<{
    kind: 'withdraw' | 'dispute';
    order: SessionOrder;
  } | null>(null);
  const act = useSessionAction(
    ({ kind, order }: { kind: 'withdraw' | 'dispute'; order: SessionOrder }) =>
      api<GuestSessionState>('POST', `/guest/orders/${order.id}/${kind}`),
  );

  if (state.orders.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted">{t('orders.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-3 px-4 py-5">
      {state.orders.map((order, index) => (
        <OrderCard
          index={index}
          key={order.id}
          order={order}
          state={state}
          currency={currency}
          onFix={() => {
            cart.edit({
              orderId: order.id,
              number: order.number,
              note: order.note ?? '',
              lines: order.items
                .filter((i) => !INACTIVE.includes(i.status) && i.status !== 'removed')
                .map((i) => ({
                  itemId: i.itemId,
                  quantity: i.quantity,
                  modifierOptionIds: i.modifiers.flatMap((m) => (m.optionId ? [m.optionId] : [])),
                  ...(i.note ? { note: i.note } : {}),
                })),
            });
            onEdit();
          }}
          onWithdraw={() => setConfirm({ kind: 'withdraw', order })}
          onDispute={() => setConfirm({ kind: 'dispute', order })}
        />
      ))}
      <ConfirmDialog
        open={confirm !== null}
        title={t(confirm?.kind === 'withdraw' ? 'orders.withdrawTitle' : 'orders.notOursTitle')}
        body={t(confirm?.kind === 'withdraw' ? 'orders.withdrawBody' : 'orders.notOursBody', {
          number: confirm?.order.number ?? 0,
        })}
        confirmLabel={t(confirm?.kind === 'withdraw' ? 'orders.withdraw' : 'orders.notOurs')}
        tone="danger"
        loading={act.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) act.mutate(confirm, { onSettled: () => setConfirm(null) });
        }}
      />
    </div>
  );
}

function OrderCard({
  index,
  order,
  state,
  currency,
  onFix,
  onWithdraw,
  onDispute,
}: {
  index: number;
  order: SessionOrder;
  state: GuestSessionState;
  currency: string;
  onFix: () => void;
  onWithdraw: () => void;
  onDispute: () => void;
}) {
  const { t, i18n } = useTranslation();
  const status = shownStatus(order);
  const mine = order.guestId === state.me.id;
  const canFix = order.status === 'returned' && (mine || state.me.isHost);
  const canDispute =
    !mine &&
    order.dispute === null &&
    !INACTIVE.includes(order.status) &&
    state.me.status === 'approved';

  return (
    <m.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 5) * 0.05, ease: [0.2, 0.8, 0.3, 1] }}
      className={cn(
        'rounded-[22px] border bg-surface p-4 shadow-card transition-shadow',
        order.status === 'ready' ? 'border-success/50 ring-4 ring-success/10' : 'border-line',
        INACTIVE.includes(order.status) && 'opacity-70',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">
            {t('orders.number', { number: order.number })}
            <span className="ml-2 text-xs font-medium text-muted">
              {formatTime(order.createdAt)}
            </span>
          </h3>
          <p className="text-xs text-muted">
            {order.orderedBy
              ? t('orders.by', {
                  name: mine ? `${order.orderedBy} (${t('orders.you')})` : order.orderedBy,
                })
              : t('orders.byStaff')}
          </p>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={status}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
              TONES[status],
            )}
          >
            {['new', 'accepted', 'modified', 'preparing'].includes(status) && (
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
            )}
            {t(`orders.status.${status}`)}
          </m.span>
        </AnimatePresence>
      </header>

      <Progress status={order.status} />

      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {order.items.map((item) => {
          const gone = item.status === 'removed' || item.status === 'cancelled';
          return (
            <li
              key={item.id}
              className={cn('flex justify-between gap-3', gone && 'text-muted line-through')}
            >
              <span className="min-w-0">
                <span className="font-semibold">{item.quantity}×</span> {item.name}
                {item.modifiers.length > 0 && (
                  <span className="text-muted">
                    {' '}
                    ({item.modifiers.map((m) => m.option).join(', ')})
                  </span>
                )}
                {item.note && (
                  <span className="block text-xs text-muted italic">„{item.note}"</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatMoney(item.lineTotal, currency, i18n.language)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
        <span>{t('cart.total')}</span>
        <span className="tabular-nums">{formatMoney(order.total, currency, i18n.language)}</span>
      </p>

      {(order.staffMessage || order.changes.length > 0) && (
        <div className="mt-3 rounded-xl bg-warning/8 px-3 py-2.5 text-[13px] text-ink">
          {order.staffMessage && (
            <p className="flex gap-2">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <b>{t('orders.staffMessage')}:</b> {order.staffMessage}
              </span>
            </p>
          )}
          {order.changes.length > 0 && (
            <ul className="mt-1.5 list-disc pl-6 text-muted">
              {order.changes.map((c, i) => (
                <li key={i}>
                  {t(`orders.changes.${c.type}`)}
                  {c.message && `: ${c.message}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {order.dispute && (
        <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-danger">
          <ShieldAlert className="size-4" aria-hidden />
          {t(order.dispute === 'confirmed' ? 'orders.disputeConfirmed' : 'orders.disputed')}
        </p>
      )}

      {(canFix || canDispute) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canFix && (
            <>
              <Button size="sm" onClick={onFix}>
                {t('orders.fix')}
              </Button>
              <Button size="sm" variant="secondary" onClick={onWithdraw}>
                {t('orders.withdraw')}
              </Button>
            </>
          )}
          {canDispute && (
            <Button size="sm" variant="ghost" className="text-danger!" onClick={onDispute}>
              {t('orders.notOurs')}
            </Button>
          )}
        </div>
      )}
    </m.article>
  );
}

/** Five dots on a line, filled up to where the order is (FR-GOS-10). */
function Progress({ status }: { status: SessionOrder['status'] }) {
  const { t } = useTranslation();
  const step = STEPS.indexOf(status as (typeof STEPS)[number]);
  if (step < 0) return null;
  return (
    <div
      className="relative mt-4 mb-1 flex items-center justify-between px-1"
      role="img"
      aria-label={t(`orders.status.${status}`)}
    >
      <div className="absolute inset-x-1 h-1 rounded-full bg-surface-2" />
      <m.div
        className="absolute left-1 h-1 rounded-full bg-gradient-to-r from-primary to-blue-bright"
        initial={false}
        animate={{ width: `calc(${(step / (STEPS.length - 1)) * 100}% - 0.5rem)` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
      {STEPS.map((s, i) => (
        <m.span
          key={s}
          initial={false}
          animate={{ scale: i === step ? 1.25 : 1 }}
          className={cn(
            'relative size-2.5 rounded-full ring-4 ring-surface transition-colors',
            i <= step ? 'bg-primary' : 'bg-line-strong',
          )}
        />
      ))}
    </div>
  );
}
