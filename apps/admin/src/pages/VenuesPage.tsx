import type { VenueStatus, VenueSummary } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { CircleAlert, MapPin, Plus, Search, Store } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CreateVenueSheet } from '../components/CreateVenueSheet';
import {
  Button,
  Card,
  cn,
  Input,
  Notice,
  Pagination,
  Segmented,
  Select,
  StatusBadge,
  useNotice,
} from '@qafe/ui';
import { VenueStatusMenu } from '../components/VenueStatusMenu';
import { api, errorKey } from '../lib/api';
import { formatDate, venueHost } from '../lib/format';
import { citiesQuery, venuesQuery } from '../lib/queries';
import { useSearchText } from '../lib/useSearchText';
import { VENUE_STATUSES, type VenuesSearch } from '../lib/venuesSearch';

const PAGE_SIZE = 20;

export function VenuesPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: '/app/venues' });
  const navigate = useNavigate({ from: '/venues' });
  const queryClient = useQueryClient();
  const [notice, setNotice] = useNotice();

  const setFilter = useCallback(
    (patch: Partial<VenuesSearch>) =>
      void navigate({ search: (s) => ({ ...s, ...patch, page: undefined }) }),
    [navigate],
  );
  const [text, setText] = useSearchText(
    search.q,
    useCallback(
      (q) => void navigate({ search: (s) => ({ ...s, q, page: undefined }), replace: true }),
      [navigate],
    ),
  );
  const setCreate = (create: boolean) =>
    void navigate({ search: (s) => ({ ...s, create: create || undefined }) });

  const page = search.page ?? 1;
  const venues = useQuery(
    venuesQuery({
      search: search.q,
      status: search.status,
      city: search.city,
      page,
      pageSize: PAGE_SIZE,
    }),
  );
  const cities = useQuery(citiesQuery);

  const changeStatus = useMutation({
    mutationFn: ({ venue, status }: { venue: VenueSummary; status: VenueStatus }) =>
      api<VenueSummary>(`/admin/venues/${venue.id}/status`, { method: 'PATCH', body: { status } }),
    onSuccess: (updated) => {
      setNotice({
        tone: 'success',
        text: t('venues.statusChanged', {
          name: updated.name,
          status: t(`venues.status.${updated.status}`),
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => setNotice({ tone: 'error', text: t(errorKey(error)) }),
  });

  const filtered = Boolean(search.q || search.status || search.city);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('venues.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('venues.subtitle')}</p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>
          {t('venues.new')}
        </Button>
      </div>

      <Notice notice={notice} className="mt-6" />

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('venues.searchPlaceholder')}
              aria-label={t('venues.searchPlaceholder')}
              icon={<Search className="size-4" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={t('venues.columns.status')}
              value={search.status}
              onChange={(status) => setFilter({ status })}
              options={[
                { value: undefined, label: t('common.all') },
                ...VENUE_STATUSES.map((s) => ({ value: s, label: t(`venues.filter.${s}`) })),
              ]}
            />
            <Select
              value={search.city ?? ''}
              onChange={(e) => setFilter({ city: e.target.value || undefined })}
              aria-label={t('venues.columns.city')}
              className="w-44"
            >
              <option value="">{t('venues.allCities')}</option>
              {cities.data?.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {venues.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-danger">
            <CircleAlert className="size-6" />
            {t(errorKey(venues.error))}
            <Button variant="secondary" size="sm" onClick={() => void venues.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : venues.data && venues.data.items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
              <Store className="size-6" />
            </span>
            <p className="mt-4 text-sm text-muted">
              {filtered ? t('venues.empty') : t('venues.emptyAll')}
            </p>
            {!filtered && (
              <Button
                className="mt-5"
                icon={<Plus className="size-4" />}
                onClick={() => setCreate(true)}
              >
                {t('venues.new')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-semibold tracking-wide text-muted uppercase">
                    <th className="px-5 py-3">{t('venues.columns.venue')}</th>
                    <th className="px-5 py-3">{t('venues.columns.city')}</th>
                    <th className="px-5 py-3">{t('venues.columns.status')}</th>
                    <th className="px-5 py-3 text-right">{t('venues.columns.staff')}</th>
                    <th className="px-5 py-3 text-right">{t('venues.columns.tables')}</th>
                    <th className="px-5 py-3">{t('venues.columns.created')}</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">{t('venues.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={cn(venues.isPlaceholderData && 'opacity-60')}>
                  {(venues.data?.items ?? Array.from({ length: 5 }, () => null)).map((venue, i) =>
                    venue ? (
                      <tr
                        key={venue.id}
                        className="border-b border-line last:border-0 hover:bg-surface-2/50"
                      >
                        <td className="px-5 py-3.5">
                          <VenueName venue={venue} />
                        </td>
                        <td className="px-5 py-3.5 text-muted">{venue.city ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={venue.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium tabular-nums">
                          {venue.staffCount}
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium tabular-nums">
                          {venue.tableCount}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-muted">
                          {formatDate(venue.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <VenueStatusMenu
                            venue={venue}
                            onChange={(status) => changeStatus.mutate({ venue, status })}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td colSpan={7} className="px-5 py-3.5">
                          <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {venues.data?.items.map((venue) => (
                <li key={venue.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <VenueName venue={venue} />
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                      <StatusBadge status={venue.status} />
                      {venue.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          {venue.city}
                        </span>
                      )}
                      <span>
                        {t('venues.columns.staff')}: {venue.staffCount}
                      </span>
                    </div>
                  </div>
                  <VenueStatusMenu
                    venue={venue}
                    onChange={(status) => changeStatus.mutate({ venue, status })}
                  />
                </li>
              ))}
            </ul>

            <Pagination
              summary={t('venues.count', { count: venues.data?.total ?? 0 })}
              page={page}
              pageSize={PAGE_SIZE}
              total={venues.data?.total ?? 0}
              onPage={(p) =>
                void navigate({ search: (s) => ({ ...s, page: p > 1 ? p : undefined }) })
              }
            />
          </>
        )}
      </Card>

      <CreateVenueSheet
        open={Boolean(search.create)}
        onClose={() => setCreate(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ['admin'] })}
      />
    </div>
  );
}

function VenueName({ venue }: { venue: VenueSummary }) {
  return (
    <Link
      to="/venues/$venueId"
      params={{ venueId: venue.id }}
      className="group flex items-center gap-3"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy-900 to-blue-brand font-display text-sm font-semibold text-white">
        {venue.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink group-hover:text-accent group-hover:underline">
          {venue.name}
        </span>
        <span className="block truncate text-xs text-muted">{venueHost(venue.slug)}</span>
      </span>
    </Link>
  );
}
