import type { Menu } from '@qafe/contracts';
import { Switch } from '@qafe/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { menuQuery } from '../lib/queries';
import { useAction } from '../lib/useAction';

/** "Nestalo" with one tap (FR-KON-22). */
export function MenuPage() {
  const { t } = useTranslation();
  const menu = useQuery(menuQuery);
  const queryClient = useQueryClient();
  const toggle = useAction(async ({ id, available }: { id: string; available: boolean }) => {
    const next = await api<Menu>(`/catalog/items/${id}/availability`, {
      method: 'PATCH',
      body: { available },
    });
    queryClient.setQueryData(menuQuery.queryKey, next);
  });

  if (!menu.data) return <p className="p-6 text-sm text-muted">{t('common.loading')}</p>;
  const categories = menu.data.categories.filter((c) => c.isActive && c.items.length > 0);
  return (
    <div className="px-4 py-4">
      <h1 className="font-display text-lg font-semibold text-ink">{t('menu.title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('menu.hint')}</p>
      {categories.length === 0 && (
        <p className="py-16 text-center text-sm text-muted">{t('menu.empty')}</p>
      )}
      {categories.map((c) => (
        <section key={c.id} className="mt-5">
          <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{c.name}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {c.items.map((item) => (
              <li key={item.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span
                  className={
                    item.isAvailable ? 'flex-1 text-ink' : 'flex-1 text-muted line-through'
                  }
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-xs text-muted">{formatMoney(item.price)}</span>
                </span>
                <Switch
                  checked={item.isAvailable}
                  label={`${t('menu.available')}: ${item.name}`}
                  disabled={toggle.isPending && toggle.variables.id === item.id}
                  onChange={(available) => toggle.mutate({ id: item.id, available })}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
