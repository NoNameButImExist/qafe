import type { GuestSessionState } from '@qafe/contracts';
import { Button, ConfirmDialog, Input, Sheet } from '@qafe/ui';
import { Crown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { resubscribe } from '../lib/realtime';
import { useSessionAction } from '../lib/useAction';

/** Nickname, the devices at the table, host actions and leaving (FR-GOS-20, 22..24). */
export function TableSheet({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: GuestSessionState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(state.me.nickname);
  const [leaving, setLeaving] = useState(false);

  const rename = useSessionAction((name: string) =>
    api<GuestSessionState>('PUT', '/guest/session/nickname', { nickname: name }),
  );
  const host = useSessionAction(
    ({ action, id }: { action: 'approve' | 'decline' | 'host'; id: string }) =>
      action === 'host'
        ? api<GuestSessionState>('POST', '/guest/session/host', { guestId: id })
        : api<GuestSessionState>('POST', `/guest/session/guests/${id}/${action}`),
  );
  const leave = useSessionAction(async () => {
    await api<void>('DELETE', '/guest/session');
    resubscribe();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('table.title', { label: state.session.tableLabel })}
    >
      <div className="flex flex-col gap-8">
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (nickname.trim()) rename.mutate(nickname.trim());
          }}
        >
          <label htmlFor="nickname" className="text-[13px] font-semibold text-ink">
            {t('table.nickname')}
          </label>
          <div className="flex gap-2">
            <Input
              id="nickname"
              value={nickname}
              maxLength={30}
              onChange={(e) => setNickname(e.target.value)}
              aria-describedby="nickname-hint"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={rename.isPending}
              disabled={!nickname.trim() || nickname.trim() === state.me.nickname}
            >
              {t('common.save')}
            </Button>
          </div>
          <p id="nickname-hint" className="text-xs text-muted">
            {t('table.nicknameHint')}
          </p>
        </form>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink">{t('table.devices')}</h3>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {state.guests.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="flex-1 font-medium text-ink">
                  {g.nickname}
                  {g.isMe && <span className="ml-1.5 text-xs text-muted">({t('table.me')})</span>}
                </span>
                {g.isHost && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-accent">
                    <Crown className="size-3.5" aria-hidden /> {t('table.host')}
                  </span>
                )}
                {g.status === 'pending_approval' && (
                  <span className="text-xs font-semibold text-warning">{t('table.waiting')}</span>
                )}
                {state.me.isHost && !g.isMe && (
                  <div className="flex w-full gap-2">
                    {g.status === 'pending_approval' ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => host.mutate({ action: 'approve', id: g.id })}
                        >
                          {t('table.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => host.mutate({ action: 'decline', id: g.id })}
                        >
                          {t('table.decline')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => host.mutate({ action: 'host', id: g.id })}
                      >
                        {t('table.makeHost')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <Button variant="ghost" className="text-danger!" onClick={() => setLeaving(true)}>
          {t('table.leave')}
        </Button>
      </div>
      <ConfirmDialog
        open={leaving}
        title={t('table.leaveTitle')}
        body={t('table.leaveBody')}
        confirmLabel={t('table.leave')}
        tone="danger"
        loading={leave.isPending}
        onClose={() => setLeaving(false)}
        onConfirm={() => leave.mutate(undefined, { onSettled: () => setLeaving(false) })}
      />
    </Sheet>
  );
}
