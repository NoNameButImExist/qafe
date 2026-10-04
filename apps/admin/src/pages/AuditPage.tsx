import type { AuditEntry } from '@qafe/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  Blocks,
  CircleAlert,
  KeyRound,
  LogIn,
  Pencil,
  RotateCcw,
  ScrollText,
  Store,
  ToggleRight,
  UserRoundCheck,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, Input, Select } from '@qafe/ui';
import { errorKey } from '../lib/api';
import type { AuditSearch } from '../lib/auditSearch';
import { formatDate, formatTime } from '../lib/format';
import { auditFacetsQuery, auditQuery } from '../lib/queries';

const PAGE_SIZE = 25;

const ACTION_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  'venue.created': { icon: Store, tone: 'bg-success/12 text-success' },
  'venue.updated': { icon: Pencil, tone: 'bg-primary/12 text-accent' },
  'venue.status_changed': { icon: ToggleRight, tone: 'bg-warning/12 text-warning' },
  'venue.module_enabled': { icon: Blocks, tone: 'bg-primary/12 text-accent' },
  'venue.module_disabled': { icon: Blocks, tone: 'bg-muted/15 text-muted' },
  'user.logged_in': { icon: LogIn, tone: 'bg-surface-2 text-muted' },
  'user.blocked': { icon: UserRoundX, tone: 'bg-danger/12 text-danger' },
  'user.unblocked': { icon: UserRoundCheck, tone: 'bg-success/12 text-success' },
  'user.password_reset': { icon: KeyRound, tone: 'bg-warning/12 text-warning' },
  'user.password_changed': { icon: KeyRound, tone: 'bg-primary/12 text-accent' },
  'user.mfa_enabled': { icon: UserRoundCheck, tone: 'bg-success/12 text-success' },
  'user.mfa_disabled': { icon: UserRoundX, tone: 'bg-warning/12 text-warning' },
  'staff.password_reset': { icon: KeyRound, tone: 'bg-warning/12 text-warning' },
  'staff.pin_changed': { icon: KeyRound, tone: 'bg-warning/12 text-warning' },
  'staff.created': { icon: UserRoundCheck, tone: 'bg-success/12 text-success' },
  'staff.updated': { icon: Pencil, tone: 'bg-primary/12 text-accent' },
  'table.qr_rotated': { icon: RotateCcw, tone: 'bg-warning/12 text-warning' },
  'item.updated': { icon: Pencil, tone: 'bg-primary/12 text-accent' },
  'item.availability_changed': { icon: ToggleRight, tone: 'bg-warning/12 text-warning' },
  'session.verified': { icon: UserRoundCheck, tone: 'bg-success/12 text-success' },
  'guest.approved': { icon: UserRoundCheck, tone: 'bg-success/12 text-success' },
  'order.accepted': { icon: Pencil, tone: 'bg-primary/12 text-accent' },
  'order.disputed': { icon: CircleAlert, tone: 'bg-danger/12 text-danger' },
  'order.cancelled': { icon: UserRoundX, tone: 'bg-danger/12 text-danger' },
  'order.rejected': { icon: UserRoundX, tone: 'bg-danger/12 text-danger' },
  'guest.removed': { icon: UserRoundX, tone: 'bg-danger/12 text-danger' },
  'payment.completed': { icon: Store, tone: 'bg-success/12 text-success' },
  'payment.failed': { icon: CircleAlert, tone: 'bg-danger/12 text-danger' },
};

/** DB column → label key for the "venue.updated" diff. */
const FIELD_LABELS: Record<string, string> = {
  name: 'createVenue.name',
  legal_name: 'createVenue.legalName',
  tax_id: 'createVenue.taxId',
  vat_number: 'createVenue.vatNumber',
  address: 'createVenue.address',
  city: 'createVenue.city',
  postal_code: 'createVenue.postalCode',
  phone: 'createVenue.phone',
  email: 'createVenue.email',
  currency: 'createVenue.currency',
  timezone: 'createVenue.timezone',
  default_language: 'createVenue.language',
};

