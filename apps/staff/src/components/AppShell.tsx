import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  ClipboardList,
  LoaderCircle,
  LogOut,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChangePasswordForm, cn, LanguageSwitch, Notice, useNotice } from '@qafe/ui';
import { NoticeContext } from '../lib/notice';
import { tellServiceWorkerLanguage } from '../lib/push';
import { floorQuery, ordersQuery } from '../lib/queries';
import { connectRealtime } from '../lib/realtime';
import {
  readyConfirmed,
  setReadyConfirmed,
  unlockOnFirstInteraction,
  unlockSound,
  useSoundEnabled,
} from '../lib/sound';
import { errorKey } from '../lib/api';
import { useAuth, useCan, useStaff } from '../lib/useAuth';
import { ReadyGate } from './ReadyGate';

/** Protected area: waits for the session, sends anonymous visitors to /login. */
export function ProtectedLayout() {
  const { state, changePassword, logout } = useAuth();
  const { t } = useTranslation();
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
      <div className="grid min-h-dvh place-items-center bg-canvas">
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

/** Top bar, live connection, alerts and the bottom navigation (one-handed use, NFR-15). */
function AppShell() {
  const { t, i18n } = useTranslation();
  const staff = useStaff();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useNotice();
  // Asked once after sign-in; a reload keeps it and unlocks sound on the first tap.
  const [ready, setReady] = useState(readyConfirmed);
  const sound = useSoundEnabled();
  useEffect(() => {
    if (ready) unlockOnFirstInteraction();
  }, [ready]);
  const canSeeOrders = useCan('orders.view');
  const canMenu = useCan('menu.availability', 'menu.edit');
  const floor = useQuery({ ...floorQuery, enabled: canSeeOrders });
  const orders = useQuery({ ...ordersQuery, enabled: canSeeOrders });

  useEffect(() => connectRealtime(queryClient), [queryClient]);
  useEffect(() => tellServiceWorkerLanguage(i18n.language), [i18n.language, ready]);

  const newOrders = orders.data?.orders.filter((o) => o.status === 'new').length ?? 0;
  const attention =
    floor.data?.tables.filter((x) => x.status === 'needs_service' || x.status === 'bill_requested')
      .length ?? 0;

  const nav = [
    {
      to: '/' as const,
      icon: Armchair,
      label: t('nav.tables'),
      badge: attention,
      show: canSeeOrders,
    },
    {
      to: '/orders' as const,
      icon: ClipboardList,
      label: t('nav.orders'),
      badge: newOrders,
      show: canSeeOrders,
    },
    { to: '/menu' as const, icon: UtensilsCrossed, label: t('nav.menu'), badge: 0, show: canMenu },
  ].filter((n) => n.show);

  return (
    <NoticeContext.Provider value={setNotice}>
      <div className="min-h-dvh bg-canvas pb-24">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold text-ink">
                {staff.venue.name}
              </p>
              <p className="truncate text-xs text-muted">{staff.fullName}</p>
            </div>
            <button
              type="button"
              onClick={() => void unlockSound().catch(() => undefined)}
              className={cn(
                'grid size-11 place-items-center rounded-xl',
                sound ? 'text-success' : 'bg-warning/12 text-warning',
              )}
              title={sound ? t('ready.soundOn') : t('ready.soundOff')}
              aria-label={sound ? t('ready.soundOn') : t('ready.soundOff')}
            >
              {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => void logout()}
              aria-label={t('nav.logout')}
              className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </header>
        <div className="fixed inset-x-0 top-16 z-40 mx-auto max-w-3xl px-4">
          <div className={notice ? 'rounded-xl bg-surface shadow-lg' : undefined}>
            <Notice notice={notice} />
          </div>
        </div>

        <main className="mx-auto max-w-3xl">
          <Outlet />
        </main>

        <nav
          aria-label={t('nav.tables')}
          className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
        >
          <div className="mx-auto flex max-w-3xl">
            {nav.map(({ to, icon: Icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted data-[status=active]:text-accent"
              >
                <Icon className="size-6" aria-hidden />
                {label}
                {badge > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>

        {!ready && (
          <ReadyGate
            onReady={() => {
              setReadyConfirmed(true);
              setReady(true);
            }}
          />
        )}
      </div>
    </NoticeContext.Provider>
  );
}
