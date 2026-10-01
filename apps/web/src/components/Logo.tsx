export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--color-primary)" />
        <circle
          cx="30"
          cy="30"
          r="14"
          fill="none"
          stroke="var(--color-on-primary)"
          strokeWidth="7"
        />
        <path
          d="M38 38l10 10"
          stroke="var(--color-on-primary)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-2xl font-extrabold">qafe</span>
    </span>
  );
}
