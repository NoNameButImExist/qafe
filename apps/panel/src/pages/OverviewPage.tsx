import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Armchair,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Settings,
  Tags,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, SectionTitle, cn } from '@qafe/ui';
import { greetingKey } from '../lib/format';
import { menuQuery, settingsQuery, spaceQuery, staffQuery } from '../lib/queries';
import { useCan, useStaff } from '../lib/useAuth';

export function OverviewPage() {
  const { t } = useTranslation();
  const staff = useStaff();
  const canSeeMenu = useCan('menu.edit', 'menu.availability');
  const menu = useQuery({ ...menuQuery, enabled: canSeeMenu });
  const settings = useQuery(settingsQuery);
  const space = useQuery({ ...spaceQuery, enabled: useCan('tables.manage') });
  const team = useQuery({ ...staffQuery, enabled: useCan('staff.manage') });

  const items = menu.data?.categories.flatMap((c) => c.items) ?? [];
  const unavailable = items.filter((i) => !i.isAvailable).length;
  const payments = settings.data
    ? [settings.data.payments.cash, settings.data.payments.card].filter(Boolean).length
    : undefined;
  const firstName = staff.fullName.split(' ')[0] ?? staff.fullName;
  const status = staff.venue.status;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t(greetingKey())}, {firstName}.
      </h1>
      <p className="mt-1 text-sm text-muted">{t('overview.subtitle')}</p>

      {(status === 'pending' || status === 'suspended') && (
        <div
          className={cn(
            'mt-6 flex items-start gap-3 rounded-2xl border px-5 py-4 text-sm',
            status === 'pending'
              ? 'border-warning/25 bg-warning/8 text-warning'
              : 'border-danger/25 bg-danger/8 text-danger',
          )}
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <p className="font-medium">{t(`overview.${status}`)}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          featured
          icon={UtensilsCrossed}
          label={t('overview.stats.items')}
          value={canSeeMenu ? (menu.data ? items.length : undefined) : '—'}
        />
        <Stat
          icon={Tags}
          label={t('overview.stats.categories')}
          value={canSeeMenu ? menu.data?.categories.length : '—'}
        />
        <Stat
          icon={CircleDashed}
          label={t('overview.stats.unavailable')}
          value={canSeeMenu ? (menu.data ? unavailable : undefined) : '—'}
          tone={unavailable ? 'warning' : undefined}
        />
        <Stat icon={Wallet} label={t('overview.stats.payments')} value={payments} />
      </div>

      <Card className="mt-6 p-6">
        <SectionTitle>{t('overview.setup')}</SectionTitle>
        <ul className="grid gap-3 md:grid-cols-2">
          <Step
            to="/settings"
            icon={Settings}
            title={t('overview.steps.settings')}
            hint={t('overview.steps.settingsHint')}
            done={Boolean(settings.data?.profile.phone || settings.data?.profile.address)}
          />
          <Step
            to="/menu"
            icon={UtensilsCrossed}
            title={t('overview.steps.menu')}
            hint={
              items.length
                ? t('overview.steps.menuHint', {
                    items: items.length,
                    categories: menu.data?.categories.length ?? 0,
                  })
                : t('overview.steps.menuEmpty')
            }
            done={items.length > 0}
          />
          <Step
            to="/tables"
            icon={Armchair}
            title={t('overview.steps.tables')}
            hint={
              space.data?.tables.length
                ? t('overview.steps.tablesCount', {
                    tables: space.data.tables.length,
                    areas: space.data.areas.length,
                  })
                : t('overview.steps.tablesHint')
            }
            done={Boolean(space.data?.tables.length)}
          />
          <Step
            to="/staff"
            icon={UsersRound}
            title={t('overview.steps.staff')}
            hint={
              team.data && team.data.members.length > 1
                ? t('overview.steps.staffCount', { count: team.data.members.length })
                : t('overview.steps.staffHint')
            }
            done={Boolean(team.data && team.data.members.length > 1)}
          />
        </ul>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  featured = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string | undefined;
  tone?: 'warning';
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl p-5',
        featured
          ? 'bg-gradient-to-br from-blue-brand to-blue-deep text-white shadow-xl shadow-primary/25'
          : 'border border-line bg-surface shadow-card',
      )}
    >
      <span
        className={cn(
          'grid size-10 place-items-center rounded-xl',
          featured
            ? 'bg-white/15'
            : tone === 'warning'
              ? 'bg-warning/12 text-warning'
              : 'bg-surface-2 text-muted',
        )}
      >
        <Icon className="size-5" />
      </span>
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
    </div>
  );
}

function Step({
  to,
  icon: Icon,
  title,
  hint,
  done = false,
  soon = false,
}: {
  to: '/settings' | '/menu' | '/tables' | '/staff';
  icon: LucideIcon;
  title: string;
  hint: string;
  done?: boolean;
  soon?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <Link
        to={to}
        className="group flex items-center gap-4 rounded-xl border border-line px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <span
          className={cn(
            'grid size-10 place-items-center rounded-xl',
            done ? 'bg-success/12 text-success' : 'bg-primary/10 text-accent',
          )}
        >
          {done ? <CircleCheck className="size-5" /> : <Icon className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            {title}
            {soon && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted">
                {t('common.comingSoon')}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted">{hint}</span>
        </span>
        <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
      </Link>
    </li>
  );
}
