import type { VenueArea, VenueTable } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Armchair,
  CircleAlert,
  Ellipsis,
  EyeOff,
  Pencil,
  Plus,
  Printer,
  QrCode as QrIcon,
  Trash,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, ConfirmDialog, Menu, MenuItem, Notice, useNotice } from '@qafe/ui';
import { AddTablesSheet } from '../components/tables/AddTablesSheet';
import { AreaDialog } from '../components/tables/AreaDialog';
import { TableSheet } from '../components/tables/TableSheet';
import { useSpaceMutation } from '../components/tables/useSpaceMutation';
import { api, errorKey } from '../lib/api';
import { spaceQuery } from '../lib/queries';
import { useCan } from '../lib/useAuth';

type Dialog =
  | { kind: 'area'; area: VenueArea | null }
  | { kind: 'add'; areaId: string | null }
  | { kind: 'table'; tableId: string }
  | { kind: 'deleteArea'; area: VenueArea }
  | null;

/** FR-SEF-11, FR-SEF-15, FR-SEF-16 */
export function TablesPage() {
  const { t } = useTranslation();
  const canManage = useCan('tables.manage');
  const space = useQuery({ ...spaceQuery, enabled: canManage });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useNotice();
  const fail = (error: unknown) => setNotice({ tone: 'error', text: t(errorKey(error)) });

  const toggleArea = useSpaceMutation(
    (a: VenueArea) =>
      api(`/venue/areas/${a.id}`, { method: 'PATCH', body: { isActive: !a.isActive } }),
    fail,
  );
  const deleteArea = useSpaceMutation(
    (a: VenueArea) => api(`/venue/areas/${a.id}`, { method: 'DELETE' }),
    fail,
  );

  if (!canManage)
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
        {t('common.noPermission')}
      </p>
    );

  const data = space.data;
  const close = () => setDialog(null);
  const groups: { area: VenueArea | null; tables: VenueTable[] }[] = data
    ? [
        ...data.areas.map((area) => ({
          area,
          tables: data.tables.filter((x) => x.areaId === area.id),
        })),
        { area: null, tables: data.tables.filter((x) => x.areaId === null) },
      ].filter((g) => g.area || g.tables.length)
    : [];
  const openTable =
    dialog?.kind === 'table' ? data?.tables.find((x) => x.id === dialog.tableId) : undefined;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('tables.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('tables.subtitle')}</p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            {data.tables.length > 0 && (
              <Link
                to="/tables/print"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-line-strong hover:bg-surface-2"
              >
                <Printer className="size-4" />
                {t('tables.printAll')}
              </Link>
            )}
            <Button
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => setDialog({ kind: 'area', area: null })}
            >
              {t('tables.newArea')}
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setDialog({ kind: 'add', areaId: null })}
            >
              {t('tables.addTables')}
            </Button>
          </div>
        )}
      </div>

      <Notice notice={notice} className="mt-6" />

      {space.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(space.error))}
        </Card>
      ) : !data ? (
        <div className="mt-6 grid gap-6">
          <Card className="h-48 animate-pulse" />
        </div>
      ) : groups.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
            <Armchair className="size-6" />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted">{t('tables.empty')}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setDialog({ kind: 'area', area: null })}>
              {t('tables.newArea')}
            </Button>
            <Button onClick={() => setDialog({ kind: 'add', areaId: null })}>
              {t('tables.addTables')}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map(({ area, tables }) => (
            <Card
              key={area?.id ?? 'none'}
              className={cn('p-5', area && !area.isActive && 'opacity-70')}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-ink">
                    {area?.name ?? t('tables.noArea')}
                  </h2>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {t('tables.count', { count: tables.length })}
                  </span>
                  {area && !area.isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                      <EyeOff className="size-3" />
                      {t('tables.hidden')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Plus className="size-4" />}
                    onClick={() => setDialog({ kind: 'add', areaId: area?.id ?? null })}
                  >
                    {t('tables.addTables')}
                  </Button>
                  {area && (
                    <Menu
                      label={`${t('tables.editArea')}: ${area.name}`}
                      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                      trigger={<Ellipsis className="size-4" />}
                    >
                      {(closeMenu) => (
                        <>
                          <MenuItem
                            icon={<Pencil className="size-4 text-muted" />}
                            onSelect={() => {
                              closeMenu();
                              setDialog({ kind: 'area', area });
                            }}
                          >
                            {t('tables.editArea')}
                          </MenuItem>
                          <MenuItem
                            icon={<EyeOff className="size-4 text-muted" />}
                            onSelect={() => {
                              closeMenu();
                              toggleArea.mutate(area);
                            }}
                          >
                            {area.isActive ? t('tables.hideArea') : t('tables.showArea')}
                          </MenuItem>
                          <MenuItem
                            tone="danger"
                            icon={<Trash className="size-4" />}
                            onSelect={() => {
                              closeMenu();
                              setDialog({ kind: 'deleteArea', area });
                            }}
                          >
                            {t('tables.deleteArea')}
                          </MenuItem>
                        </>
                      )}
                    </Menu>
                  )}
                </div>
              </div>
              {tables.length === 0 ? (
                <p className="rounded-xl bg-surface-2/60 px-4 py-6 text-center text-sm text-muted">
                  {t('tables.emptyArea')}
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                  {tables.map((table) => (
                    <li key={table.id}>
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'table', tableId: table.id })}
                        className={cn(
                          'group flex w-full flex-col items-start gap-2 rounded-2xl border border-line bg-surface-2/50 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5',
                          !table.isActive && 'opacity-60',
                        )}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span className="font-display text-xl font-bold text-ink">
                            {table.label}
                          </span>
                          <QrIcon
                            className="size-4 text-muted group-hover:text-accent"
                            aria-hidden
                          />
                        </span>
                        <span className="text-xs text-muted">
                          {table.seats ? t('tables.seats', { count: table.seats }) : '—'}
                          {!table.isActive && ` · ${t('tables.inactive')}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {dialog?.kind === 'area' && <AreaDialog area={dialog.area} onClose={close} />}
      {data && dialog?.kind === 'add' && (
        <AddTablesSheet space={data} areaId={dialog.areaId} onClose={close} />
      )}
      {data && openTable && (
        <TableSheet
          key={openTable.id}
          space={data}
          table={openTable}
          onClose={close}
          onNotice={(text) => setNotice({ tone: 'success', text })}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'deleteArea'}
        title={t('tables.deleteAreaTitle', {
          name: dialog?.kind === 'deleteArea' ? dialog.area.name : '',
        })}
        body={t('tables.deleteAreaBody')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={deleteArea.isPending}
        onConfirm={() =>
          dialog?.kind === 'deleteArea' && deleteArea.mutate(dialog.area, { onSettled: close })
        }
        onClose={close}
      />
    </div>
  );
}
