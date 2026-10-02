import { Pin, type StaffMember, type VenueStaff } from '@qafe/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select, Sheet } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { generatePassword, generatePin } from '../../lib/text';
import { SecretInput } from './CreateStaffSheet';
import { Credentials } from './Credentials';
import { useStaffMutation } from './useStaffMutation';

/** FR-SEF-09: name and role. Owners cannot change their own role. */
export function EditMemberSheet({
  staff,
  member,
  isSelf,
  onClose,
  onSaved,
}: {
  staff: VenueStaff;
  member: StaffMember;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(member.fullName);
  const [roleId, setRoleId] = useState(member.roleId);
  const save = useStaffMutation(() =>
    api<VenueStaff>(`/venue/staff/${member.memberId}`, {
      method: 'PATCH',
      body: { fullName: fullName.trim(), ...(isSelf ? {} : { roleId }) },
    }),
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${t('staff.edit')}: ${member.fullName}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="member-form"
            disabled={fullName.trim().length < 2}
            loading={save.isPending}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form
        id="member-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: onSaved });
        }}
      >
        {save.isError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {t(errorKey(save.error))}
          </p>
        )}
        <Field label={t('staff.fullName')} required>
          {({ id }) => (
            <Input
              id={id}
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('staff.role')} hint={isSelf ? t('staff.selfHint') : undefined}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              disabled={isSelf}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              {staff.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Sheet>
  );
}

/** New password or new PIN; the value is shown once to pass on. */
export function SecretSheet({
  member,
  kind,
  onClose,
}: {
  member: StaffMember;
  kind: 'password' | 'pin';
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() =>
    kind === 'password' ? generatePassword() : generatePin(),
  );
  const valid = kind === 'password' ? value.length >= 8 : Pin.safeParse(value).success;
  const [requireChange, setRequireChange] = useState(true);
  const save = useStaffMutation(() =>
    kind === 'password'
      ? api<VenueStaff>(`/venue/staff/${member.memberId}/password`, {
          method: 'POST',
          body: { password: value, requirePasswordChange: requireChange },
        })
      : api<VenueStaff>(`/venue/staff/${member.memberId}/pin`, {
          method: 'PUT',
          body: { pin: value },
        }),
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        save.isSuccess
          ? t(kind === 'password' ? 'staff.passwordSet' : 'staff.pinSet')
          : t(kind === 'password' ? 'staff.passwordTitle' : 'staff.pinTitle', {
              name: member.fullName,
            })
      }
      footer={
        <div className="flex justify-end gap-3">
          {save.isSuccess ? (
            <Button onClick={onClose}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={!valid}
                loading={save.isPending}
                onClick={() => save.mutate(undefined)}
              >
                {t('staff.save')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {save.isSuccess ? (
        <Credentials
          body={t('staff.credentialsBody')}
          username={member.username}
          password={kind === 'password' ? value : undefined}
          pin={kind === 'pin' ? value : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            {t(kind === 'password' ? 'staff.passwordBody' : 'staff.pinBody')}
          </p>
          {save.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {t(errorKey(save.error))}
            </p>
          )}
          <SecretInput
            label={t(kind === 'password' ? 'staff.password' : 'staff.pin')}
            hint={t(kind === 'password' ? 'staff.passwordHint' : 'staff.pinHint')}
            numeric={kind === 'pin'}
            value={value}
            onChange={setValue}
            onGenerate={() => setValue(kind === 'password' ? generatePassword() : generatePin())}
          />
          {kind === 'password' && (
            <label className="flex items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                checked={requireChange}
                onChange={(e) => setRequireChange(e.target.checked)}
              />
              <span>
                <span className="font-semibold">{t('staff.requireChange')}</span>
                <span className="block text-xs text-muted">{t('staff.requireChangeHint')}</span>
              </span>
            </label>
          )}
        </div>
      )}
    </Sheet>
  );
}
