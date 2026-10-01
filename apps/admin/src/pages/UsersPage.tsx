import type { AdminUser } from '@qafe/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  CircleAlert,
  Ellipsis,
  KeyRound,
  Search,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResetPasswordSheet } from '../components/ResetPasswordSheet';
import {
  Card,
  cn,
  ConfirmDialog,
  Input,
  Menu,
  MenuItem,
  Notice,
  Pagination,
  Segmented,
  useNotice,
} from '@qafe/ui';
import { api, errorKey } from '../lib/api';
import { formatDate } from '../lib/format';
import { usersQuery } from '../lib/queries';
import { initials } from '../lib/text';
import { useUser } from '../lib/useAuth';
import { useSearchText } from '../lib/useSearchText';
import type { UsersSearch } from '../lib/usersSearch';

const PAGE_SIZE = 20;

/** FR-ADM-09: every account, with blocking and password reset. */
export function UsersPage() {
  const { t } = useTranslation();
  const me = useUser();
  const search = useSearch({ from: '/app/users' });
  const navigate = useNavigate({ from: '/users' });
  const queryClient = useQueryClient();
  const [notice, setNotice] = useNotice();
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

  const setFilter = (patch: Partial<UsersSearch>) =>
    void navigate({ search: (s) => ({ ...s, ...patch, page: undefined }) });
  const [text, setText] = useSearchText(
    search.q,
    useCallback(
      (q) => void navigate({ search: (s) => ({ ...s, q, page: undefined }), replace: true }),
      [navigate],
    ),
  );

  const page = search.page ?? 1;
  const users = useQuery(
    usersQuery({
      search: search.q,
      kind: search.kind,
      status: search.status,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const setActive = useMutation({
    mutationFn: (user: AdminUser) =>
      api<void>(`/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { active: !user.isActive },
      }),
    onSuccess: (_, user) => {
      setNotice({
        tone: 'success',
        text: t(user.isActive ? 'users.blockedNotice' : 'users.unblockedNotice', {
          name: user.fullName,
        }),
      });
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      setConfirm(null);
      setNotice({ tone: 'error', text: t(errorKey(error)) });
    },
  });

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('users.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">{t('users.subtitle')}</p>

      <Notice notice={notice} className="mt-6" />

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              aria-label={t('users.searchPlaceholder')}
              icon={<Search className="size-4" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={t('users.columns.type')}
              value={search.kind}
              onChange={(kind) => setFilter({ kind })}
              options={[
                { value: undefined, label: t('users.kind.all') },
                { value: 'platform', label: t('users.kind.platform') },
                { value: 'staff', label: t('users.kind.staff') },
              ]}
            />
            <Segmented
              label={t('users.columns.status')}
              value={search.status}
              onChange={(status) => setFilter({ status })}
              options={[
                { value: undefined, label: t('users.status.all') },
                { value: 'active', label: t('users.status.active') },
                { value: 'blocked', label: t('users.status.blocked') },
              ]}
            />
          </div>
        </div>

        {users.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm text-danger">
            <CircleAlert className="size-6" />
            {t(errorKey(users.error))}
          </div>
        ) : users.data && users.data.items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
              <Users className="size-6" />
            </span>
            <p className="mt-4 text-sm text-muted">{t('users.empty')}</p>
          </div>
        ) : (
          <>
            <ul
              className={cn(
                'flex flex-col divide-y divide-line',
                users.isPlaceholderData && 'opacity-60',
              )}
            >
              <li
                className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-4 px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase lg:grid"
                aria-hidden
              >
                <span>{t('users.columns.user')}</span>
                <span>{t('users.columns.type')}</span>
                <span>{t('users.columns.venues')}</span>
                <span>{t('users.columns.status')}</span>
                <span>{t('users.columns.lastLogin')}</span>
                <span />
              </li>
              {(users.data?.items ?? Array.from({ length: 5 }, () => null)).map((user, i) =>
                user ? (
                  <UserRow
                    key={user.id}
                    user={user}
                    isMe={user.id === me.id}
                    onToggle={() => setConfirm(user)}
                    onReset={() => setResetFor(user)}
                  />
                ) : (
                  <li key={i} className="px-5 py-3.5">
                    <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
                  </li>
                ),
              )}
            </ul>
            <Pagination
              summary={t('users.count', { count: users.data?.total ?? 0 })}
              page={page}
              pageSize={PAGE_SIZE}
              total={users.data?.total ?? 0}
              onPage={(p) =>
                void navigate({ search: (s) => ({ ...s, page: p > 1 ? p : undefined }) })
              }
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={t(confirm?.isActive ? 'users.blockTitle' : 'users.unblockTitle', {
          name: confirm?.fullName ?? '',
        })}
        body={t(confirm?.isActive ? 'users.blockBody' : 'users.unblockBody')}
        confirmLabel={t(confirm?.isActive ? 'users.block' : 'users.unblock')}
        tone={confirm?.isActive ? 'danger' : 'primary'}
        loading={setActive.isPending}
        onConfirm={() => confirm && setActive.mutate(confirm)}
        onClose={() => setConfirm(null)}
      />
      <ResetPasswordSheet
        user={
          resetFor && {
            id: resetFor.id,
            fullName: resetFor.fullName,
            email: resetFor.email,
            login: resetFor.memberships[0] && {
              venueSlug: resetFor.memberships[0].venueSlug,
              username: resetFor.memberships[0].username,
            },
          }
        }
        onClose={() => setResetFor(null)}
        onDone={() => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />
    </div>
  );
}

function UserRow({
  user,
  isMe,
  onToggle,
  onReset,
}: {
  user: AdminUser;
  isMe: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-x-4 gap-y-2 px-5 py-3.5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem]">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold',
            user.kind === 'platform'
              ? 'bg-gradient-to-br from-navy-900 to-blue-brand text-white'
              : 'bg-surface-2 text-muted',
          )}
        >
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
            {user.fullName}
            {isMe && (
              <span className="rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold text-accent">
                {t('users.you')}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {user.email ?? `@${user.memberships[0]?.username ?? ''}`}
          </p>
        </div>
      </div>

      {/* One wrapped row of badges on phones; three table columns from lg up. */}
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:contents">
        <div className="flex flex-wrap items-center gap-1.5">
          {user.kind === 'platform' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-accent">
              <ShieldCheck className="size-3.5" />
              {t(`nav.role.${user.platformRole ?? 'support'}`)}
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
              {t('users.staffRole')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {user.memberships.map((m) => (
            <Link
              key={m.venueId}
              to="/venues/$venueId"
              params={{ venueId: m.venueId }}
              className="rounded-lg border border-line px-2 py-1 text-xs text-ink hover:border-primary/40 hover:text-accent"
            >
              {m.venueName} · <span className="text-muted">{m.role}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              user.isActive ? 'bg-success/12 text-success' : 'bg-danger/12 text-danger',
            )}
          >
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {user.isActive ? t('users.active') : t('users.blocked')}
          </span>
          {user.mustChangePassword && (
            <span className="rounded-full bg-warning/12 px-2 py-1 text-[11px] font-semibold text-warning">
              {t('users.mustChange')}
            </span>
          )}
        </div>
      </div>

      <p className="hidden text-[13px] text-muted lg:block">
        {user.lastLoginAt ? formatDate(user.lastLoginAt) : t('users.never')}
      </p>

      <div className="col-start-2 row-start-1 justify-self-end lg:col-auto lg:row-auto">
        {!isMe && (
          <Menu
            label={t('users.actions', { name: user.fullName })}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            trigger={<Ellipsis className="size-4" />}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<KeyRound className="size-4 text-muted" />}
                  onSelect={() => {
                    close();
                    onReset();
                  }}
                >
                  {t('users.resetPassword')}
                </MenuItem>
                <MenuItem
                  tone={user.isActive ? 'danger' : 'default'}
                  icon={
                    user.isActive ? (
                      <UserRoundX className="size-4" />
                    ) : (
                      <UserRoundCheck className="size-4 text-success" />
                    )
                  }
                  onSelect={() => {
                    close();
                    onToggle();
                  }}
                >
                  {user.isActive ? t('users.block') : t('users.unblock')}
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    </li>
  );
}
