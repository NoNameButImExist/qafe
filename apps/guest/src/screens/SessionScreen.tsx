import type { GuestMenuItem, GuestSessionState, GuestVenue } from '@qafe/contracts';
import { cn, Notice, useNotice } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ReceiptText, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banners } from '../components/Banners';
import { BillView } from '../components/BillView';
import { CartSheet } from '../components/CartSheet';
import { Header } from '../components/Header';
import { ItemSheet } from '../components/ItemSheet';
import { MenuView } from '../components/MenuView';
import { OrdersView } from '../components/OrdersView';
import { TableSheet } from '../components/TableSheet';
import { useCart } from '../lib/cart';
import { formatMoney, multiplyMoney, sumMoney } from '../lib/format';
import { NoticeContext } from '../lib/notice';
import { menuQuery } from '../lib/queries';

type Tab = 'menu' | 'orders' | 'bill';

const ACTIVE = ['new', 'returned', 'accepted', 'preparing', 'ready'];

/** The table: menu, the table's orders and the bill, with the cart on top. */
export function SessionScreen({ venue, state }: { venue: GuestVenue; state: GuestSessionState }) {
  const { t, i18n } = useTranslation();
  const menu = useQuery(menuQuery);
  const cart = useCart();
  const [tab, setTab] = useState<Tab>('menu');
  const [item, setItem] = useState<GuestMenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [notice, setNotice] = useNotice();

  // A short vibration when an order changes status or this device is let in (Android; iOS
  // browsers do not vibrate). The first state after loading is only remembered.
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const now = new Map(state.orders.map((o) => [o.id, `${o.status}|${o.changes.length}`]));
    now.set('me', state.me.status);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    if ([...now].some(([key, value]) => before.has(key) && before.get(key) !== value)) {
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        // Not supported.
      }
    }
  }, [state]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollTo.
    void window.scrollTo({ top: 0 });
  }, [tab]);

  const canOrder = venue.orderingOpen && state.me.status === 'approved';
  const active = state.orders.filter((o) => ACTIVE.includes(o.status)).length;

  const items = menu.data?.categories.flatMap((c) => c.items) ?? [];
  const options = menu.data?.modifierGroups.flatMap((g) => g.options) ?? [];
  const count = cart.lines.reduce((s, l) => s + l.quantity, 0);
  const total = sumMoney(
    cart.lines.map((l) =>
      multiplyMoney(
        sumMoney([
          items.find((i) => i.id === l.itemId)?.price ?? 0,
          ...l.modifierOptionIds.map((id) => options.find((o) => o.id === id)?.priceDelta ?? 0),
        ]),
        l.quantity,
      ),
    ),
  );

  const tabs: { id: Tab; icon: typeof UtensilsCrossed; badge?: number }[] = [
    { id: 'menu', icon: UtensilsCrossed },
    { id: 'orders', icon: ClipboardList, badge: active },
    { id: 'bill', icon: ReceiptText },
  ];

  return (
    <NoticeContext.Provider value={setNotice}>
      <div className="min-h-dvh bg-canvas pb-40">
        <Header
          venue={venue}
          tableLabel={state.session.tableLabel}
          onTable={() => setTableOpen(true)}
        />
        <div className="fixed inset-x-0 top-18 z-30 mx-auto max-w-2xl px-4">
          {/* Opaque backing: the notice's own tint would let the page show through. */}
          <div className={notice ? 'rounded-xl bg-surface shadow-lg' : undefined}>
            <Notice notice={notice} />
          </div>
        </div>
        <main className="mx-auto max-w-2xl">
          <Banners venue={venue} state={state} onReview={() => setTableOpen(true)} />
          {tab === 'menu' && menu.data && (
            <MenuView
              menu={menu.data}
              currency={venue.currency}
              onPick={canOrder ? setItem : undefined}
            />
          )}
          {tab === 'orders' && (
            <OrdersView
              state={state}
              currency={venue.currency}
              onEdit={() => {
                setTab('menu');
                setCartOpen(true);
              }}
            />
          )}
          {tab === 'bill' && <BillView state={state} venue={venue} />}
        </main>

        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
          {count > 0 && canOrder && (
            <div className="mx-auto max-w-2xl px-4 pt-3">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex h-13 w-full items-center gap-3 rounded-2xl bg-primary px-4 text-on-primary shadow-lg shadow-primary/25"
              >
                <ShoppingBag className="size-5" aria-hidden />
                <span className="flex-1 text-left text-sm font-semibold">
                  {cart.editing
                    ? t('cart.editingTitle', { number: cart.editing.number })
                    : `${t('cart.open')} · ${t('cart.items', { count })}`}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {formatMoney(total, venue.currency, i18n.language)}
                </span>
              </button>
            </div>
          )}
          <nav aria-label={t('tabs.menu')} className="mx-auto flex max-w-2xl">
            {tabs.map(({ id, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
                className={cn(
                  'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold',
                  tab === id ? 'text-accent' : 'text-muted',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {t(`tabs.${id}`)}
                {badge ? (
                  <span className="absolute top-2 left-1/2 ml-2 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        {menu.data && (
          <>
            <ItemSheet
              item={item}
              menu={menu.data}
              currency={venue.currency}
              onClose={() => setItem(null)}
            />
            <CartSheet
              open={cartOpen}
              menu={menu.data}
              currency={venue.currency}
              onClose={() => setCartOpen(false)}
              onSent={() => {
                setCartOpen(false);
                setTab('orders');
              }}
            />
          </>
        )}
        <TableSheet
          key={state.me.nickname}
          open={tableOpen}
          state={state}
          onClose={() => setTableOpen(false)}
        />
      </div>
    </NoticeContext.Provider>
  );
}
