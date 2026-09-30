import { SaveModifierGroupRequest, type Menu, type ModifierGroup } from '@qafe/contracts';
import { ArrowLeft, Pencil, Plus, Trash, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, Field, Input, Sheet } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { formatDelta } from '../../lib/format';
import { useStaff } from '../../lib/useAuth';
import { useMenuMutation } from './useMenuMutation';

/** FR-SEF-18: groups of choices with min/max and an extra charge per option. */
export function ModifierGroupsSheet({
  open,
  menu,
  onClose,
  onNotice,
}: {
  open: boolean;
  menu: Menu;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { venue } = useStaff();
  const [editing, setEditing] = useState<ModifierGroup | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ModifierGroup | null>(null);
  const remove = useMenuMutation((id: string) =>
    api<Menu>(`/catalog/modifier-groups/${id}`, { method: 'DELETE' }),
  );

  function close() {
    setEditing(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={
        editing
          ? editing === 'new'
            ? t('menu.modifiers.new')
            : t('menu.modifiers.edit')
          : t('menu.modifiers.title')
      }
      description={editing ? undefined : t('menu.modifiers.subtitle')}
    >
      {editing ? (
        <GroupEditor
          key={editing === 'new' ? 'new' : editing.id}
          group={editing === 'new' ? null : editing}
          onDone={(name) => {
            setEditing(null);
            onNotice(`${name} ✓`);
          }}
          onBack={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => setEditing('new')}
            className="self-start"
          >
            {t('menu.modifiers.new')}
          </Button>
          {menu.modifierGroups.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
              {t('menu.modifiers.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {menu.modifierGroups.map((g) => (
                <li key={g.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{g.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {t('menu.modifiers.rule', { min: g.minSelect, max: g.maxSelect })} ·{' '}
                        {t('menu.modifiers.usedBy', { count: g.itemCount })}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton label={t('menu.modifiers.edit')} onClick={() => setEditing(g)}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label={t('menu.modifiers.delete')}
                        onClick={() => setDeleting(g)}
                        danger
                      >
                        <Trash className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {g.options.map((o) => (
                      <li key={o.id} className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink">
                        {o.name}
                        {formatDelta(o.priceDelta, venue.currency, i18n.language) && (
                          <span className="ml-1 text-muted">
                            {formatDelta(o.priceDelta, venue.currency, i18n.language)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('menu.modifiers.deleteTitle', { name: deleting?.name ?? '' })}
        body={t('menu.modifiers.deleteBody')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
        onClose={() => setDeleting(null)}
      />
    </Sheet>
  );
}

/** An option being edited; new options have no id yet. */
interface OptionDraft {
  id?: string;
  name: string;
  priceDelta: string;
  isDefault: boolean;
}

function GroupEditor({
  group,
  onDone,
  onBack,
}: {
  group: ModifierGroup | null;
  onDone: (name: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name ?? '');
  const [min, setMin] = useState(group?.minSelect ?? 0);
  const [max, setMax] = useState(group?.maxSelect ?? 1);
  const [options, setOptions] = useState<OptionDraft[]>(
    group?.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: o.priceDelta.replace('.', ','),
      isDefault: o.isDefault,
    })) ?? [{ id: undefined, name: '', priceDelta: '0', isDefault: false }],
  );
  const body = { name, minSelect: min, maxSelect: max, options };
  const parsed = SaveModifierGroupRequest.safeParse(body);
  const rangeInvalid = max < min || min > options.length;

  const save = useMenuMutation(() =>
    group
      ? api<Menu>(`/catalog/modifier-groups/${group.id}`, { method: 'PUT', body })
      : api<Menu>('/catalog/modifier-groups', { method: 'POST', body }),
  );

  const update = (index: number, patch: Partial<(typeof options)[number]>) =>
    setOptions((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.success) save.mutate(undefined, { onSuccess: () => onDone(name.trim()) });
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted hover:text-accent"
      >
        <ArrowLeft className="size-4" />
        {t('menu.modifiers.title')}
      </button>
      {save.isError && <p className="text-sm font-medium text-danger">{t(errorKey(save.error))}</p>}

      <Field label={t('menu.modifiers.name')} required>
        {({ id }) => (
          <Input
            id={id}
            autoFocus
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mlijeko"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('menu.modifiers.min')}>
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={20}
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          )}
        </Field>
        <Field label={t('menu.modifiers.max')}>
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={1}
              max={20}
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          )}
        </Field>
      </div>
      {rangeInvalid && (
        <p className="-mt-3 text-xs font-medium text-danger">{t('menu.modifiers.invalidRange')}</p>
      )}

      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-ink">
          {t('menu.modifiers.options')}
        </legend>
        <ul className="flex flex-col gap-2.5">
          {options.map((option, index) => (
            <li
              key={option.id ?? `new-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_7rem_auto_auto] items-center gap-2"
            >
              <Input
                aria-label={t('menu.modifiers.option')}
                placeholder={t('menu.modifiers.option')}
                maxLength={60}
                value={option.name}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <Input
                aria-label={t('menu.modifiers.priceDelta')}
                inputMode="decimal"
                value={option.priceDelta}
                onChange={(e) => update(index, { priceDelta: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={option.isDefault}
                  onChange={(e) => update(index, { isDefault: e.target.checked })}
                />
                {t('menu.modifiers.isDefault')}
              </label>
              <IconButton
                label={t('menu.modifiers.removeOption')}
                disabled={options.length === 1}
                onClick={() => setOptions((list) => list.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          icon={<Plus className="size-4" />}
          onClick={() =>
            setOptions((list) => [
              ...list,
              { id: undefined, name: '', priceDelta: '0', isDefault: false },
            ])
          }
        >
          {t('menu.modifiers.addOption')}
        </Button>
      </fieldset>

      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!parsed.success} loading={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        danger
          ? 'grid size-9 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-40'
          : 'grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40'
      }
    >
      {children}
    </button>
  );
}
