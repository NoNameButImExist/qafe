import type { ReactNode } from 'react';

interface PhoneProps {
  children: ReactNode;
  /** Accessible description of what the screen shows; the screen itself is decorative. */
  label?: string;
  className?: string;
  screenClassName?: string;
}

/**
 * A phone frame whose screen scales with its width: the screen is a size container and its
 * base font size is a share of that width, so everything inside sized in `em` scales along.
 */
export function Phone({ children, label, className = '', screenClassName = '' }: PhoneProps) {
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`relative aspect-[9/19] w-full rounded-[14%/6.6%] bg-phone p-[3.2%] shadow-phone ${className}`}
    >
      <span className="absolute top-[18%] -left-[1.2%] h-[7%] w-[1.4%] rounded-l bg-phone-edge" />
      <span className="absolute top-[28%] -left-[1.2%] h-[11%] w-[1.4%] rounded-l bg-phone-edge" />
      <span className="absolute top-[24%] -right-[1.2%] h-[13%] w-[1.4%] rounded-r bg-phone-edge" />
      <div
        className={`relative h-full overflow-hidden rounded-[11.5%/5.4%] bg-surface text-ink [container-type:inline-size] ${screenClassName}`}
      >
        <div className="h-full" aria-hidden style={{ fontSize: 'clamp(7px, 4.6cqw, 17px)' }}>
          {children}
        </div>
        <span className="pointer-events-none absolute top-[1.6%] left-1/2 z-30 h-[3.4%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
      </div>
    </div>
  );
}
