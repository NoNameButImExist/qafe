import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyRow } from '@qafe/ui';
import { venueHost } from '../../lib/format';
import { useStaff } from '../../lib/useAuth';

/** Sign-in details shown once after creating an account or setting a password or PIN. */
export function Credentials({
  body,
  username,
  password,
  pin,
}: {
  body: string;
  username: string;
  password?: string;
  pin?: string;
}) {
  const { t } = useTranslation();
  const { venue } = useStaff();
  return (
    <>
      <div className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-success/12 text-success">
          <CircleCheck className="size-7" />
        </span>
        <p className="mt-4 max-w-sm text-sm text-muted">{body}</p>
      </div>
      <dl className="mt-6 flex flex-col gap-3">
        <CopyRow label={t('staff.venue')} value={venueHost(venue.slug)} />
        <CopyRow label={t('staff.username')} value={username} />
        {password && <CopyRow label={t('staff.password')} value={password} secret />}
        {pin && <CopyRow label={t('staff.pin')} value={pin} secret />}
      </dl>
    </>
  );
}
