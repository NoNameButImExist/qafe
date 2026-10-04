import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  Flame,
  ClipboardList,
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChangePasswordForm, cn, LanguageSwitch, Notice, useNotice } from '@qafe/ui';
import { NoticeContext } from '../lib/notice';
import { tellServiceWorkerLanguage } from '../lib/push';
import { floorQuery, ordersQuery } from '../lib/queries';
import { connectRealtime, useLive } from '../lib/realtime';
import { useOnline } from '../lib/network';
import { persistSnapshots, startSync, useQueue } from '../lib/offline';
import {
  readyConfirmed,
  setReadyConfirmed,
  unlockOnFirstInteraction,
  unlockSound,
  useSoundEnabled,
} from '../lib/sound';
import { errorKey } from '../lib/api';
import { formatTime } from '../lib/format';
import { useAuth, useCan, useStaff } from '../lib/useAuth';
import { DeviceSheet } from './DeviceSheet';
import { ReadyGate } from './ReadyGate';
import { isPinSession, PIN_IDLE_LOCK_MS } from '../lib/device';

/** Protected area with the app chrome. */
export function ProtectedLayout() {
  return <Protected>{() => <AppShell />}</Protected>;
}

/** Protected, full screen without navigation (KDS screen on the bar or kitchen). */
export function ProtectedBare() {
  return <Protected>{() => <Outlet />}</Protected>;
}

/** Waits for the session, sends anonymous visitors to /login. */
function Protected({ children }: { children: () => React.ReactNode }) {
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
  return children();
}

/**
 * App chrome: a dark top bar with the live connection, a side menu on wide screens and a
 * floating bottom bar on phones (one-handed use, NFR-15).
 */
