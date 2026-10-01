import type { GuestSessionState } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNoticeContext } from './notice';
import { ApiError, errorKey } from './api';

/**
 * A guest action that answers with the new table state. The state replaces the cached one,
 * errors become a translated notice, and stale-state errors trigger a refetch.
 */
export function useSessionAction<V>(fn: (vars: V) => Promise<GuestSessionState | void>) {
  const queryClient = useQueryClient();
  const notify = useNoticeContext();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => {
      if (state) queryClient.setQueryData(['session'], state);
      else void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (error) => {
      notify({ tone: 'error', text: t(errorKey(error) as 'errors.unknown') });
      if (error instanceof ApiError && error.status !== 0) {
        void queryClient.invalidateQueries({ queryKey: ['session'] });
        if (error.code === 'item_unavailable')
          void queryClient.invalidateQueries({ queryKey: ['menu'] });
      }
    },
  });
}
