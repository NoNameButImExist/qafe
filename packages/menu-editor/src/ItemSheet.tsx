import { CreateItemRequest, type Menu, type MenuItem, type UploadedImage } from '@qafe/contracts';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, ImageInput, Input, Select, Sheet, Switch, Textarea, cn } from '@qafe/ui';
import { useMenuEditor } from './context';
import { formatDelta } from './format';
import { useMenuMutation } from './useMenuMutation';

interface ItemSheetProps {
  open: boolean;
  menu: Menu;
  /** null = new item in `categoryId`. */
  item: MenuItem | null;
  categoryId: string;
  onClose: () => void;
  onSaved: (menu: Menu, name: string) => void;
}

/** FR-SEF-17..19: name, description, image, price, quantity, modifiers and availability. */
export function ItemSheet({ open, menu, item, categoryId, onClose, onSaved }: ItemSheetProps) {
  const { t, i18n } = useTranslation();
  const { request, errorText, currency, stations: allStations } = useMenuEditor();
  const kds = allStations !== null;
  const [form, setForm] = useState({
    categoryId: item?.categoryId ?? categoryId,
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item ? item.price.replace('.', ',') : '',
    volumeLabel: item?.volumeLabel ?? '',
    imageUrl: item?.imageUrl ?? null,
    isAvailable: item?.isAvailable ?? true,
    modifierGroupIds: item?.modifierGroupIds ?? [],
    prepStationId: item?.prepStationId ?? null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const stations = (allStations ?? []).filter((s) => s.isActive || s.id === form.prepStationId);

  const save = useMenuMutation((body: CreateItemRequest) =>
    item
      ? request<Menu>(`/items/${item.id}`, { method: 'PATCH', body })
      : request<Menu>('/items', { method: 'POST', body }),
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: CreateItemRequest = { ...form, imageUrl: form.imageUrl };
    const parsed = CreateItemRequest.safeParse(body);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        next[String(issue.path[0])] ??= t('errors.validation_failed');
      setErrors(next);
      return;
    }
    save.mutate(body, { onSuccess: (m) => onSaved(m, form.name.trim()) });
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? t('menu.editItem') : t('menu.newItem')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="item-form" loading={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form id="item-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {save.isError && (
          <p
            role="alert"
            className="rounded-xl border border-danger/25 bg-danger/8 px-4 py-3 text-[13px] font-medium text-danger"
          >
            {errorText(save.error)}
          </p>
        )}

        <Field label={t('menu.item.image')}>
          {() => (
            <ImageInput
              errorText={errorText}
              url={form.imageUrl}
              chooseLabel={t('menu.item.chooseImage')}
              changeLabel={t('menu.item.changeImage')}
              removeLabel={t('menu.item.removeImage')}
              hint={t('menu.item.imageHint')}
              onUpload={async (file) => {
                const data = new FormData();
                data.append('file', file);
                const { url } = await request<UploadedImage>('/images', {
                  method: 'POST',
                  form: data,
                });
                set('imageUrl', url);
              }}
              onRemove={() => set('imageUrl', null)}
            />
          )}
        </Field>

        <Field label={t('menu.item.name')} required error={errors.name || undefined}>
          {({ id, invalid }) => (
            <Input
              id={id}
              aria-invalid={invalid}
              autoFocus
              maxLength={120}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('menu.item.price')} required error={errors.price || undefined}>
            {({ id, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                inputMode="decimal"
                placeholder="2,50"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                trailing={
                  <span className="pr-3 text-sm text-muted">
                    {currency === 'BAM' ? 'KM' : currency}
                  </span>
                }
              />
            )}
          </Field>
          <Field label={t('menu.item.volume')} hint={t('menu.item.volumeHint')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={20}
                value={form.volumeLabel}
                onChange={(e) => set('volumeLabel', e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t('menu.item.description')} hint={t('menu.item.descriptionHint')}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              maxLength={500}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
        </Field>

        <Field label={t('menu.item.category')}>
          {({ id }) => (
            <Select
              id={id}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              {menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset>
          <legend className="text-[13px] font-semibold text-ink">{t('menu.item.modifiers')}</legend>
          <p className="mt-0.5 mb-3 text-xs text-muted">{t('menu.item.modifiersHint')}</p>
          {menu.modifierGroups.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
              {t('menu.item.noModifiers')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {menu.modifierGroups.map((g) => {
                const checked = form.modifierGroupIds.includes(g.id);
                return (
                  <li key={g.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                        checked
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-line hover:border-line-strong',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--primary)]"
                        checked={checked}
                        onChange={(e) =>
                          set(
                            'modifierGroupIds',
                            e.target.checked
                              ? [...form.modifierGroupIds, g.id]
                              : form.modifierGroupIds.filter((id) => id !== g.id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{g.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {g.options
                            .map((o) =>
                              [o.name, formatDelta(o.priceDelta, currency, i18n.language)]
                                .filter(Boolean)
                                .join(' '),
                            )
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {kds && (
          <Field label={t('menu.item.station')} hint={t('menu.item.stationHint')}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.prepStationId ?? ''}
                onChange={(e) => set('prepStationId', e.target.value || null)}
              >
                <option value="">{t('menu.item.noStation')}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
          <span className="text-sm font-semibold text-ink">{t('menu.item.availableNow')}</span>
          <Switch
            label={t('menu.item.availableNow')}
            checked={form.isAvailable}
            onChange={(v) => set('isAvailable', v)}
          />
        </div>
      </form>
    </Sheet>
  );
}
