import { motion } from 'motion/react';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'left' }: SectionHeadingProps) {
  const words = title.split(' ');
  const centered = align === 'center';
  return (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <motion.p
        className={`mb-5 inline-flex items-center gap-2 font-mono text-xs tracking-[0.25em] text-primary uppercase ${centered ? 'justify-center' : ''}`}
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <span className="h-px w-8 bg-primary" />
        {eyebrow}
      </motion.p>
      <h2 className="font-display text-4xl leading-[1.02] font-bold text-balance sm:text-5xl lg:text-6xl">
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="mr-[0.22em] inline-block overflow-hidden pb-[0.08em] align-bottom"
          >
            <motion.span
              className="inline-block"
              initial={{ y: '105%' }}
              whileInView={{ y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.75, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              {word}
            </motion.span>
          </span>
        ))}
      </h2>
      {subtitle && (
        <motion.p
          className="mt-6 text-lg text-pretty text-muted"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.25 }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}
