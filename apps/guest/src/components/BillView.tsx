import type { GuestSessionState, GuestVenue } from '@qafe/contracts';
import { Button, cn } from '@qafe/ui';
import { ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useSessionAction } from '../lib/useAction';
import { CallWaiter } from './CallWaiter';

type Method = 'cash' | 'card';

/** The table's bill (FR-GOS-16) and "Zatraži račun" with the payment method (FR-GOS-15). */
export function BillView({ state, venue }: { state: GuestSessionState; venue: GuestVenue }) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, venue.currency, i18n.language);
  const methods = venue.paymentMethods.filter(
    (m): m is { method: Method; isDefault: boolean } => m.method !== 'online',
  );
  const requested = state.session.status === 'bill_requested';
  const [method, setMethod] = useState<Method | undefined>(
    () =>
      (state.session.requestedPaymentMethod as Method | null) ??
      methods.find((m) => m.isDefault)?.method ??
      methods[0]?.method,
  );
  const [changing, setChanging] = useState(false);
  const request = useSessionAction((paymentMethod: Method) =>
    api<GuestSessionState>('POST', '/guest/requests', { type: 'request_bill', paymentMethod }),
  );
  const canRequest = state.me.status === 'approved' && method !== undefined;

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <ReceiptText className="size-5 text-accent" aria-hidden />
          {t('bill.title')}
        </h2>
        {state.bill.lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('bill.empty')}</p>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {state.bill.lines.map((line) => (
                <li key={`${line.name}|${line.unitPrice}`} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-semibold">{line.quantity}×</span> {line.name}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(line.total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3">
              <p className="flex justify-between text-lg font-semibold text-ink">
                <span>{t('bill.total')}</span>
                <span className="tabular-nums">{money(state.bill.total)}</span>
              </p>
              <p className="mt-0.5 flex justify-between text-xs text-muted">
                <span>{t('bill.vat')}</span>
                <span className="tabular-nums">{money(state.bill.vatAmount)}</span>
              </p>
              {state.bill.paid !== '0.00' && (
                // Someone at the table already paid their part (FR-KON-20).
                <>
                  <p className="mt-2 flex justify-between text-sm text-success">
                    <span>{t('bill.paid')}</span>
                    <span className="tabular-nums">−{money(state.bill.paid)}</span>
                  </p>
                  <p className="mt-1 flex justify-between text-base font-semibold text-ink">
                    <span>{t('bill.remaining')}</span>
                    <span className="tabular-nums">{money(state.bill.remaining)}</span>
                  </p>
                </>
              )}
            </div>
          </>
        )}
        <p className="mt-3 text-xs text-muted">{t('bill.note')}</p>
      </section>

      {requested && !changing ? (
        <div className="rounded-2xl border border-success/25 bg-success/8 p-4 text-sm font-medium text-success">
          {t('bill.requested', {
            method: t(`bill.methods.${state.session.requestedPaymentMethod ?? 'cash'}`),
          })}
          {methods.length > 1 && (
            <button
              type="button"
              className="mt-2 block min-h-11 text-[13px] font-semibold text-accent underline"
              onClick={() => setChanging(true)}
            >
              {t('bill.change')}
            </button>
          )}
        </div>
      ) : (
        methods.length > 0 && (
          <section className="flex flex-col gap-3">
            <fieldset className="flex gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-ink">
                {t('bill.method')}
              </legend>
              {methods.map((m) => (
                <label
                  key={m.method}
                  className={cn(
                    'flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-semibold',
                    method === m.method
                      ? 'border-primary bg-primary/6 text-ink'
                      : 'border-line bg-surface text-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    className="sr-only"
                    checked={method === m.method}
                    onChange={() => setMethod(m.method)}
                  />
                  {t(`bill.methods.${m.method}`)}
                </label>
              ))}
            </fieldset>
            <Button
              size="lg"
              className="w-full"
              disabled={!canRequest}
              loading={request.isPending}
              onClick={() => {
                if (method) request.mutate(method, { onSuccess: () => setChanging(false) });
              }}
            >
              {t('bill.request')}
            </Button>
          </section>
        )
      )}

      <CallWaiter state={state} />
    </div>
  );
}
