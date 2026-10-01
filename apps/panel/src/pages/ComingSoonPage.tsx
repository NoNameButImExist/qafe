import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@qafe/ui';

export function ComingSoonPage({ title, refs }: { title: string; refs: string }) {
  const { t } = useTranslation();
  return (
    <div className="animate-fade-up">
      <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
      <Card className="mt-6 flex flex-col items-center px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-accent">
          <Sparkles className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-lg font-semibold text-ink">
          {t('comingSoon.title')}
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted">{t('comingSoon.body', { refs })}</p>
      </Card>
    </div>
  );
}
