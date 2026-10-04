import type { KdsOrder, KdsView } from '@qafe/contracts';
import { cn } from '@qafe/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, ChevronLeft, CircleCheck, Expand, Flame, History, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kdsQuery } from '../lib/queries';
import { setAlertsMuted } from '../lib/realtime';
import { beep, unlockSound, vibrate } from '../lib/sound';
import { useQueuedAction } from '../lib/useAction';
import { useCan } from '../lib/useAuth';

const STATION_KEY = 'qafe.staff.kdsStation';
const UNDO_MS = 10_000;

function storedStation(): string {
  try {
    return localStorage.getItem(STATION_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

/**
 * Bar and kitchen screen (KDS module, FR-KON-24..29): items of accepted orders for one
 * station, grouped by order, oldest first. One tap marks an item ready; the last tap can be
 * undone for 10 seconds. Cards turn amber and red as waiting passes the owner's thresholds.
 */
export function KdsPage() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [station, setStation] = useState(storedStation);
  const [showDone, setShowDone] = useState(false);
  const view = useQuery({ ...kdsQuery(station === 'all' ? undefined : station), enabled: started });
  const now = useNow(started);
  const canWork = useCan('orders.update');
  const [undo, setUndo] = useState<{ itemId: string; name: string; until: number } | null>(null);

  // Waiter alerts stay quiet here; the screen rings for new items itself.
  useEffect(() => {
    setAlertsMuted(true);
    return () => setAlertsMuted(false);
  }, []);
  useNewItemAlert(view.data);
  useWakeLock(started);

  // Taps on the KDS also work without internet (queued, NFR-05).
  const ready = useQueuedAction((itemId: string) => ({
    method: 'POST',
    path: `/staff/kds/items/${itemId}/ready`,
    patch: { id: itemId, fields: { status: 'ready' } },
    label: t('kds.title'),
  }));
  const undoReady = useQueuedAction((itemId: string) => ({
    method: 'POST',
    path: `/staff/kds/items/${itemId}/undo`,
    patch: { id: itemId, fields: { status: 'preparing' } },
    label: t('kds.title'),
  }));
  const start = useQueuedAction((orderId: string) => ({
    method: 'POST',
    path: `/staff/kds/orders/${orderId}/start`,
    query: { station: station === 'all' ? undefined : station },
    patch: { id: orderId, fields: { started: true } },
    label: t('kds.title'),
  }));

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

  const choose = (id: string) => {
    setStation(id);
    try {
      localStorage.setItem(STATION_KEY, id);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  };

  if (!started) {
    return (
      <main className="grid min-h-dvh place-items-center bg-navy-950 p-6 text-white">
        <div className="max-w-sm text-center">
          <Flame className="mx-auto size-12 text-warning" aria-hidden />
          <h1 className="mt-4 font-display text-2xl font-bold">{t('kds.title')}</h1>
          <p className="mt-2 text-sm text-white/70">{t('kds.startHint')}</p>
          <button
            type="button"
            onClick={() => {
              void unlockSound().catch(() => undefined);
              void document.documentElement.requestFullscreen?.().catch(() => undefined);
              setStarted(true);
            }}
            className="mt-6 h-16 w-full rounded-2xl bg-primary text-lg font-bold text-on-primary"
          >
            {t('kds.start')}
          </button>
          <Link to="/" className="mt-4 inline-block min-h-11 text-sm text-white/60 underline">
            {t('kds.back')}
          </Link>
        </div>
      </main>
    );
  }

  const data = view.data;
  const orders = showDone ? (data?.done ?? []) : (data?.open ?? []);

  return (
    <main className="min-h-dvh bg-navy-950 text-white">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-navy-950/95 px-4 py-3 backdrop-blur">
        <Link
          to="/"
          aria-label={t('kds.back')}
          className="grid size-11 place-items-center rounded-xl bg-white/10"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div
          className="no-scrollbar flex flex-1 gap-2 overflow-x-auto"
          role="group"
          aria-label={t('kds.station')}
        >
          {[{ id: 'all', name: t('kds.allStations') }, ...(data?.stations ?? [])].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={station === s.id}
              onClick={() => choose(s.id)}
              className={cn(
                'h-11 shrink-0 rounded-xl px-4 text-sm font-bold',
                station === s.id ? 'bg-primary text-on-primary' : 'bg-white/10 text-white/80',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={showDone}
          onClick={() => setShowDone((v) => !v)}
          className={cn(
            'flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold',
            showDone ? 'bg-success text-white' : 'bg-white/10 text-white/80',
          )}
        >
          <History className="size-4" aria-hidden /> {t('kds.done')}
        </button>
        <button
          type="button"
          aria-label={t('kds.fullscreen')}
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className="grid size-11 place-items-center rounded-xl bg-white/10"
        >
          <Expand className="size-5" />
        </button>
      </header>

      {!data ? (
        <p className="p-8 text-white/60">{t('common.loading')}</p>
      ) : orders.length === 0 ? (
        <p className="grid min-h-[60dvh] place-items-center text-xl font-semibold text-white/40">
          {showDone ? t('kds.noneDone') : t('kds.empty')}
        </p>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order) => (
            <OrderTicket
              key={order.orderId}
              order={order}
              view={data}
              now={now}
              finished={showDone}
              canWork={canWork}
              onStart={() => start.mutate(order.orderId)}
              onReady={(item) => {
                ready.mutate(item.id, {
                  onSuccess: () =>
                    setUndo({ itemId: item.id, name: item.name, until: Date.now() + UNDO_MS }),
                });
              }}
            />
          ))}
        </div>
      )}

      {undo && (
        <div className="fixed inset-x-0 bottom-4 z-20 mx-auto flex w-fit items-center gap-4 rounded-2xl bg-white px-5 py-3 text-ink shadow-2xl">
          <CircleCheck className="size-5 text-success" aria-hidden />
          <span className="font-semibold">{t('kds.readyToast', { name: undo.name })}</span>
          <button
            type="button"
            onClick={() => {
              undoReady.mutate(undo.itemId);
              setUndo(null);
            }}
            className="h-11 rounded-xl bg-navy-900 px-4 text-sm font-bold text-white"
          >
            {t('kds.undo', { seconds: Math.max(0, Math.ceil((undo.until - now) / 1000)) })}
          </button>
        </div>
      )}
    </main>
  );
}

function OrderTicket({
  order,
  view,
  now,
  finished,
  canWork,
  onStart,
  onReady,
}: {
  order: KdsOrder;
  view: KdsView;
  now: number;
  finished: boolean;
  canWork: boolean;
  onStart: () => void;
  onReady: (item: KdsOrder['items'][number]) => void;
}) {
  const { t } = useTranslation();
  const minutes = Math.max(0, Math.floor((now - Date.parse(order.acceptedAt)) / 60_000));
  const level = finished
    ? 'done'
    : minutes >= view.criticalMinutes
      ? 'critical'
      : minutes >= view.warningMinutes
        ? 'warning'
        : 'normal';
  const pending = order.items.some((i) => i.status === 'pending');

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border-2 bg-navy-900',
        level === 'critical' && 'border-danger shadow-[0_0_0_4px] shadow-danger/25',
        level === 'warning' && 'border-warning',
        level === 'normal' && 'border-white/10',
        level === 'done' && 'border-white/10 opacity-70',
      )}
    >
      <header
        className={cn(
          'flex items-baseline gap-3 rounded-t-xl px-4 py-3',
          level === 'critical' && 'bg-danger',
          level === 'warning' && 'bg-warning text-navy-950',
          (level === 'normal' || level === 'done') && 'bg-white/5',
        )}
      >
        <span className="font-display text-3xl font-black">{order.tableLabel}</span>
        <span className="text-sm font-semibold opacity-80">#{order.number}</span>
        <span className="ml-auto text-lg font-bold tabular-nums">
          {minutes} min
          {level === 'critical' && <span className="ml-2 text-xs uppercase">{t('kds.late')}</span>}
        </span>
      </header>
      {order.note && <p className="px-4 pt-2 text-sm font-semibold text-warning">„{order.note}"</p>}
      <ul className="flex flex-1 flex-col gap-1 p-2">
        {order.items.map((item) => {
          const isReady = item.status === 'ready' || item.status === 'served';
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={isReady || finished || !canWork}
                onClick={() => onReady(item)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  isReady ? 'text-white/40' : 'bg-white/5 hover:bg-white/10 active:bg-success/30',
                )}
              >
                <span className="font-display text-2xl font-black tabular-nums">
                  {item.quantity}×
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-lg font-bold', isReady && 'line-through')}>
                    {item.name}
                  </span>
                  {item.modifiers.length > 0 && (
                    <span className="block text-sm text-white/70">{item.modifiers.join(', ')}</span>
                  )}
                  {item.note && (
                    <span className="block text-sm font-semibold text-warning">„{item.note}"</span>
                  )}
                </span>
                {isReady ? (
                  <Check className="size-6 text-success" aria-label={t('kds.itemReady')} />
                ) : (
                  <span className="text-xs font-semibold text-white/50">{t('kds.tapReady')}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!finished && pending && canWork && (
        <button
          type="button"
          onClick={onStart}
          className="m-2 mt-0 flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-bold"
        >
          <Play className="size-4" aria-hidden /> {t('kds.startOrder')}
        </button>
      )}
    </article>
  );
}

/** Ticks every second: waiting minutes, colours and the undo countdown move on. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** A sound (and vibration) when items appear that were not on the screen before (FR-KON-28). */
function useNewItemAlert(view: KdsView | undefined) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!view) return;
    const ids = new Set(view.open.flatMap((o) => o.items.map((i) => i.id)));
    const before = seen.current;
    seen.current = ids;
    if (before && [...ids].some((id) => !before.has(id))) {
      beep();
      vibrate();
    }
  }, [view]);
}

/** Keeps the screen on while the KDS runs (FR-KON-28); taken again after the tab is shown. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
