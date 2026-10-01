import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModuleIcon } from '../components/ModuleIcon';
import { Card, StatusBadge } from '@qafe/ui';
import { errorKey } from '../lib/api';
import { venueHost } from '../lib/format';
import { modulesQuery } from '../lib/queries';

/** FR-ADM-06: the optional modules and where they are switched on. */
export function ModulesPage() {
  const { t } = useTranslation();
  const modules = useQuery(modulesQuery);

  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-[28px] leading-tight font-bold text-ink">
        {t('modules.title')}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {t('modules.subtitle')} {t('modules.manageHint')}
      </p>

      {modules.isError ? (
        <Card className="mt-6 flex items-center gap-3 p-5 text-sm text-danger">
          <CircleAlert className="size-5" />
          {t(errorKey(modules.error))}
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {(modules.data ?? Array.from({ length: 3 }, () => null)).map((m, i) =>
            m ? (
              <Card key={m.code} className="flex flex-col p-6">
                <div className="flex items-start gap-3">
                  <ModuleIcon code={m.code} active={m.venues.length > 0} className="size-12" />
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-ink">
                      {t(`modules.names.${m.code}`, { defaultValue: m.name })}
                    </h2>
                    <p className="mt-0.5 text-xs font-semibold text-accent">
                      {m.venues.length > 0
                        ? t('modules.usedBy', { count: m.venues.length })
                        : t('modules.notUsed')}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-muted">
                  {t(`modules.descriptions.${m.code}`, { defaultValue: m.description ?? '' })}
                </p>
                {m.venues.length > 0 && (
                  <ul className="mt-5 flex flex-col divide-y divide-line border-t border-line">
                    {m.venues.map((v) => (
                      <li key={v.id}>
                        <Link
                          to="/venues/$venueId"
                          params={{ venueId: v.id }}
                          className="group flex items-center justify-between gap-3 py-2.5"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink group-hover:text-accent">
                              {v.name}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {venueHost(v.slug)}
                            </span>
                          </span>
                          <StatusBadge status={v.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : (
              <Card key={i} className="h-56 animate-pulse" />
            ),
          )}
        </div>
      )}
    </div>
  );
}
