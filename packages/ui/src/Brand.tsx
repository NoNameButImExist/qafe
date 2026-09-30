import { cn } from './cn';

/**
 * Text wordmark until the final logo arrives. Replace the body of this component
 * with the logo image; every screen uses it through here.
 */
export function Brand({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={cn('font-display text-xl font-bold tracking-tight', className)}
      aria-label="qafe.ba"
    >
      <span className={onDark ? 'text-white' : 'text-ink'}>Qafe</span>
      <span className={onDark ? 'text-blue-bright' : 'text-blue-brand dark:text-blue-bright'}>
        .ba
      </span>
    </span>
  );
}
