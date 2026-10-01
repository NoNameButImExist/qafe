import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './theme';
import { cn } from './cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('common.theme.toggle')}
      title={isDark ? t('common.theme.light') : t('common.theme.dark')}
      className={cn(
        'grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink',
        className,
      )}
    >
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={cn(
        'flex h-10 items-center rounded-xl border border-line bg-surface p-1',
        className,
      )}
    >
      {(['bs', 'en'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          aria-pressed={i18n.language === lng}
          onClick={() => void i18n.changeLanguage(lng)}
          className={cn(
            'h-full rounded-lg px-2.5 text-xs font-bold uppercase transition-colors',
            i18n.language === lng ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink',
          )}
        >
          {lng}
        </button>
      ))}
    </div>
  );
}
