import type { GuestMenu, GuestSessionState, PlacedOrder } from '@qafe/contracts';
import { Button, Textarea } from '@qafe/ui';
import { AnimatePresence, m } from 'motion/react';
import { ShoppingBag } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { cart, useCart } from '../lib/cart';
import { formatMoney, multiplyMoney, sumMoney } from '../lib/format';
import { useNoticeContext } from '../lib/notice';
import { useSessionAction } from '../lib/useAction';
import { BottomSheet } from '../motion/BottomSheet';
import { burst } from '../motion/burst';
import { PinForm } from './Banners';
import { Stepper } from './Stepper';

/** Review before sending, with the total (FR-GOS-09); also corrects a returned order (FR-GOS-12). */
export function CartSheet({
  open,
  session,
  menu,
  currency,
  onClose,
  onSent,
}: {
  open: boolean;
  session: GuestSessionState;
  menu: GuestMenu;
  currency: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t, i18n } = useTranslation();
  const state = useCart();
  const queryClient = useQueryClient();
  const notify = useNoticeContext();
  const money = (v: string) => formatMoney(v, currency, i18n.language);

  const items = menu.categories.flatMap((c) => c.items);
  const options = menu.modifierGroups.flatMap((g) => g.options);
  const lines = state.lines.map((line) => {
    const item = items.find((i) => i.id === line.itemId);
    const picked = line.modifierOptionIds
      .map((id) => options.find((o) => o.id === id))
      .filter((o) => o !== undefined);
    const unit = sumMoney([item?.price ?? 0, ...picked.map((o) => o.priceDelta)]);
    return { line, item, picked, total: multiplyMoney(unit, line.quantity) };
  });
  const total = sumMoney(lines.map((l) => l.total));
  // PIN mode: the table is confirmed before the first order, right here in the cart.
  const needsPin =
    session.session.verificationMode === 'pin' &&
    !session.session.verified &&
    session.me.status === 'approved';
  const blocked = needsPin || lines.some((l) => !l.item?.isAvailable);

  const send = useSessionAction(async () => {
    const items = state.lines.map(({ itemId, quantity, note, modifierOptionIds }) => ({
      itemId,
      quantity,
      modifierOptionIds,
      ...(note ? { note } : {}),
    }));
    const note = state.note.trim() || undefined;
    if (state.editing) {
      return api<GuestSessionState>('PUT', `/guest/orders/${state.editing.orderId}`, {
        items,
        note,
      });
    }
    await api<PlacedOrder>('POST', '/guest/orders', {
      idempotencyKey: state.idempotencyKey,
      items,
      note,
    });
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        state.editing ? t('cart.editingTitle', { number: state.editing.number }) : t('cart.title')
      }
      description={t('cart.priceInfo')}
      footer={
        state.lines.length > 0 && (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full"
              loading={send.isPending}
              disabled={blocked}
              onClick={() =>
                send.mutate(undefined, {
                  onSuccess: () => {
                    burst({ x: window.innerWidth / 2, y: window.innerHeight * 0.6 }, 'lg');
                    cart.clear();
                    notify({ tone: 'success', text: t('cart.sent') });
                    onSent();
                  },
                })
              }
            >
              {t(state.editing ? 'cart.resend' : 'cart.send', { total: money(total) })}
            </Button>
            {state.editing && (
              <Button variant="ghost" onClick={() => cart.clear()}>
                {t('cart.cancelEdit')}
              </Button>
            )}
          </div>
        )
      }
    >
      {state.lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
          <span className="grid size-14 place-items-center rounded-full bg-surface-2">
            <ShoppingBag className="size-6" aria-hidden />
          </span>
          {t('cart.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {needsPin && <PinForm />}
          <ul className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {lines.map(({ line, item, picked, total: lineTotal }) => (
                <m.li
                  key={line.key}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    x: -40,
                    height: 0,
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{item?.name ?? '—'}</p>
                      {picked.length > 0 && (
                        <p className="text-[13px] text-muted">
                          {picked.map((o) => o.name).join(', ')}
                        </p>
                      )}
                      {line.note && <p className="text-[13px] text-muted italic">„{line.note}"</p>}
                      {!item?.isAvailable && (
                        <p className="mt-1 text-[13px] font-semibold text-danger">
                          {t('errors.item_unavailable')}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-display font-semibold text-accent tabular-nums">
                      {money(lineTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <Stepper
                      value={line.quantity}
                      min={0}
                      onChange={(q) => cart.setQuantity(line.key, q)}
                    />
                    <button
                      type="button"
                      className="min-h-11 px-2 text-[13px] font-semibold text-danger"
                      onClick={() => cart.setQuantity(line.key, 0)}
                    >
                      {t('cart.remove')}
                    </button>
                  </div>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink">{t('cart.note')}</span>
            <Textarea
              value={state.note}
              maxLength={300}
              rows={2}
              onChange={(e) => cart.setNote(e.target.value)}
            />
          </label>
          <div className="flex items-center justify-between rounded-2xl bg-navy-900 px-4 py-3.5 text-white">
            <span className="text-sm font-medium text-white/75">{t('cart.total')}</span>
            <m.span
              key={total}
              initial={{ y: -6, opacity: 0.4 }}
              animate={{ y: 0, opacity: 1 }}
              className="font-display text-lg font-semibold tabular-nums"
            >
              {money(total)}
            </m.span>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
