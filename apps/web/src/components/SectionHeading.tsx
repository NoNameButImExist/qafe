import { motion } from 'motion/react';

interface SectionHeadingProps {
  index: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onNavy?: boolean;
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// "01 / Kako radi" label, then a title whose lines rise into place.
export function SectionHeading({
  index,
  eyebrow,
  title,
  subtitle,
  onNavy = false,
  className = '',
}: SectionHeadingProps) {
  const words = title.split(' ');
  return (
    <div className={`max-w-3xl ${className}`}>
      <motion.p
        className={`mb-6 inline-flex items-center gap-3 rounded-full border px-3.5 py-1.5 text-sm font-medium ${onNavy ? 'border-navy-line text-on-navy-muted' : 'border-line-strong bg-surface text-muted'}`}
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <span className={`font-display font-bold ${onNavy ? 'text-highlight' : 'text-bright'}`}>
          {index}
        </span>
        <span className={`h-3.5 w-px ${onNavy ? 'bg-navy-line' : 'bg-line-strong'}`} />
        {eyebrow}
      </motion.p>
      {/* The heading triggers the reveal: the words start clipped out of view, so they
          would never count as visible themselves. */}
      <motion.h2
        className={`font-display text-[clamp(2.4rem,5.4vw,4.5rem)] leading-[1.02] font-bold text-balance ${onNavy ? 'text-on-navy' : 'text-ink'}`}
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: '-60px' }}
      >
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="mr-[0.24em] inline-block overflow-hidden pb-[0.1em] align-bottom"
          >
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: '110%' },
                shown: { y: 0, transition: { duration: 0.8, delay: i * 0.04, ease: EASE } },
              }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </motion.h2>
      {subtitle && (
        <motion.p
          className={`mt-6 max-w-2xl text-lg text-pretty sm:text-xl ${onNavy ? 'text-on-navy-muted' : 'text-muted'}`}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
