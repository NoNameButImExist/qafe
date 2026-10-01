import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorKey } from './api';
import { useNotify } from './notice';

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
