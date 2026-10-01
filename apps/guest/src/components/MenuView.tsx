import type { GuestMenu, GuestMenuItem } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';

/** Categories as chips that jump to their section, then the items (FR-GOS-04). */
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
  if (menu.categories.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted">{t('menu.empty')}</p>;
  }
  return (
    <div>
      <nav
        aria-label={t('tabs.menu')}
        className="no-scrollbar sticky top-16 z-10 flex gap-2 overflow-x-auto border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur"
      >
        {menu.categories.map((c) => (
          <a
            key={c.id}
            href={`#c-${c.id}`}
            className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-line-strong"
          >
            {c.name}
          </a>
        ))}
      </nav>
      {menu.categories.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="scroll-mt-32 px-4 pt-6">
          <h2 className="font-display text-lg font-semibold text-ink">{c.name}</h2>
          {c.description && <p className="mt-0.5 text-sm text-muted">{c.description}</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {c.items.map((item) => {
              const enabled = Boolean(onPick) && item.isAvailable;
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink">
                      {item.name}
                      {item.volumeLabel && (
                        <span className="ml-1.5 text-xs font-medium text-muted">
                          {item.volumeLabel}
                        </span>
                      )}
                    </h3>
                    {item.description && (
                      <p className="mt-1 line-clamp-2 text-[13px] text-muted">{item.description}</p>
                    )}
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink">
                      {formatMoney(item.price, currency, i18n.language)}
                      {!item.isAvailable && (
                        <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-bold text-danger uppercase">
                          {t('menu.soldOut')}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-24 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="size-12" />
                    )}
                    {enabled && (
                      <span className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/30">
                        <Plus className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>
                </>
              );
              const box = cn(
                'flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left',
                !item.isAvailable && 'opacity-60',
              );
              return (
                <li key={item.id}>
                  {enabled ? (
                    <button
                      type="button"
                      className={cn(
                        box,
                        'transition-colors hover:border-line-strong active:scale-[0.99]',
                      )}
                      onClick={() => onPick?.(item)}
                      aria-label={`${t('menu.add')}: ${item.name}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={box}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="h-8" />
    </div>
  );
}
