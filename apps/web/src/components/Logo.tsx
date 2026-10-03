// Mark (a QR finder square with a dot) and the same wordmark as `Brand` in @qafe/ui.
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
        <rect
          x="8"
          y="8"
          width="16"
          height="16"
          rx="4.5"
          fill="none"
          stroke="var(--color-on-primary)"
          strokeWidth="3"
        />
        <rect x="13" y="13" width="6" height="6" rx="1.6" fill="var(--color-highlight)" />
      </svg>
      <span className="font-display text-[1.4rem] leading-none font-bold tracking-tight">
        <span className="text-ink">qafe</span>
        <span className="text-bright">.ba</span>
      </span>
    </span>
  );
}
