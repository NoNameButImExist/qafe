import type { LucideIcon } from 'lucide-react';
import { Brand } from './Brand';

interface AuthBrandPanelProps {
  tagline: string;
  badge: string;
  /** Headline lines; the last one is highlighted in brand blue. */
  lines: string[];
  subtitle: string;
  features: { icon: LucideIcon; label: string }[];
}

/** Left half of the sign-in screens on large screens: the look of the printed table cards. */
export function AuthBrandPanel({ tagline, badge, lines, subtitle, features }: AuthBrandPanelProps) {
  const last = lines.length - 1;
  return (
    <aside className="relative hidden w-1/2 flex-col overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 0.05) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div className="pointer-events-none absolute -top-40 -left-40 size-[560px] rounded-full bg-blue-brand/20 blur-[150px]" />
      <div className="pointer-events-none absolute top-1/3 -right-24 size-[320px] rounded-full bg-blue-bright/10 blur-[110px]" />

      <div className="relative z-10 p-10 xl:p-12">
        <Brand onDark className="text-3xl" />
        <p className="mt-2 text-xs font-medium tracking-[0.3em] text-white/70 uppercase">
          {tagline}
        </p>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-40 xl:px-16">
        <div className="animate-fade-up">
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-bright/30 bg-blue-bright/10 px-3.5 py-1.5 text-xs font-semibold text-blue-bright">
            <span className="size-1.5 animate-pulse rounded-full bg-blue-bright" />
            {badge}
          </span>
          <h2 className="font-display text-5xl leading-[1.08] font-bold tracking-tight xl:text-6xl">
            {lines.map((line, i) => (
              <span key={line} className={i === last ? 'block text-blue-bright' : 'block'}>
                {line}
              </span>
            ))}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">{subtitle}</p>
          <ul className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] py-5 backdrop-blur-sm">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2.5 px-3 text-center">
                <Icon className="size-7 text-blue-bright" strokeWidth={1.6} aria-hidden />
                <span className="text-xs leading-snug font-medium text-white/80">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Blue wave at the bottom, as on the printed table cards. */}
      <svg
        className="absolute inset-x-0 bottom-0 h-40 w-full"
        viewBox="0 0 800 160"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M0 110 C 220 40, 480 170, 800 60 L 800 160 L 0 160 Z"
          className="fill-blue-brand"
        />
        <path
          d="M0 132 C 260 80, 520 175, 800 100 L 800 160 L 0 160 Z"
          className="fill-blue-deep"
          opacity="0.55"
        />
      </svg>
    </aside>
  );
}
