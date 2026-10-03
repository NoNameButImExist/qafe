import type { ReactNode } from 'react';
import { ArrowIcon } from './icons';

interface ButtonProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'outline' | 'ghost-navy';
  arrow?: boolean;
  className?: string;
}

const STYLES = {
  primary: 'bg-primary text-on-primary shadow-blue hover:bg-primary-hover',
  outline: 'border border-line-strong bg-surface/70 text-ink backdrop-blur hover:border-ink',
  'ghost-navy': 'border border-on-navy/25 text-on-navy hover:border-on-navy',
} as const;

// A link styled as a button. The arrow slides out and a copy slides in on hover.
export function Button({
  href,
  children,
  variant = 'primary',
  arrow = false,
  className = '',
}: ButtonProps) {
  return (
    <a
      href={href}
      className={`group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full px-6 py-3 font-semibold transition-[background-color,border-color,transform] duration-300 active:scale-[0.97] ${STYLES[variant]} ${className}`}
    >
      {children}
      {arrow && (
        <span className="relative grid size-5 place-items-center overflow-hidden" aria-hidden>
          <ArrowIcon className="size-4 transition-transform duration-300 group-hover:translate-x-5" />
          <ArrowIcon className="absolute size-4 -translate-x-5 transition-transform duration-300 group-hover:translate-x-0" />
        </span>
      )}
    </a>
  );
}