function AppShell() {
  const { t, i18n } = useTranslation();
  const staff = useStaff();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useNotice();
  // Asked once after sign-in; a reload keeps it and unlocks sound on the first tap.
  const [ready, setReady] = useState(readyConfirmed);
  const sound = useSoundEnabled();
  const live = useLive();
  useEffect(() => {
    if (ready) unlockOnFirstInteraction();
  }, [ready]);
  const canManageStaff = useCan('staff.manage');
  const [deviceOpen, setDeviceOpen] = useState(false);
  // A PIN session on a shared device locks itself after a while without a touch (FR-KON-01).
  useEffect(() => {
    if (!isPinSession()) return;
    let timer = setTimeout(() => void logout(), PIN_IDLE_LOCK_MS);
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void logout(), PIN_IDLE_LOCK_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [logout]);
  const canSeeOrders = useCan('orders.view');
  const canMenu = useCan('menu.availability', 'menu.edit');
  const floor = useQuery({ ...floorQuery, enabled: canSeeOrders });
  const orders = useQuery({ ...ordersQuery, enabled: canSeeOrders });

  useEffect(() => connectRealtime(queryClient), [queryClient]);
  // NFR-05: last state on screen without internet, one-tap actions queued and sent later.
  const venueId = staff.venue.id;
  useEffect(() => persistSnapshots(queryClient, venueId), [queryClient, venueId]);
  useEffect(
    () =>
      startSync(queryClient, venueId, (report) => {
        void queryClient.invalidateQueries();
        if (report.refused.length > 0) {
          setNotice({
            tone: 'error',
            text: t('offline.refused', {
              count: report.refused.length,
              what: report.refused.map((r) => r.label).join(', '),
            }),
          });
        } else {
          setNotice({ tone: 'success', text: t('offline.synced', { count: report.sent }) });
        }
      }),
    [queryClient, venueId, setNotice, t],
  );
  const online = useOnline();
  const queued = useQueue();
  const snapshotAt = queryClient.getQueryState(['floor'])?.dataUpdatedAt;
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
    {
      to: '/kds' as const,
      icon: Flame,
      label: t('nav.kds'),
      badge: 0,
      show: staff.modules.includes('kds') && canSeeOrders,
    },
  ].filter((n) => n.show);
  const initials = staff.fullName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <NoticeContext.Provider value={setNotice}>
      <div className="min-h-dvh bg-canvas pb-28 lg:pb-8 lg:pl-64">
        <header className="sticky top-0 z-20 bg-navy-900 text-white shadow-lg shadow-navy-950/20">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:px-8">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-blue-bright font-display text-sm font-bold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] font-semibold">{staff.venue.name}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-white/65">
                <span className="relative flex size-2" aria-hidden>
                  {live && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex size-2 rounded-full',
                      live ? 'bg-emerald-400' : 'bg-amber-400',
                    )}
                  />
                </span>
                {staff.fullName} · {live ? t('nav.live') : t('nav.offline')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void unlockSound().catch(() => undefined)}
              className={cn(
                'grid size-11 place-items-center rounded-xl transition-colors',
                sound ? 'text-emerald-300 hover:bg-white/10' : 'bg-amber-400/20 text-amber-300',
              )}
              title={sound ? t('ready.soundOn') : t('ready.soundOff')}
              aria-label={sound ? t('ready.soundOn') : t('ready.soundOff')}
            >
              {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
            <LanguageSwitch />
            {canManageStaff && (
              <button
                type="button"
                onClick={() => setDeviceOpen(true)}
                aria-label={t('pin.linkTitle')}
                title={t('pin.linkTitle')}
                className="grid size-11 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
              >
                <MonitorSmartphone className="size-[18px]" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              aria-label={isPinSession() ? t('pin.lock') : t('nav.logout')}
              title={isPinSession() ? t('pin.lock') : t('nav.logout')}
              className="grid size-11 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </header>
        {(!online || queued.pending > 0) && (
          // Opaque base under the tint: the list scrolls beneath this bar.
          <div role="status" className="sticky top-16 z-20 bg-canvas shadow-sm">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-[13px] font-semibold lg:px-8',
                online ? 'bg-primary/12 text-accent' : 'bg-amber-400/25 text-ink',
              )}
            >
              {online ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <WifiOff className="size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0">
                {online
                  ? t('offline.syncing', { count: queued.pending })
                  : t('offline.banner', {
                      time: snapshotAt ? formatTime(new Date(snapshotAt).toISOString()) : '—',
                    })}
                {!online &&
                  queued.pending > 0 &&
                  ` · ${t('offline.pending', { count: queued.pending })}`}
              </span>
            </div>
          </div>
        )}
        <div className="fixed inset-x-0 top-[4.5rem] z-40 mx-auto max-w-3xl px-4 lg:pl-64">
          <div className={notice ? 'rounded-xl bg-surface shadow-lg' : undefined}>
            <Notice notice={notice} />
          </div>
        </div>

        {/* Wide screens: the menu on the left. */}
        <nav
          aria-label={t('nav.tables')}
          className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-950 px-4 py-5 text-white lg:flex"
        >
          <p className="px-3 font-display text-xl font-bold tracking-tight">
            qafe<span className="text-blue-bright">.</span>
          </p>
          <p className="mt-1 px-3 text-xs text-white/50">{t('login.badge')}</p>
          <div className="mt-8 flex flex-col gap-1">
            {nav.map(({ to, icon: Icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="group relative flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/65 transition-colors hover:text-white data-[status=active]:text-white"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <m.span
                        layoutId="side-nav"
                        className="absolute inset-0 rounded-xl bg-white/10"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon className="relative size-5" aria-hidden />
                    <span className="relative flex-1">{label}</span>
                    {badge > 0 && (
                      <span className="relative grid min-w-6 place-items-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold">
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            ))}
          </div>
        </nav>

        <main className="mx-auto max-w-6xl lg:px-4">
          <Outlet />
        </main>

        {/* Phones and tablets: a floating bar within thumb reach. */}
        <nav
          aria-label={t('nav.tables')}
          className="pb-safe fixed inset-x-0 bottom-0 z-20 px-3 lg:hidden"
        >
          <div className="mx-auto mb-3 flex max-w-md rounded-[22px] border border-white/10 bg-navy-900/95 p-1.5 shadow-2xl shadow-navy-950/40 backdrop-blur">
            {nav.map(({ to, icon: Icon, label, badge }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-white/55 data-[status=active]:text-white"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <m.span
                        layoutId="bottom-nav"
                        className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary to-blue-brand"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    <Icon className="relative size-[22px]" aria-hidden />
                    <span className="relative">{label}</span>
                    <AnimatePresence>
                      {badge > 0 && (
                        <m.span
                          key={badge}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                          className="absolute top-1 left-1/2 ml-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-navy-900"
                        >
                          {badge}
                        </m.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </Link>
            ))}
          </div>
        </nav>

        <DeviceSheet open={deviceOpen} onClose={() => setDeviceOpen(false)} />
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
