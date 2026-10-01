import type { OrderLineRequest, StaffOrder } from '@qafe/contracts';
import { Button, cn, ConfirmDialog, Textarea } from '@qafe/ui';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, MessageSquareText, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatMoney, formatTime, minutesSince } from '../lib/format';
import { useAction } from '../lib/useAction';
import { useCan } from '../lib/useAuth';
import { ItemPicker } from './ItemPicker';

const TONES: Record<StaffOrder['status'], string> = {
  new: 'bg-danger/12 text-danger',
  returned: 'bg-warning/12 text-warning',
  accepted: 'bg-primary/10 text-accent',
  preparing: 'bg-primary/10 text-accent',
  ready: 'bg-success/12 text-success',
  served: 'bg-surface-2 text-muted',
  cancelled: 'bg-surface-2 text-muted',
  rejected: 'bg-surface-2 text-muted',
  withdrawn: 'bg-surface-2 text-muted',
};

const CHANGEABLE = ['new', 'accepted', 'preparing', 'ready'];
const LIVE_ITEM = ['pending', 'preparing', 'ready', 'served'];

type Dialog =
  | { kind: 'return' | 'reject' | 'cancel' }
  | { kind: 'remove' | 'cancelItem'; itemId: string; name: string };

/** One order with what the member may do with it (FR-KON-06..11, 13, FR-GOS-25). */
export function OrderCard({
  order,
  showTable = false,
  rejectionEnabled = false,
}: {
  order: StaffOrder;
  showTable?: boolean;
  rejectionEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const can = {
    update: useCan('orders.update'),
    ret: useCan('orders.return'),
    reject: useCan('orders.reject'),
    cancel: useCan('orders.cancel'),
    add: useCan('orders.add_items'),
    disputes: useCan('orders.disputes'),
  };
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState<
    { mode: 'add' } | { mode: 'replace'; itemId: string; name: string } | null
  >(null);

  const url = `/staff/orders/${order.id}`;
  const post = (path: string, body: object = {}) =>
    api<void>(`${url}${path}`, { method: 'POST', body });
  const accept = useAction(() => post('/accept'));
  const serve = useAction(() => post('/serve'));
  const dialogAction = useAction((d: Dialog) => {
    const message = text.trim();
    switch (d.kind) {
      case 'return':
        return post('/return', { message });
      case 'reject':
        return post('/reject', { reason: message });
      case 'cancel':
        return post('/cancel', message ? { reason: message } : {});
      case 'remove':
        return post(`/items/${d.itemId}/remove`, message ? { message } : {});
      case 'cancelItem':
        return post(`/items/${d.itemId}/cancel`, message ? { reason: message } : {});
    }
  });
  const dispute = useAction((action: 'confirm' | 'cancel') => post('/dispute', { action }));
  const add = useAction(
    (items: OrderLineRequest[]) => post('/items', { items }),
    t('picker.added'),
  );
  const replace = useAction(
    ({ itemId, line }: { itemId: string; line: OrderLineRequest }) =>
      post(`/items/${itemId}/replace`, line),
    t('picker.replaced'),
  );

  const waiting = minutesSince(order.createdAt);
  const changeable = CHANGEABLE.includes(order.status);
  const textRequired = dialog?.kind === 'return' || dialog?.kind === 'reject';
  const modified = order.status === 'accepted' && order.changes.length > 0;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-surface p-4',
        order.status === 'new'
          ? 'border-danger/40 shadow-[0_0_0_3px] shadow-danger/10'
          : 'border-line',
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {showTable ? (
              <Link
                to="/table/$tableId"
                params={{ tableId: order.tableId }}
                className="font-display text-lg font-bold text-ink underline-offset-2 hover:underline"
              >
                {t('orders.table', { label: order.tableLabel })}
              </Link>
            ) : null}
            <span className="font-semibold text-ink">
              {t('orders.number', { number: order.number })}
            </span>
            <span
              className={cn(
                'text-xs font-medium',
                order.status === 'new' && waiting >= 10
                  ? 'font-bold text-danger'
                  : order.status === 'new' && waiting >= 5
                    ? 'font-bold text-warning'
                    : 'text-muted',
              )}
            >
              {formatTime(order.createdAt)} ·{' '}
              {waiting > 0 ? t('common.minutesAgo', { count: waiting }) : t('common.justNow')}
            </span>
          </div>
          <p className="text-xs text-muted">
            {order.orderedBy ? t('orders.by', { name: order.orderedBy }) : t('orders.byStaff')}
          </p>
        </div>
        <span
          className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', TONES[order.status])}
        >
          {modified ? t('orders.changed') : t(`orders.status.${order.status}`)}
        </span>
      </header>

      <ul className="mt-3 flex flex-col gap-2">
        {order.items.map((item) => {
          const live = LIVE_ITEM.includes(item.status);
          return (
            <li key={item.id} className={cn('text-[15px]', !live && 'text-muted line-through')}>
              <div className="flex justify-between gap-3">
                <span className="min-w-0">
                  <b>{item.quantity}×</b> {item.name}
                  {item.modifiers.length > 0 && (
                    <span className="text-muted">
                      {' '}
                      ({item.modifiers.map((m) => m.option).join(', ')})
                    </span>
                  )}
                  {item.note && (
                    <span className="block text-sm text-warning italic">„{item.note}"</span>
                  )}
                </span>
                <span className="shrink-0 text-sm tabular-nums">{formatMoney(item.lineTotal)}</span>
              </div>
              {expanded && live && changeable && (can.update || can.cancel) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {can.update && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          openDialog({ kind: 'remove', itemId: item.id, name: item.name })
                        }
                      >
                        {t('orders.itemRemove')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setPicker({ mode: 'replace', itemId: item.id, name: item.name })
                        }
                      >
                        {t('orders.itemReplace')}
                      </Button>
                    </>
                  )}
                  {can.cancel && order.status !== 'new' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger!"
                      onClick={() =>
                        openDialog({ kind: 'cancelItem', itemId: item.id, name: item.name })
                      }
                    >
                      {t('orders.itemCancel')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
        <span>{order.note ? t('orders.note', { note: order.note }) : ''}</span>
        <span className="tabular-nums">{formatMoney(order.total)}</span>
      </p>
      {order.staffMessage && (
        <p className="mt-2 flex gap-2 text-[13px] text-muted">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('orders.staffMessage', { message: order.staffMessage })}
        </p>
      )}

      {order.dispute === 'open' && (
        <div className="mt-3 rounded-xl border border-danger/25 bg-danger/8 p-3 text-[13px] text-ink">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <ShieldAlert className="size-4" aria-hidden /> {t('orders.dispute')}
          </p>
          <p className="mt-1 text-muted">{t('orders.disputeHint')}</p>
          {can.disputes && (
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                loading={dispute.isPending}
                onClick={() => dispute.mutate('confirm')}
              >
                {t('orders.disputeConfirm')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={dispute.isPending}
                onClick={() => dispute.mutate('cancel')}
              >
                {t('orders.disputeCancel')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {order.status === 'new' && can.update && (
          <Button
            size="lg"
            className="min-w-36 flex-1"
            loading={accept.isPending}
            onClick={() => accept.mutate(undefined)}
          >
            {t('orders.accept')}
          </Button>
        )}
        {['accepted', 'preparing', 'ready'].includes(order.status) && can.update && (
          <Button
            size="lg"
            className="min-w-36 flex-1"
            loading={serve.isPending}
            onClick={() => serve.mutate(undefined)}
          >
            {t('orders.serve')}
          </Button>
        )}
        {changeable && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            icon={expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          >
            {t('orders.more')}
          </Button>
        )}
      </div>

      {expanded && changeable && (
        <div className="mt-2 flex flex-wrap gap-2">
          {can.add && (
            <Button size="sm" variant="secondary" onClick={() => setPicker({ mode: 'add' })}>
              {t('orders.addItems')}
            </Button>
          )}
          {order.status === 'new' && can.ret && (
            <Button size="sm" variant="secondary" onClick={() => openDialog({ kind: 'return' })}>
              {t('orders.returnToGuest')}
            </Button>
          )}
          {order.status === 'new' && can.reject && rejectionEnabled && (
            <Button size="sm" variant="secondary" onClick={() => openDialog({ kind: 'reject' })}>
              {t('orders.reject')}
            </Button>
          )}
          {can.cancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger!"
              onClick={() => openDialog({ kind: 'cancel' })}
            >
              {t('orders.cancel')}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialogTitle()}
        tone={dialog?.kind === 'return' ? 'primary' : 'danger'}
        confirmLabel={t('common.confirm')}
        loading={dialogAction.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (!dialog || (textRequired && !text.trim())) return;
          dialogAction.mutate(dialog, { onSettled: () => setDialog(null) });
        }}
        body={
          <label className="flex flex-col gap-1.5 text-left">
            {dialog?.kind === 'return' && (
              <span className="text-[13px] text-muted">{t('orders.returnHint')}</span>
            )}
            <span className="text-[13px] font-semibold text-ink">
              {dialog?.kind === 'reject' ||
              dialog?.kind === 'cancel' ||
              dialog?.kind === 'cancelItem'
                ? t('orders.reason')
                : dialog?.kind === 'return'
                  ? t('orders.message')
                  : t('orders.messageOptional')}
            </span>
            <Textarea
              rows={2}
              maxLength={dialog?.kind === 'return' ? 300 : 200}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        }
      />
      <ItemPicker
        open={picker !== null}
        mode={picker?.mode === 'replace' ? 'single' : 'multi'}
        title={
          picker?.mode === 'replace'
            ? t('orders.replaceTitle', { name: picker.name })
            : t('orders.addItems')
        }
        busy={add.isPending || replace.isPending}
        onClose={() => setPicker(null)}
        onSubmit={(lines) => {
          if (picker?.mode === 'replace') {
            replace.mutate(
              { itemId: picker.itemId, line: lines[0]! },
              { onSuccess: () => setPicker(null) },
            );
          } else {
            add.mutate(lines, { onSuccess: () => setPicker(null) });
          }
        }}
      />
    </article>
  );

  function openDialog(d: Dialog) {
    setText('');
    setDialog(d);
  }

  function dialogTitle(): string {
    if (!dialog) return '';
    switch (dialog.kind) {
      case 'return':
        return t('orders.returnTitle', { number: order.number });
      case 'reject':
        return t('orders.rejectTitle', { number: order.number });
      case 'cancel':
        return t('orders.cancelTitle', { number: order.number });
      case 'remove':
      case 'cancelItem':
        return t('orders.removeTitle', { name: dialog.name });
    }
  }
}
