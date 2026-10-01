import type { GuestMenu, GuestMenuItem } from '@qafe/contracts';
import { Button, cn, Sheet, Textarea } from '@qafe/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cart } from '../lib/cart';
import { formatDelta, formatMoney, multiplyMoney, sumMoney } from '../lib/format';
import { Stepper } from './Stepper';

/** One item with its options, quantity and note, added to the cart (FR-GOS-08). */
export function ItemSheet({
  item,
  menu,
  currency,
  onClose,
}: {
  item: GuestMenuItem | null;
  menu: GuestMenu;
  currency: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={item !== null} onClose={onClose} title={item?.name ?? ''}>
      {item && (
        <ItemForm key={item.id} item={item} menu={menu} currency={currency} onDone={onClose} />
      )}
    </Sheet>
  );
}

function ItemForm({
  item,
  menu,
  currency,
  onDone,
}: {
  item: GuestMenuItem;
  menu: GuestMenu;
  currency: string;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
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

  const options = groups.flatMap((g) => g.options);
  const unit = sumMoney([
    item.price,
    ...selected.map((id) => options.find((o) => o.id === id)?.priceDelta ?? 0),
  ]);
  const valid = groups.every((g) => {
    const count = g.options.filter((o) => selected.includes(o.id)).length;
    return count >= g.minSelect && count <= g.maxSelect;
  });

  const toggle = (groupId: string, optionId: string) => {
    const group = groups.find((g) => g.id === groupId)!;
    const inGroup = group.options.map((o) => o.id);
    setSelected((current) => {
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      // A single-choice group behaves like radio buttons.
      if (group.maxSelect === 1)
        return [...current.filter((id) => !inGroup.includes(id)), optionId];
      if (current.filter((id) => inGroup.includes(id)).length >= group.maxSelect) return current;
      return [...current, optionId];
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {item.imageUrl && (
        <img src={item.imageUrl} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
      )}
      {item.description && <p className="text-sm text-muted">{item.description}</p>}

      {groups.map((g) => (
        <fieldset key={g.id} className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
            <span className="font-semibold text-ink">{g.name}</span>
            <span className="text-xs font-medium text-muted">
              {g.minSelect > 0
                ? g.minSelect === g.maxSelect
                  ? t('item.chooseExactly', { count: g.minSelect })
                  : `${t('item.required')} · ${t('item.chooseUpTo', { count: g.maxSelect })}`
                : g.maxSelect > 1
                  ? t('item.chooseUpTo', { count: g.maxSelect })
                  : t('item.optional')}
            </span>
          </legend>
          {g.options.map((o) => {
            const checked = selected.includes(o.id);
            return (
              <label
                key={o.id}
                className={cn(
                  'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                  checked ? 'border-primary bg-primary/6' : 'border-line bg-surface',
                )}
              >
                <input
                  type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                  name={g.id}
                  checked={checked}
                  onChange={() => toggle(g.id, o.id)}
                  onClick={() => {
                    // Radios cannot be unticked natively; optional groups need that.
                    if (g.maxSelect === 1 && checked && g.minSelect === 0) toggle(g.id, o.id);
                  }}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="flex-1 font-medium text-ink">{o.name}</span>
                <span className="text-muted">
                  {formatDelta(o.priceDelta, currency, i18n.language)}
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink">{t('item.note')}</span>
        <Textarea
          value={note}
          maxLength={200}
          rows={2}
          placeholder={t('item.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex items-center justify-between gap-4">
        <Stepper value={quantity} onChange={setQuantity} />
        <Button
          size="lg"
          className="flex-1"
          disabled={!valid}
          onClick={() => {
            cart.add({
              itemId: item.id,
              quantity,
              modifierOptionIds: selected,
              ...(note.trim() ? { note: note.trim() } : {}),
            });
            onDone();
          }}
        >
          {t('item.addToCart', {
            price: formatMoney(multiplyMoney(unit, quantity), currency, i18n.language),
          })}
        </Button>
      </div>
    </div>
  );
}
