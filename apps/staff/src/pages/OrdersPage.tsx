import { cn } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
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
    <div className="px-4 py-4">
      <div
        className="mb-4 flex h-12 rounded-xl bg-surface-2 p-1"
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
              'flex-1 rounded-lg text-sm font-semibold',
              filter === f ? 'bg-surface text-ink shadow-sm' : 'text-muted',
            )}
          >
            {f === 'all' ? t('common.all') : t(`orders.filter.${f}`)} ({count(f)})
          </button>
        ))}
      </div>
      {!orders.data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">{t('orders.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((order) => (
            <OrderCard key={order.id} order={order} showTable />
          ))}
        </div>
      )}
    </div>
  );
}
