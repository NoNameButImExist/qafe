import type { GuestSessionState } from '@qafe/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '../components/Message';
import { api, ApiError } from '../lib/api';
import { resubscribe } from '../lib/realtime';

/** /t/<token>: opens or joins the table's session (FR-GOS-01, 02, 20..23, 26). */
export function JoinScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const join = useMutation({
    mutationFn: (leaveCurrent: boolean) =>
      api<GuestSessionState>('POST', `/guest/tables/${token}/join`, {
        locale: i18n.language === 'en' ? 'en' : 'bs',
        leaveCurrent,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(['session'], state);
      resubscribe();
      onDone();
    },
  });

  // Once per page load, also under StrictMode's double effects.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    join.mutate(false);
  }, [join]);

  const error = join.error instanceof ApiError ? join.error : null;
  if (error?.code === 'table_not_found') {
    return <Message title={t('join.invalidTitle')} body={t('join.invalidBody')} />;
  }
  if (error?.code === 'device_blocked') {
    return <Message title={t('join.blockedTitle')} body={t('join.blockedBody')} />;
  }
  if (error?.code === 'active_elsewhere') {
    return (
      <Message
        title={t('join.elsewhereTitle')}
        body={t('join.elsewhereBody', {
          label: typeof error.details?.tableLabel === 'string' ? error.details.tableLabel : '',
        })}
        action={{
          label: t('join.elsewhereConfirm'),
          onClick: () => join.mutate(true),
          loading: join.isPending,
        }}
      />
    );
  }
  if (join.isError) {
    return (
      <Message
        title={t(error ? (`errors.${error.code}` as 'errors.unknown') : 'errors.unknown')}
        action={{ label: t('common.retry'), onClick: () => join.mutate(false) }}
      />
    );
  }
  return <Message loading title={t('join.joining')} />;
}
