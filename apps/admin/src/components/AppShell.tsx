import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Blocks,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu as MenuIcon,
  ScrollText,
  Settings,
  Store,
  Users,
  X,
  type LucideIcon,
  UserCog,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../lib/api';
import { useAuth, useUser } from '../lib/useAuth';
import { initials } from '../lib/text';
import {
  ChangePasswordForm,
  Brand,
  cn,
  LanguageSwitch,
  Menu,
  MenuItem,
  ThemeToggle,
} from '@qafe/ui';

interface NavItem {
  to: '/' | '/venues' | '/users' | '/modules' | '/audit' | '/system' | '/settings';
  icon: LucideIcon;
  label: string;
}

/** Protected area: waits for the session, sends anonymous visitors to /login. */
export function ProtectedLayout() {
  const { state, changePassword, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status !== 'anonymous') return;
    // Remember where the admin was going, to return there after signing in.
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
  // FR-SEF-01: with a temporary password the only thing to do is change it.
  if (state.user.mustChangePassword) {
    return (
      <ChangePasswordForm
        variant="screen"
        onSubmit={changePassword}
        errorText={(error) => t(errorKey(error))}
        onLogout={() => void logout()}
      />
    );
  }
  return <AppShell />;
}

function AppShell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: t('nav.sectionPlatform'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav.overview') },
        { to: '/venues', icon: Store, label: t('nav.venues') },
        { to: '/users', icon: Users, label: t('nav.users') },
        { to: '/modules', icon: Blocks, label: t('nav.modules') },
        { to: '/settings', icon: Settings, label: t('nav.settings') },
      ],
    },
    {
      title: t('nav.sectionOperations'),
      items: [
        { to: '/audit', icon: ScrollText, label: t('nav.audit') },
        { to: '/system', icon: Activity, label: t('nav.system') },
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
          <Link to="/" aria-label="qafe.ba">
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

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {sections.map((section) => (
            <div key={section.title} className="mt-5 first:mt-2">
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
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch className="hidden sm:flex" />
            <ThemeToggle />
            <UserMenu />
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
    </Link>
  );
}

function SidebarUser() {
  const { t } = useTranslation();
  const user = useUser();
  const { logout } = useAuth();
  return (
    <div className="m-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-brand to-blue-bright text-sm font-bold">
        {initials(user.fullName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-white/50">{t(`nav.role.${user.role}`)}</p>
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

function UserMenu() {
  const { t } = useTranslation();
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Menu
      label={user.fullName}
      className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface pr-3 pl-1 hover:border-line-strong"
      trigger={
        <>
          <span className="grid size-8 place-items-center rounded-lg bg-primary/12 text-xs font-bold text-accent">
            {initials(user.fullName)}
          </span>
          <span className="hidden text-[13px] font-semibold text-ink sm:inline">
            {user.fullName.split(' ')[0]}
          </span>
        </>
      }
    >
      {() => (
        <>
          <div className="mb-1 border-b border-line px-4 pt-1.5 pb-3">
            <p className="text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="text-xs text-muted">{user.email}</p>
          </div>
          <MenuItem
            icon={<UserCog className="size-4" />}
            onSelect={() => void navigate({ to: '/account' })}
          >
            {t('nav.account')}
          </MenuItem>
          <MenuItem
            tone="danger"
            icon={<LogOut className="size-4" />}
            onSelect={() => void logout()}
          >
            {t('nav.logout')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
