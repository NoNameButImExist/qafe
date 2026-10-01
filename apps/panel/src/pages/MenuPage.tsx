import type { Menu, MenuCategory, MenuItem } from '@qafe/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  Ellipsis,
  EyeOff,
  ImageOff,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  cn,
  ConfirmDialog,
  Menu as DropMenu,
  MenuItem as DropItem,
  Notice,
  Switch,
  useNotice,
} from '@qafe/ui';
import { CategoryDialog } from '../components/menu/CategoryDialog';
import { ItemSheet } from '../components/menu/ItemSheet';
import { ModifierGroupsSheet } from '../components/menu/ModifierGroupsSheet';
import { SortableList } from '../components/menu/Sortable';
import { useMenuMutation } from '../components/menu/useMenuMutation';
import { api, errorKey } from '../lib/api';
import { formatMoney } from '../lib/format';
import { menuQuery } from '../lib/queries';
import { useCan, useStaff } from '../lib/useAuth';

type Dialog =
  | { kind: 'category'; category: MenuCategory | null }
  | { kind: 'item'; item: MenuItem | null }
  | { kind: 'modifiers' }
  | { kind: 'deleteCategory'; category: MenuCategory }
  | { kind: 'deleteItem'; item: MenuItem }
  | null;

/** FR-SEF-17..19 (and FR-KON-22 for waiters: availability only). */
export function MenuPage() {
  const { t } = useTranslation();
  const canEdit = useCan('menu.edit');
  const canToggle = useCan('menu.edit', 'menu.availability');
  const menu = useQuery({ ...menuQuery, enabled: canToggle });
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useNotice();

  const fail = (error: unknown) => setNotice({ tone: 'error', text: t(errorKey(error)) });
  const optimistic = (update: (m: Menu) => Menu) =>
    queryClient.setQueryData<Menu>(menuQuery.queryKey, (m) => (m ? update(m) : m));

  const reorderCategories = useMenuMutation(
    (ids: string[]) => api<Menu>('/catalog/categories/order', { method: 'PUT', body: { ids } }),
    fail,
  );
  const reorderItems = useMenuMutation(
    ({ categoryId, ids }: { categoryId: string; ids: string[] }) =>
      api<Menu>(`/catalog/categories/${categoryId}/items/order`, { method: 'PUT', body: { ids } }),
    fail,
  );
  const toggleCategory = useMenuMutation(
    (c: MenuCategory) =>
      api<Menu>(`/catalog/categories/${c.id}`, {
        method: 'PATCH',
        body: { isActive: !c.isActive },
      }),
    fail,
  );
  const availability = useMenuMutation(
    ({ item, available }: { item: MenuItem; available: boolean }) =>
      api<Menu>(`/catalog/items/${item.id}/availability`, { method: 'PATCH', body: { available } }),
    fail,
  );
  const deleteCategory = useMenuMutation(
    (c: MenuCategory) => api<Menu>(`/catalog/categories/${c.id}`, { method: 'DELETE' }),
    fail,
  );
  const deleteItem = useMenuMutation(
    (i: MenuItem) => api<Menu>(`/catalog/items/${i.id}`, { method: 'DELETE' }),
    fail,
  );

  if (!canToggle) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
        {t('common.noPermission')}
      </p>
    );
  }

  const data = menu.data;
  const category = data?.categories.find((c) => c.id === selected) ?? data?.categories[0] ?? null;
  const closeDialog = () => setDialog(null);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('menu.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('menu.subtitle')}</p>
        </div>
        {canEdit && data && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<SlidersHorizontal className="size-4" />}
              onClick={() => setDialog({ kind: 'modifiers' })}
            >
              {t('menu.modifiers.open')}
            </Button>
            <Button
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => setDialog({ kind: 'category', category: null })}
            >
              {t('menu.newCategory')}
            </Button>
          </div>
        )}
      </div>

      <Notice notice={notice} className="mt-6" />

      {menu.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(menu.error))}
        </Card>
      ) : !data ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="h-80 animate-pulse" />
          <Card className="h-96 animate-pulse" />
        </div>
      ) : data.categories.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
            <UtensilsCrossed className="size-6" />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted">{t('menu.emptyMenu')}</p>
          {canEdit && (
            <Button
              className="mt-5"
              icon={<Plus className="size-4" />}
              onClick={() => setDialog({ kind: 'category', category: null })}
            >
              {t('menu.newCategory')}
            </Button>
          )}
        </Card>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Categories */}
          <Card className="min-w-0 p-3">
            <p className="px-2 pt-1 pb-2 font-display text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {t('menu.categories')}
            </p>
            <SortableList
              items={data.categories}
              disabled={!canEdit}
              className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
              onReorder={(ids) => {
                optimistic((m) => ({
                  ...m,
                  categories: ids.map((id) => m.categories.find((c) => c.id === id)!),
                }));
                reorderCategories.mutate(ids);
              }}
            >
              {(c, handle) => (
                <div
                  className={cn(
                    'group flex min-w-44 items-center gap-1 rounded-xl pr-1 transition-colors lg:min-w-0',
                    c.id === category?.id ? 'bg-primary/10' : 'hover:bg-surface-2',
                  )}
                >
                  {handle}
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-current={c.id === category?.id}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-1 text-left"
                  >
                    <span
                      className={cn(
                        'truncate text-sm font-semibold',
                        c.id === category?.id ? 'text-accent' : 'text-ink',
                      )}
                    >
                      {c.name}
                    </span>
                    {!c.isActive && (
                      <EyeOff
                        className="size-3.5 shrink-0 text-muted"
                        aria-label={t('menu.hidden')}
                      />
                    )}
                    <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {c.items.length}
                    </span>
                  </button>
                  {canEdit && (
                    <DropMenu
                      label={`${t('menu.renameCategory')}: ${c.name}`}
                      className="grid size-8 place-items-center rounded-lg text-muted opacity-60 hover:bg-surface hover:text-ink group-hover:opacity-100"
                      trigger={<Ellipsis className="size-4" />}
                    >
                      {(close) => (
                        <>
                          <DropItem
                            icon={<Pencil className="size-4 text-muted" />}
                            onSelect={() => {
                              close();
                              setDialog({ kind: 'category', category: c });
                            }}
                          >
                            {t('menu.renameCategory')}
                          </DropItem>
                          <DropItem
                            icon={<EyeOff className="size-4 text-muted" />}
                            onSelect={() => {
                              close();
                              toggleCategory.mutate(c);
                            }}
                          >
                            {c.isActive ? t('menu.hideCategory') : t('menu.showCategory')}
                          </DropItem>
                          <DropItem
                            tone="danger"
                            icon={<Trash className="size-4" />}
                            onSelect={() => {
                              close();
                              setDialog({ kind: 'deleteCategory', category: c });
                            }}
                          >
                            {t('menu.deleteCategory')}
                          </DropItem>
                        </>
                      )}
                    </DropMenu>
                  )}
                </div>
              )}
            </SortableList>
          </Card>

          {/* Items of the selected category */}
          {category && (
            <Card className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    {category.name}
                    {!category.isActive && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                        {t('menu.hidden')}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted">
                    {category.description ?? t('menu.count', { count: category.items.length })}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="sm"
                    icon={<Plus className="size-4" />}
                    onClick={() => setDialog({ kind: 'item', item: null })}
                  >
                    {t('menu.newItem')}
                  </Button>
                )}
              </div>
              {category.items.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-muted">
                  {t('menu.emptyCategory')}
                </p>
              ) : (
                <SortableList
                  items={category.items}
                  disabled={!canEdit}
                  className="flex flex-col divide-y divide-line"
                  onReorder={(ids) => {
                    optimistic((m) => ({
                      ...m,
                      categories: m.categories.map((c) =>
                        c.id === category.id
                          ? { ...c, items: ids.map((id) => c.items.find((i) => i.id === id)!) }
                          : c,
                      ),
                    }));
                    reorderItems.mutate({ categoryId: category.id, ids });
                  }}
                >
                  {(item, handle) => (
                    <ItemRow
                      item={item}
                      menu={data}
                      handle={handle}
                      canEdit={canEdit}
                      pending={availability.isPending && availability.variables.item.id === item.id}
                      onToggle={(available) => availability.mutate({ item, available })}
                      onEdit={() => setDialog({ kind: 'item', item })}
                      onDelete={() => setDialog({ kind: 'deleteItem', item })}
                    />
                  )}
                </SortableList>
              )}
            </Card>
          )}
        </div>
      )}

      {data && dialog?.kind === 'category' && (
        <CategoryDialog
          open
          category={dialog.category}
          onClose={closeDialog}
          onSaved={(m, name) => {
            closeDialog();
            setNotice({ tone: 'success', text: `${name} ✓` });
            if (!dialog.category) setSelected(m.categories.at(-1)?.id ?? null);
          }}
        />
      )}
      {data && category && dialog?.kind === 'item' && (
        <ItemSheet
          open
          menu={data}
          item={dialog.item}
          categoryId={category.id}
          onClose={closeDialog}
          onSaved={(_, name) => {
            closeDialog();
            setNotice({ tone: 'success', text: `${name} ✓` });
          }}
        />
      )}
      {data && (
        <ModifierGroupsSheet
          open={dialog?.kind === 'modifiers'}
          menu={data}
          onClose={closeDialog}
          onNotice={(text) => setNotice({ tone: 'success', text })}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'deleteCategory'}
        title={t('menu.deleteCategoryTitle', {
          name: dialog?.kind === 'deleteCategory' ? dialog.category.name : '',
        })}
        body={t('menu.deleteCategoryBody')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={deleteCategory.isPending}
        onConfirm={() =>
          dialog?.kind === 'deleteCategory' &&
          deleteCategory.mutate(dialog.category, { onSettled: closeDialog })
        }
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteItem'}
        title={t('menu.deleteItemTitle', {
          name: dialog?.kind === 'deleteItem' ? dialog.item.name : '',
        })}
        body={t('menu.deleteItemBody')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={deleteItem.isPending}
        onConfirm={() =>
          dialog?.kind === 'deleteItem' &&
          deleteItem.mutate(dialog.item, { onSettled: closeDialog })
        }
        onClose={closeDialog}
      />
    </div>
  );
}

function ItemRow({
  item,
  menu,
  handle,
  canEdit,
  pending,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  menu: Menu;
  handle: React.ReactNode;
  canEdit: boolean;
  pending: boolean;
  onToggle: (available: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { venue } = useStaff();
  const groups = menu.modifierGroups.filter((g) => item.modifierGroupIds.includes(g.id));
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-3 sm:px-4',
        !item.isAvailable && 'bg-surface-2/40',
      )}
    >
      {handle}
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-muted sm:size-14">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-semibold',
            item.isAvailable ? 'text-ink' : 'text-muted line-through',
          )}
        >
          {item.name}
          {item.volumeLabel && (
            <span className="ml-1.5 font-normal text-muted no-underline">{item.volumeLabel}</span>
          )}
        </p>
        <p className="text-xs font-semibold text-ink tabular-nums sm:hidden">
          {formatMoney(item.price, venue.currency, i18n.language)}
        </p>
        {item.description && (
          <p className="hidden truncate text-xs text-muted sm:block">{item.description}</p>
        )}
        {groups.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {groups.map((g) => (
              <span
                key={g.id}
                className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[11px] font-medium text-accent"
              >
                {g.name}
              </span>
            ))}
          </p>
        )}
      </div>
      <p className="hidden shrink-0 text-right font-display text-sm font-semibold text-ink tabular-nums sm:block">
        {formatMoney(item.price, venue.currency, i18n.language)}
      </p>
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <Switch
          label={t('menu.availability', { name: item.name })}
          checked={pending ? !item.isAvailable : item.isAvailable}
          disabled={pending}
          onChange={onToggle}
        />
        <span
          className={cn(
            'text-[10px] font-semibold',
            item.isAvailable ? 'text-success' : 'text-warning',
          )}
        >
          {item.isAvailable ? t('menu.available') : t('menu.unavailable')}
        </span>
      </div>
      {canEdit && (
        <DropMenu
          label={`${t('menu.editItem')}: ${item.name}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          trigger={<Ellipsis className="size-4" />}
        >
          {(close) => (
            <>
              <DropItem
                icon={<Pencil className="size-4 text-muted" />}
                onSelect={() => {
                  close();
                  onEdit();
                }}
              >
                {t('menu.editItem')}
              </DropItem>
              <DropItem
                tone="danger"
                icon={<Trash className="size-4" />}
                onSelect={() => {
                  close();
                  onDelete();
                }}
              >
                {t('menu.deleteItem')}
              </DropItem>
            </>
          )}
        </DropMenu>
      )}
    </div>
  );
}
