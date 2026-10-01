import type { StaffOrder } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, CircleCheck, Search, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, ConfirmDialog, Input, Segmented, Textarea } from '@qafe/ui';
import { api, errorKey } from '../lib/api';
import { formatMoney } from '../lib/format';
import { dayOrdersQuery } from '../lib/queries';
import { useCan } from '../lib/useAuth';

type Group = 'all' | 'open' | 'done' | 'cancelled';

const LIVE = ['new', 'returned', 'accepted', 'preparing', 'ready'];
const CANCELLED = ['cancelled', 'rejected', 'withdrawn'];

/** The table is still open: only then the order can change. */
const tableOpen = (o: StaffOrder) =>
  o.sessionStatus === 'open' || o.sessionStatus === 'bill_requested';
/** Still in work at an open table. */
const isOpen = (o: StaffOrder) => LIVE.includes(o.status) && tableOpen(o);
/** Served, or its table was paid / closed. */
const isDone = (o: StaffOrder) => !CANCELLED.includes(o.status) && !isOpen(o);

const TONES: Record<StaffOrder['status'], string> = {
  new: 'bg-danger/12 text-danger',
  returned: 'bg-warning/12 text-warning',
  accepted: 'bg-primary/10 text-accent',
  preparing: 'bg-primary/10 text-accent',
  ready: 'bg-success/12 text-success',
  served: 'bg-success/12 text-success',
  cancelled: 'bg-surface-2 text-muted',
  rejected: 'bg-surface-2 text-muted',
  withdrawn: 'bg-surface-2 text-muted',
};

const time = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** FR-SEF-23: every order of a business day, all areas; the owner may cancel any of them. */
export function OrdersPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [group, setGroup] = useState<Group>('all');
  const [search, setSearch] = useState('');
  const orders = useQuery(dayOrdersQuery(date));

  const shownDate = orders.data?.date ?? date ?? '';
  const term = search.trim().toLowerCase();
  const list = (orders.data?.orders ?? []).filter((o) => {
    const inGroup =
      group === 'all' ||
      (group === 'open' && isOpen(o)) ||
      (group === 'done' && isDone(o)) ||
      (group === 'cancelled' && CANCELLED.includes(o.status));
    const matches =
      !term ||
      o.tableLabel.toLowerCase().includes(term) ||
      String(o.number) === term.replace('#', '');
    return inGroup && matches;
  });
  const live = list.filter((o) => !CANCELLED.includes(o.status));
  const total = live.reduce((sum, o) => sum + Math.round(Number(o.total) * 100), 0) / 100;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('orders.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('orders.subtitle')}</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">{t('orders.date')}</span>
          <div className="flex gap-2">
            <Input
              type="date"
              value={shownDate}
              onChange={(e) => setDate(e.target.value || undefined)}
              className="w-44"
            />
            {date && (
              <Button variant="secondary" onClick={() => setDate(undefined)}>
                {t('orders.today')}
              </Button>
            )}
          </div>
        </label>
        <Segmented<Group>
          label={t('orders.title')}
          value={group}
          onChange={setGroup}
          options={[
            { value: 'all', label: t('orders.all') },
            { value: 'open', label: t('orders.open') },
            { value: 'done', label: t('orders.done') },
            { value: 'cancelled', label: t('orders.cancelledGroup') },
          ]}
        />
        <div className="w-full sm:ml-auto sm:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('orders.search')}
            aria-label={t('orders.search')}
            icon={<Search className="size-4" />}
          />
        </div>
      </div>

      {orders.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" /> {t(errorKey(orders.error))}
        </Card>
      ) : !orders.data ? (
        <Card className="mt-6 h-64 animate-pulse" />
      ) : list.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-sm text-muted">{t('orders.empty')}</Card>
      ) : (
        <>
          <p className="mt-6 mb-2 text-[13px] font-medium text-muted">
            {t('orders.count', {
              count: live.length,
              total: formatMoney(total.toFixed(2), 'BAM', 'bs'),
            })}
          </p>
          <Card className="divide-y divide-line">
            {list.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: StaffOrder }) {
  const { t, i18n } = useTranslation();
  const canCancel = useCan('orders.cancel');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      api<void>(`/staff/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onSuccess: () => setCancelling(false),
  });
  const gone = CANCELLED.includes(order.status);

  return (
    <div className="px-5 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left"
      >
        <span className="w-14 font-display font-bold text-ink">#{order.number}</span>
        <span className="w-20 text-sm font-semibold text-ink">
          {t('orders.table', { label: order.tableLabel })}
        </span>
        <span className="w-12 text-sm text-muted tabular-nums">{time(order.createdAt)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {order.orderedBy ?? t('orders.byStaff')}
        </span>
        {order.dispute === 'open' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-danger">
            <ShieldAlert className="size-3.5" /> {t('orders.disputed')}
          </span>
        )}
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', TONES[order.status])}>
          {t(`orders.status.${order.status}`)}
        </span>
        {!gone && !tableOpen(order) && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
              order.sessionStatus === 'closed'
                ? 'bg-success/12 text-success'
                : 'bg-surface-2 text-muted',
            )}
          >
            {order.sessionStatus === 'closed' && <CircleCheck className="size-3.5" aria-hidden />}
            {t(order.sessionStatus === 'closed' ? 'orders.paid' : 'orders.tableClosed')}
          </span>
        )}
        <span
          className={cn(
            'w-24 text-right text-sm font-semibold tabular-nums',
            gone ? 'text-muted line-through' : 'text-ink',
          )}
        >
          {formatMoney(order.total, 'BAM', i18n.language)}
        </span>
        <ChevronDown
          className={cn('size-4 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 rounded-xl bg-surface-2/60 p-4 text-sm">
          <ul className="flex flex-col gap-1">
            {order.items.map((item) => {
              const live = ['pending', 'preparing', 'ready', 'served'].includes(item.status);
              return (
                <li
                  key={item.id}
                  className={cn('flex justify-between gap-3', !live && 'text-muted line-through')}
                >
                  <span>
                    <b>{item.quantity}×</b> {item.name}
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
                  <span className="tabular-nums">
                    {formatMoney(item.lineTotal, 'BAM', i18n.language)}
                  </span>
                </li>
              );
            })}
          </ul>
          {order.note && (
            <p className="mt-2 text-xs text-muted">{t('orders.note', { note: order.note })}</p>
          )}
          {canCancel && isOpen(order) && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="text-danger!"
                onClick={() => {
                  setReason('');
                  setCancelling(true);
                }}
              >
                {t('orders.cancel')}
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={cancelling}
        title={t('orders.cancelTitle', { number: order.number })}
        tone="danger"
        confirmLabel={t('orders.cancel')}
        loading={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={() => reason.trim() && cancel.mutate()}
        body={
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-[13px] text-muted">{t('orders.cancelBody')}</span>
            <span className="text-[13px] font-semibold text-ink">{t('orders.reason')}</span>
            <Textarea
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {cancel.isError && (
              <span className="text-xs text-danger">{t(errorKey(cancel.error))}</span>
            )}
          </label>
        }
      />
    </div>
  );
}
