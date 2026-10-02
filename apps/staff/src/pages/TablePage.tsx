import type {
  OrderLineRequest,
  PaymentResult,
  StaffSessionDetail,
  StaffSessionGuest,
} from '@qafe/contracts';
import { Button, cn, ConfirmDialog, Sheet } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BadgeCheck,
  BellRing,
  ChevronLeft,
  Crown,
  KeyRound,
  Plus,
  ReceiptText,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemPicker } from '../components/ItemPicker';
import { OrderCard } from '../components/OrderCard';
import { api } from '../lib/api';
import { formatMoney, formatTime } from '../lib/format';
import { floorQuery, sessionQuery } from '../lib/queries';
import { useAction } from '../lib/useAction';
import { useCan } from '../lib/useAuth';
import { tableRoute } from '../router';

/** One table: devices, requests, orders, bill and payment (FR-KON-12, 15..21). */
export function TablePage() {
  const { t } = useTranslation();
  const { tableId } = tableRoute.useParams();
  const floor = useQuery(floorQuery);
  const table = floor.data?.tables.find((x) => x.id === tableId);
  const sessionId = table?.session?.id;
  const detail = useQuery({ ...sessionQuery(sessionId ?? ''), enabled: Boolean(sessionId) });
  const [picker, setPicker] = useState(false);
  const canCreate = useCan('orders.create');

  // One key per order being entered: resending after a lost answer cannot duplicate it.
  const [orderKey, setOrderKey] = useState(() => crypto.randomUUID());
  const manual = useAction(
    (items: OrderLineRequest[]) =>
      api<void>(`/staff/tables/${tableId}/orders`, {
        method: 'POST',
        body: { idempotencyKey: orderKey, items },
      }),
    t('picker.sent'),
  );

  if (!floor.data) return <p className="p-6 text-sm text-muted">{t('common.loading')}</p>;
  if (!table) return <p className="p-6 text-sm text-muted">{t('errors.not_found')}</p>;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="flex-1 font-display text-2xl font-bold text-ink">
          {t('table.title', { label: table.label })}
        </h1>
        {canCreate && (
          <Button icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>
            {t('table.newOrder')}
          </Button>
        )}
      </div>

      {!sessionId ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
          {t('table.free')}
        </p>
      ) : !detail.data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <SessionView detail={detail.data} />
      )}

      <ItemPicker
        open={picker}
        mode="multi"
        title={t('table.newOrder')}
        busy={manual.isPending}
        onClose={() => setPicker(false)}
        onSubmit={(lines) =>
          manual.mutate(lines, {
            onSuccess: () => {
              setPicker(false);
              setOrderKey(crypto.randomUUID());
            },
          })
        }
      />
    </div>
  );
}

