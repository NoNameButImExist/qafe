import { CreateStaffRequest, type VenueStaff } from '@qafe/contracts';
import { KeyRound, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select, Sheet } from '@qafe/ui';
import { api, errorKey } from '../../lib/api';
import { generatePassword, generatePin, suggestUsername } from '../../lib/text';
import { Credentials } from './Credentials';
import { useStaffMutation } from './useStaffMutation';

/** FR-SEF-08: name, username, password or PIN, and role. No email is sent. */
export function CreateStaffSheet({ staff, onClose }: { staff: VenueStaff; onClose: () => void }) {
  const { t } = useTranslation();
  const defaultRole = staff.roles.find((r) => !r.isOwner) ?? staff.roles[0];
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [roleId, setRoleId] = useState(defaultRole?.id ?? '');
  const [usePassword, setUsePassword] = useState(true);
  const [password, setPassword] = useState(() => generatePassword());
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState(() => generatePin());

  const body = {
    fullName,
    username,
    roleId,
    password: usePassword ? password : undefined,
    pin: usePin ? pin : undefined,
  };
  const parsed = CreateStaffRequest.safeParse(body);
  const create = useStaffMutation(() => api<VenueStaff>('/venue/staff', { method: 'POST', body }));

  return (
    <Sheet
      open
      onClose={onClose}
      title={create.isSuccess ? t('staff.created') : t('staff.new')}
      footer={
        <div className="flex justify-end gap-3">
          {create.isSuccess ? (
            <Button onClick={onClose}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                form="staff-form"
                disabled={!parsed.success}
                loading={create.isPending}
              >
                {t('staff.create')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {create.isSuccess ? (
        <Credentials
          body={t('staff.createdBody')}
          username={username}
          password={body.password}
          pin={body.pin}
        />
      ) : (
        <form
          id="staff-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed.success) create.mutate(undefined);
          }}
        >
          {create.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {t(errorKey(create.error))}
            </p>
          )}
          <Field label={t('staff.fullName')} required>
            {({ id }) => (
              <Input
                id={id}
                autoFocus
                maxLength={120}
                autoComplete="off"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (!usernameEdited) setUsername(suggestUsername(e.target.value));
                }}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('staff.username')} hint={t('staff.usernameHint')} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={30}
                  value={username}
                  onChange={(e) => {
                    setUsernameEdited(true);
                    setUsername(e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label={t('staff.role')}>
              {({ id }) => (
                <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {staff.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
              />
              {t('staff.usePassword')}
            </label>
            {usePassword && (
              <SecretInput
                label={t('staff.password')}
                hint={t('staff.passwordHint')}
                value={password}
                onChange={setPassword}
                onGenerate={() => setPassword(generatePassword())}
              />
            )}
            <label className="mt-1 flex items-center gap-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={usePin}
                onChange={(e) => setUsePin(e.target.checked)}
              />
              {t('staff.usePin')}
            </label>
            {usePin && (
              <SecretInput
                label={t('staff.pin')}
                hint={t('staff.pinHint')}
                value={pin}
                numeric
                onChange={setPin}
                onGenerate={() => setPin(generatePin())}
              />
            )}
            {!usePassword && !usePin && (
              <p className="text-xs font-medium text-danger">{t('staff.needLogin')}</p>
            )}
          </fieldset>
        </form>
      )}
    </Sheet>
  );
}

export function SecretInput({
  label,
  hint,
  value,
  numeric,
  onChange,
  onGenerate,
}: {
  label: string;
  hint: string;
  value: string;
  numeric?: boolean;
  onChange: (value: string) => void;
  onGenerate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          className="font-mono"
          inputMode={numeric ? 'numeric' : undefined}
          maxLength={numeric ? 6 : 200}
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          icon={<KeyRound className="size-4" />}
          trailing={
            <button
              type="button"
              onClick={onGenerate}
              aria-label={t('staff.generate')}
              title={t('staff.generate')}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              <RefreshCw className="size-4" />
            </button>
          }
        />
      )}
    </Field>
  );
}
