import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** − 2 + with 44 px targets (NFR-15). */
export function Stepper({
  value,
  min = 1,
  max = 50,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const button =
    'grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink disabled:opacity-40';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('item.quantity')}>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t('item.decrease')}
      >
        <Minus className="size-4" />
      </button>
      <span
        className="w-8 text-center text-base font-semibold text-ink tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={t('item.increase')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
