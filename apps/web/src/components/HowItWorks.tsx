import { motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react';
import { useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { Phone } from './Phone';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';
import { StepScreen } from './StepScreens';

export function HowItWorks() {
  const { t } = useI18n();
  const steps = t.how.steps;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });

  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    setActive(Math.min(steps.length - 1, Math.floor(p * steps.length)));
  });

  return (
    <section id="kako-radi" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} subtitle={t.how.subtitle} />
      </div>

      {/* Desktop: the phone stays pinned while the steps scroll past. */}
      <div
        ref={trackRef}
        className="relative hidden lg:block"
        style={{ height: `${steps.length * 90}vh` }}
      >
        <div className="sticky top-0 flex h-dvh items-center pt-16">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_minmax(0,min(320px,calc((100dvh-8rem)*9/19)))] items-center gap-20 px-6">
            <div className="relative pl-10">
              <div className="absolute top-0 bottom-0 left-0 w-px bg-line">
                <motion.div
                  className="h-full w-full origin-top bg-linear-to-b from-primary to-accent"
                  style={{ scaleY: fill }}
                />
              </div>
              <ol className="flex flex-col gap-10">
                {steps.map((step, i) => {
                  const isActive = i === active;
                  return (
                    <motion.li
                      key={step.title}
                      animate={{ opacity: isActive ? 1 : 0.3, x: isActive ? 0 : -8 }}
                      transition={{ duration: 0.4 }}
                      className="relative"
                    >
                      <motion.span
                        className="absolute top-3 -left-10 size-3 -translate-x-1/2 rounded-full border-2"
                        animate={{
                          backgroundColor:
                            i <= active ? 'var(--color-primary)' : 'var(--color-canvas)',
                          borderColor: i <= active ? 'var(--color-primary)' : 'var(--color-muted)',
                          scale: isActive ? 1.5 : 1,
                        }}
                      />
                      <div className="flex items-baseline gap-5">
                        <span className="font-mono text-sm text-primary">0{i + 1}</span>
                        <h3 className="font-display text-5xl font-bold xl:text-6xl">
                          {step.title}
                        </h3>
                      </div>
                      <motion.p
                        className="mt-3 max-w-md overflow-hidden pl-11 text-lg text-muted"
                        animate={{ height: isActive ? 'auto' : 0, opacity: isActive ? 1 : 0 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {step.body}
                      </motion.p>
                    </motion.li>
                  );
                })}
              </ol>
            </div>

            <div className="relative">
              <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-primary/20 blur-[100px]" />
              <Phone label={steps[active]?.title ?? ''}>
                <StepScreen step={active} />
              </Phone>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile and tablet: a plain list, one screen per step. */}
      <ol className="mx-auto mt-16 flex max-w-xl flex-col gap-20 px-4 sm:px-6 lg:hidden">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Reveal>
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-sm text-primary">0{i + 1}</span>
                <h3 className="font-display text-4xl font-bold">{step.title}</h3>
              </div>
              <p className="mt-3 text-lg text-muted">{step.body}</p>
            </Reveal>
            <Reveal delay={0.1} className="mx-auto mt-8 w-full max-w-[300px]">
              <Phone label={step.title}>
                <StepScreen step={i} />
              </Phone>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
