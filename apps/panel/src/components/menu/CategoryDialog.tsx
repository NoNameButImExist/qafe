import type { Menu, MenuCategory } from '@qafe/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Sheet, Textarea } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { useMenuMutation } from './useMenuMutation';

/** Create (category = null) or edit a category. */
export function CategoryDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: MenuCategory | null;
  onClose: () => void;
  onSaved: (menu: Menu, name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const save = useMenuMutation(() =>
    category
      ? api<Menu>(`/catalog/categories/${category.id}`, {
          method: 'PATCH',
          body: { name, description },
        })
      : api<Menu>('/catalog/categories', { method: 'POST', body: { name, description } }),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={category ? t('menu.renameCategory') : t('menu.newCategory')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="category-form"
            disabled={!name.trim()}
            loading={save.isPending}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form
        id="category-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: (menu) => onSaved(menu, name.trim()) });
        }}
      >
        {save.isError && (
          <p className="text-sm font-medium text-danger">{t(errorKey(save.error))}</p>
        )}
        <Field label={t('menu.categoryName')} required>
          {({ id }) => (
            <Input
              id={id}
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('menu.categoryDescription')}>
          {({ id }) => (
            <Textarea
              id={id}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
