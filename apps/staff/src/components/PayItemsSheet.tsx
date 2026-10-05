import type { PaymentResult, SessionPayments, StaffSessionDetail } from '@qafe/contracts';
import { Button, cn, Sheet } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useAction } from '../lib/useAction';

const BILLABLE = ['accepted', 'preparing', 'ready', 'served'];
const LIVE = ['pending', 'preparing', 'ready', 'served'];
const cents = (v: string) => Math.round(Number(v) * 100);

/**
 * One guest pays their items (FR-KON-20): pick items and how many, the method, done. The
 * table stays open for the others; when the last items are paid it closes. The server
 * computes the amount; the total here is the same rule, shown before paying.
 */
export function PayItemsSheet({
  open,
  detail,
  onClose,
  onPaid,
}: {
  open: boolean;
  detail: StaffSessionDetail;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t } = useTranslation();
  const payments = useQuery({
    queryKey: ['session', detail.id, 'payments'],
    queryFn: () => api<SessionPayments>(`/staff/sessions/${detail.id}/payments`),
    enabled: open,
  });
  const methods = detail.paymentMethods.filter((m) => m.method !== 'online');
  const [method, setMethod] = useState<'cash' | 'card'>(
    (methods.find((m) => m.isDefault)?.method as 'cash' | 'card' | undefined) ?? 'cash',
  );
  const [picked, setPicked] = useState<Record<string, number>>({});

  const items = useMemo(() => {
    const paid = payments.data?.paidQuantities ?? {};
    return detail.orders
      .filter((o) => BILLABLE.includes(o.status) && o.dispute !== 'open')
      .flatMap((o) =>
        o.items
          .filter((i) => LIVE.includes(i.status))
          .map((i) => ({
            id: i.id,
            name: i.modifiers.length
              ? `${i.name} (${i.modifiers.map((m) => m.option).join(', ')})`
              : i.name,
            quantity: i.quantity,
            left: i.quantity - (paid[i.id] ?? 0),
            lineTotal: i.lineTotal,
            orderedBy: o.orderedBy,
          })),
      )
      .filter((i) => i.left > 0);
  }, [detail.orders, payments.data]);

  const total = items.reduce((sum, i) => {
    const n = picked[i.id] ?? 0;
    return sum + Math.round((cents(i.lineTotal) * n) / i.quantity);
  }, 0);
  const lines = Object.entries(picked)
    .filter(([, n]) => n > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

  const pay = useAction(
    () =>
      api<PaymentResult>(`/staff/sessions/${detail.id}/pay-items`, {
        method: 'POST',
        body: { method, items: lines },
      }),
    (r) => t('payItems.paid', { amount: formatMoney(r.amount) }),
  );
  const set = (id: string, n: number) => setPicked((p) => ({ ...p, [id]: n }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('payItems.title', { label: detail.tableLabel })}
      description={t('payItems.hint')}
      footer={
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {methods.map((m) => (
              <button
                key={m.method}
                type="button"
                aria-pressed={method === m.method}
                onClick={() => setMethod(m.method as 'cash' | 'card')}
                className={cn(
                  'h-11 flex-1 rounded-xl border text-sm font-semibold',
                  method === m.method
                    ? 'border-primary bg-primary/8 text-ink'
                    : 'border-line bg-surface text-muted',
                )}
              >
                {t(`table.methods.${m.method}`)}
              </button>
            ))}
          </div>
          <Button
            size="lg"
            className="w-full"
            disabled={lines.length === 0}
            loading={pay.isPending}
            onClick={() =>
              pay.mutate(undefined, {
                onSuccess: () => {
                  setPicked({});
                  onPaid();
                },
              })
            }
          >
            {t('payItems.confirm', { total: formatMoney((total / 100).toFixed(2)) })}
          </Button>
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('payItems.nothing')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((i) => {
            const n = picked[i.id] ?? 0;
            return (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{i.name}</p>
                  <p className="text-xs text-muted">
                    {t('payItems.left', { count: i.left })}
                    {i.orderedBy && ` · ${i.orderedBy}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t('payItems.less', { name: i.name })}
                    disabled={n === 0}
                    onClick={() => set(i.id, n - 1)}
                    className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-7 text-center font-semibold tabular-nums">{n}</span>
                  <button
                    type="button"
                    aria-label={t('payItems.more', { name: i.name })}
                    disabled={n >= i.left}
                    onClick={() => set(i.id, n + 1)}
                    className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
