import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorKey } from './api';
import { useNotify } from './notice';
import { runQueued, type QueuedAction } from './offline';

/**
 * A staff action: on success everything live is refetched (the socket also says so); an
 * error becomes a translated notice and a refetch, since it usually means stale data.
 */
export function useAction<V, R = void>(
  fn: (vars: V) => Promise<R>,
  success?: string | ((r: R) => string),
) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  const refresh = () =>
    Promise.all(
      ['floor', 'orders', 'session'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await refresh();
      if (success)
        notify({ tone: 'success', text: typeof success === 'string' ? success : success(result) });
    },
    onError: (error) => {
      notify({ tone: 'error', text: t(errorKey(error)) });
      void refresh();
    },
  });
}

/**
 * A one-tap action that also works without internet (NFR-05): sent at once when the API answers,
 * otherwise queued, shown on screen right away and sent when the connection is back.
 */
export function useQueuedAction<V>(
  build: (vars: V) => Omit<QueuedAction, 'id' | 'createdAt'>,
  success?: string,
) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  const refresh = () =>
    Promise.all(
      ['floor', 'orders', 'session', 'kds', 'menu'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  return useMutation({
    // TanStack Query pauses mutations while the browser is offline; this one queues itself.
    networkMode: 'always',
    mutationFn: (vars: V) => runQueued(queryClient, build(vars)),
    onSuccess: async (result) => {
      if (result === 'queued') {
        notify({ tone: 'success', text: t('offline.queued') });
        return;
      }
      await refresh();
      if (success) notify({ tone: 'success', text: success });
    },
    onError: (error) => {
      notify({ tone: 'error', text: t(errorKey(error)) });
      void refresh();
    },
  });
}
