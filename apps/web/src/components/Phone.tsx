import type { ReactNode } from 'react';

interface PhoneProps {
  children: ReactNode;
  label: string;
  className?: string;
}

export function Phone({ children, label, className = '' }: PhoneProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative aspect-[9/19] w-full rounded-[2.6rem] border border-fg/15 bg-linear-to-b from-phone-top to-phone-bottom p-2 shadow-phone ${className}`}
    >
      <div className="relative h-full overflow-hidden rounded-[2.1rem] bg-surface">
        <div className="absolute top-2 left-1/2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        <div className="h-full pt-9" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