/** FR-ADM-10: the audit log with filters by venue, user, action and day. */
export function AuditPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: '/app/audit' });
  const navigate = useNavigate({ from: '/audit' });
  const facets = useQuery(auditFacetsQuery);
  const entries = useInfiniteQuery(
    auditQuery({
      action: search.action,
      venueId: search.venueId,
      actorId: search.actorId,
      from: search.from,
      to: search.to,
      limit: PAGE_SIZE,
    }),
  );
  const items = entries.data?.pages.flatMap((p) => p.items);

  const setFilter = (patch: Partial<AuditSearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch }) });
  const filtered = Boolean(
    search.action || search.venueId || search.actorId || search.from || search.to,
  );
  const actionLabel = (action: string) =>
    t(`audit.actions.${action.replace(/\./g, '_')}` as 'audit.actions.venue_created', {
      defaultValue: action,
    });

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('audit.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('audit.subtitle')}</p>

      <Card className="mt-6">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_9.5rem_9.5rem_auto]">
          <Select
            aria-label={t('audit.columns.action')}
            value={search.action ?? ''}
            onChange={(e) => setFilter({ action: e.target.value || undefined })}
          >
            <option value="">{t('audit.filters.action')}</option>
            {facets.data?.actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('audit.columns.subject')}
            value={search.venueId ?? ''}
            onChange={(e) => setFilter({ venueId: e.target.value || undefined })}
          >
            <option value="">{t('audit.filters.venue')}</option>
            {facets.data?.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('audit.columns.actor')}
            value={search.actorId ?? ''}
            onChange={(e) => setFilter({ actorId: e.target.value || undefined })}
          >
            <option value="">{t('audit.filters.actor')}</option>
            {facets.data?.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label={t('audit.filters.from')}
            title={t('audit.filters.from')}
            value={search.from ?? ''}
            max={search.to}
            onChange={(e) => setFilter({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            aria-label={t('audit.filters.to')}
            title={t('audit.filters.to')}
            value={search.to ?? ''}
            min={search.from}
            onChange={(e) => setFilter({ to: e.target.value || undefined })}
          />
          <button
            type="button"
            disabled={!filtered}
            onClick={() => void navigate({ search: {} })}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <RotateCcw className="size-4" />
            {t('audit.filters.reset')}
          </button>
        </div>

        {entries.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-danger">
            <CircleAlert className="size-6" />
            {t(errorKey(entries.error))}
          </div>
        ) : items && items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
              <ScrollText className="size-6" />
            </span>
            <p className="mt-4 max-w-md text-sm text-muted">
              {filtered ? t('audit.empty') : t('audit.emptyAll')}
            </p>
          </div>
        ) : (
          <>
            <ol
              className={cn(
                'flex flex-col divide-y divide-line',
                entries.isPlaceholderData && 'opacity-60',
              )}
            >
              {(items ?? Array.from({ length: 6 }, () => null)).map((entry, i) =>
                entry ? (
                  <AuditRow key={entry.id} entry={entry} label={actionLabel(entry.action)} />
                ) : (
                  <li key={i} className="px-5 py-4">
                    <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
                  </li>
                ),
              )}
            </ol>
            <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-[13px] text-muted">
              <span>{t('audit.shown', { count: items?.length ?? 0 })}</span>
              {entries.hasNextPage && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={entries.isFetchingNextPage}
                  onClick={() => void entries.fetchNextPage()}
                >
                  {t('audit.loadMore')}
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function AuditRow({ entry, label }: { entry: AuditEntry; label: string }) {
  const { t } = useTranslation();
  const { icon: Icon, tone } = ACTION_ICONS[entry.action] ?? {
    icon: ScrollText,
    tone: 'bg-surface-2 text-muted',
  };
  const after = entry.after as { user?: string; name?: string } | null;
  const subjectUser = after?.user ?? (entry.action.startsWith('venue.') ? undefined : after?.name);

  return (
    <li className="flex gap-4 px-5 py-4">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-ink">
            {label}
            {entry.venueLabel && entry.venueId && (
              <>
                {' · '}
                <Link
                  to="/venues/$venueId"
                  params={{ venueId: entry.venueId }}
                  className="text-accent hover:underline"
                >
                  {entry.venueLabel}
                </Link>
              </>
            )}
            {subjectUser && <span className="font-normal text-muted"> · {subjectUser}</span>}
          </p>
          <time
            dateTime={entry.createdAt}
            className="text-xs whitespace-nowrap text-muted tabular-nums"
          >
            {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
          </time>
        </div>
        <p className="mt-0.5 text-xs text-muted">{entry.actorLabel ?? t('audit.system')}</p>
        <Details entry={entry} />
      </div>
    </li>
  );
}

function Details({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return t('audit.empty_value');
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };
  const status = (v: unknown) =>
    typeof v === 'string'
      ? t(`venues.status.${v}` as 'venues.status.active', { defaultValue: v })
      : show(v);
  const moduleName = (code: unknown) =>
    typeof code === 'string'
      ? t(`modules.names.${code}` as 'modules.names.kds', { defaultValue: code })
      : show(code);

  let content: ReactNode = null;
  switch (entry.action) {
    case 'venue.status_changed':
      content = <Change from={status(before.status)} to={status(after.status)} />;
      break;
    case 'venue.updated':
      content = (
        <ul className="flex flex-col gap-1">
          {Object.keys({ ...before, ...after }).map((field) => (
            <li key={field}>
              <span className="text-muted">
                {FIELD_LABELS[field] ? t(FIELD_LABELS[field] as 'createVenue.name') : field}:{' '}
              </span>
              <Change from={show(before[field])} to={show(after[field])} />
            </li>
          ))}
        </ul>
      );
      break;
    case 'venue.module_enabled':
      content = moduleName(after.module);
      break;
    case 'venue.module_disabled':
      content = moduleName(before.module);
      break;
    case 'venue.created':
      content = typeof after.slug === 'string' ? `${after.slug}` : null;
      break;
    case 'user.logged_in':
      content = entry.ip ? t('audit.ip', { ip: entry.ip }) : null;
      break;
    default: {
      // Menu, space and staff changes: every field that changed, old → new.
      const fields = Object.keys({ ...before, ...after }).filter(
        (f) => f !== 'name' && f !== 'user',
      );
      if (fields.length) {
        content = (
          <ul className="flex flex-col gap-1">
            {fields.map((field) => (
              <li key={field}>
                <span className="text-muted">{fieldLabel(field, t)}: </span>
                {field in before ? (
                  <Change from={show(before[field])} to={show(after[field])} />
                ) : (
                  <b>{show(after[field])}</b>
                )}
              </li>
            ))}
          </ul>
        );
      }
    }
  }
  if (!content) return null;
  return (
    <div className="mt-2 rounded-lg bg-surface-2/70 px-3 py-2 text-xs text-ink">{content}</div>
  );
}

function fieldLabel(field: string, t: ReturnType<typeof useTranslation>['t']): string {
  const known = FIELD_LABELS[field];
  if (known) return t(known as 'createVenue.name');
  return t(`audit.fields.${field}` as 'audit.fields.label', { defaultValue: field });
}

function Change({ from, to }: { from: string; to: string }) {
  return (
    <span>
      <span className="text-muted line-through decoration-muted/50">{from}</span>
      <span className="mx-1.5 text-muted">→</span>
      <span className="font-semibold">{to}</span>
    </span>
  );
}
