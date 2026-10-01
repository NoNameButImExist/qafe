import type { Menu, MenuItem, OrderLineRequest } from '@qafe/contracts';
import { Button, cn, Input, Sheet, Textarea } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Minus, Plus, Search, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, multiplyMoney, sumMoney } from '../lib/format';
import { menuQuery } from '../lib/queries';

type Line = OrderLineRequest & { modifierOptionIds: string[] };

/**
 * Picks items from the menu with options, quantity and note. "single" returns one line
 * (replacing an item); "multi" collects lines and sends them together (manual order, adding
 * items).
 */
export function ItemPicker({
  open,
  title,
  mode,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  mode: 'single' | 'multi';
  busy?: boolean;
  onClose: () => void;
  onSubmit: (lines: Line[]) => void;
}) {
  const { t } = useTranslation();
  const menu = useQuery({ ...menuQuery, enabled: open });
  const [query, setQuery] = useState('');
  const [item, setItem] = useState<MenuItem | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const close = () => {
    setItem(null);
    setLines([]);
    setQuery('');
    onClose();
  };

  const data = menu.data;
  const priceOf = (line: Line) =>
    data ? multiplyMoney(unitPrice(data, line), line.quantity) : '0.00';
  const total = sumMoney(lines.map(priceOf));

  return (
    <Sheet
      open={open}
      onClose={close}
      title={item ? item.name : title}
      footer={
        mode === 'multi' && !item && lines.length > 0 ? (
          <Button size="lg" className="w-full" loading={busy} onClick={() => onSubmit(lines)}>
            {t('picker.send', {
              count: lines.reduce((s, l) => s + l.quantity, 0),
              total: formatMoney(total),
            })}
          </Button>
        ) : undefined
      }
    >
      {!data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : item ? (
        <ItemForm
          key={item.id}
          item={item}
          menu={data}
          busy={busy}
          onBack={() => setItem(null)}
          onAdd={(line) => {
            if (mode === 'single') {
              onSubmit([line]);
              return;
            }
            setLines((current) => [...current, line]);
            setItem(null);
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {mode === 'multi' && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('picker.cart')}</h3>
              {lines.length === 0 ? (
                <p className="text-sm text-muted">{t('picker.empty')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
                  {lines.map((line, index) => (
                    <li key={index} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <b>{line.quantity}×</b> {itemName(data, line.itemId)}
                        {line.modifierOptionIds.length > 0 && (
                          <span className="text-muted">
                            {' '}
                            ({optionNames(data, line.modifierOptionIds)})
                          </span>
                        )}
                        {line.note && (
                          <span className="block text-xs text-muted italic">„{line.note}"</span>
                        )}
                      </span>
                      <span className="tabular-nums">{formatMoney(priceOf(line))}</span>
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-lg text-danger"
                        aria-label={t('orders.itemRemove')}
                        onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            icon={<Search className="size-4" />}
          />
          {data.categories
            .filter((c) => c.isActive)
            .map((c) => {
              const items = c.items.filter((i) =>
                i.name.toLowerCase().includes(query.trim().toLowerCase()),
              );
              if (items.length === 0) return null;
              return (
                <section key={c.id}>
                  <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
                    {c.name}
                  </h3>
                  <ul className="grid grid-cols-2 gap-2">
                    {items.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          disabled={!i.isAvailable}
                          onClick={() => setItem(i)}
                          className="flex min-h-16 w-full flex-col items-start justify-between rounded-xl border border-line bg-surface p-3 text-left disabled:opacity-50"
                        >
                          <span className="text-sm font-semibold text-ink">{i.name}</span>
                          <span className="text-xs text-muted">
                            {i.isAvailable ? formatMoney(i.price) : t('picker.soldOut')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
        </div>
      )}
    </Sheet>
  );
}

function ItemForm({
  item,
  menu,
  busy,
  onBack,
  onAdd,
}: {
  item: MenuItem;
  menu: Menu;
  busy?: boolean;
  onBack: () => void;
  onAdd: (line: Line) => void;
}) {
  const { t } = useTranslation();
  const groups = item.modifierGroupIds
    .map((id) => menu.modifierGroups.find((g) => g.id === id))
    .filter((g) => g !== undefined);
  const [selected, setSelected] = useState<string[]>(() =>
    groups.flatMap((g) =>
      g.options
        .filter((o) => o.isDefault)
        .slice(0, g.maxSelect)
        .map((o) => o.id),
    ),
  );
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const valid = groups.every((g) => {
    const n = g.options.filter((o) => selected.includes(o.id)).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const line: Line = {
    itemId: item.id,
    quantity,
    modifierOptionIds: selected,
    ...(note.trim() ? { note: note.trim() } : {}),
  };

  const toggle = (groupId: string, optionId: string) => {
    const group = groups.find((g) => g.id === groupId)!;
    const inGroup = group.options.map((o) => o.id);
    setSelected((current) => {
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      if (group.maxSelect === 1)
        return [...current.filter((id) => !inGroup.includes(id)), optionId];
      if (current.filter((id) => inGroup.includes(id)).length >= group.maxSelect) return current;
      return [...current, optionId];
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"
      >
        <ChevronLeft className="size-4" /> {t('common.back')}
      </button>
      {groups.map((g) => (
        <fieldset key={g.id} className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold text-ink">{g.name}</legend>
          <div className="grid grid-cols-2 gap-2">
            {g.options.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={selected.includes(o.id)}
                onClick={() => toggle(g.id, o.id)}
                className={cn(
                  'min-h-12 rounded-xl border px-3 text-sm font-medium',
                  selected.includes(o.id)
                    ? 'border-primary bg-primary/8 text-ink'
                    : 'border-line bg-surface text-muted',
                )}
              >
                {o.name}
                {Number(o.priceDelta) !== 0 && (
                  <span className="ml-1 text-xs">({formatMoney(o.priceDelta)})</span>
                )}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink">{t('picker.note')}</span>
        <Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2" role="group" aria-label={t('picker.quantity')}>
          <button
            type="button"
            className="grid size-12 place-items-center rounded-xl border border-line bg-surface disabled:opacity-40"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => q - 1)}
            aria-label="−"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            className="grid size-12 place-items-center rounded-xl border border-line bg-surface"
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            aria-label="+"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <Button
          size="lg"
          className="flex-1"
          disabled={!valid}
          loading={busy}
          onClick={() => onAdd(line)}
        >
          {t('picker.add', { price: formatMoney(multiplyMoney(unitPrice(menu, line), quantity)) })}
        </Button>
      </div>
    </div>
  );
}

function allItems(menu: Menu) {
  return menu.categories.flatMap((c) => c.items);
}

function itemName(menu: Menu, id: string) {
  return allItems(menu).find((i) => i.id === id)?.name ?? '—';
}

function optionNames(menu: Menu, ids: string[]) {
  const options = menu.modifierGroups.flatMap((g) => g.options);
  return ids.map((id) => options.find((o) => o.id === id)?.name ?? '').join(', ');
}

function unitPrice(menu: Menu, line: Line): string {
  const options = menu.modifierGroups.flatMap((g) => g.options);
  return sumMoney([
    allItems(menu).find((i) => i.id === line.itemId)?.price ?? 0,
    ...line.modifierOptionIds.map((id) => options.find((o) => o.id === id)?.priceDelta ?? 0),
  ]);
}
