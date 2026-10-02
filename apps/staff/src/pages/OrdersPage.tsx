import { cn } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AnimatePresence, m } from 'motion/react';
import { ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OrderCard } from '../components/OrderCard';
import { ordersQuery } from '../lib/queries';

type Filter = 'new' | 'active' | 'all';

/** Live orders, oldest first (FR-KON-04). */
export function OrdersPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: '/app/orders' });
  const navigate = useNavigate({ from: '/orders' });
  const filter: Filter = search.filter ?? 'all';
  const orders = useQuery(ordersQuery);

  const list = (orders.data?.orders ?? []).filter((o) =>
    filter === 'new'
      ? o.status === 'new' || o.dispute === 'open'
      : filter === 'active'
        ? o.status !== 'new'
        : true,
  );
  const count = (f: Filter) =>
    (orders.data?.orders ?? []).filter((o) =>
      f === 'new'
        ? o.status === 'new' || o.dispute === 'open'
        : f === 'active'
          ? o.status !== 'new'
          : true,
    ).length;

  return (
    <div className="px-4 py-5">
      <div
        className="mb-5 flex h-12 max-w-lg rounded-2xl bg-surface-2 p-1"
        role="group"
        aria-label={t('orders.title')}
      >
        {(['all', 'new', 'active'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => void navigate({ search: { filter: f === 'all' ? undefined : f } })}
            className={cn(
              'relative flex-1 rounded-xl text-sm font-semibold transition-colors',
              filter === f ? 'text-ink' : 'text-muted',
            )}
          >
            {filter === f && (
              <m.span
                layoutId="orders-filter"
                className="absolute inset-0 rounded-xl bg-surface shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">
              {f === 'all' ? t('common.all') : t(`orders.filter.${f}`)}
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 py-px text-xs',
                  f === 'new' && count(f) > 0 ? 'bg-danger text-white' : 'bg-line/70',
                )}
              >
                {count(f)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {!orders.data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <m.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 py-20 text-center text-sm text-muted"
        >
          <span className="grid size-16 place-items-center rounded-full bg-success/12 text-success">
            <ClipboardCheck className="size-7" aria-hidden />
          </span>
          {t('orders.empty')}
        </m.div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((order) => (
              <m.div
                key={order.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                <OrderCard
                  order={order}
                  showTable
                  rejectionEnabled={orders.data.orderRejectionEnabled}
                />
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
