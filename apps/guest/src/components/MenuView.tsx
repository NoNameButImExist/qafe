import type { GuestMenu, GuestMenuItem } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { AnimatePresence, m } from 'motion/react';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cart, useCart } from '../lib/cart';
import { formatMoney } from '../lib/format';
import { burst } from '../motion/burst';

/** Height of the sticky header and chip bar: sections stop just below them. */
const STICKY_OFFSET = 128;

/**
 * Categories as chips that follow the scroll, then the items as cards (FR-GOS-04). Items
 * without options go into the cart with one tap on "+"; tapping the card opens the details.
 */
export function MenuView({
  menu,
  currency,
  onPick,
}: {
  menu: GuestMenu;
  currency: string;
  /** Undefined = browse only (no table, venue closed, device not approved yet). */
  onPick?: (item: GuestMenuItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState(menu.categories[0]?.id ?? null);
  const chips = useRef<HTMLElement>(null);
  const jumping = useRef(false);
  const { lines } = useCart();
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.quantity);
    return map;
  }, [lines]);

  // Scroll spy: the category whose section crosses the line under the chip bar is active.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (jumping.current) return;
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(hit.target.id.slice(2));
      },
      { rootMargin: `-${STICKY_OFFSET + 8}px 0px -65% 0px` },
    );
    for (const c of menu.categories) {
      const el = document.getElementById(`c-${c.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [menu.categories]);

  // Keep the active chip visible in the bar.
  useEffect(() => {
    const bar = chips.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (bar && chip) {
      bar.scrollTo({
        left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [active]);

  const jump = (id: string) => {
    const section = document.getElementById(`c-${id}`);
    if (!section) return;
    setActive(id);
    jumping.current = true;
    window.scrollTo({ top: section.offsetTop - STICKY_OFFSET + 4, behavior: 'smooth' });
    window.setTimeout(() => (jumping.current = false), 700);
  };

  if (menu.categories.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted">{t('menu.empty')}</p>;
  }
  return (
    <div>
      <nav
        ref={chips}
        aria-label={t('tabs.menu')}
        className="no-scrollbar sticky top-16 z-10 mt-2 flex gap-1.5 overflow-x-auto bg-canvas/90 px-4 py-3 backdrop-blur-md"
      >
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            data-chip={c.id}
            aria-current={active === c.id ? 'true' : undefined}
            onClick={() => jump(c.id)}
            className={cn(
              'relative shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
              active === c.id ? 'text-on-primary' : 'text-muted hover:text-ink',
            )}
          >
            {active === c.id && (
              <m.span
                layoutId="chip"
                className="absolute inset-0 rounded-full bg-primary shadow-md shadow-primary/30"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{c.name}</span>
          </button>
        ))}
      </nav>
      {menu.categories.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="px-4 pt-5">
          <h2 className="font-display text-xl font-semibold text-ink">{c.name}</h2>
          {c.description && <p className="mt-0.5 text-sm text-muted">{c.description}</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {c.items.map((item, index) => (
              <ItemCard
                key={item.id}
                item={item}
                index={index}
                currency={currency}
                locale={i18n.language}
                count={inCart.get(item.id) ?? 0}
                onPick={onPick}
              />
            ))}
          </ul>
        </section>
      ))}
      <div className="h-8" />
    </div>
  );
}

function ItemCard({
  item,
  index,
  currency,
  locale,
  count,
  onPick,
}: {
  item: GuestMenuItem;
  index: number;
  currency: string;
  locale: string;
  count: number;
  onPick?: (item: GuestMenuItem) => void;
}) {
  const { t } = useTranslation();
  const enabled = Boolean(onPick) && item.isAvailable;
  const quick = item.modifierGroupIds.length === 0;

  return (
    <m.li
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.4, delay: Math.min(index, 6) * 0.04, ease: [0.2, 0.8, 0.3, 1] }}
      whileTap={enabled ? { scale: 0.98 } : undefined}
      className={cn(
        'relative flex items-stretch gap-3 rounded-[22px] border bg-surface p-3 shadow-card transition-colors',
        count > 0 ? 'border-primary/40' : 'border-line',
        !item.isAvailable && 'opacity-55',
      )}
    >
      {/* The whole card opens the item; "+" sits above it as its own button. */}
      {enabled && (
        <button
          type="button"
          className="absolute inset-0 rounded-[22px]"
          onClick={() => onPick?.(item)}
          aria-label={item.name}
        />
      )}
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col py-1 pl-1">
        <h3 className="font-semibold text-ink">
          {item.name}
          {item.volumeLabel && (
            <span className="ml-1.5 text-xs font-medium text-muted">{item.volumeLabel}</span>
          )}
        </h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">
            {item.description}
          </p>
        )}
        <p className="mt-auto flex items-center gap-2 pt-2.5 font-display text-[15px] font-semibold text-accent">
          {formatMoney(item.price, currency, locale)}
          {!item.isAvailable && (
            <span className="rounded-md bg-danger/10 px-1.5 py-0.5 font-sans text-[11px] font-bold text-danger uppercase">
              {t('menu.soldOut')}
            </span>
          )}
        </p>
      </div>
      <div className="pointer-events-none relative shrink-0">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="size-26 rounded-[18px] object-cover"
          />
        ) : (
          <div className="grid size-26 place-items-center rounded-[18px] bg-gradient-to-br from-primary/15 to-blue-bright/5 font-display text-3xl font-semibold text-accent/70">
            {item.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <AnimatePresence>
          {count > 0 && (
            <m.span
              key={count}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
              className="absolute -top-1.5 -left-1.5 grid min-w-6 place-items-center rounded-full bg-navy-900 px-1.5 py-0.5 text-xs font-bold text-white ring-2 ring-surface"
            >
              {count}
            </m.span>
          )}
        </AnimatePresence>
      </div>
      {enabled && (
        <m.button
          type="button"
          whileTap={{ scale: 0.8 }}
          aria-label={`${t('menu.add')}: ${item.name}`}
          onClick={(e) => {
            if (!quick) return onPick?.(item);
            cart.add({ itemId: item.id, quantity: 1, modifierOptionIds: [] });
            burst(e.currentTarget);
            try {
              navigator.vibrate?.(15);
            } catch {
              // Not supported.
            }
          }}
          className="absolute right-1.5 bottom-1.5 grid size-10 place-items-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/35 ring-4 ring-surface"
        >
          <Plus className="size-5" aria-hidden />
        </m.button>
      )}
    </m.li>
  );
}
