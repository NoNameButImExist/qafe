import { cn } from './cn';

interface SegmentedProps<T extends string | undefined> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A row of toggle buttons for a single choice (filters). */
export function Segmented<T extends string | undefined>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex h-11 items-center overflow-x-auto rounded-xl bg-surface-2 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value ?? 'all'}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-full shrink-0 rounded-lg px-3 text-[13px] font-semibold transition-colors',
            value === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
