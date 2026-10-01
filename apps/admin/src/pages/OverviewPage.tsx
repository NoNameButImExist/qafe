import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  Armchair,
  ArrowRight,
  ArrowUpRight,
  CircleAlert,
  Clock,
  Pause,
  Plus,
  Search,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, SectionTitle, StatusBadge } from '@qafe/ui';
import { errorKey } from '../lib/api';
import { useUser } from '../lib/useAuth';
import { formatDate, formatToday, greetingKey, venueHost } from '../lib/format';
import { adminStatsQuery } from '../lib/queries';

export function OverviewPage() {
  const { t } = useTranslation();
  const user = useUser();
  const stats = useQuery(adminStatsQuery);
  const firstName = user.fullName.split(' ')[0] ?? user.fullName;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-muted first-letter:uppercase">
            {formatToday()}
          </p>
          <h1 className="mt-1 font-display text-[28px] leading-tight font-bold text-ink">
            {t(greetingKey())}, {firstName}.
          </h1>
          <p className="mt-1 text-sm text-muted">{t('overview.subtitle')}</p>
        </div>
        <Link to="/venues" search={{ create: true }}>
          <Button icon={<Plus className="size-4" />}>{t('overview.newVenue')}</Button>
        </Link>
      </div>

      {stats.isError ? (
        <Card className="mt-8 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(stats.error))}
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => void stats.refetch()}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile
              featured
              icon={Store}
              label={t('overview.stats.active')}
              value={stats.data?.venues.active}
              sub={
                stats.data
                  ? t('overview.stats.totalVenues', { count: stats.data.venues.total })
                  : undefined
              }
              className="col-span-2 lg:col-span-1"
            />
            <StatTile
              icon={Clock}
              label={t('overview.stats.pending')}
              value={stats.data?.venues.pending}
              tone="warning"
            />
            <StatTile
              icon={Pause}
              label={t('overview.stats.suspended')}
              value={stats.data?.venues.suspended}
              tone="danger"
            />
            <StatTile
              icon={Users}
              label={t('overview.stats.staff')}
              value={stats.data?.venueStaff}
            />
            <StatTile
              icon={Armchair}
              label={t('overview.stats.tables')}
              value={stats.data?.tables}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <SectionTitle
                action={
                  <Link
                    to="/venues"
                    className="text-[13px] font-semibold text-accent hover:underline"
                  >
                    {t('overview.seeAll')} →
                  </Link>
                }
              >
                {t('overview.recent')}
              </SectionTitle>
              {stats.data && stats.data.recentVenues.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">{t('overview.recentEmpty')}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {(stats.data?.recentVenues ?? Array.from({ length: 3 }, () => null)).map(
                    (venue, i) =>
                      venue ? (
                        <li
                          key={venue.id}
                          className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3"
                        >
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy-900 to-blue-brand font-display text-sm font-semibold text-white">
                            {venue.name.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{venue.name}</p>
                            <p className="truncate text-xs text-muted">
                              {venueHost(venue.slug)}
                              {venue.city ? ` · ${venue.city}` : ''}
                            </p>
                          </div>
                          <div className="hidden text-right sm:block">
                            <StatusBadge status={venue.status} />
                            <p className="mt-1 text-[11px] text-muted">
                              {formatDate(venue.createdAt)}
                            </p>
                          </div>
                        </li>
                      ) : (
                        <li key={i} className="h-[68px] animate-pulse rounded-xl bg-surface-2" />
                      ),
                  )}
                </ul>
              )}
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <SectionTitle>{t('overview.quickActions')}</SectionTitle>
                <div className="flex flex-col gap-2.5">
                  <QuickAction
                    to="/venues"
                    create
                    icon={Plus}
                    title={t('overview.newVenue')}
                    hint={t('overview.newVenueHint')}
                  />
                  <QuickAction
                    to="/venues"
                    icon={Search}
                    title={t('overview.browseVenues')}
                    hint={t('overview.browseVenuesHint')}
                  />
                </div>
              </Card>

              <Card className="relative overflow-hidden bg-gradient-to-br from-navy-900 to-navy-800 p-6 text-white">
                <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-blue-bright/20 blur-2xl" />
                <Activity className="size-6 text-blue-bright" />
                <h3 className="mt-3 font-display text-base font-semibold">
                  {t('overview.monitoring')}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                  {t('overview.monitoringHint')}
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  featured = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  sub?: string;
  tone?: 'warning' | 'danger';
  featured?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl p-5',
        featured
          ? 'bg-gradient-to-br from-blue-brand to-[#0056C4] text-white shadow-xl shadow-primary/25'
          : 'border border-line bg-surface shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'grid size-10 place-items-center rounded-xl',
            featured
              ? 'bg-white/15'
              : tone === 'warning'
                ? 'bg-warning/12 text-warning'
                : tone === 'danger'
                  ? 'bg-danger/12 text-danger'
                  : 'bg-surface-2 text-muted',
          )}
        >
          <Icon className="size-5" />
        </span>
        {featured && <ArrowUpRight className="size-4 text-white/70" />}
      </div>
      {value === undefined ? (
        <div
          className={cn(
            'mt-4 h-9 w-14 animate-pulse rounded-lg',
            featured ? 'bg-white/20' : 'bg-surface-2',
          )}
        />
      ) : (
        <p className="mt-4 font-display text-4xl leading-none font-bold">{value}</p>
      )}
      <p
        className={cn(
          'mt-2 text-xs font-semibold tracking-wide uppercase',
          featured ? 'text-white/80' : 'text-muted',
        )}
      >
        {label}
      </p>
      {sub && <p className="mt-0.5 text-xs text-white/70">{sub}</p>}
    </div>
  );
}

function QuickAction({
  to,
  create,
  icon: Icon,
  title,
  hint,
}: {
  to: '/venues';
  create?: boolean;
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      search={create ? { create: true } : {}}
      className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-accent">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
  );
}