function SessionView({ detail }: { detail: StaffSessionDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = {
    verify: useCan('sessions.verify'),
    remove: useCan('sessions.remove'),
    close: useCan('sessions.close'),
    pay: useCan('payments.process'),
  };
  const base = `/staff/sessions/${detail.id}`;
  const verify = useAction(() => api<void>(`${base}/verify`, { method: 'POST' }));
  const approve = useAction((guestId: string) =>
    api<void>(`${base}/guests/${guestId}/approve`, { method: 'POST' }),
  );
  const request = useAction(({ id, action }: { id: string; action: 'acknowledge' | 'done' }) =>
    api<void>(`/staff/requests/${id}/${action}`, { method: 'POST' }),
  );
  const [removing, setRemoving] = useState<StaffSessionGuest | null>(null);
  const [block, setBlock] = useState(true);
  const remove = useAction((guestId: string) =>
    api<void>(`${base}/guests/${guestId}/remove`, { method: 'POST', body: { block } }),
  );
  const [paying, setPaying] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const setPin = useAction(
    (code?: string) =>
      api<{ code: string }>(`${base}/pin`, { method: 'POST', body: code ? { code } : {} }),
    (r) => t('table.pinSaved', { code: r.code }),
  );
  const [closing, setClosing] = useState(false);
  const close = useAction(
    () => api<void>(`${base}/close`, { method: 'POST' }),
    t('table.closed', { label: detail.tableLabel }),
  );

  return (
    <>
      {/* Verification (FR-GOS-21) */}
      {!detail.verified ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/8 p-4">
          <p className="text-sm text-ink">
            {t(detail.verificationMode === 'pin' ? 'table.pinHint' : 'table.verifyHint')}
          </p>
          {can.verify && (
            <Button
              className="mt-3"
              loading={verify.isPending}
              onClick={() => verify.mutate(undefined)}
            >
              {t('table.verify')}
            </Button>
          )}
        </section>
      ) : (
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <BadgeCheck className="size-4" /> {t('table.verified')}
        </p>
      )}

      {/* The table's PIN: always visible to staff, in both modes (FR-GOS-21). */}
      {detail.verificationCode && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <KeyRound className="size-5 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">{t('table.pinLabel')}</p>
            <p className="font-display text-2xl font-bold tracking-[0.25em] text-ink tabular-nums">
              {detail.verificationCode}
            </p>
          </div>
          {can.verify && (
            <Button variant="secondary" onClick={() => setPinOpen(true)}>
              {t('table.pinChange')}
            </Button>
          )}
        </section>
      )}

      {/* Requests (FR-KON-18) */}
      {detail.requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-ink">{t('table.requests')}</h2>
          {detail.requests.map((r) => (
            <div
              key={r.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-2xl border p-3.5',
                r.status === 'open' ? 'border-warning bg-warning/10' : 'border-line bg-surface',
              )}
            >
              {r.type === 'request_bill' ? (
                <ReceiptText className="size-5 text-success" />
              ) : (
                <BellRing className="size-5 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t(`table.request.${r.type}`)}</p>
                <p className="text-xs text-muted">
                  {formatTime(r.createdAt)}
                  {r.nickname && ` · ${r.nickname}`}
                  {r.paymentMethod &&
                    ` · ${t('table.paymentMethod', { method: t(`table.methods.${r.paymentMethod}`) })}`}
                </p>
              </div>
              {r.status === 'open' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => request.mutate({ id: r.id, action: 'acknowledge' })}
                >
                  {t('table.acknowledge')}
                </Button>
              )}
              <Button size="sm" onClick={() => request.mutate({ id: r.id, action: 'done' })}>
                {t('table.done')}
              </Button>
            </div>
          ))}
        </section>
      )}

      {/* Devices (FR-KON-16, 17) */}
      {detail.guests.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-ink">{t('table.devices')}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {detail.guests.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="flex-1 font-medium text-ink">{g.nickname}</span>
                {g.isHost && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                    <Crown className="size-3.5" /> {t('table.host')}
                  </span>
                )}
                {g.status === 'pending_approval' && (
                  <>
                    <span className="text-xs font-semibold text-warning">{t('table.waiting')}</span>
                    {can.verify && (
                      <Button size="sm" onClick={() => approve.mutate(g.id)}>
                        {t('table.approve')}
                      </Button>
                    )}
                  </>
                )}
                {can.remove && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger!"
                    onClick={() => setRemoving(g)}
                  >
                    {t('table.remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Orders */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-ink">{t('table.orders')}</h2>
        {detail.orders.length === 0 ? (
          <p className="text-sm text-muted">{t('table.noOrders')}</p>
        ) : (
          detail.orders.map((o) => (
            <OrderCard key={o.id} order={o} rejectionEnabled={detail.orderRejectionEnabled} />
          ))
        )}
      </section>

      {/* Bill and payment (FR-KON-19, 21) */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-display text-lg font-semibold text-ink">{t('table.bill')}</h2>
        {detail.bill.lines.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('table.billEmpty')}</p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {detail.bill.lines.map((l) => (
                <li key={`${l.name}|${l.unitPrice}`} className="flex justify-between gap-3">
                  <span>
                    <b>{l.quantity}×</b> {l.name}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3">
              <p className="flex justify-between text-lg font-bold text-ink">
                <span>{t('table.total')}</span>
                <span className="tabular-nums">{formatMoney(detail.bill.total)}</span>
              </p>
              <p className="flex justify-between text-xs text-muted">
                <span>{t('table.vat')}</span>
                <span className="tabular-nums">{formatMoney(detail.bill.vatAmount)}</span>
              </p>
            </div>
          </>
        )}
        {detail.blockingOrders > 0 && (
          <p className="mt-3 text-[13px] font-semibold text-warning">
            {t('table.blocking', { count: detail.blockingOrders })}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {can.pay && detail.bill.total !== '0.00' && (
            <Button size="lg" disabled={detail.blockingOrders > 0} onClick={() => setPaying(true)}>
              {t('table.pay', { total: formatMoney(detail.bill.total) })}
            </Button>
          )}
          {can.close && detail.bill.total === '0.00' && (
            <Button
              size="lg"
              variant="secondary"
              disabled={detail.blockingOrders > 0}
              onClick={() => setClosing(true)}
            >
              {t('table.close')}
            </Button>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={removing !== null}
        title={t('table.removeTitle', { name: removing?.nickname ?? '' })}
        tone="danger"
        confirmLabel={t('table.remove')}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })
        }
        body={
          <div className="flex flex-col gap-3 text-left text-sm">
            <p className="text-muted">{t('table.removeBody')}</p>
            <label className="flex min-h-11 items-center gap-3 font-medium text-ink">
              <input
                type="checkbox"
                className="size-5"
                checked={block}
                onChange={(e) => setBlock(e.target.checked)}
              />
              {t('table.block')}
            </label>
          </div>
        }
      />
      <ConfirmDialog
        open={closing}
        title={t('table.closeTitle', { label: detail.tableLabel })}
        body={t('table.closeBody')}
        confirmLabel={t('table.close')}
        loading={close.isPending}
        onClose={() => setClosing(false)}
        onConfirm={() =>
          close.mutate(undefined, {
            onSettled: () => setClosing(false),
            onSuccess: () => void navigate({ to: '/' }),
          })
        }
      />
      <ConfirmDialog
        open={pinOpen}
        title={t('table.pinChange')}
        confirmLabel={t('common.save')}
        loading={setPin.isPending}
        onClose={() => setPinOpen(false)}
        onConfirm={() => {
          if (pinValue.length !== 4) return;
          setPin.mutate(pinValue, { onSettled: () => setPinOpen(false) });
        }}
        body={
          <div className="flex flex-col gap-3 text-left">
            <p className="text-sm text-muted">{t('table.pinChangeHint')}</p>
            <input
              aria-label={t('table.pinLabel')}
              inputMode="numeric"
              maxLength={4}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
              className="h-14 rounded-xl border border-line bg-surface text-center font-display text-2xl tracking-[0.4em] text-ink"
            />
            <Button
              variant="ghost"
              onClick={() => setPin.mutate(undefined, { onSettled: () => setPinOpen(false) })}
            >
              {t('table.pinRandom')}
            </Button>
          </div>
        }
      />
      <PaySheet
        open={paying}
        detail={detail}
        onClose={() => setPaying(false)}
        onPaid={() => void navigate({ to: '/' })}
      />
    </>
  );
}

function PaySheet({
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
  const methods = detail.paymentMethods.filter((m) => m.method !== 'online');
  const preferred =
    (detail.requests.find((r) => r.type === 'request_bill')?.paymentMethod as
      'cash' | 'card' | null | undefined) ??
    (methods.find((m) => m.isDefault)?.method as 'cash' | 'card' | undefined) ??
    'cash';
  const [method, setMethod] = useState<'cash' | 'card'>(preferred);
  const pay = useAction(
    () =>
      api<PaymentResult>(`/staff/sessions/${detail.id}/pay`, { method: 'POST', body: { method } }),
    t('table.paid', { label: detail.tableLabel }),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('table.payTitle', { label: detail.tableLabel })}
      footer={
        <Button
          size="lg"
          className="w-full"
          loading={pay.isPending}
          onClick={() =>
            pay.mutate(undefined, {
              onSuccess: () => {
                onClose();
                onPaid();
              },
            })
          }
        >
          {t('table.payConfirm')}
        </Button>
      }
    >
      <p className="text-center font-display text-4xl font-bold text-ink tabular-nums">
        {formatMoney(detail.bill.total)}
      </p>
      <p className="mt-1 text-center text-xs text-muted">
        {t('table.vat')} {formatMoney(detail.bill.vatAmount)}
      </p>
      <fieldset className="mt-6">
        <legend className="mb-2 text-[13px] font-semibold text-ink">{t('table.method')}</legend>
        <div className="flex gap-2">
          {methods.map((m) => (
            <button
              key={m.method}
              type="button"
              aria-pressed={method === m.method}
              onClick={() => setMethod(m.method as Method)}
              className={cn(
                'h-14 flex-1 rounded-xl border text-base font-semibold',
                method === m.method
                  ? 'border-primary bg-primary/8 text-ink'
                  : 'border-line bg-surface text-muted',
              )}
            >
              {t(`table.methods.${m.method}`)}
            </button>
          ))}
        </div>
      </fieldset>
    </Sheet>
  );
}

type Method = 'cash' | 'card';
