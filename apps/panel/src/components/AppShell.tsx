import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import {
  Armchair,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu as MenuIcon,
  Settings,
  UsersRound,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand, cn, LanguageSwitch, StatusBadge, ThemeToggle } from '@qafe/ui';
import { initials } from '../lib/text';
import { useAuth, useStaff } from '../lib/useAuth';

type Path = '/' | '/menu' | '/tables' | '/staff' | '/orders' | '/reports' | '/settings';
interface NavItem {
  to: Path;
  icon: LucideIcon;
  label: string;
  soon?: boolean;
}

/** Protected area: waits for the session, sends anonymous visitors to /login. */
export function ProtectedLayout() {
  return <Protected>{() => <AppShell />}</Protected>;
}

/** Protected, without sidebar and header (print layouts). */
export function ProtectedBare() {
  return <Protected>{() => <Outlet />}</Protected>;
}

function Protected({ children }: { children: () => React.ReactNode }) {
  const { state } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status !== 'anonymous') return;
    const here = window.location.pathname + window.location.search;
    void navigate({
      to: '/login',
      search: { redirect: here === '/' ? undefined : here },
      replace: true,
    });
  }, [state.status, navigate]);

  if (state.status !== 'authenticated') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoaderCircle className="size-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }
  return children();
}

function AppShell() {
  const { t } = useTranslation();
  const staff = useStaff();
  const [open, setOpen] = useState(false);

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: t('nav.sectionVenue'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav.overview') },
        { to: '/menu', icon: UtensilsCrossed, label: t('nav.menu') },
        { to: '/tables', icon: Armchair, label: t('nav.tables') },
        { to: '/staff', icon: UsersRound, label: t('nav.staff') },
      ],
    },
    {
      title: t('nav.sectionWork'),
      items: [
        { to: '/orders', icon: ClipboardList, label: t('nav.orders') },
        { to: '/reports', icon: ChartColumn, label: t('nav.reports') },
        { to: '/settings', icon: Settings, label: t('nav.settings') },
      ],
    },
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-68 flex-col bg-sidebar text-white transition-transform duration-300 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-18 items-center justify-between px-6">
          <Link to="/" aria-label="qafe.ba" onClick={() => setOpen(false)}>
            <Brand onDark className="text-[22px]" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('nav.closeMenu')}
            className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mx-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="truncate font-display text-sm font-semibold">{staff.venue.name}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={staff.venue.status} />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {sections.map((section) => (
            <div key={section.title} className="mt-5">
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-white/40 uppercase">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink item={item} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <SidebarUser />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-18 shrink-0 items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('nav.openMenu')}
            className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink lg:hidden"
          >
            <MenuIcon className="size-5" />
          </button>
          <p className="hidden truncate text-sm font-semibold text-ink lg:block">
            {staff.venue.name}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch className="hidden sm:flex" />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/' }}
      onClick={onNavigate}
      className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white data-[status=active]:bg-blue-brand/20 data-[status=active]:text-white"
    >
      <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-blue-bright opacity-0 group-data-[status=active]:opacity-100" />
      <Icon
        className="size-[18px] text-white/50 group-data-[status=active]:text-blue-bright"
        aria-hidden
      />
      <span className="flex-1">{item.label}</span>
      {item.soon && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
          {t('common.comingSoon')}
        </span>
      )}
    </Link>
  );
}

function SidebarUser() {
  const { t } = useTranslation();
  const staff = useStaff();
  const { logout } = useAuth();
  return (
    <div className="m-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-brand to-blue-bright text-sm font-bold">
        {initials(staff.fullName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{staff.fullName}</p>
        <p className="truncate text-xs text-white/50">
          @{staff.username} · {staff.role}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        aria-label={t('nav.logout')}
        title={t('nav.logout')}
        className="grid size-9 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
