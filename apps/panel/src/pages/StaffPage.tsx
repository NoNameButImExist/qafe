import type { StaffMember } from '@qafe/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  Crown,
  Ellipsis,
  KeyRound,
  Pencil,
  Plus,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, cn, ConfirmDialog, Menu, MenuItem, Notice, useNotice } from '@qafe/ui';
import { CreateStaffSheet } from '../components/staff/CreateStaffSheet';
import { EditMemberSheet, SecretSheet } from '../components/staff/MemberSheets';
import { StaffDevices } from '../components/staff/StaffDevices';
import { useStaffMutation } from '../components/staff/useStaffMutation';
import { api, errorKey } from '../lib/api';
import { formatDate } from '../lib/format';
import { staffQuery } from '../lib/queries';
import { initials } from '../lib/text';
import { useCan, useStaff } from '../lib/useAuth';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; member: StaffMember }
  | { kind: 'password' | 'pin'; member: StaffMember }
  | { kind: 'deactivate'; member: StaffMember }
  | null;

/** FR-SEF-08, FR-SEF-09: staff accounts of the venue. */
export function StaffPage() {
  const { t, i18n } = useTranslation();
  const me = useStaff();
  const canManage = useCan('staff.manage');
  const staff = useQuery({ ...staffQuery, enabled: canManage });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useNotice();
  const fail = (error: unknown) => setNotice({ tone: 'error', text: t(errorKey(error)) });

  const setActive = useStaffMutation(
    ({ member, active }: { member: StaffMember; active: boolean }) =>
      api(`/venue/staff/${member.memberId}`, { method: 'PATCH', body: { isActive: active } }),
    fail,
  );
  const removePin = useStaffMutation(
    (member: StaffMember) => api(`/venue/staff/${member.memberId}/pin`, { method: 'DELETE' }),
    fail,
  );

  if (!canManage)
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
        {t('common.noPermission')}
      </p>
    );
  const close = () => setDialog(null);
  const data = staff.data;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
            {t('staff.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('staff.subtitle')}</p>
        </div>
        {data && (
          <Button icon={<Plus className="size-4" />} onClick={() => setDialog({ kind: 'create' })}>
            {t('staff.new')}
          </Button>
        )}
      </div>

      <Notice notice={notice} className="mt-6" />

      {staff.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(staff.error))}
        </Card>
      ) : (
        <Card className="mt-6">
          <ul className="flex flex-col divide-y divide-line">
            {(data?.members ?? Array.from({ length: 3 }, () => null)).map((m, i) =>
              m ? (
                <li
                  key={m.memberId}
                  className={cn('flex items-center gap-3 px-5 py-4', !m.isActive && 'opacity-60')}
                >
                  <span
                    className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold',
                      m.isOwner
                        ? 'bg-gradient-to-br from-navy-900 to-blue-brand text-white'
                        : 'bg-surface-2 text-muted',
                    )}
                  >
                    {initials(m.fullName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                      {m.fullName}
                      {m.isOwner && (
                        <Crown className="size-3.5 text-warning" aria-label={t('staff.owner')} />
                      )}
                      {m.memberId === me.memberId && (
                        <span className="rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold text-accent">
                          {t('staff.you')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      @{m.username} ·{' '}
                      {m.lastLoginAt
                        ? t('staff.lastLogin', { date: formatDate(m.lastLoginAt, i18n.language) })
                        : t('staff.neverLoggedIn')}
                    </p>
                  </div>
                  <div className="hidden flex-wrap items-center justify-end gap-1.5 sm:flex">
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        m.isOwner ? 'bg-primary/12 text-accent' : 'bg-surface-2 text-muted',
                      )}
                    >
                      {m.role}
                    </span>
                    {m.hasPin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">
                        <KeyRound className="size-3" />
                        {t('staff.pin')}
                      </span>
                    )}
                    {!m.userActive ? (
                      <span className="rounded-full bg-danger/12 px-2 py-1 text-[11px] font-semibold text-danger">
                        {t('staff.blocked')}
                      </span>
                    ) : (
                      !m.isActive && (
                        <span className="rounded-full bg-muted/15 px-2 py-1 text-[11px] font-semibold text-muted">
                          {t('staff.inactive')}
                        </span>
                      )
                    )}
                  </div>
                  <Menu
                    label={t('staff.actions', { name: m.fullName })}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                    trigger={<Ellipsis className="size-4" />}
                  >
                    {(closeMenu) => {
                      const run = (fn: () => void) => () => {
                        closeMenu();
                        fn();
                      };
                      const self = m.memberId === me.memberId;
                      return (
                        <>
                          <MenuItem
                            icon={<Pencil className="size-4 text-muted" />}
                            onSelect={run(() => setDialog({ kind: 'edit', member: m }))}
                          >
                            {t('staff.edit')}
                          </MenuItem>
                          <MenuItem
                            icon={<KeyRound className="size-4 text-muted" />}
                            onSelect={run(() => setDialog({ kind: 'password', member: m }))}
                          >
                            {t('staff.newPassword')}
                          </MenuItem>
                          <MenuItem
                            icon={<KeyRound className="size-4 text-muted" />}
                            onSelect={run(() => setDialog({ kind: 'pin', member: m }))}
                          >
                            {t('staff.setPin')}
                          </MenuItem>
                          {m.hasPin && (
                            <MenuItem
                              icon={<KeyRound className="size-4 text-muted" />}
                              onSelect={run(() =>
                                removePin.mutate(m, {
                                  onSuccess: () =>
                                    setNotice({
                                      tone: 'success',
                                      text: t('staff.removedPin', { name: m.fullName }),
                                    }),
                                }),
                              )}
                            >
                              {t('staff.removePin')}
                            </MenuItem>
                          )}
                          {!self &&
                            (m.isActive ? (
                              <MenuItem
                                tone="danger"
                                icon={<UserRoundX className="size-4" />}
                                onSelect={run(() => setDialog({ kind: 'deactivate', member: m }))}
                              >
                                {t('staff.deactivate')}
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<UserRoundCheck className="size-4 text-success" />}
                                onSelect={run(() => setActive.mutate({ member: m, active: true }))}
                              >
                                {t('staff.activate')}
                              </MenuItem>
                            ))}
                        </>
                      );
                    }}
                  </Menu>
                </li>
              ) : (
                <li key={i} className="px-5 py-4">
                  <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
                </li>
              ),
            )}
          </ul>
          {data && (
            <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-muted">
              <UsersRound className="size-4" />
              {t('staff.count', { count: data.members.length })}
            </p>
          )}
        </Card>
      )}

      {canManage && <StaffDevices onError={(text) => setNotice({ tone: 'error', text })} />}

      {data && dialog?.kind === 'create' && <CreateStaffSheet staff={data} onClose={close} />}
      {data && dialog?.kind === 'edit' && (
        <EditMemberSheet
          staff={data}
          member={dialog.member}
          isSelf={dialog.member.memberId === me.memberId}
          onClose={close}
          onSaved={() => {
            close();
            setNotice({
              tone: 'success',
              text: t('staff.updated', { name: dialog.member.fullName }),
            });
          }}
        />
      )}
      {(dialog?.kind === 'password' || dialog?.kind === 'pin') && (
        <SecretSheet member={dialog.member} kind={dialog.kind} onClose={close} />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'deactivate'}
        title={t('staff.deactivateTitle', {
          name: dialog?.kind === 'deactivate' ? dialog.member.fullName : '',
        })}
        body={t('staff.deactivateBody')}
        confirmLabel={t('staff.deactivate')}
        tone="danger"
        loading={setActive.isPending}
        onConfirm={() =>
          dialog?.kind === 'deactivate' &&
          setActive.mutate({ member: dialog.member, active: false }, { onSettled: close })
        }
        onClose={close}
      />
    </div>
  );
}
