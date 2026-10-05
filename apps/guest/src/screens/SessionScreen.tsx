import type { GuestMenuItem, GuestSessionState, GuestVenue } from '@qafe/contracts';
import { cn, Notice, useNotice } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { ClipboardList, ReceiptText, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banners } from '../components/Banners';
import { BillView } from '../components/BillView';
import { CartSheet } from '../components/CartSheet';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { ItemSheet } from '../components/ItemSheet';
import { MenuView } from '../components/MenuView';
import { OrdersView } from '../components/OrdersView';
import { TableSheet } from '../components/TableSheet';
import { useCart } from '../lib/cart';
import { formatMoney, multiplyMoney, sumMoney } from '../lib/format';
import { CurrentNoticeContext, NoticeContext } from '../lib/notice';
import { menuQuery } from '../lib/queries';
import { resubscribe } from '../lib/realtime';

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

  // The waiter moved or merged the table (FR-KON-14): listen to the new table's updates.
  const sessionId = state.session.id;
  const firstSession = useRef(sessionId);
  useEffect(() => {
    if (firstSession.current === sessionId) return;
    firstSession.current = sessionId;
    resubscribe();
  }, [sessionId]);

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
      <CurrentNoticeContext.Provider value={notice}>
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
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {tab === 'menu' && (
                  <>
                    <Hero venue={venue} tableLabel={state.session.tableLabel} />
                    {menu.data && (
                      <MenuView
                        menu={menu.data}
                        currency={venue.currency}
                        onPick={canOrder ? setItem : undefined}
                      />
                    )}
                  </>
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
              </m.div>
            </AnimatePresence>
          </main>

          <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
            <AnimatePresence>
              {count > 0 && canOrder && (
                <m.div
                  key="cart"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  className="overflow-hidden"
                >
                  <div className="mx-auto max-w-2xl px-4 pt-3">
                    <m.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setCartOpen(true)}
                      className="flex h-14 w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-blue-bright px-4 text-on-primary shadow-lg shadow-primary/30"
                    >
                      <span className="relative">
                        <ShoppingBag className="size-5" aria-hidden />
                        <m.span
                          key={count}
                          initial={{ scale: 1.8 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                          className="absolute -top-2 -right-2.5 grid min-w-4.5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-accent"
                        >
                          {count}
                        </m.span>
                      </span>
                      <span className="flex-1 pl-1 text-left text-sm font-semibold">
                        {cart.editing
                          ? t('cart.editingTitle', { number: cart.editing.number })
                          : `${t('cart.open')} · ${t('cart.items', { count })}`}
                      </span>
                      <span className="font-display text-[15px] font-semibold tabular-nums">
                        {formatMoney(total, venue.currency, i18n.language)}
                      </span>
                    </m.button>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
            <nav aria-label={t('tabs.menu')} className="mx-auto flex max-w-2xl">
              {tabs.map(({ id, icon: Icon, badge }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id ? 'page' : undefined}
                  onClick={() => setTab(id)}
                  className={cn(
                    'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors',
                    tab === id ? 'text-accent' : 'text-muted',
                  )}
                >
                  {tab === id && (
                    <m.span
                      layoutId="tab"
                      className="absolute inset-x-5 top-1.5 bottom-1.5 rounded-2xl bg-primary/10"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <m.span
                    className="relative"
                    animate={tab === id ? { y: -1, scale: 1.1 } : { y: 0, scale: 1 }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </m.span>
                  <span className="relative">{t(`tabs.${id}`)}</span>
                  <AnimatePresence>
                    {badge ? (
                      <m.span
                        key={badge}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                        className="absolute top-2 left-1/2 ml-2 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary"
                      >
                        {badge}
                      </m.span>
                    ) : null}
                  </AnimatePresence>
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
                session={state}
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
      </CurrentNoticeContext.Provider>
    </NoticeContext.Provider>
  );
}
